/**
 * @fileoverview Offset mapping utilities for clause position translation.
 *
 * Provides utilities to translate character positions from the original
 * raw text coordinate system to the markdown coordinate system. Uses
 * binary search for efficient lookup in the offset map.
 *
 * @module lib/document-rendering/offset-mapper
 */

import type {
  OffsetMapping,
  ClauseOverlay,
  DocumentSegment,
  ClauseForRendering,
} from "./types"

// ============================================================================
// translateOffset
// ============================================================================

/**
 * Translates an original text position to a markdown text position.
 *
 * Uses binary search to find the nearest offset mapping at or before
 * the given position, then applies the cumulative shift recorded in
 * that mapping.
 *
 * The shift formula:
 *   markdownPos = originalPos + (nearestMapping.markdown - nearestMapping.original)
 *
 * If the position is before the first mapping, no shift is applied.
 * If the offset map is empty, the position is returned unchanged.
 *
 * @param originalOffset - Character position in the original raw text
 * @param offsetMap - Sorted array of offset mappings from convertToMarkdown
 * @returns The corresponding position in the markdown text
 */
export function translateOffset(
  originalOffset: number,
  offsetMap: OffsetMapping[]
): number {
  if (offsetMap.length === 0) {
    return originalOffset
  }

  // Binary search for the last mapping with original <= originalOffset
  let low = 0
  let high = offsetMap.length - 1
  let bestIndex = -1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (offsetMap[mid].original <= originalOffset) {
      bestIndex = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  // If no mapping is at or before this offset, return unshifted
  if (bestIndex === -1) {
    return originalOffset
  }

  const nearest = offsetMap[bestIndex]
  const shift = nearest.markdown - nearest.original
  return originalOffset + shift
}

// ============================================================================
// mapClausePositions
// ============================================================================

/**
 * Maps an array of clause positions through the offset map.
 *
 * Translates each clause's start/end positions from original text
 * coordinates to markdown coordinates using translateOffset. Also
 * determines which paragraph segment contains each clause.
 *
 * Clauses with null positions are skipped. Negative start positions
 * are clamped to 0.
 *
 * @param clauses - Array of clause data with original text positions
 * @param offsetMap - Offset mappings from convertToMarkdown
 * @param paragraphs - Paragraph segments for determining paragraphIndex
 * @returns Array of ClauseOverlay with both coordinate systems
 */
export function mapClausePositions(
  clauses: ClauseForRendering[],
  offsetMap: OffsetMapping[],
  paragraphs: DocumentSegment[]
): ClauseOverlay[] {
  const overlays: ClauseOverlay[] = []

  for (const clause of clauses) {
    // Skip clauses without position data
    if (clause.startPosition === null || clause.endPosition === null) {
      continue
    }

    // Clamp negative positions
    const originalStart = Math.max(0, clause.startPosition)
    const originalEnd = Math.max(originalStart, clause.endPosition)

    // Translate to markdown positions
    const markdownStart = translateOffset(originalStart, offsetMap)
    const markdownEnd = translateOffset(originalEnd, offsetMap)

    // Find which paragraph contains the start of this clause
    const paragraphIndex = findParagraphIndex(markdownStart, paragraphs)

    overlays.push({
      clauseId: clause.id,
      category: clause.category,
      riskLevel: clause.riskLevel,
      confidence: clause.confidence,
      originalStart,
      originalEnd,
      markdownStart,
      markdownEnd,
      paragraphIndex,
    })
  }

  return overlays
}

/**
 * Finds the paragraph index that contains the given markdown position.
 *
 * Searches through paragraphs to find which one contains the position.
 * If no paragraph contains it (e.g., position is in whitespace between
 * paragraphs), returns the index of the nearest preceding paragraph
 * or 0 if before all paragraphs.
 *
 * @param markdownOffset - Position in the markdown text
 * @param paragraphs - Array of paragraph segments
 * @returns Zero-based index of the containing paragraph
 */
function findParagraphIndex(
  markdownOffset: number,
  paragraphs: DocumentSegment[]
): number {
  if (paragraphs.length === 0) {
    return 0
  }

  // Find the paragraph containing this offset
  for (const paragraph of paragraphs) {
    if (
      markdownOffset >= paragraph.startOffset &&
      markdownOffset < paragraph.endOffset
    ) {
      return paragraph.index
    }
  }

  // If not inside any paragraph, find the nearest preceding one
  let bestIndex = 0
  for (const paragraph of paragraphs) {
    if (paragraph.startOffset <= markdownOffset) {
      bestIndex = paragraph.index
    }
  }

  return bestIndex
}
