/**
 * @fileoverview Legal-aware document chunking engine.
 *
 * This is the main entry point for transforming extracted text + DocumentStructure
 * into right-sized, metadata-rich chunks. It replaces the simplistic paragraph-based
 * `chunkDocument()` in `lib/document-processing.ts` with structure-aware chunking
 * that respects clause/definition/sub-clause boundaries.
 *
 * The chunking pipeline:
 * 1. Validate structure quality (bounds, overlaps, gaps)
 * 2. Dispatch sections to appropriate strategy (definitions, clauses, recitals, etc.)
 * 3. Handle gaps between detected sections via fallback strategy
 * 4. Post-process: merge short chunks, split oversized chunks
 * 5. Annotate cross-references on all chunks
 * 6. Add overlap tokens between consecutive chunks
 * 7. Re-index all chunks sequentially
 *
 * CHK-03 (LLM re-chunking): When structure quality is poor (empty sections or
 * low chunk/page ratio), the chunker calls `detectStructure({ forceLlm: true })`
 * to get LLM-based structure and re-chunks with that result.
 *
 * @module lib/document-chunking/legal-chunker
 * @see {@link ./types} for LegalChunk, LegalChunkOptions types
 * @see {@link ./chunk-strategies} for strategy implementations
 */

import type { DocumentStructure, PositionedSection } from "@/lib/document-extraction/types"
import { detectStructure } from "@/lib/document-extraction/structure-detector"
import type { LegalChunk, LegalChunkOptions } from "./types"
import { initVoyageTokenizer, countVoyageTokensSync } from "./token-counter"
import {
  chunkDefinitions,
  chunkClause,
  chunkBoilerplate,
  chunkExhibit,
  chunkRecital,
  chunkFallback,
} from "./chunk-strategies"
import { mergeShortChunks, splitOversizedChunks } from "./chunk-merger"
import { extractCrossReferences } from "./cross-reference"

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<LegalChunkOptions> = {
  maxTokens: 512,
  targetTokens: 400,
  overlapTokens: 50,
  minChunkTokens: 50,
  skipBoilerplateEmbedding: true,
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Chunks a legal document into semantically meaningful, right-sized chunks.
 *
 * Consumes `DocumentStructure` from Phase 3's structure detection and produces
 * `LegalChunk[]` with position tracking, section paths, and metadata.
 *
 * @param text - The full extracted document text
 * @param structure - Document structure from detectStructure()
 * @param options - Optional chunking configuration overrides
 * @returns Array of legal chunks ready for embedding and storage
 *
 * @example
 * ```typescript
 * const structure = await detectStructure(text)
 * const chunks = await chunkLegalDocument(text, structure, { maxTokens: 512 })
 * ```
 */
export async function chunkLegalDocument(
  text: string,
  structure: DocumentStructure,
  options?: Partial<LegalChunkOptions>
): Promise<LegalChunk[]> {
  const opts: Required<LegalChunkOptions> = { ...DEFAULT_OPTIONS, ...options }

  // Step 1: Initialize tokenizer for accurate token counting
  await initVoyageTokenizer()

  // Step 2: Validate and sanitize structure
  const validatedStructure = validateStructure(text, structure)

  // Step 3: Determine structure source and initial chunking
  let chunks: LegalChunk[]
  let structureSource: "regex" | "llm" = inferStructureSource(validatedStructure)

  if (validatedStructure.sections.length === 0) {
    // No structure at all -- use fallback on entire text
    chunks = chunkFallback(text, 0, opts)
  } else {
    // Dispatch sections to appropriate strategies
    chunks = chunkSections(text, validatedStructure.sections, opts)
  }

  // Step 4: CHK-03 - LLM re-chunking when structure is insufficient
  const estimatedPages = Math.ceil(text.length / 3000)
  const chunkPageRatio = estimatedPages > 0 ? chunks.length / estimatedPages : chunks.length

  if (
    validatedStructure.sections.length === 0 ||
    (chunkPageRatio < 2 && estimatedPages > 1)
  ) {
    console.log(
      `[legal-chunker] Structure quality insufficient (sections: ${validatedStructure.sections.length}, ` +
        `chunks: ${chunks.length}, estimated pages: ${estimatedPages}, ratio: ${chunkPageRatio.toFixed(1)}). ` +
        `Triggering LLM re-chunking...`
    )

    try {
      const llmStructure = await detectStructure(text, { forceLlm: true })
      const llmValidated = validateStructure(text, llmStructure)

      if (llmValidated.sections.length > 0) {
        const llmChunks = chunkSections(text, llmValidated.sections, opts)
        const llmRatio = estimatedPages > 0 ? llmChunks.length / estimatedPages : llmChunks.length

        // Only use LLM chunks if they're better quality
        if (llmChunks.length > chunks.length || llmRatio >= 2) {
          chunks = llmChunks
          structureSource = "llm"
          console.log(
            `[legal-chunker] LLM re-chunking improved results: ` +
              `${llmChunks.length} chunks (ratio: ${llmRatio.toFixed(1)})`
          )
        }
      }
    } catch (error) {
      console.warn(
        `[legal-chunker] LLM re-chunking failed, using initial chunks:`,
        error
      )
    }
  }

  // Step 5: Post-process - merge short chunks, split oversized chunks
  chunks = mergeShortChunks(chunks, opts.minChunkTokens)
  chunks = splitOversizedChunks(chunks, opts.maxTokens)

  // Step 6: Annotate cross-references on all chunks
  for (const chunk of chunks) {
    chunk.metadata.references = extractCrossReferences(chunk.content)
    chunk.metadata.structureSource = structureSource
  }

  // Step 7: Add overlap between consecutive chunks
  chunks = addOverlap(chunks, opts.overlapTokens)

  // Step 8: Re-index all chunks sequentially
  for (let i = 0; i < chunks.length; i++) {
    chunks[i].index = i
    chunks[i].id = `chunk-${i}`
  }

  return chunks
}

// ============================================================================
// Section Dispatch
// ============================================================================

/**
 * Dispatches each section to the appropriate chunking strategy based on type.
 * Also handles gaps between sections.
 */
function chunkSections(
  text: string,
  sections: PositionedSection[],
  opts: Required<LegalChunkOptions>
): LegalChunk[] {
  const chunks: LegalChunk[] = []

  // Sort sections by start offset to process in document order
  const sorted = [...sections].sort((a, b) => a.startOffset - b.startOffset)

  // Handle text before first section
  if (sorted.length > 0 && sorted[0].startOffset > 0) {
    const preambleText = text.slice(0, sorted[0].startOffset).trim()
    if (preambleText && countVoyageTokensSync(preambleText) >= 10) {
      chunks.push(...chunkFallback(preambleText, 0, opts, ["Preamble"]))
    }
  }

  // Process each section
  for (let i = 0; i < sorted.length; i++) {
    const section = sorted[i]
    const sectionChunks = dispatchSection(section, text, opts)
    chunks.push(...sectionChunks)

    // Handle gaps between sections
    if (i + 1 < sorted.length) {
      const gapStart = section.endOffset
      const gapEnd = sorted[i + 1].startOffset

      if (gapEnd > gapStart) {
        const gapText = text.slice(gapStart, gapEnd).trim()
        if (gapText && countVoyageTokensSync(gapText) >= 10) {
          chunks.push(
            ...chunkFallback(gapText, gapStart, opts, section.sectionPath)
          )
        }
      }
    }
  }

  // Handle text after last section
  if (sorted.length > 0) {
    const lastEnd = sorted[sorted.length - 1].endOffset
    if (lastEnd < text.length) {
      const trailingText = text.slice(lastEnd).trim()
      if (trailingText && countVoyageTokensSync(trailingText) >= 10) {
        chunks.push(...chunkFallback(trailingText, lastEnd, opts, ["Trailing"]))
      }
    }
  }

  return chunks
}

/**
 * Dispatches a single section to its type-specific chunking strategy.
 *
 * Recitals are detected by checking if the section content contains
 * WHEREAS patterns, since the SectionType enum doesn't include a
 * dedicated recital type (they appear as 'clause' or 'other').
 */
function dispatchSection(
  section: PositionedSection,
  text: string,
  opts: Required<LegalChunkOptions>
): LegalChunk[] {
  // Check for recital content (WHEREAS patterns) regardless of section type
  const sectionContent = text.slice(
    Math.max(0, section.startOffset),
    Math.min(text.length, section.endOffset)
  )
  if (/WHEREAS/i.test(sectionContent) || /recital/i.test(section.title)) {
    return chunkRecital(section, text, opts)
  }

  switch (section.type) {
    case "definitions":
      return chunkDefinitions(section, text, opts)

    case "clause":
    case "heading":
    case "other":
    case "amendment":
      return chunkClause(section, text, opts)

    case "signature":
      return chunkBoilerplate(section, text, opts)

    case "exhibit":
    case "schedule":
      return chunkExhibit(section, text, opts)

    case "cover_letter":
      return chunkBoilerplate(section, text, opts)

    default:
      // Fallback for unknown section types
      return chunkClause(section, text, opts)
  }
}

// ============================================================================
// Structure Validation
// ============================================================================

/**
 * Validates and sanitizes a DocumentStructure before chunking.
 *
 * Checks:
 * - Section positions are within text bounds (clamps if out of bounds)
 * - Sections don't overlap (logs warning if found)
 * - Coverage gaps are reasonable (logs warning if > 20% uncovered)
 */
function validateStructure(
  text: string,
  structure: DocumentStructure
): DocumentStructure {
  const textLength = text.length
  const sections: PositionedSection[] = []

  for (const section of structure.sections) {
    // Clamp positions to valid range
    const startOffset = Math.max(0, section.startOffset)
    const endOffset = Math.min(textLength, section.endOffset)

    // Ensure end is after start
    if (endOffset <= startOffset) {
      console.warn(
        `[legal-chunker] Section "${section.title}" has invalid range ` +
          `[${section.startOffset}, ${section.endOffset}], skipping`
      )
      continue
    }

    // Log warning if positions were clamped
    if (startOffset !== section.startOffset || endOffset !== section.endOffset) {
      console.warn(
        `[legal-chunker] Section "${section.title}" positions clamped: ` +
          `[${section.startOffset}, ${section.endOffset}] -> [${startOffset}, ${endOffset}]`
      )
    }

    sections.push({
      ...section,
      startOffset,
      endOffset,
    })
  }

  // Check for overlapping sections
  const sorted = [...sections].sort((a, b) => a.startOffset - b.startOffset)
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endOffset > sorted[i + 1].startOffset) {
      console.warn(
        `[legal-chunker] Overlapping sections detected: "${sorted[i].title}" ` +
          `ends at ${sorted[i].endOffset} but "${sorted[i + 1].title}" starts at ${sorted[i + 1].startOffset}`
      )
    }
  }

  // Check for large gaps (> 20% uncovered)
  if (sorted.length > 0 && textLength > 0) {
    let coveredChars = 0
    for (const s of sorted) {
      coveredChars += s.endOffset - s.startOffset
    }
    const coverageRatio = coveredChars / textLength
    if (coverageRatio < 0.8) {
      console.warn(
        `[legal-chunker] Low structure coverage: ${(coverageRatio * 100).toFixed(1)}% ` +
          `of text covered by sections (${coveredChars}/${textLength} chars)`
      )
    }
  }

  return {
    ...structure,
    sections,
  }
}

