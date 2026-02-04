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
