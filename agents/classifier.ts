/**
 * @fileoverview Classifier Agent
 *
 * Second stage of the NDA analysis pipeline. Classifies document chunks
 * into CUAD 41-category taxonomy with confidence scores.
 *
 * Enhanced with:
 * - Batch classification (3-5 chunks per LLM call, reduces API calls ~75%)
 * - Neighbor context (200 chars from adjacent chunks for boundary-spanning clauses)
 * - Two-stage RAG (vector search narrows candidate categories before LLM)
 * - Multi-label output with Uncategorized support
 *
 * @module agents/classifier
 */

import { generateText, Output, NoObjectGeneratedError } from 'ai'
import { getAgentModel } from '@/lib/ai/config'
import { AnalysisFailedError } from '@/lib/errors'
import {
  multiLabelClassificationSchema,
  CLASSIFICATION_THRESHOLDS,
  type CuadCategory,
  type ChunkClassificationResult,
} from './types'
import { findSimilarClauses } from './tools/vector-search'
import type { VectorSearchResult } from './tools/vector-search'
import { createBatchClassifierPrompt, CLASSIFIER_SYSTEM_PROMPT } from './prompts'
import type { BudgetTracker } from '@/lib/ai/budget'
import type { DocumentChunk } from '@/lib/document-processing'

// ============================================================================
// Constants
// ============================================================================

/** Number of chunks to process per LLM call (3-5 range, 4 is a good default) */
const BATCH_SIZE = 4

/** Number of reference examples to fetch per chunk from vector search */
const REFERENCES_PER_CHUNK = 7

/** Maximum deduplicated references to include in a batch prompt */
const MAX_BATCH_REFERENCES = 10

/** Number of characters of neighbor context from adjacent chunks */
const NEIGHBOR_CONTEXT_CHARS = 200

// ============================================================================
// Types
// ============================================================================

export interface ParsedChunk extends DocumentChunk {
  embedding: number[]
}

export interface ClassifierInput {
  parsedDocument: {
    documentId: string
    title: string
    rawText: string
    chunks: ParsedChunk[]
  }
  budgetTracker: BudgetTracker
}

export interface ClassifiedClause {
  chunkId: string
  clauseText: string
  category: CuadCategory
  secondaryCategories: CuadCategory[]
  confidence: number
  reasoning: string
  startPosition: number
  endPosition: number
}

export interface ClassifierOutput {
  /** Filtered clauses (no Uncategorized) for risk-scorer compatibility */
  clauses: ClassifiedClause[]
  /** All results including Uncategorized, for persistence in Plan 03 */
  rawClassifications: ChunkClassificationResult[]
  tokenUsage: { inputTokens: number; outputTokens: number }
}

// ============================================================================
// Internal Types
// ============================================================================

