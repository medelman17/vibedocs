/**
 * @fileoverview Chunking strategy implementations for different legal section types.
 *
 * Each strategy function takes a positioned section (from Phase 3 structure
 * detection) and produces an array of LegalChunk objects. The strategies
 * handle legal-specific structures:
 *
 * - **Definitions:** One chunk per defined term
 * - **Clauses:** Detect and split sub-clauses (a), (b), (c)
 * - **Recitals:** Each WHEREAS paragraph becomes its own chunk
 * - **Boilerplate:** Signature blocks, notices, governing law
 * - **Exhibits:** Exhibit/schedule content
 * - **Fallback:** Paragraph-based splitting for unstructured text
 *
 * All strategy functions return LegalChunk[] with correct positions
 * referencing the original full text, not sliced content.
 *
 * @module lib/document-chunking/chunk-strategies
 */

import type { PositionedSection } from "@/lib/document-extraction/types"
import type { LegalChunk, ChunkType, LegalChunkOptions } from "./types"
import { countVoyageTokensSync } from "./token-counter"

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

function resolveOptions(
  options?: Partial<LegalChunkOptions>
): Required<LegalChunkOptions> {
  return { ...DEFAULT_OPTIONS, ...options }
}

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Creates a LegalChunk with standard defaults.
 * Index and id are placeholders -- the legal chunker re-indexes all chunks.
 */
function createChunk(
  content: string,
  chunkType: ChunkType,
  sectionPath: string[],
  startPosition: number,
  endPosition: number,
  structureSource: "regex" | "llm" = "regex",
  parentClauseIntro?: string
): LegalChunk {
  return {
    id: "chunk-0", // Will be re-indexed by legal-chunker
    index: 0,
    content,
    sectionPath: [...sectionPath],
    tokenCount: countVoyageTokensSync(content),
    startPosition,
    endPosition,
    chunkType,
    metadata: {
      parentClauseIntro,
      references: [], // Annotated later by cross-reference module
      isOverlap: false,
      overlapTokens: 0,
      structureSource,
    },
  }
}

/**
 * Extracts section text from the full document text using section positions.
 */
function getSectionText(section: PositionedSection, fullText: string): string {
  const start = Math.max(0, section.startOffset)
  const end = Math.min(fullText.length, section.endOffset)
  return fullText.slice(start, end)
}

// ============================================================================
// Definition Strategy
// ============================================================================

/**
 * Pattern matching individual definition entries.
 * Handles both smart quotes and straight quotes around defined terms.
 * Matches: "Term" means..., "Term" shall mean..., "Term" refers to...,
 *          "Term" has the meaning...
 */
const DEFINITION_ENTRY_PATTERN =
  /["""]([^"""]+)["""]\s+(?:means|shall mean|refers to|has the meaning|is defined as)[^]*?(?=\n\s*["""]|\n\s*\n|$)/gim

/**
 * Chunks a definitions section into one chunk per defined term.
 *
 * Each definition becomes a standalone retrievable chunk, allowing
 * downstream agents to cross-reference specific terms. If a definition
 * cannot be parsed by the regex, the remaining text falls through
 * to a single fallback chunk.
 */
export function chunkDefinitions(
  section: PositionedSection,
  fullText: string,
  options?: Partial<LegalChunkOptions>
): LegalChunk[] {
  const _opts = resolveOptions(options)
  const sectionText = getSectionText(section, fullText)
  const chunks: LegalChunk[] = []
  const coveredRanges: Array<{ start: number; end: number }> = []

  // Find all definition entries
  const matches = Array.from(sectionText.matchAll(DEFINITION_ENTRY_PATTERN))

  for (const match of matches) {
    const definedTerm = match[1]
    const defContent = match[0].trim()
    const matchStart = match.index!
    const matchEnd = matchStart + match[0].length

    if (!defContent) continue

    coveredRanges.push({ start: matchStart, end: matchEnd })

    chunks.push(
      createChunk(
        defContent,
        "definition",
        [...section.sectionPath, `Definition: ${definedTerm}`],
        section.startOffset + matchStart,
        section.startOffset + matchEnd,
        "regex"
      )
    )
  }

  // Handle any uncovered text in the definitions section as a fallback chunk
  if (matches.length === 0 && sectionText.trim()) {
    // No definitions matched -- chunk the entire section as a clause
    chunks.push(
      createChunk(
        sectionText.trim(),
        "clause",
        section.sectionPath,
        section.startOffset,
        section.endOffset,
        "regex"
      )
    )
  }

  // If we had definitions but there's a preamble before first definition, capture it
  if (matches.length > 0) {
    const firstMatchStart = matches[0].index!
    const preamble = sectionText.slice(0, firstMatchStart).trim()
    if (preamble && countVoyageTokensSync(preamble) >= 10) {
      chunks.unshift(
        createChunk(
          preamble,
          "clause",
          section.sectionPath,
          section.startOffset,
          section.startOffset + firstMatchStart,
          "regex"
        )
      )
    }
  }

  return chunks
}

