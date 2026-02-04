/**
 * @fileoverview Unified document extraction entry point
 *
 * Single function for extracting text from PDF, DOCX, or plain text
 * with validation gates (language, quality) and structured output.
 *
 * @module lib/document-extraction/extract-document
 */

import { ValidationError, OcrRequiredError } from '@/lib/errors'
import { extractPdf } from './pdf-extractor'
import { extractDocx } from './docx-extractor'
import { detectLanguage, validateExtractionQuality } from './validators'
import type { ExtractionResult } from './types'

// ============================================================================
// Types
// ============================================================================

export interface ExtractDocumentOptions {
  /** File size in bytes for quality metrics */
  fileSize?: number
  /** Skip language validation (for testing) */
  skipLanguageCheck?: boolean
  /** Skip OCR routing (return result with requiresOcr flag instead of throwing) */
  skipOcrRouting?: boolean
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extracts text from document buffer with validation.
 *
 * Validation flow:
 * 1. Format detection and raw extraction
 * 2. Quality validation (OCR detection)
 * 3. Language detection (English-only)
 * 4. Return structured result with metrics
 *
 * Per CONTEXT.md:
 * - Block non-English documents with clear message
 * - <100 chars auto-route to OCR (Phase 4)
 * - Log detailed quality metrics for every extraction
 *
 * @throws EncryptedDocumentError - Password-protected PDF
 * @throws CorruptDocumentError - Invalid or corrupt file
 * @throws OcrRequiredError - Document needs OCR processing
 * @throws ValidationError - Non-English document
 */
export async function extractDocument(
  buffer: Buffer,
  mimeType: string,
  options: ExtractDocumentOptions = {}
): Promise<ExtractionResult> {
  const { fileSize = buffer.length, skipLanguageCheck = false, skipOcrRouting = false } = options

  // 1. Extract based on MIME type
  let result: ExtractionResult

  switch (mimeType) {
    case 'application/pdf':
      result = await extractPdf(buffer, fileSize)
      break

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      result = await extractDocx(buffer, fileSize)
      break

    case 'text/plain':
      result = extractPlainText(buffer, fileSize)
      break

    default:
      throw new ValidationError(`Unsupported file type: ${mimeType}`)
  }

  // 2. Check for OCR requirement
  if (result.quality.requiresOcr && !skipOcrRouting) {
    // Log for observability before throwing
    logExtractionMetrics(mimeType, result, 'ocr_required')
    throw new OcrRequiredError()
  }

  // 3. Language validation (English-only per CONTEXT.md)
  if (!skipLanguageCheck && result.text.length > 100) {
    const lang = detectLanguage(result.text)

    if (!lang.isEnglish) {
      // Log for observability before throwing
      logExtractionMetrics(mimeType, result, 'non_english')
      throw new ValidationError(
        'This document appears to be in a non-English language. Analysis is optimized for English documents.'
      )
    }

    // Add warning if low confidence in English detection
    if (lang.confidence < 0.7) {
      result.quality.warnings.push({
        type: 'non_english',
        message: `Document may contain non-English text (confidence: ${(lang.confidence * 100).toFixed(0)}%)`,
      })
    }
  }

  // 4. Log metrics for observability
  logExtractionMetrics(mimeType, result, 'success')

  return result
}

// ============================================================================
// Plain Text Extraction
// ============================================================================

/**
 * Extracts text from plain text buffer.
 */
function extractPlainText(buffer: Buffer, fileSize: number): ExtractionResult {
  const text = buffer.toString('utf-8').normalize('NFC')
  const quality = validateExtractionQuality(text, fileSize)

  return {
    text,
    quality,
    pageCount: 1,
    metadata: {},
  }
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Logs extraction metrics for observability.
 * Per CONTEXT.md: Log detailed quality metrics for every extraction.
 */
function logExtractionMetrics(
  mimeType: string,
  result: ExtractionResult,
  outcome: 'success' | 'ocr_required' | 'non_english'
): void {
  const metrics = {
    mimeType,
    outcome,
    charCount: result.quality.charCount,
    wordCount: result.quality.wordCount,
    pageCount: result.pageCount,
    confidence: result.quality.confidence,
    requiresOcr: result.quality.requiresOcr,
    warningCount: result.quality.warnings.length,
    warnings: result.quality.warnings.map(w => w.type),
    hasTitle: !!result.metadata.title,
    hasAuthor: !!result.metadata.author,
  }

  // Use console for now, can be replaced with structured logging
  console.log('[extraction]', JSON.stringify(metrics))
}
