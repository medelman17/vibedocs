/**
 * @fileoverview Bootstrap Pipeline - Reference Data Ingestion
 *
 * Inngest function that orchestrates the full reference data ingestion pipeline:
 * 1. Download/cache datasets from remote sources
 * 2. Parse each dataset into NormalizedRecords
 * 3. Generate embeddings in batches (with rate limiting)
 * 4. Insert into database with deduplication
 * 5. Create HNSW indexes after bulk load
 *
 * This is a long-running operation (potentially hours for full dataset).
 * Progress events are emitted for monitoring.
 *
 * @module inngest/functions/bootstrap/ingest-reference-data
 */

import { inngest } from "../../client"
import { NonRetriableError } from "../../utils/errors"
import { db } from "@/db/client"
import { referenceDocuments, referenceEmbeddings } from "@/db/schema/reference"
import { downloadDataset, getDatasetPath } from "@/lib/datasets/downloader"
import {
  parseCuadDataset,
  parseContractNliDataset,
  parseBontermsDataset,
  parseCommonAccordDataset,
  type NormalizedRecord,
  type DatasetSource,
} from "@/lib/datasets"
import { getVoyageAIClient, VOYAGE_CONFIG } from "@/lib/embeddings"
import { sql } from "drizzle-orm"

type Parser = (path: string) => AsyncGenerator<NormalizedRecord>

const PARSERS: Record<DatasetSource, Parser> = {
  cuad: parseCuadDataset,
  contract_nli: parseContractNliDataset,
  bonterms: parseBontermsDataset,
  commonaccord: parseCommonAccordDataset,
}

const BATCH_SIZE = VOYAGE_CONFIG.batchLimit // 128
const RATE_LIMIT_DELAY_MS = 200 // 300 RPM = 200ms between calls

interface BootstrapStats {
  downloaded: string[]
  recordsProcessed: number
  embeddingsCreated: number
  errors: string[]
  startedAt: number
}

/**
 * Bootstrap reference data ingestion function.
 *
 * Trigger via API or Inngest UI:
 * ```json
 * {
 *   "name": "bootstrap/ingest.requested",
 *   "data": {
 *     "sources": ["cuad", "contract_nli", "bonterms", "commonaccord"],
 *     "forceRefresh": false
 *   }
 * }
 * ```
 */
export const ingestReferenceData = inngest.createFunction(
  {
    id: "bootstrap-ingest-reference-data",
    name: "Bootstrap: Ingest Reference Data",
    concurrency: { limit: 1 }, // Only one bootstrap at a time
    retries: 3,
  },
  { event: "bootstrap/ingest.requested" },
  async ({ event, step }) => {
    const { sources, forceRefresh = false } = event.data

    const stats: BootstrapStats = {
      downloaded: [],
      recordsProcessed: 0,
      embeddingsCreated: 0,
      errors: [],
      startedAt: Date.now(),
    }

    // Step 1: Download all datasets
    for (const source of sources) {
      const result = await step.run(`download-${source}`, async () => {
        const downloadResult = await downloadDataset(source, forceRefresh)
        return downloadResult
      })

      if (!result.cached) {
        stats.downloaded.push(source)
      }
    }

    // Step 2: Process each source
    for (const source of sources) {
      // Parse and collect records
      const records = await step.run(`parse-${source}`, async () => {
        const path = getDatasetPath(source)
        const parser = PARSERS[source]

        if (!parser) {
          throw new NonRetriableError(`Unknown source: ${source}`)
        }

        const allRecords: NormalizedRecord[] = []
        for await (const record of parser(path)) {
          // Filter out empty content (Voyage AI rejects empty strings)
          if (record.content && record.content.trim().length > 0) {
            allRecords.push(record)
          }
        }
        return allRecords
      })

      // Process records in batches with rate limiting
      const numBatches = Math.ceil(records.length / BATCH_SIZE)

      for (let batchIdx = 0; batchIdx < numBatches; batchIdx++) {
        const batchStart = batchIdx * BATCH_SIZE
        const batchEnd = Math.min(batchStart + BATCH_SIZE, records.length)
        const batch = records.slice(batchStart, batchEnd)

        // Rate limit between batches (skip first batch)
        if (batchIdx > 0) {
          await step.sleep(
            `rate-limit-${source}-${batchIdx}`,
            `${RATE_LIMIT_DELAY_MS}ms`
          )
        }

        // Process batch: embed and insert
        const batchResult = await step.run(
          `process-batch-${source}-${batchIdx}`,
          async () => {
            return await processBatch(batch, source, batchIdx, stats)
          }
        )

        stats.recordsProcessed += batchResult.processed
        stats.embeddingsCreated += batchResult.embedded
        stats.errors.push(...batchResult.errors)

        // Emit progress event
        await step.sendEvent(`progress-${source}-${batchIdx}`, {
          name: "bootstrap/ingest.progress",
          data: {
            source,
            step: "embedding" as const,
            recordsProcessed: Math.min(batchEnd, records.length),
            totalRecords: records.length,
            percent: Math.round((batchEnd / records.length) * 100),
          },
        })
      }
    }

    // Step 3: Create HNSW indexes (after bulk load)
    await step.run("create-hnsw-indexes", async () => {
      // Drop existing index if any
      await db.execute(sql`
        DROP INDEX IF EXISTS ref_embeddings_hnsw_idx
      `)

      // Create new HNSW index
      // m=16: connections per layer (good for ~33K vectors)
      // ef_construction=64: build-time quality factor
      await db.execute(sql`
        CREATE INDEX ref_embeddings_hnsw_idx
        ON reference_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `)
    })

    const durationMs = Date.now() - stats.startedAt

    // Emit completion event
    await step.sendEvent("emit-completed", {
      name: "bootstrap/ingest.completed",
      data: {
        sources,
        totalRecords: stats.recordsProcessed,
        totalEmbeddings: stats.embeddingsCreated,
        durationMs,
      },
    })

    return {
      success: true,
      downloaded: stats.downloaded,
      recordsProcessed: stats.recordsProcessed,
      embeddingsCreated: stats.embeddingsCreated,
      errors: stats.errors,
      durationMs,
    }
  }
)

