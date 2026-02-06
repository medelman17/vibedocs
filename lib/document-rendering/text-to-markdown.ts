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
import type { ChunkForRendering } from "@/db/queries/chunks"
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
 * Page marker patterns to strip from the rendered document.
 * Matches patterns like "-- 1 of 12 --", "-2-", "---3---".
 */
const PAGE_MARKER_RE = /^-{1,3}\s*\d+\s*(of\s+\d+)?\s*-{0,3}$/

/** Markdown heading prefix (# ## ### ####). */
const HEADING_RE = /^#{1,4}\s/

/**
 * Document metadata noise lines to strip.
 * These are artifacts from document processing (DocuSign, watermarks, etc.)
 * that provide no legal content value.
 */
const METADATA_NOISE_PATTERNS = [
  /^DocuSign Envelope ID:\s*[0-9A-Fa-f-]+$/i,
  /^Document ID:\s*[0-9A-Fa-f-]+$/i,
  /^Envelope ID:\s*[0-9A-Fa-f-]+$/i,
  /^CONFIDENTIAL$/i,
  /^DRAFT$/i,
  /^Page\s+\d+\s*(of\s+\d+)?$/i,
]

function isMetadataNoise(line: string): boolean {
  return METADATA_NOISE_PATTERNS.some((re) => re.test(line))
}

/**
 * Splits markdown text into paragraph segments for virtual scrolling.
 *
 * Uses a multi-signal heuristic to detect paragraph boundaries in
 * PDF-extracted text where `\n` represents line-wraps and true paragraph
 * breaks are not always marked by double newlines:
 *
 * 1. **Empty lines** (`\n\n`) — definite paragraph break
 * 2. **Page markers** (`-- N of N --`, `-N-`) — stripped entirely
 * 3. **Markdown headings** (`# ...`) — isolated as own segment
 * 4. **Short-line heuristic** — if a line is significantly shorter than
 *    the median line length and is followed by a long line, it signals
 *    the end of a paragraph (common in PDF text where line-wrapping
 *    produces ~80-char lines and paragraph-final lines are shorter)
 *
 * @param markdownText - The markdown text to split
 * @returns Array of paragraph segments with offsets
 */
export function splitIntoParagraphs(markdownText: string): DocumentSegment[] {
  if (markdownText.length === 0) return []

  // 1. Parse into lines with exact character offsets
  const lines: Array<{ text: string; start: number; end: number }> = []
  let pos = 0
  for (let i = 0; i <= markdownText.length; i++) {
    if (i === markdownText.length || markdownText[i] === "\n") {
      lines.push({ text: markdownText.slice(pos, i), start: pos, end: i })
      pos = i + 1
    }
  }

  // 2. Compute median content-line length for short-line detection
  const contentLengths = lines
    .map((l) => l.text.trim().length)
    .filter((len) => len > 30)
  contentLengths.sort((a, b) => a - b)
  const medianLength =
    contentLengths.length > 0
      ? contentLengths[Math.floor(contentLengths.length / 2)]
      : 80
  const shortThreshold = Math.floor(medianLength * 0.6)

  // 3. Group lines into paragraph segments
  const segments: DocumentSegment[] = []
  let group: typeof lines = []

  function flush() {
    // Trim empty lines from edges
    while (group.length > 0 && group[0].text.trim() === "") group.shift()
    while (
      group.length > 0 &&
      group[group.length - 1].text.trim() === ""
    )
      group.pop()

    if (group.length === 0) return

    const joined = group.map((l) => l.text).join("\n")
    const trimmed = joined.trim()
    if (trimmed.length === 0) return

    segments.push({
      text: trimmed,
      startOffset: group[0].start,
      endOffset: group[group.length - 1].end,
      index: segments.length,
    })
    group = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.text.trim()

    // Empty line → paragraph break
    if (trimmed === "") {
      flush()
      continue
    }

    // Page marker → skip entirely
    if (PAGE_MARKER_RE.test(trimmed)) {
      flush()
      continue
    }

    // Document metadata noise → skip entirely
    if (isMetadataNoise(trimmed)) {
      flush()
      continue
    }

    // Markdown heading → its own segment
    if (HEADING_RE.test(trimmed)) {
      flush()
      group.push(line)
      flush()
      continue
    }

    // Short-line heuristic: if the previous line was noticeably shorter
    // than the typical wrap width and the current line is long, the
    // previous line ended a paragraph.
    if (group.length > 0) {
      const prevTrimmed = group[group.length - 1].text.trim()
      if (
        prevTrimmed.length > 0 &&
        prevTrimmed.length < shortThreshold &&
        trimmed.length >= shortThreshold
      ) {
        flush()
      }
    }

    group.push(line)
  }

  flush()
  return segments
}

