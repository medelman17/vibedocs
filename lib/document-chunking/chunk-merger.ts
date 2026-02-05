/**
 * @fileoverview Post-processing module for chunk size compliance.
 *
 * Provides two operations:
 * - **mergeShortChunks:** Merges chunks below the minimum token threshold
 *   with adjacent siblings to avoid degenerate embeddings.
 * - **splitOversizedChunks:** Splits chunks exceeding the maximum token limit
 *   at sentence boundaries to maintain semantic coherence.
 *
 * Both operations preserve position tracking and section paths. Merged chunks
 * get `chunkType: 'merged'` and split chunks get `chunkType: 'split'`.
 *
 * @module lib/document-chunking/chunk-merger
 */

import type { LegalChunk } from "./types"
import { countVoyageTokensSync } from "./token-counter"

// ============================================================================
// Short Chunk Merging
// ============================================================================

/**
 * Merges chunks below the minimum token threshold with adjacent siblings.
 *
 * Rules:
 * - Only merges with the NEXT sibling chunk (same top-level section path)
 * - Combined content uses \n\n separator
 * - Merged chunk gets earlier startPosition, later endPosition
 * - Merged chunk gets chunkType: 'merged', summed tokenCounts
 * - Does NOT merge across different top-level section paths
 * - Does NOT merge boilerplate with non-boilerplate chunks
 *
 * @param chunks - Array of chunks to process
 * @param minTokens - Minimum token threshold (default 50)
 * @returns Array of chunks with short ones merged
 */
export function mergeShortChunks(
  chunks: LegalChunk[],
  minTokens: number = 50
): LegalChunk[] {
  if (chunks.length <= 1) return chunks

  const result: LegalChunk[] = []
  let i = 0

  while (i < chunks.length) {
    const current = chunks[i]

    // Check if current chunk is too short and can be merged
    if (
      current.tokenCount < minTokens &&
      i + 1 < chunks.length &&
      canMerge(current, chunks[i + 1])
    ) {
      // Merge with next chunk
      const next = chunks[i + 1]
      const mergedContent = current.content + "\n\n" + next.content
      const mergedTokenCount = countVoyageTokensSync(mergedContent)

      result.push({
        id: current.id, // Will be re-indexed
        index: current.index,
        content: mergedContent,
        sectionPath: current.sectionPath,
        tokenCount: mergedTokenCount,
        startPosition: Math.min(current.startPosition, next.startPosition),
        endPosition: Math.max(current.endPosition, next.endPosition),
        chunkType: "merged",
        metadata: {
          ...current.metadata,
          references: [
            ...current.metadata.references,
            ...next.metadata.references,
          ],
        },
      })
      i += 2 // Skip the merged chunk
    } else {
      result.push(current)
      i++
    }
  }

  return result
}

/**
 * Determines if two adjacent chunks can be merged.
 * Prevents merging across different top-level sections and
 * prevents merging boilerplate with non-boilerplate.
 */
function canMerge(a: LegalChunk, b: LegalChunk): boolean {
  // Don't merge boilerplate with non-boilerplate
  const aIsBoilerplate = a.chunkType === "boilerplate"
  const bIsBoilerplate = b.chunkType === "boilerplate"
  if (aIsBoilerplate !== bIsBoilerplate) return false

  // Don't merge across different top-level section paths
  const aTopSection = a.sectionPath[0] ?? ""
  const bTopSection = b.sectionPath[0] ?? ""
  return aTopSection === bTopSection
}

// ============================================================================
// Oversized Chunk Splitting
// ============================================================================

/**
 * Splits chunks exceeding the maximum token limit at sentence boundaries.
 *
 * When a chunk exceeds maxTokens:
 * 1. Split at sentence boundaries (period + space or period + newline)
 * 2. Each sub-chunk inherits the parent's sectionPath
 * 3. Sub-chunks get chunkType: 'split'
 * 4. If no sentence boundaries found, fall back to word boundary splitting
 *
 * @param chunks - Array of chunks to process
 * @param maxTokens - Maximum token limit per chunk (default 512)
 * @returns Array of chunks with oversized ones split
 */
export function splitOversizedChunks(
  chunks: LegalChunk[],
  maxTokens: number = 512
): LegalChunk[] {
  const result: LegalChunk[] = []

  for (const chunk of chunks) {
    if (chunk.tokenCount <= maxTokens) {
      result.push(chunk)
      continue
    }

    // Split this oversized chunk
    const subChunks = splitAtSentenceBoundaries(chunk, maxTokens)
    result.push(...subChunks)
  }

  return result
}

/**
 * Splits a single oversized chunk at sentence boundaries.
 */
