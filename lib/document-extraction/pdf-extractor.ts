/**
 * @fileoverview PDF text extraction with error handling
 * @module lib/document-extraction/pdf-extractor
 */

import { EncryptedDocumentError, CorruptDocumentError } from '@/lib/errors'
import type { ExtractionResult } from './types'
import { validateExtractionQuality } from './validators'

/**
 * Extracts text from PDF buffer with proper error handling.
 *
 * Uses dynamic import for pdf-parse per CLAUDE.md decision [02-01]
 * to avoid barrel export issues with pdfjs-dist browser dependencies.
 *
 * **Linearization:** pdf-parse (via pdfjs-dist) outputs text in reading order,
 * effectively linearizing multi-column layouts. Per CONTEXT.md decision
 * "Linearize PDF layout completely (single-column, discard visual layout)",
 * we rely on pdf-parse's default text extraction which outputs content
 * sequentially as encountered in the PDF content stream.
 *
 * @throws EncryptedDocumentError - Password-protected PDF
 * @throws CorruptDocumentError - Invalid or corrupt PDF
 */
export async function extractPdf(
  buffer: Buffer,
  fileSize?: number
): Promise<ExtractionResult> {
  // Dynamic import to avoid barrel export issues with pdfjs-dist browser deps
  const { PDFParse, PasswordException, InvalidPDFException } =
    await import('pdf-parse')

  try {
    const pdfParser = new PDFParse({ data: buffer })
    const result = await pdfParser.getText()

    // NFC normalize per CONTEXT.md
    const text = result.text.normalize('NFC')

    // Validate quality with file size
    const quality = validateExtractionQuality(text, fileSize ?? buffer.length)
    quality.pageCount = result.pages.length

    // Extract metadata via getInfo()
    const info = await pdfParser.getInfo()
    const metadata = {
      title: info.info?.Title,
      author: info.info?.Author,
      creationDate: info.info?.CreationDate,
      modificationDate: info.info?.ModDate,
    }

    return {
      text,
      quality,
      pageCount: quality.pageCount,
      metadata,
    }
  } catch (error: unknown) {
    // Handle pdf-parse specific error classes
    if (error instanceof PasswordException) {
      throw new EncryptedDocumentError()
    }
    if (error instanceof InvalidPDFException) {
      throw new CorruptDocumentError()
    }

    // Fallback to message-based detection for other errors
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (
      errorMessage.includes('password') ||
      errorMessage.includes('encrypted')
    ) {
      throw new EncryptedDocumentError()
    }
    if (
      errorMessage.includes('Invalid PDF') ||
      errorMessage.includes('not a PDF')
    ) {
      throw new CorruptDocumentError()
    }
    // Re-throw unknown errors
    throw error
  }
}
