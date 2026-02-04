/**
 * @fileoverview DOCX text extraction with warnings capture
 * @module lib/document-extraction/docx-extractor
 */

import mammoth from 'mammoth'
import { CorruptDocumentError } from '@/lib/errors'
import type { ExtractionResult, ExtractionWarning } from './types'
import { validateExtractionQuality } from './validators'

/**
 * Extracts text from DOCX buffer with warning capture.
 *
 * mammoth.extractRawText() returns accepted changes (final text),
 * per CONTEXT.md decision "Accept all track changes when extracting DOCX."
 *
 * @throws CorruptDocumentError - Invalid or corrupt DOCX
 */
export async function extractDocx(
  buffer: Buffer,
  fileSize?: number
): Promise<ExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer })

    // NFC normalize per CONTEXT.md
    const text = result.value.normalize('NFC')

    // Validate quality with file size
    const quality = validateExtractionQuality(text, fileSize ?? buffer.length)

    // Capture mammoth warnings (embedded objects, images, etc.)
    const docxWarnings: ExtractionWarning[] = result.messages
      .filter((m) => m.type === 'warning')
      .map((m) => ({
        type: 'docx_warning' as const,
        message: m.message,
      }))

    // Check for embedded images that may contain text
    const hasImages = docxWarnings.some(
      (w) => w.message.includes('image') || w.message.includes('picture')
    )

    if (hasImages) {
      docxWarnings.push({
        type: 'embedded_images',
        message: 'Document contains images that may have text',
      })
      // Lower confidence if images present
      quality.confidence = Math.min(quality.confidence, 0.8)
    }

    quality.warnings.push(...docxWarnings)

    return {
      text,
      quality,
      pageCount: 1, // DOCX doesn't have intrinsic pages
      metadata: {}, // mammoth doesn't extract metadata
    }
  } catch {
    throw new CorruptDocumentError(
      'Could not process this Word document. Try re-uploading or use a different format.'
    )
  }
}
