/**
 * @fileoverview PDF to image conversion for OCR
 * @module lib/ocr/pdf-to-image
 */

import type { PdfToImageOptions, RenderedPage } from "./types"
import { MAX_OCR_PAGES } from "./types"

/**
 * Render PDF pages as images for OCR processing.
 *
 * Uses dynamic import for pdf-to-img to avoid barrel export issues
 * (same pattern as pdf-parse - see CLAUDE.md "Barrel Exports" section).
 *
 * @param buffer - PDF file as Buffer
 * @param options - Rendering options
 * @returns Async generator yielding rendered pages
 *
 * @example
 * ```ts
 * const pages: RenderedPage[] = []
 * for await (const page of renderPdfPages(buffer)) {
 *   pages.push(page)
 * }
 * ```
 */
export async function* renderPdfPages(
  buffer: Buffer,
  options: PdfToImageOptions = {}
): AsyncGenerator<RenderedPage> {
  const { scale = 2.0, maxPages = MAX_OCR_PAGES } = options

  // Dynamic import to avoid barrel export issues with pdfjs-dist
  const { pdf } = await import("pdf-to-img")

  const document = await pdf(buffer, { scale })

  let pageNumber = 0
  for await (const pageImage of document) {
    pageNumber++

    if (pageNumber > maxPages) {
      console.log("[OCR] Reached max pages limit", {
        maxPages,
        totalPages: pageNumber,
      })
      break
    }

    yield {
      pageNumber,
      image: pageImage as Uint8Array,
    }
  }
}
