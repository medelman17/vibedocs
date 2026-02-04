/**
 * @fileoverview Section-boundary truncation for oversized documents.
 *
 * When documents exceed the token budget, this module truncates at
 * section boundaries to preserve document structure. This is preferable
 * to mid-sentence truncation which can confuse downstream analysis.
 *
 * @module lib/budget/truncation
 */

import { encode } from 'gpt-tokenizer'
import { BUDGET_LIMITS } from './limits'
import type { DocumentChunk } from '@/lib/document-processing'

/**
 * Result of document truncation operation.
 */
export interface TruncationResult {
  /** Truncated text (or original if no truncation needed) */
  text: string
  /** Chunks included after truncation */
  chunks: DocumentChunk[]
  /** Whether any truncation occurred */
  truncated: boolean
  /** Original document token count */
  originalTokens: number
  /** Token count after truncation */
  truncatedTokens: number
  /** Section names that were removed by truncation */
  removedSections: string[]
}

/**
 * Truncates document at section boundaries to fit within token budget.
 *
 * Strategy:
 * 1. Work with existing chunks (already split at section boundaries)
 * 2. Include chunks from start until budget exhausted
 * 3. Stop at the last complete section boundary
 * 4. Record which sections were removed
 *
 * This approach preserves document structure better than mid-sentence
 * truncation and ensures the analysis sees complete sections.
 *
 * @param rawText - Full document text for original token count
 * @param chunks - Pre-parsed document chunks with section boundaries
 * @param budget - Token budget limit (defaults to BUDGET_LIMITS.TOKEN_BUDGET)
 * @returns Truncation result with included chunks and removed sections
 */
export function truncateToTokenBudget(
  rawText: string,
  chunks: DocumentChunk[],
  budget: number = BUDGET_LIMITS.TOKEN_BUDGET
): TruncationResult {
  const originalTokens = encode(rawText).length

  // No truncation needed
  if (originalTokens <= budget) {
    return {
      text: rawText,
      chunks,
      truncated: false,
      originalTokens,
      truncatedTokens: originalTokens,
      removedSections: [],
    }
  }

  // Handle edge case: no chunks provided
  if (chunks.length === 0) {
    return {
      text: '',
      chunks: [],
      truncated: true,
      originalTokens,
      truncatedTokens: 0,
      removedSections: [],
    }
  }

  // Accumulate chunks until we exceed budget
  let accumulatedTokens = 0
  let lastIncludedIndex = -1

  for (let i = 0; i < chunks.length; i++) {
    const chunkTokens = chunks[i].tokenCount
    if (accumulatedTokens + chunkTokens > budget) {
      break
    }
    accumulatedTokens += chunkTokens
    lastIncludedIndex = i
  }

  // Handle edge case: even first chunk exceeds budget
  // Include it anyway to have SOME content for analysis
  if (lastIncludedIndex < 0) {
    lastIncludedIndex = 0
    accumulatedTokens = chunks[0].tokenCount
  }

  const includedChunks = chunks.slice(0, lastIncludedIndex + 1)
  const removedChunks = chunks.slice(lastIncludedIndex + 1)

  // Build truncated text from included chunks
  const truncatedText = includedChunks.map((c) => c.content).join('\n\n')

  // Extract unique section names from removed chunks
  const removedSections = [
    ...new Set(removedChunks.flatMap((c) => c.sectionPath).filter(Boolean)),
  ]

  return {
    text: truncatedText,
    chunks: includedChunks,
    truncated: true,
    originalTokens,
    truncatedTokens: accumulatedTokens,
    removedSections,
  }
}
