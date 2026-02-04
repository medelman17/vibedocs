/**
 * @fileoverview Document extraction type definitions
 * @module lib/document-extraction/types
 */

export interface ExtractionWarning {
  type:
    | 'ocr_required'
    | 'docx_warning'
    | 'embedded_images'
    | 'low_confidence'
    | 'non_english'
  message: string
}

export interface QualityMetrics {
  /** Total character count after normalization */
  charCount: number
  /** Estimated word count */
  wordCount: number
  /** Number of pages (PDF only, 1 for DOCX) */
  pageCount: number
  /** Extraction confidence 0-1 based on text density */
  confidence: number
  /** Warnings from extraction process */
  warnings: ExtractionWarning[]
  /** True if document should be routed to OCR */
  requiresOcr: boolean
}

export interface DocumentMetadata {
  title?: string
  author?: string
  creationDate?: string
  modificationDate?: string
}

export interface ExtractionResult {
  /** Extracted text, NFC-normalized UTF-8 */
  text: string
  /** Quality metrics for validation gates */
  quality: QualityMetrics
  /** Page count from source document */
  pageCount: number
  /** Document metadata if available */
  metadata: DocumentMetadata
}

// ============================================================================
// Structure Detection Types
// ============================================================================

export type SectionType =
  | 'heading'
  | 'definitions'
  | 'clause'
  | 'signature'
  | 'exhibit'
  | 'schedule'
  | 'amendment'
  | 'cover_letter'
  | 'other'

export interface DocumentSection {
  /** Section title/heading */
  title: string
  /** Hierarchy level (1=main, 2=subsection, 3=sub-subsection, 4=paragraph) */
  level: 1 | 2 | 3 | 4
  /** Raw content of the section */
  content: string
  /** Section type for filtering */
  type: SectionType
}

export interface PositionedSection extends DocumentSection {
  /** Character offset where section starts in full text */
  startOffset: number
  /** Character offset where section ends in full text */
  endOffset: number
  /** Full path in document hierarchy, e.g. ["Article 5", "Section 5.2"] */
  sectionPath: string[]
}

export interface PartyInfo {
  /** Disclosing party name if detected */
  disclosing?: string
  /** Receiving party name if detected */
  receiving?: string
}

export interface DocumentStructure {
  /** All sections with positions */
  sections: PositionedSection[]
  /** Detected party names */
  parties: PartyInfo
  /** Whether document has exhibits/schedules (excluded from analysis) */
  hasExhibits: boolean
  /** Whether document has signature block (excluded from analysis) */
  hasSignatureBlock: boolean
  /** Whether redacted text was detected */
  hasRedactedText: boolean
}