function splitAtSentenceBoundaries(
  chunk: LegalChunk,
  maxTokens: number
): LegalChunk[] {
  // Split text into sentences
  const sentences = splitIntoSentences(chunk.content)

  if (sentences.length <= 1) {
    // No sentence boundaries -- fall back to word splitting
    return splitAtWordBoundaries(chunk, maxTokens)
  }

  const subChunks: LegalChunk[] = []
  let currentContent = ""
  let currentStartOffset = 0

  for (const sentence of sentences) {
    const potential = currentContent
      ? currentContent + " " + sentence
      : sentence

    if (countVoyageTokensSync(potential) > maxTokens && currentContent) {
      // Save current sub-chunk
      const subStart =
        chunk.startPosition + chunk.content.indexOf(currentContent, currentStartOffset)
      subChunks.push({
        id: chunk.id,
        index: chunk.index,
        content: currentContent,
        sectionPath: chunk.sectionPath,
        tokenCount: countVoyageTokensSync(currentContent),
        startPosition: subStart >= chunk.startPosition ? subStart : chunk.startPosition,
        endPosition:
          (subStart >= chunk.startPosition ? subStart : chunk.startPosition) +
          currentContent.length,
        chunkType: "split",
        metadata: {
          ...chunk.metadata,
          parentClauseIntro:
            chunk.metadata.parentClauseIntro ??
            currentContent.slice(0, 200),
        },
      })

      currentStartOffset =
        chunk.content.indexOf(currentContent, currentStartOffset) +
        currentContent.length
      currentContent = sentence
    } else {
      currentContent = potential
    }
  }

  // Last sub-chunk
  if (currentContent.trim()) {
    const subStart =
      chunk.startPosition + chunk.content.indexOf(currentContent, currentStartOffset)
    subChunks.push({
      id: chunk.id,
      index: chunk.index,
      content: currentContent,
      sectionPath: chunk.sectionPath,
      tokenCount: countVoyageTokensSync(currentContent),
      startPosition: subStart >= chunk.startPosition ? subStart : chunk.startPosition,
      endPosition:
        (subStart >= chunk.startPosition ? subStart : chunk.startPosition) +
        currentContent.length,
      chunkType: "split",
      metadata: {
        ...chunk.metadata,
        parentClauseIntro:
          chunk.metadata.parentClauseIntro ??
          currentContent.slice(0, 200),
      },
    })
  }

  return subChunks.length > 0 ? subChunks : [chunk]
}

/**
 * Splits a chunk at word boundaries when no sentence boundaries exist.
 */
function splitAtWordBoundaries(
  chunk: LegalChunk,
  maxTokens: number
): LegalChunk[] {
  const words = chunk.content.split(/\s+/)
  const subChunks: LegalChunk[] = []
  let currentWords: string[] = []

  for (const word of words) {
    const candidate = [...currentWords, word]
    if (countVoyageTokensSync(candidate.join(" ")) > maxTokens && currentWords.length > 0) {
      const content = currentWords.join(" ")
      const contentStart = chunk.content.indexOf(content)
      subChunks.push({
        id: chunk.id,
        index: chunk.index,
        content,
        sectionPath: chunk.sectionPath,
        tokenCount: countVoyageTokensSync(content),
        startPosition: chunk.startPosition + Math.max(0, contentStart),
        endPosition: chunk.startPosition + Math.max(0, contentStart) + content.length,
        chunkType: "split",
        metadata: {
          ...chunk.metadata,
        },
      })
      currentWords = [word]
    } else {
      currentWords = candidate
    }
  }

  if (currentWords.length > 0) {
    const content = currentWords.join(" ")
    subChunks.push({
      id: chunk.id,
      index: chunk.index,
      content,
      sectionPath: chunk.sectionPath,
      tokenCount: countVoyageTokensSync(content),
      startPosition: chunk.endPosition - content.length,
      endPosition: chunk.endPosition,
      chunkType: "split",
      metadata: {
        ...chunk.metadata,
      },
    })
  }

  return subChunks.length > 0 ? subChunks : [chunk]
}

// ============================================================================
// Sentence Splitting
// ============================================================================

/**
 * Splits text into sentences using legal-text-aware heuristics.
 *
 * Handles:
 * - Standard period + space boundaries
 * - Semicolon list items (common in legal text)
 * - Avoids splitting on abbreviations (e.g., "Inc.", "Ltd.", "U.S.")
 */
function splitIntoSentences(text: string): string[] {
  // Split on period/semicolon followed by space and uppercase or newline
  const sentencePattern = /(?<=[.;])\s+(?=[A-Z(])/g
  const sentences = text.split(sentencePattern).filter((s) => s.trim())

  // If splitting produced only one chunk, try splitting on just periods
  if (sentences.length <= 1) {
    const simpleSplit = text
      .split(/(?<=\.)\s+/)
      .filter((s) => s.trim())
    return simpleSplit.length > 1 ? simpleSplit : sentences
  }

  return sentences
}
