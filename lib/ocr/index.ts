/**
 * @fileoverview OCR module exports
 * @module lib/ocr
 *
 * IMPORTANT: This barrel only exports types and lightweight utilities.
 * Heavy processing functions (ocr-processor, tesseract-worker) should be
 * imported directly to avoid pulling in large dependencies.
 */

// Types are always safe to export
export * from "./types"

// PDF-to-image uses dynamic import internally, safe to export
export { renderPdfPages } from "./pdf-to-image"
