/**
 * @fileoverview Batch Processor for Bootstrap Pipeline
 *
 * Handles embedding generation and database insertion for batches of records.
 * Includes retry logic and error handling.
 *
 * @module inngest/functions/bootstrap/utils/batch-processor
 */

import { db } from "@/db/client"
import {
  referenceDocuments,
  referenceEmbeddings,
} from "@/db/schema/reference"
import { getVoyageAIClient, VOYAGE_CONFIG } from "@/lib/embeddings"
import type { NormalizedRecord, DatasetSource } from "@/lib/datasets"
import { withRetry } from "./retry"

/**
 * Result of processing a batch.
 */
export interface BatchResult {
  processed: number
  embedded: number
  errors: number
}

const ERROR_RATE_THRESHOLD = 0.1
const MIN_RECORDS_FOR_CIRCUIT_BREAKER = 100

/**
 * Process a batch of records: generate embeddings and insert into database.
 */
export async function processBatch(
  batch: NormalizedRecord[],
  source: DatasetSource,
  batchIndex: number
): Promise<BatchResult> {
  const result: BatchResult = {
    processed: 0,
    embedded: 0,
    errors: 0,
  }

  if (batch.length === 0) {
    return result
  }

  // 1. Generate embeddings with retry
  const texts = batch.map((r) => r.content)
  let embeddings: number[][]
  let tokensPerText: number

  try {
    const client = getVoyageAIClient()
    const embedResult = await withRetry(
      () => client.embedBatch(texts, "document"),
      {
        maxAttempts: 3,
        backoff: [1000, 2000, 4000],
        onRetry: (error, attempt) => {
          console.warn(
            `[${source}] Batch ${batchIndex} embedding retry ${attempt}: ${error.message}`
          )
        },
      }
    )
    embeddings = embedResult.embeddings
    tokensPerText = Math.floor(embedResult.totalTokens / texts.length)
  } catch (error) {
    console.error(`[${source}] Batch ${batchIndex} embedding failed: ${error}`)
    result.errors = batch.length
    return result
  }

  // Validate embeddings count
  if (embeddings.length !== batch.length) {
    console.error(
      `[${source}] Batch ${batchIndex}: Expected ${batch.length} embeddings, got ${embeddings.length}`
    )
    result.errors = batch.length
    return result
  }

  // 2. Insert records individually
  for (let i = 0; i < batch.length; i++) {
    const record = batch[i]
    const embedding = embeddings[i]

    if (!embedding || embedding.length !== VOYAGE_CONFIG.dimensions) {
      console.error(
        `[${source}] Batch ${batchIndex}, item ${i}: Invalid embedding dimensions`
      )
      result.errors++
      continue
    }

    try {
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
      console.error(
        `[${source}] Batch ${batchIndex}, item ${i} insert failed: ${error}`
      )
      result.errors++
    }
  }

  return result
}

/**
 * Check if error rate exceeds threshold (circuit breaker).
 *
 * Returns true if the error rate is above 10% and we have processed
 * at least 100 records (to avoid false positives on small batches).
 */
export function shouldCircuitBreak(
  totalProcessed: number,
  totalErrors: number
): boolean {
  const total = totalProcessed + totalErrors
  if (total < MIN_RECORDS_FOR_CIRCUIT_BREAKER) {
    return false
  }
  const errorRate = totalErrors / total
  return errorRate > ERROR_RATE_THRESHOLD
}
