/**
 * @fileoverview PDF text extraction with error handling
 *
 * Uses unpdf (serverless-optimized PDF.js build) instead of pdf-parse
 * to avoid DOMMatrix/pdfjs-dist browser dependency issues in production.
 *
 * @module lib/document-extraction/pdf-extractor
 */

import { EncryptedDocumentError, CorruptDocumentError } from '@/lib/errors'
import type { ExtractionResult } from './types'
import { validateExtractionQuality } from './validators'

/**
 * Extracts text from PDF buffer with proper error handling.
 *
 * **Linearization:** PDF.js outputs text in reading order,
 * effectively linearizing multi-column layouts. Per CONTEXT.md decision
 * "Linearize PDF layout completely (single-column, discard visual layout)",
 * we rely on PDF.js's default text extraction which outputs content
 * sequentially as encountered in the PDF content stream.
 *
 * @throws EncryptedDocumentError - Password-protected PDF
 * @throws CorruptDocumentError - Invalid or corrupt PDF
 */
export async function extractPdf(
  buffer: Buffer,
  fileSize?: number
): Promise<ExtractionResult> {
  const { extractText, getMeta, getDocumentProxy } = await import('unpdf')

  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))

    const { totalPages, text: rawText } = await extractText(pdf, { mergePages: true })

    // NFC normalize per CONTEXT.md
    const text = (rawText as string).normalize('NFC')

    // Validate quality with file size
    const quality = validateExtractionQuality(text, fileSize ?? buffer.length)
    quality.pageCount = totalPages

    // Extract metadata
    let metadata: Record<string, string | undefined> = {}
    try {
      const { info } = await getMeta(pdf)
      metadata = {
        title: info?.Title,
        author: info?.Author,
        creationDate: info?.CreationDate,
        modificationDate: info?.ModDate,
      }
    } catch {
      // Metadata extraction is optional — don't fail the whole extraction
    }

    await pdf.destroy()

    return {
      text,
      quality,
      pageCount: totalPages,
      metadata,
    }
  } catch (error: unknown) {
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