// ============================================================================
// Clause Strategy (with Sub-Clause Detection)
// ============================================================================

/**
 * Pattern for lettered sub-clauses: (a), (b), (c), etc.
 * Must be preceded by a newline (or start of string) and whitespace.
 */
const SUB_CLAUSE_PATTERN = /(?:^|\n)\s*\(([a-z])\)\s+/g

/**
 * Chunks a clause section, detecting and splitting sub-clauses (a), (b), (c).
 *
 * If the clause contains lettered sub-clauses, each becomes its own chunk
 * with the parent clause intro stored in metadata. If no sub-clauses are
 * found, the entire clause becomes a single chunk.
 */
export function chunkClause(
  section: PositionedSection,
  fullText: string,
  options?: Partial<LegalChunkOptions>
): LegalChunk[] {
  const _opts = resolveOptions(options)
  const sectionText = getSectionText(section, fullText)

  if (!sectionText.trim()) return []

  // Check for sub-clauses
  const subClauseMatches = Array.from(sectionText.matchAll(SUB_CLAUSE_PATTERN))

  if (subClauseMatches.length === 0) {
    // No sub-clauses -- single chunk for the whole clause
    return [
      createChunk(
        sectionText.trim(),
        "clause",
        section.sectionPath,
        section.startOffset,
        section.endOffset,
        "regex"
      ),
    ]
  }

  const chunks: LegalChunk[] = []

  // Extract intro text (before first sub-clause)
  const firstSubStart = subClauseMatches[0].index!
  const introText = sectionText.slice(0, firstSubStart).trim()

  // Truncate intro to ~100 tokens for parentClauseIntro metadata
  const introForMetadata = introText
    ? truncateToTokens(introText, 100)
    : undefined

  // If intro is substantial, make it its own chunk
  if (introText && countVoyageTokensSync(introText) >= 20) {
    chunks.push(
      createChunk(
        introText,
        "clause",
        section.sectionPath,
        section.startOffset,
        section.startOffset + firstSubStart,
        "regex"
      )
    )
  }

  // Create a chunk for each sub-clause
  for (let i = 0; i < subClauseMatches.length; i++) {
    const match = subClauseMatches[i]
    const letter = match[1]
    const subStart = match.index!
    const subEnd =
      i + 1 < subClauseMatches.length
        ? subClauseMatches[i + 1].index!
        : sectionText.length

    const subContent = sectionText.slice(subStart, subEnd).trim()
    if (!subContent) continue

    chunks.push(
      createChunk(
        subContent,
        "sub-clause",
        [...section.sectionPath, `(${letter})`],
        section.startOffset + subStart,
        section.startOffset + subEnd,
        "regex",
        introForMetadata
      )
    )
  }

  return chunks
}

// ============================================================================
// Boilerplate Strategy
// ============================================================================

/**
 * Chunks signature blocks, notices, governing law, and other boilerplate
 * sections. These are chunked for document reconstruction and highlighting
 * but marked as boilerplate to skip embedding.
 */
export function chunkBoilerplate(
  section: PositionedSection,
  fullText: string,
  options?: Partial<LegalChunkOptions>
): LegalChunk[] {
  const _opts = resolveOptions(options)
  const sectionText = getSectionText(section, fullText)

  if (!sectionText.trim()) return []

  return [
    createChunk(
      sectionText.trim(),
      "boilerplate",
      section.sectionPath,
      section.startOffset,
      section.endOffset,
      "regex"
    ),
  ]
}

// ============================================================================
// Exhibit Strategy
// ============================================================================

/**
 * Chunks exhibit/schedule content. Exhibits are chunked with normal treatment
 * as they may contain substantive terms.
 */
export function chunkExhibit(
  section: PositionedSection,
  fullText: string,
  options?: Partial<LegalChunkOptions>
): LegalChunk[] {
  const _opts = resolveOptions(options)
  const sectionText = getSectionText(section, fullText)

  if (!sectionText.trim()) return []

  // For short exhibits, keep as one chunk
  if (countVoyageTokensSync(sectionText) <= _opts.maxTokens) {
    return [
      createChunk(
        sectionText.trim(),
        "exhibit",
        section.sectionPath,
        section.startOffset,
        section.endOffset,
        "regex"
      ),
    ]
  }

  // For longer exhibits, use paragraph-based fallback
  return chunkFallback(
    sectionText,
    section.startOffset,
    options,
    section.sectionPath,
    "exhibit"
  )
}

