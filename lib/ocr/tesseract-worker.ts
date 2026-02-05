/**
 * @fileoverview Tesseract.js worker management
 * @module lib/ocr/tesseract-worker
 *
 * Provides worker lifecycle utilities for OCR processing.
 * Workers are memory-intensive - always terminate after use.
 */

import type { Worker } from "tesseract.js"
import type { OcrPageResult } from "./types"

/**
 * Create a Tesseract worker for English text recognition.
 *
 * IMPORTANT: Always call worker.terminate() when done to prevent memory leaks.
 * For multi-page documents, reuse a single worker across pages (more efficient
 * than creating one per page).
 *
 * @returns Initialized Tesseract worker
 *
 * @example
 * ```ts
 * const worker = await createOcrWorker()
 * try {
 *   // Process pages...
 * } finally {
 *   await worker.terminate()
 * }
 * ```
 */
export async function createOcrWorker(): Promise<Worker> {
  // Dynamic import to keep tesseract.js out of initial bundle
  const { createWorker } = await import("tesseract.js")

  // Initialize worker with English language
  // Worker downloads language data on first use (~15MB for eng.traineddata)
  const worker = await createWorker("eng")

  return worker
}

/**
 * Recognize text from an image using a Tesseract worker.
 *
 * @param worker - Initialized Tesseract worker
 * @param image - Image data (Uint8Array, Buffer, or similar)
 * @param pageNumber - Page number for result tracking
 * @returns OCR result with text and confidence
 */
export async function recognizePage(
  worker: Worker,
  image: Uint8Array | Buffer,
  pageNumber: number
): Promise<OcrPageResult> {
  // Tesseract.js accepts Buffer but not Uint8Array directly
  // Convert Uint8Array to Buffer if needed
  const imageBuffer = Buffer.isBuffer(image) ? image : Buffer.from(image)
  const result = await worker.recognize(imageBuffer)

  return {
    pageNumber,
    text: result.data.text,
    // Tesseract confidence is 0-100
    confidence: result.data.confidence,
  }
}
