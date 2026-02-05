/**
 * @fileoverview Text-to-markdown conversion with offset tracking.
 *
 * Converts raw document text to markdown by inserting heading prefixes
 * (# ## ### ####) based on DocumentStructure sections. Tracks every
 * character insertion in an offset map so that clause positions from
 * the original text can be accurately translated to the markdown text.
 *
 * @module lib/document-rendering/text-to-markdown
 */

import type { PositionedSection } from "@/lib/document-extraction/types"
import type { MarkdownConversion, OffsetMapping, DocumentSegment } from "./types"

// ============================================================================
// Heading Prefix Helpers
// ============================================================================

/**
 * Returns the markdown heading prefix for a given heading level.
 * Level 1 -> "# ", Level 2 -> "## ", Level 3 -> "### ", Level 4 -> "#### "
 */
function headingPrefix(level: 1 | 2 | 3 | 4): string {
  return "#".repeat(level) + " "
}

// ============================================================================
// convertToMarkdown
// ============================================================================

/**
 * Converts raw document text to markdown by inserting heading prefixes.
 *
 * Processes sections in order of their startOffset position, inserting
 * the appropriate markdown heading prefix at each section start. Builds
 * an offset map that records the cumulative character shift at each
 * insertion point.
 *
 * The offset map uses the convention:
 * - { original: X, markdown: Y } means "at original position X, the
 *   corresponding markdown position is Y"
 * - The shift (Y - X) represents the total characters inserted up to
 *   that point
 *
 * @param rawText - The original document text
 * @param sections - Positioned sections from DocumentStructure
 * @returns Markdown text and offset map for position translation
 */
export function convertToMarkdown(
  rawText: string,
  sections: PositionedSection[]
): MarkdownConversion {
  if (rawText.length === 0) {
    return { markdown: "", offsetMap: [] }
  }

  if (sections.length === 0) {
    return { markdown: rawText, offsetMap: [] }
  }

  // Sort sections by startOffset to process in document order
  const sortedSections = [...sections].sort(
    (a, b) => a.startOffset - b.startOffset
  )

  const offsetMap: OffsetMapping[] = []
  let result = ""
  let lastPos = 0
  let cumulativeShift = 0

  for (const section of sortedSections) {
    const insertPos = section.startOffset

    // Copy text from lastPos to insertPos unchanged
    result += rawText.slice(lastPos, insertPos)

    // Insert heading prefix
    const prefix = headingPrefix(section.level)
    cumulativeShift += prefix.length

    // Record offset mapping: at this original position, the markdown
    // position includes all cumulative insertions
    offsetMap.push({
      original: insertPos,
      markdown: insertPos + cumulativeShift,
    })

    result += prefix

    // Continue from insertPos (don't skip any original text)
    lastPos = insertPos
  }

  // Copy remaining text after last section
  result += rawText.slice(lastPos)

  return { markdown: result, offsetMap }
}

// ============================================================================
// splitIntoParagraphs
// ============================================================================

/**
 * Splits markdown text into paragraph segments for virtual scrolling.
 *
 * Splits on double newlines (paragraph boundaries) and tracks the
 * start and end offset of each paragraph in the markdown text.
 * Each segment can be independently rendered and measured by
 * react-window for windowed rendering.
 *
 * @param markdownText - The markdown text to split
 * @returns Array of paragraph segments with offsets
 */
export function splitIntoParagraphs(markdownText: string): DocumentSegment[] {
  if (markdownText.length === 0) {
    return []
  }

  const segments: DocumentSegment[] = []

  // Split on one or more consecutive blank lines (double+ newline)
  const parts = markdownText.split(/\n{2,}/)
  let currentOffset = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    // Find where this part actually starts in the original text
    // by searching from currentOffset
    const startOffset = markdownText.indexOf(part, currentOffset)

    if (part.trim().length > 0) {
      const trimmed = part.trim()
      // Find the trimmed text within the part for accurate offsets
      const trimStart = markdownText.indexOf(trimmed, startOffset)

      segments.push({
        text: trimmed,
        startOffset: trimStart,
        endOffset: trimStart + trimmed.length,
        index: segments.length,
      })
    }

    // Move past this part and the separator
    currentOffset = startOffset + part.length
  }

  return segments
}
