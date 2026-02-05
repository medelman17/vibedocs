/**
 * @fileoverview Main OCR processor
 * @module lib/ocr/ocr-processor
 *
 * Coordinates PDF-to-image conversion and Tesseract OCR to extract
 * text from scanned PDFs.
 */

import type { OcrResult, PdfToImageOptions } from "./types"
import { CONFIDENCE_THRESHOLD } from "./types"
import { renderPdfPages } from "./pdf-to-image"
import { createOcrWorker, recognizePage } from "./tesseract-worker"

export interface OcrPdfOptions extends PdfToImageOptions {
  /**
   * Callback for progress updates during OCR.
   * Called after each page is processed.
   */
  onProgress?: (processed: number, total: number | null) => void
}

/**
 * Extract text from a scanned PDF using OCR.
 *
 * Process:
 * 1. Render PDF pages as high-resolution images
 * 2. Run Tesseract OCR on each page
 * 3. Aggregate results with confidence metrics
 *
 * Memory considerations (per RESEARCH.md):
 * - Pages processed sequentially to avoid memory exhaustion
 * - Single Tesseract worker reused across all pages
 * - Worker always terminated in finally block
 *
 * @param buffer - PDF file as Buffer
 * @param options - Processing options
 * @returns OCR result with text and confidence metrics
 *
 * @example
 * ```ts
 * const result = await ocrPdf(pdfBuffer, {
 *   onProgress: (done, total) => console.log(`Page ${done}/${total ?? '?'}`)
 * })
 * if (result.averageConfidence < 85) {
 *   console.warn('Low OCR quality')
 * }
 * ```
 */
export async function ocrPdf(
  buffer: Buffer,
  options: OcrPdfOptions = {}
): Promise<OcrResult> {
  const { onProgress, ...pdfOptions } = options

  const worker = await createOcrWorker()

  try {
    const pages: OcrResult["pages"] = []
    let totalConfidence = 0

    // Process pages sequentially to manage memory
    // (parallel processing would load all images into memory at once)
    for await (const renderedPage of renderPdfPages(buffer, pdfOptions)) {
      const pageResult = await recognizePage(
        worker,
        renderedPage.image,
        renderedPage.pageNumber
      )

      pages.push(pageResult)
      totalConfidence += pageResult.confidence

      // Report progress (total unknown until we finish iterating)
      onProgress?.(pages.length, null)
    }

    // Aggregate results
    const averageConfidence = pages.length > 0 ? totalConfidence / pages.length : 0

    const lowConfidencePages = pages
      .filter((p) => p.confidence < CONFIDENCE_THRESHOLD)
      .map((p) => p.pageNumber)

    const fullText = pages.map((p) => p.text).join("\n\n")

    console.log("[OCR] Processing complete", {
      pages: pages.length,
      averageConfidence: averageConfidence.toFixed(1),
      lowConfidencePages: lowConfidencePages.length,
    })

    return {
      text: fullText,
      pages,
      averageConfidence,
      lowConfidencePages,
    }
  } finally {
    // CRITICAL: Always terminate worker to prevent memory leaks
    await worker.terminate()
  }
}