// ============================================================================
// originalToMarkdownInclusive (private helper)
// ============================================================================

/**
 * Translates an original-text position to markdown coordinates.
 *
 * Uses the shift from BEFORE any heading inserted at this exact position.
 * This ensures headings are included in the segment they introduce
 * (strict `<` comparison, not `<=`).
 *
 * @param pos - Position in the original raw text
 * @param offsetMap - Ordered array of offset translation points
 * @returns Corresponding position in the markdown text
 */
function originalToMarkdownInclusive(
  pos: number,
  offsetMap: OffsetMapping[]
): number {
  let shift = 0
  for (const m of offsetMap) {
    if (m.original < pos) {
      shift = m.markdown - m.original
    } else {
      break
    }
  }
  return pos + shift
}

// ============================================================================
// splitByChunks
// ============================================================================

/**
 * Split markdown text into segments using database chunk boundaries.
 *
 * Each chunk from the analysis pipeline defines a logical section of the
 * document. This function maps chunk boundaries (which reference original
 * text positions) into the markdown coordinate system using the offset map,
 * then slices the markdown text at those boundaries.
 *
 * Falls back to `splitIntoParagraphs` when no chunks are provided (e.g.,
 * during progressive reveal before the chunking step completes).
 *
 * @param markdownText - The converted markdown text
 * @param chunks - Chunk metadata from the analysis pipeline
 * @param offsetMap - Offset map from convertToMarkdown
 * @returns Array of document segments aligned to chunk boundaries
 */
export function splitByChunks(
  markdownText: string,
  chunks: ChunkForRendering[],
  offsetMap: OffsetMapping[]
): DocumentSegment[] {
  if (markdownText.length === 0) return []
  if (chunks.length === 0) return splitIntoParagraphs(markdownText)

  const sorted = [...chunks].sort((a, b) => a.startPosition - b.startPosition)
  const segments: DocumentSegment[] = []

  // Handle preamble text before the first chunk
  const firstMdStart = originalToMarkdownInclusive(
    sorted[0].startPosition,
    offsetMap
  )
  if (firstMdStart > 0) {
    const preamble = markdownText.slice(0, firstMdStart).trim()
    if (preamble.length > 0) {
      segments.push({
        text: preamble,
        startOffset: 0,
        endOffset: firstMdStart,
        index: 0,
      })
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const chunk = sorted[i]
    const mdStart = originalToMarkdownInclusive(
      chunk.startPosition,
      offsetMap
    )
    const mdEnd =
      i < sorted.length - 1
        ? originalToMarkdownInclusive(
            sorted[i + 1].startPosition,
            offsetMap
          )
        : markdownText.length

    if (mdEnd <= mdStart) continue

    const text = markdownText.slice(mdStart, mdEnd).trim()
    if (text.length === 0) continue

    segments.push({
      text,
      startOffset: mdStart,
      endOffset: mdEnd,
      index: segments.length,
      sectionLevel: chunk.sectionPath?.length ?? undefined,
      chunkType: chunk.chunkType ?? undefined,
    })
  }

  return segments
}