interface BatchProcessResult {
  processed: number
  embedded: number
  errors: string[]
}

/**
 * Process a batch of records: generate embeddings and insert into database.
 */
async function processBatch(
  batch: NormalizedRecord[],
  source: DatasetSource,
  batchIndex: number,
  _stats: BootstrapStats
): Promise<BatchProcessResult> {
  const result: BatchProcessResult = {
    processed: 0,
    embedded: 0,
    errors: [],
  }

  // Generate embeddings
  const texts = batch.map((r) => r.content)
  let embeddings: number[][]
  let tokensPerText: number

  try {
    const client = getVoyageAIClient()
    const embedResult = await client.embedBatch(texts, "document")
    embeddings = embedResult.embeddings
    tokensPerText = Math.floor(embedResult.totalTokens / texts.length)
  } catch (error) {
    const message = `Embedding failed for ${source} batch ${batchIndex}: ${error}`
    result.errors.push(message)
    console.error(message)
    return result
  }

  // Insert documents and embeddings sequentially
  // Note: neon-http driver doesn't support transactions, using idempotent inserts instead
  for (let i = 0; i < batch.length; i++) {
    const record = batch[i]
    const embedding = embeddings[i]

    if (!embedding) {
      result.errors.push(`Missing embedding for record ${record.sourceId}`)
      continue
    }

    try {
      // Upsert document (idempotent via contentHash)
      const [doc] = await db
        .insert(referenceDocuments)
        .values({
          source: record.source,
          sourceId: record.sourceId,
          title: record.sectionPath.join(" > ") || record.sourceId,
          rawText: record.content,
          metadata: record.metadata,
          contentHash: record.contentHash,
        })
        .onConflictDoUpdate({
          target: referenceDocuments.contentHash,
          set: {
            // Return existing record on conflict
            source: record.source,
          },
        })
        .returning({ id: referenceDocuments.id })

      // Insert embedding (skip if already exists via contentHash)
      await db
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          content: record.content,
          embedding: embedding,
          granularity: record.granularity,
          sectionPath: record.sectionPath,
          category: record.category ?? null,
          hypothesisId: record.hypothesisId ?? null,
          nliLabel: record.nliLabel ?? null,
          contentHash: record.contentHash,
          metadata: {
            tokenCount: tokensPerText,
          },
        })
        .onConflictDoNothing({ target: referenceEmbeddings.contentHash })

      result.processed++
      result.embedded++
    } catch (error) {
      const message = `Insert failed for ${record.sourceId}: ${error}`
      result.errors.push(message)
      console.error(message)
    }
  }

  return result
}