// ============================================================================
// Recital Strategy
// ============================================================================

/**
 * Pattern for WHEREAS paragraphs in recitals/preamble.
 */
const WHEREAS_PATTERN = /(?:^|\n)\s*(WHEREAS[,:]?\s+[^]*?)(?=\n\s*WHEREAS|\n\s*NOW,?\s+THEREFORE|$)/gi

/**
 * Chunks recital/preamble sections. Each WHEREAS paragraph becomes its own chunk.
 * If no WHEREAS pattern is found, falls back to paragraph splitting.
 */
export function chunkRecital(
  section: PositionedSection,
  fullText: string,
  _options?: Partial<LegalChunkOptions>
): LegalChunk[] {
  const sectionText = getSectionText(section, fullText)

  if (!sectionText.trim()) return []

  const whereasMatches = Array.from(sectionText.matchAll(WHEREAS_PATTERN))

  if (whereasMatches.length === 0) {
    // No WHEREAS found -- treat as a regular clause
    return [
      createChunk(
        sectionText.trim(),
        "recital",
        section.sectionPath,
        section.startOffset,
        section.endOffset,
        "regex"
      ),
    ]
  }

  const chunks: LegalChunk[] = []

  for (let i = 0; i < whereasMatches.length; i++) {
    const match = whereasMatches[i]
    const content = match[1].trim()
    if (!content) continue

    const matchStart = match.index!
    const matchEnd = matchStart + match[0].length

    chunks.push(
      createChunk(
        content,
        "recital",
        [...section.sectionPath, `Recital ${i + 1}`],
        section.startOffset + matchStart,
        section.startOffset + matchEnd,
        "regex"
      )
    )
  }

  return chunks.length > 0 ? chunks : [
    createChunk(
      sectionText.trim(),
      "recital",
      section.sectionPath,
      section.startOffset,
      section.endOffset,
      "regex"
    ),
  ]
}

// ============================================================================
// Fallback Strategy (Paragraph-Based Splitting)
// ============================================================================

/**
 * Paragraph-based fallback chunking for unstructured text.
 *
 * Splits text into paragraphs and groups them into chunks that
 * stay under the target token limit. Used when structure detection
 * returns no sections or for text gaps between detected sections.
 */
export function chunkFallback(
  text: string,
  startOffset: number,
  options?: Partial<LegalChunkOptions>,
  sectionPath?: string[],
  chunkTypeOverride?: ChunkType
): LegalChunk[] {
  const opts = resolveOptions(options)
  const chunks: LegalChunk[] = []
  const paragraphs = text.split(/\n\s*\n/)
  const path = sectionPath ?? []
  const chunkType: ChunkType = chunkTypeOverride ?? "fallback"

  let currentContent = ""
  let currentStart = startOffset
  let currentOffset = startOffset

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) {
      // Track the empty paragraph's position
      currentOffset += para.length + 1 // +1 for the split delimiter
      continue
    }

    // Find the actual position of this paragraph in the original text
    const paraStart = text.indexOf(para, currentOffset - startOffset) + startOffset
    const paraEnd = paraStart + para.length

    const potential = currentContent
      ? currentContent + "\n\n" + trimmed
      : trimmed
    const potentialTokens = countVoyageTokensSync(potential)

    if (potentialTokens > opts.targetTokens && currentContent) {
      // Save current chunk
      chunks.push(
        createChunk(
          currentContent,
          chunkType,
          path,
          currentStart,
          currentStart + currentContent.length,
          "regex"
        )
      )
      currentContent = trimmed
      currentStart = paraStart
    } else {
      if (!currentContent) {
        currentStart = paraStart
      }
      currentContent = potential
    }

    currentOffset = paraEnd
  }

  // Don't forget the last chunk
  if (currentContent.trim()) {
    chunks.push(
      createChunk(
        currentContent.trim(),
        chunkType,
        path,
        currentStart,
        currentStart + currentContent.length,
        "regex"
      )
    )
  }

  return chunks
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Truncates text to approximately the specified number of tokens.
 * Uses word boundaries to avoid cutting mid-word.
 */
function truncateToTokens(text: string, maxTokens: number): string {
  if (countVoyageTokensSync(text) <= maxTokens) return text

  const words = text.split(/\s+/)
  let result = ""

  for (const word of words) {
    const candidate = result ? result + " " + word : word
    if (countVoyageTokensSync(candidate) > maxTokens) break
    result = candidate
  }

  return result || words[0] // At minimum return the first word
}
