/**
 * @fileoverview OCR type definitions
 * @module lib/ocr/types
 */

/** Confidence threshold below which a warning is shown (85%) */
export const CONFIDENCE_THRESHOLD = 85

/** Confidence threshold below which OCR may be unusable (60%) */
export const CRITICAL_THRESHOLD = 60

/** Maximum pages to OCR (memory/time constraint) */
export const MAX_OCR_PAGES = 100

/** OCR result for a single page */
export interface OcrPageResult {
  pageNumber: number
  text: string
  /** Tesseract confidence 0-100 */
  confidence: number
}

/** Aggregated OCR result for entire document */
export interface OcrResult {
  /** Combined text from all pages */
  text: string
  /** Per-page results */
  pages: OcrPageResult[]
  /** Average confidence across all pages */
  averageConfidence: number
  /** Page numbers with confidence below CONFIDENCE_THRESHOLD */
  lowConfidencePages: number[]
}

/** Quality assessment of OCR output */
export interface OcrQuality {
  /** Average confidence 0-100 */
  confidence: number
  /** True if warning should be shown to user */
  isLowQuality: boolean
  /** User-facing warning message (if applicable) */
  warningMessage?: string
  /** Pages with confidence below threshold */
  affectedPages: number[]
}

/** Options for PDF-to-image conversion */
export interface PdfToImageOptions {
  /** Scale factor for rendering (2.0 = 2x resolution, better for OCR) */
  scale?: number
  /** Maximum pages to render (default: MAX_OCR_PAGES) */
  maxPages?: number
}

/** A rendered PDF page as image buffer */
export interface RenderedPage {
  pageNumber: number
  /** Image data as Uint8Array (PNG format) */
  image: Uint8Array
}