/** Neighbor context for a chunk */
interface NeighborContext {
  prev?: string // Last 200 chars of previous chunk
  next?: string // First 200 chars of next chunk
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Builds a map of neighbor context for each chunk.
 * Uses the last N chars of the previous chunk and first N chars of the next chunk
 * to provide context for boundary-spanning clauses.
 */
function buildNeighborMap(chunks: ParsedChunk[]): Map<string, NeighborContext> {
  const map = new Map<string, NeighborContext>()
  for (let i = 0; i < chunks.length; i++) {
    map.set(chunks[i].id, {
      prev: i > 0 ? chunks[i - 1].content.slice(-NEIGHBOR_CONTEXT_CHARS) : undefined,
      next:
        i < chunks.length - 1
          ? chunks[i + 1].content.slice(0, NEIGHBOR_CONTEXT_CHARS)
          : undefined,
    })
  }
  return map
}

/**
 * Deduplicates vector search results by ID, keeping the highest-similarity
 * instance of each unique reference.
 */
function deduplicateReferences(
  allRefs: VectorSearchResult[],
  maxCount: number
): VectorSearchResult[] {
  const seen = new Map<string, VectorSearchResult>()
  for (const ref of allRefs) {
    const existing = seen.get(ref.id)
    if (!existing || ref.similarity > existing.similarity) {
      seen.set(ref.id, ref)
    }
  }
  return Array.from(seen.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxCount)
}

// ============================================================================
// Classifier Agent
// ============================================================================

/**
 * Runs the classifier agent to categorize document chunks.
 *
 * Enhanced batch processing flow:
 * 1. Build neighbor context map from all chunks
 * 2. Process chunks in batches of 4 (configurable)
 * 3. For each batch:
 *    a. Two-stage RAG: vector search per chunk, deduplicate across batch
 *    b. Extract candidate categories from references
 *    c. Build batch prompt with neighbor context and candidates
 *    d. Call LLM with structured output (multiLabelClassificationSchema)
 *    e. Apply confidence thresholds and map to output formats
 *
 * @param input - Classifier input with parsed document and budget tracker
 * @returns Classified clauses (filtered) and raw classifications (all)
 */
export async function runClassifierAgent(
  input: ClassifierInput
): Promise<ClassifierOutput> {
  const { parsedDocument, budgetTracker } = input
  const clauses: ClassifiedClause[] = []
  const rawClassifications: ChunkClassificationResult[] = []
  let totalInputTokens = 0
  let totalOutputTokens = 0

  // Step 1: Build neighbor context map
  const neighborMap = buildNeighborMap(parsedDocument.chunks)

  // Step 2: Process chunks in batches
  const totalBatches = Math.ceil(parsedDocument.chunks.length / BATCH_SIZE)

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * BATCH_SIZE
    const batchEnd = Math.min(batchStart + BATCH_SIZE, parsedDocument.chunks.length)
    const batchChunks = parsedDocument.chunks.slice(batchStart, batchEnd)

    // Step 3a: Two-stage RAG - vector search per chunk in batch
    const allReferences: VectorSearchResult[] = []
    for (const chunk of batchChunks) {
      const refs = await findSimilarClauses(chunk.content, {
        limit: REFERENCES_PER_CHUNK,
      })
      allReferences.push(...refs)
    }

    // Deduplicate references across batch, keep top by similarity
    const dedupedRefs = deduplicateReferences(allReferences, MAX_BATCH_REFERENCES)

    // Step 3b: Extract candidate categories from references
    const candidateCategories = [...new Set(dedupedRefs.map((r) => r.category))]

    // Step 3c: Build batch prompt with neighbor context
    const promptChunks = batchChunks.map((chunk) => {
      const neighbors = neighborMap.get(chunk.id)
      return {
        index: chunk.index,
        content: chunk.content,
        sectionPath: chunk.sectionPath,
        prevContext: neighbors?.prev,
        nextContext: neighbors?.next,
      }
    })

    const prompt = createBatchClassifierPrompt(promptChunks, dedupedRefs, candidateCategories)

    // Step 3d: Call LLM with structured output
    let result
    try {
      result = await generateText({
        model: getAgentModel('classifier'),
        system: CLASSIFIER_SYSTEM_PROMPT,
        prompt,
        output: Output.object({ schema: multiLabelClassificationSchema }),
      })
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        console.error('[Classifier] Batch object generation failed', {
          batch: batchIdx + 1,
          totalBatches,
          chunkIndices: batchChunks.map((c) => c.index),
          cause: error.cause,
          text: error.text?.slice(0, 500),
          usage: error.usage,
        })
        throw new AnalysisFailedError(
          `Classification failed for batch ${batchIdx + 1}/${totalBatches}`,
          [
            {
              field: 'batch',
              message: `Chunks ${batchChunks[0].index}-${batchChunks[batchChunks.length - 1].index}: ${error.text?.slice(0, 100) ?? 'empty'}`,
            },
          ]
        )
      }
      throw error
    }

    const { output, usage } = result

    // Track token usage
    totalInputTokens += usage?.inputTokens ?? 0
    totalOutputTokens += usage?.outputTokens ?? 0

    // Step 3e: Process batch results
    if (output?.classifications) {
      for (const classification of output.classifications) {
        // Find the corresponding chunk in the batch
        const chunk = batchChunks.find((c) => c.index === classification.chunkIndex)
        if (!chunk) {
          console.warn('[Classifier] Classification references unknown chunk index', {
            chunkIndex: classification.chunkIndex,
            batchChunks: batchChunks.map((c) => c.index),
          })
          continue
        }

        // Apply minimum confidence threshold
        const isPrimaryBelowFloor =
          classification.primary.confidence < CLASSIFICATION_THRESHOLDS.MINIMUM_FLOOR

        // Store raw classification (with threshold applied to primary)
        const rawResult: ChunkClassificationResult = {
          chunkIndex: classification.chunkIndex,
          primary: isPrimaryBelowFloor
            ? {
                category: 'Uncategorized',
                confidence: classification.primary.confidence,
                rationale: classification.primary.rationale,
              }
            : classification.primary,
          secondary: classification.secondary.filter(
            (s) => s.confidence >= CLASSIFICATION_THRESHOLDS.MINIMUM_FLOOR
          ),
        }
        rawClassifications.push(rawResult)

        // Skip Uncategorized from filtered clauses output (for risk-scorer compat)
        if (
          rawResult.primary.category === 'Uncategorized' ||
          rawResult.primary.category === 'Unknown'
        ) {
          continue
        }

        // Map to ClassifiedClause for backward compatibility
        clauses.push({
          chunkId: chunk.id,
          clauseText: chunk.content,
          category: rawResult.primary.category as CuadCategory,
          secondaryCategories: rawResult.secondary.map((s) => s.category as CuadCategory),
          confidence: rawResult.primary.confidence,
          reasoning: rawResult.primary.rationale,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
        })
      }
    }
  }

  // Record budget
  budgetTracker.record('classifier', totalInputTokens, totalOutputTokens)

  return {
    clauses,
    rawClassifications,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  }
}
