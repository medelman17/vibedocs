/**
 * @fileoverview Bootstrap Source Worker
 *
 * Inngest function that processes a single dataset source.
 * Called by the coordinator for each source in parallel.
 *
 * Features:
 * - Resume from lastBatchIndex after failures
 * - Hash deduplication for already-embedded records
 * - Per-batch Inngest steps for durability
 * - Circuit breaker at 10% error rate
 * - Rate limiting between batches
 *
 * @module inngest/functions/bootstrap/ingest-source
 */

import { inngest, NonRetriableError } from "@/inngest";
import { db } from "@/db/client";
import { referenceDocuments, referenceEmbeddings } from "@/db/schema/reference";
import { eq } from "drizzle-orm";
import { getDatasetPath } from "@/lib/datasets/downloader";
import {
  parseCuadDataset,
  parseContractNliDataset,
  parseBontermsDataset,
  parseCommonAccordDataset,
  type NormalizedRecord,
  type DatasetSource,
} from "@/lib/datasets";
import {
  getProgress,
  markStarted,
  markCompleted,
  markFailed,
  updateProgress,
} from "./utils/progress-tracker";
import { processBatch, shouldCircuitBreak } from "./utils/batch-processor";

type Parser = (path: string) => AsyncGenerator<NormalizedRecord>;

const PARSERS: Record<DatasetSource, Parser> = {
  cuad: parseCuadDataset,
  contract_nli: parseContractNliDataset,
  bonterms: parseBontermsDataset,
  commonaccord: parseCommonAccordDataset,
};

const BATCH_SIZE = 128;
const RATE_LIMIT_DELAY_MS = 200;

/**
 * Process a single dataset source with resume support.
 *
 * This worker is dispatched by the coordinator and handles:
 * 1. Loading progress state for resume capability
 * 2. Fetching existing content hashes for deduplication
 * 3. Streaming records from the dataset parser
 * 4. Processing in batches with per-batch durability
 * 5. Circuit breaking on high error rates
 * 6. Emitting completion events
 */
export const ingestSource = inngest.createFunction(
  {
    id: "bootstrap-ingest-source",
    name: "Bootstrap: Ingest Source",
    concurrency: { limit: 2 },
    retries: 2,
  },
  { event: "bootstrap/source.process" },
  async ({ event, step }) => {
    const { source, progressId } = event.data;

    // Get progress record for resume support
    const progress = await step.run("get-progress", async () => {
      const p = await getProgress(progressId);
      if (!p) {
        throw new NonRetriableError(`Progress record not found: ${progressId}`);
      }
      return p;
    });

    // Get existing hashes for deduplication
    // Join with documents to filter by source
    const existingHashesArray = await step.run(
      "get-existing-hashes",
      async () => {
        const rows = await db
          .select({ hash: referenceEmbeddings.contentHash })
          .from(referenceEmbeddings)
          .innerJoin(
            referenceDocuments,
            eq(referenceEmbeddings.documentId, referenceDocuments.id),
          )
          .where(eq(referenceDocuments.source, source));

        return rows.map((r) => r.hash).filter((h): h is string => h !== null);
      },
    );

    // Convert to Set for O(1) lookups (done outside step for proper type)
    const existingHashes = new Set(existingHashesArray);

    // Mark as started
    await step.run("mark-started", async () => {
      await markStarted(progressId);
    });

    // Get parser and path
    const path = getDatasetPath(source);
    const parser = PARSERS[source];

    if (!parser) {
      throw new NonRetriableError(`Unknown source: ${source}`);
    }

    let batchIndex = 0;
    let batch: NormalizedRecord[] = [];
    let totalProcessed = 0;
    let totalEmbedded = 0;
    let totalErrors = 0;

    // Stream through records from parser
    for await (const record of parser(path)) {
      // Skip empty content
      if (!record.content?.trim()) {
        continue;
      }

      // Skip already-embedded records (deduplication)
      if (existingHashes.has(record.contentHash)) {
        continue;
      }

      batch.push(record);

      if (batch.length >= BATCH_SIZE) {
        // Skip already-completed batches (resume support)
        if (batchIndex < progress.lastBatchIndex) {
          batchIndex++;
          batch = [];
          continue;
        }

        // Process batch as a durable step
        const result = await step.run(`batch-${batchIndex}`, async () => {
          return await processBatch(batch, source, batchIndex);
        });

        totalProcessed += result.processed;
        totalEmbedded += result.embedded;
        totalErrors += result.errors;

        // Update progress
        await step.run(`progress-${batchIndex}`, async () => {
          await updateProgress(progressId, {
            processedRecords: totalProcessed,
            embeddedRecords: totalEmbedded,
            errorCount: totalErrors,
            lastBatchIndex: batchIndex,
          });
        });

        // Circuit breaker check
        if (shouldCircuitBreak(totalProcessed, totalErrors)) {
          await markFailed(progressId);
          throw new NonRetriableError(`Error rate exceeded 10% for ${source}`);
        }

        // Rate limit between batches
        await step.sleep(`rate-limit-${batchIndex}`, RATE_LIMIT_DELAY_MS);

        batch = [];
        batchIndex++;
      }
    }

    // Process remaining records in final batch
    if (batch.length > 0) {
      const result = await step.run(`batch-${batchIndex}-final`, async () => {
        return await processBatch(batch, source, batchIndex);
      });

      totalProcessed += result.processed;
      totalEmbedded += result.embedded;
      totalErrors += result.errors;

      await step.run("progress-final", async () => {
        await updateProgress(progressId, {
          processedRecords: totalProcessed,
          embeddedRecords: totalEmbedded,
          errorCount: totalErrors,
          lastBatchIndex: batchIndex,
        });
      });
    }

    // Mark as completed
    await step.run("mark-completed", async () => {
      await markCompleted(progressId);
    });

    // Emit completion event
    await step.sendEvent("emit-completed", {
      name: "bootstrap/source.completed",
      data: {
        source,
        progressId,
        status: "completed" as const,
        processedRecords: totalProcessed,
        embeddedRecords: totalEmbedded,
        errorCount: totalErrors,
      },
    });

    return {
      source,
      processedRecords: totalProcessed,
      embeddedRecords: totalEmbedded,
      errorCount: totalErrors,
    };
  },
);
