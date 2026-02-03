/**
 * @fileoverview Bootstrap Pipeline - Reference Data Ingestion
 *
 * Inngest function that orchestrates the full reference data ingestion pipeline:
 * 1. Download/cache datasets from remote sources
 * 2. Parse each dataset and stream records through embedding + insert
 * 3. Create HNSW indexes after bulk load
 *
 * Uses streaming to avoid memory issues with large datasets.
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
    retries: 1, // Reduce retries for long-running function
  },
  { event: "bootstrap/ingest.requested" },
  async ({ event, step }) => {
    const { sources, forceRefresh = false } = event.data
    const startedAt = Date.now()

    const downloaded: string[] = []
    let totalProcessed = 0
    let totalEmbedded = 0
    let totalErrors = 0

    // Step 1: Download all datasets
    for (const source of sources) {
      const result = await step.run(`download-${source}`, async () => {
        const downloadResult = await downloadDataset(source, forceRefresh)
        return { cached: downloadResult.cached }
      })

      if (!result.cached) {
        downloaded.push(source)
      }
    }

    // Step 2: Process each source with streaming (one step per source)
    for (const source of sources) {
      const result = await step.run(`ingest-${source}`, async () => {
        return await streamIngestSource(source)
      })

      totalProcessed += result.processed
      totalEmbedded += result.embedded
      totalErrors += result.errorCount

      // Emit progress event
      await step.sendEvent(`progress-${source}`, {
        name: "bootstrap/ingest.progress",
        data: {
          source,
          step: "complete" as const,
          recordsProcessed: result.processed,
          totalRecords: result.processed,
          percent: 100,
        },
      })
    }

    // Step 3: Create HNSW indexes (after bulk load)
    await step.run("create-hnsw-indexes", async () => {
      await db.execute(sql`DROP INDEX IF EXISTS ref_embeddings_hnsw_idx`)
      await db.execute(sql`
        CREATE INDEX ref_embeddings_hnsw_idx
        ON reference_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `)
    })

    const durationMs = Date.now() - startedAt

    // Emit completion event
    await step.sendEvent("emit-completed", {
      name: "bootstrap/ingest.completed",
      data: {
        sources,
        totalRecords: totalProcessed,
        totalEmbeddings: totalEmbedded,
        durationMs,
      },
    })

    return {
      success: true,
      downloaded,
      recordsProcessed: totalProcessed,
      embeddingsCreated: totalEmbedded,
      errorCount: totalErrors,
      durationMs,
    }
  }
)

interface IngestResult {
  processed: number
  embedded: number
  errorCount: number
}

/**
 * Stream ingest a source: parse once, batch embed, insert.
 * Memory efficient - processes in batches without loading all records.
 */
async function streamIngestSource(source: DatasetSource): Promise<IngestResult> {
  const path = getDatasetPath(source)
  const parser = PARSERS[source]

  if (!parser) {
    throw new NonRetriableError(`Unknown source: ${source}`)
  }

  let processed = 0
  let embedded = 0
  let errorCount = 0

  // Collect batch
  let batch: NormalizedRecord[] = []
  let batchIdx = 0

  for await (const record of parser(path)) {
    // Filter empty content
    if (!record.content || record.content.trim().length === 0) {
      continue
    }

    batch.push(record)

    // Process batch when full
    if (batch.length >= BATCH_SIZE) {
      const result = await processBatch(batch, source, batchIdx)
      processed += result.processed
      embedded += result.embedded
      errorCount += result.errorCount

      // Rate limit
      if (batchIdx > 0) {
        await sleep(RATE_LIMIT_DELAY_MS)
      }

      batch = []
      batchIdx++

      // Log progress every 10 batches
      if (batchIdx % 10 === 0) {
        console.log(`[${source}] Processed ${processed} records...`)
      }
    }
  }

  // Process remaining records
  if (batch.length > 0) {
    const result = await processBatch(batch, source, batchIdx)
    processed += result.processed
    embedded += result.embedded
    errorCount += result.errorCount
  }

  console.log(`[${source}] Complete: ${processed} processed, ${embedded} embedded, ${errorCount} errors`)

  return { processed, embedded, errorCount }
}

interface BatchResult {
  processed: number
  embedded: number
  errorCount: number
}

/**
 * Process a batch: generate embeddings and insert into database.
 */
async function processBatch(
  batch: NormalizedRecord[],
  source: DatasetSource,
  batchIndex: number
): Promise<BatchResult> {
  const result: BatchResult = {
    processed: 0,
    embedded: 0,
    errorCount: 0,
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
    console.error(`Embedding failed for ${source} batch ${batchIndex}: ${error}`)
    result.errorCount = batch.length
    return result
  }

  // Insert documents and embeddings
  for (let i = 0; i < batch.length; i++) {
    const record = batch[i]
    const embedding = embeddings[i]

    if (!embedding) {
      result.errorCount++
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
          set: { source: record.source },
        })
        .returning({ id: referenceDocuments.id })

      // Insert embedding (skip if exists)
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
          metadata: { tokenCount: tokensPerText },
        })
        .onConflictDoNothing({ target: referenceEmbeddings.contentHash })

      result.processed++
      result.embedded++
    } catch (error) {
      console.error(`Insert failed for ${record.sourceId}: ${error}`)
      result.errorCount++
    }
  }

  return result
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