// ============================================================================
// Overlap Application
// ============================================================================

/**
 * Adds overlap tokens between consecutive chunks for context continuity.
 *
 * For each chunk after the first, prepends up to `overlapTokens` tokens
 * from the end of the previous chunk. The overlap text is prepended to
 * the chunk content, and metadata is updated accordingly.
 *
 * Note: startPosition/endPosition still reference the original text
 * positions (without overlap). The overlap is for embedding quality only.
 */
function addOverlap(chunks: LegalChunk[], overlapTokens: number): LegalChunk[] {
  if (overlapTokens <= 0 || chunks.length <= 1) return chunks

  const result: LegalChunk[] = [chunks[0]]

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1]
    const currentChunk = chunks[i]

    // Extract overlap text from end of previous chunk
    const overlapText = extractOverlapText(prevChunk.content, overlapTokens)

    if (overlapText) {
      const overlapTokenCount = countVoyageTokensSync(overlapText)
      result.push({
        ...currentChunk,
        content: overlapText + "\n\n" + currentChunk.content,
        tokenCount: countVoyageTokensSync(overlapText + "\n\n" + currentChunk.content),
        metadata: {
          ...currentChunk.metadata,
          isOverlap: true,
          overlapTokens: overlapTokenCount,
        },
      })
    } else {
      result.push(currentChunk)
    }
  }

  return result
}

