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


/** Number of reference examples to fetch per chunk from vector search */
const REFERENCES_PER_CHUNK = 7

/** Maximum deduplicated references to include in a batch prompt */
const MAX_BATCH_REFERENCES = 10

/** Number of characters of neighbor context from adjacent chunks */
const NEIGHBOR_CONTEXT_CHARS = 200

// ============================================================================
// Types
// ============================================================================

export type ParsedChunk = DocumentChunk

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
 * instance of each unique reference. Ensures category diversity so the LLM
 * sees examples from multiple CUAD categories, not just the top-similarity one.
 */
function selectDiverseReferences(
  allRefs: VectorSearchResult[],
  maxCount: number
): VectorSearchResult[] {
  // Deduplicate by ID, keeping highest similarity
  const seen = new Map<string, VectorSearchResult>()
  for (const ref of allRefs) {
    const existing = seen.get(ref.id)
    if (!existing || ref.similarity > existing.similarity) {
      seen.set(ref.id, ref)
    }
  }
  const unique = Array.from(seen.values()).sort((a, b) => b.similarity - a.similarity)

  // Ensure category diversity: pick top ref per category first, then fill remaining by similarity
  const selected: VectorSearchResult[] = []
  const usedIds = new Set<string>()
  const byCategory = new Map<string, VectorSearchResult[]>()

  for (const ref of unique) {
    const list = byCategory.get(ref.category) ?? []
    list.push(ref)
    byCategory.set(ref.category, list)
  }

  // Round 1: top ref from each category
  for (const [, refs] of byCategory) {
    if (selected.length >= maxCount) break
    selected.push(refs[0])
    usedIds.add(refs[0].id)
  }

  // Round 2: fill remaining slots by similarity
  for (const ref of unique) {
    if (selected.length >= maxCount) break
    if (!usedIds.has(ref.id)) {
      selected.push(ref)
      usedIds.add(ref.id)
    }
  }

  return selected
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

  const chunks = parsedDocument.chunks
  if (chunks.length === 0) {
    budgetTracker.record('classifier', 0, 0)
    return { clauses, rawClassifications, tokenUsage: { inputTokens: 0, outputTokens: 0 } }
  }

  // Step 1: Build neighbor context map from full chunk list
  const neighborMap = buildNeighborMap(chunks)

  try {
    // Step 2: Parallel vector search for ALL chunks at once
    // With 24 chunks × 7 refs each, this fires 24 parallel searches.
    // The LRU cache in vector-search.ts deduplicates identical queries.
    const refArrays = await Promise.all(
      chunks.map((chunk) =>
        findSimilarClauses(chunk.content, { limit: REFERENCES_PER_CHUNK })
      )
    )
    const allReferences = refArrays.flat()

    // Step 3: Category-diverse reference selection
    // With all chunks' refs pooled, we get much better category diversity
    // than the per-batch approach (which could miss categories split across batches)
    const dedupedRefs = selectDiverseReferences(allReferences, MAX_BATCH_REFERENCES)
    const candidateCategories = [...new Set(dedupedRefs.map((r) => r.category))]

    // Step 4: Build prompt with ALL chunks using document-wide indices only
    // FIX: The original used `Chunk ${i} (index ${chunk.index})` creating a
    // dual-mapping ambiguity. With a single call, we use chunk.index exclusively.
    const promptChunks = chunks.map((chunk) => {
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

    // Step 5: Single LLM call for all chunks
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
        if (error.usage) {
          totalInputTokens += error.usage.inputTokens ?? 0
          totalOutputTokens += error.usage.outputTokens ?? 0
        }
        console.error('[Classifier] Object generation failed', {
          chunkCount: chunks.length,
          chunkIndices: chunks.map((c) => c.index),
          cause: error.cause,
          text: error.text?.slice(0, 500),
          usage: error.usage,
        })
        throw new AnalysisFailedError(
          `Classification failed for ${chunks.length} chunks`,
          [
            {
              field: 'classification',
              message: `Chunks ${chunks[0].index}-${chunks[chunks.length - 1].index}: ${error.text?.slice(0, 100) ?? 'empty'}`,
            },
          ]
        )
      }
      throw error
    }

    const { output, usage } = result
    totalInputTokens += usage?.inputTokens ?? 0
    totalOutputTokens += usage?.outputTokens ?? 0

    // Step 6: Validate output
    if (!output?.classifications || output.classifications.length === 0) {
      throw new AnalysisFailedError(
        `Classification returned empty output for ${chunks.length} chunks`,
        [
          {
            field: 'classification',
            message: `Expected ${chunks.length} classifications, got 0 (${usage?.inputTokens ?? 0} input tokens consumed)`,
          },
        ]
      )
    }

    // Step 7: Map results using document-wide index ONLY
    // No more dual batch-local / doc-wide mapping — single source of truth
    const chunkByDocIndex = new Map(chunks.map((c) => [c.index, c]))

    for (const classification of output.classifications) {
      const chunk = chunkByDocIndex.get(classification.chunkIndex)
      if (!chunk) {
        console.warn('[Classifier] Classification references unknown chunk index', {
          chunkIndex: classification.chunkIndex,
          validIndices: [...chunkByDocIndex.keys()],
        })
        continue
      }

      const isPrimaryBelowFloor =
        classification.primary.confidence < CLASSIFICATION_THRESHOLDS.MINIMUM_FLOOR

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

      if (
        rawResult.primary.category === 'Uncategorized' ||
        rawResult.primary.category === 'Unknown'
      ) {
        continue
      }

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
  } finally {
    budgetTracker.record('classifier', totalInputTokens, totalOutputTokens)
  }

  return {
    clauses,
    rawClassifications,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  }
}
