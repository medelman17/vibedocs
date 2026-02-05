/**
 * @fileoverview Type definitions for document rendering with clause highlighting.
 *
 * These types support the text-to-markdown conversion pipeline and clause overlay
 * system. The rendering pipeline converts raw document text (stored in DB) to
 * markdown with heading syntax, while maintaining accurate character offset
 * mappings so clause highlights appear on the correct text.
 *
 * @module lib/document-rendering/types
 */

import type { PositionedSection, DocumentStructure } from "@/lib/document-extraction/types"

// Re-export upstream types for rendering consumers
export type { PositionedSection, DocumentStructure }

// ============================================================================
// Offset Mapping
// ============================================================================

/**
 * A single offset translation point between original text and markdown text.
 *
 * Records where characters were inserted (e.g., heading prefixes like "# ")
 * so that downstream code can translate clause positions from the original
 * coordinate system to the markdown coordinate system.
 */
export interface OffsetMapping {
  /** Character position in the original raw text */
  original: number
  /** Corresponding character position in the markdown text */
  markdown: number
}

// ============================================================================
// Markdown Conversion
// ============================================================================

/**
 * Result of converting raw text to markdown.
 *
 * Contains the converted markdown string and the offset map needed to
 * translate clause positions through the transformation.
 */
export interface MarkdownConversion {
  /** The converted markdown text with heading prefixes inserted */
  markdown: string
  /** Ordered array of offset translation points */
  offsetMap: OffsetMapping[]
}

// ============================================================================
// Document Segments (for Virtualization)
// ============================================================================

/**
 * A paragraph-level segment of the document for virtual scrolling.
 *
 * The document viewer uses windowed rendering (react-window) to handle
 * large documents. Each segment represents one paragraph that can be
 * independently measured and rendered.
 */
export interface DocumentSegment {
  /** The paragraph text content (in markdown) */
  text: string
  /** Start offset in the markdown text */
  startOffset: number
  /** End offset in the markdown text (exclusive) */
  endOffset: number
  /** Zero-based index of this paragraph */
  index: number
}

// ============================================================================
// Clause Overlays
// ============================================================================

/**
 * A clause positioned in both the original and markdown coordinate systems.
 *
 * Used by the document viewer to highlight clause text. Contains positions
 * in both coordinate systems so the viewer can render highlights on the
 * markdown text while the server action returns positions from the original
 * raw text.
 */
export interface ClauseOverlay {
  /** Unique clause extraction ID (from DB) */
  clauseId: string
  /** CUAD taxonomy category */
  category: string
  /** Risk level: standard | cautious | aggressive | unknown */
  riskLevel: string
  /** Classification confidence 0-1 */
  confidence: number
  /** Start position in the original raw text */
  originalStart: number
  /** End position in the original raw text (exclusive) */
  originalEnd: number
  /** Start position in the markdown text */
  markdownStart: number
  /** End position in the markdown text (exclusive) */
  markdownEnd: number
  /** Index of the paragraph segment containing the start of this clause */
  paragraphIndex: number
}

// ============================================================================
// Server Action Data
// ============================================================================

/**
 * Complete data needed to render a document with clause overlays.
 *
 * Returned by the `getDocumentForRendering` server action. Contains
 * raw text, structure metadata, and clause positions. The markdown
 * conversion and clause position mapping happen client-side.
 */
export interface DocumentRenderingData {
  /** Document information */
  document: {
    /** Raw text content from document extraction */
    rawText: string
    /** Document title */
    title: string
    /** Document metadata (pageCount, uploadDate, etc.) */
    metadata: Record<string, unknown>
  }
  /** Document structure with positioned sections */
  structure: DocumentStructure
  /** Clause extractions with positions, ordered by startPosition */
  clauses: ClauseForRendering[]
  /** Current analysis status */
  status: string
  /** Token usage data (may be null if analysis is still running) */
  tokenUsage: {
    total?: { input?: number; output?: number; estimatedCost?: number }
  } | null
}

/**
 * Clause data needed for rendering (subset of full ClauseExtraction).
 */
export interface ClauseForRendering {
  /** Clause extraction ID */
  id: string
  /** CUAD taxonomy category */
  category: string
  /** Risk level */
  riskLevel: string
  /** Start position in raw text */
  startPosition: number | null
  /** End position in raw text (exclusive) */
  endPosition: number | null
  /** Classification confidence 0-1 */
  confidence: number
  /** Extracted clause text */
  clauseText: string
  /** Risk explanation */
  riskExplanation: string | null
}

// ============================================================================
// Risk Level Info
// ============================================================================

/**
 * Visual configuration for a risk level.
 * Used by the document renderer to color-code clause highlights.
 */
export interface RiskLevelInfo {
  /** Risk level key */
  level: string
  /** Display label */
  label: string
  /** Tailwind CSS color class for text */
  color: string
  /** Tailwind CSS color class for background highlight */
  bgColor: string
  /** Tailwind CSS color class for border */
  borderColor: string
}