/**
 * Extracts approximately N tokens from the end of text for overlap.
 * Uses word boundaries to avoid cutting mid-word.
 */
function extractOverlapText(text: string, targetTokens: number): string {
  const words = text.split(/\s+/)
  const overlapWords: string[] = []

  for (let i = words.length - 1; i >= 0; i--) {
    overlapWords.unshift(words[i])
    const candidateTokens = countVoyageTokensSync(overlapWords.join(" "))
    if (candidateTokens >= targetTokens) break
  }

  const result = overlapWords.join(" ")
  // Don't return the entire previous chunk as overlap
  if (countVoyageTokensSync(result) > targetTokens * 1.5) {
    // Trim back
    while (
      overlapWords.length > 1 &&
      countVoyageTokensSync(overlapWords.join(" ")) > targetTokens
    ) {
      overlapWords.shift()
    }
    return overlapWords.join(" ")
  }

  return result
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Infers whether the structure was detected via regex or LLM.
 * Heuristic: if sections have typical regex-detected titles (ARTICLE, Section),
 * it's regex; otherwise assume LLM.
 */
function inferStructureSource(
  structure: DocumentStructure
): "regex" | "llm" {
  if (structure.sections.length === 0) return "regex"

  const regexIndicators = /^(ARTICLE|Section|SECTION|\d+\.)/i
  const regexCount = structure.sections.filter((s) =>
    regexIndicators.test(s.title)
  ).length

  return regexCount > structure.sections.length / 2 ? "regex" : "llm"
}
