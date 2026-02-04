/**
 * @fileoverview Extraction quality validation utilities
 * @module lib/document-extraction/validators
 */

import type { QualityMetrics, ExtractionWarning } from './types'

const MIN_TEXT_LENGTH = 100 // Per CONTEXT.md decision
const MIN_TEXT_TO_SIZE_RATIO = 0.001 // Very low = likely scanned

/**
 * Validates extraction quality and determines if OCR is needed.
 *
 * Per CONTEXT.md: Documents with <100 chars auto-route to OCR.
 */
export function validateExtractionQuality(
  text: string,
  fileSize: number
): QualityMetrics {
  const charCount = text.length
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const ratio = fileSize > 0 ? charCount / fileSize : 0
  const warnings: ExtractionWarning[] = []

  // Determine if OCR is required
  const requiresOcr = charCount < MIN_TEXT_LENGTH

  if (requiresOcr) {
    warnings.push({
      type: 'ocr_required',
      message: 'Document requires OCR processing (may take longer)',
    })
  } else if (ratio < MIN_TEXT_TO_SIZE_RATIO && fileSize > 100_000) {
    // Large file with very little text - suspicious
    warnings.push({
      type: 'low_confidence',
      message: 'Document has unusually low text density',
    })
  }

  // Confidence based on text density
  // Higher ratio = more confident it's actual text
  const confidence = requiresOcr ? 0 : Math.min(1, ratio * 100)

  return {
    charCount,
    wordCount,
    pageCount: 1, // Caller should override for PDFs
    confidence,
    warnings,
    requiresOcr,
  }
}

/**
 * Simple language detection heuristic.
 *
 * Per CONTEXT.md: Block non-English documents with clear message.
 * Uses character script detection as first pass.
 */
export function detectLanguage(text: string): {
  isEnglish: boolean
  confidence: number
} {
  // Sample first 5000 chars for efficiency
  const sample = text.slice(0, 5000)

  // Count Latin alphabet characters (a-z, A-Z)
  const latinChars = (sample.match(/[a-zA-Z]/g) || []).length

  // Count non-ASCII characters (CJK, Cyrillic, Arabic, etc.)
  const nonAsciiChars = (sample.match(/[^\x00-\x7F]/g) || []).length

  // English documents should be mostly Latin alphabet
  const latinRatio = latinChars / (latinChars + nonAsciiChars + 1)

  // High confidence if >80% Latin, low if <50%
  const isEnglish = latinRatio > 0.5
  const confidence = latinRatio

  return { isEnglish, confidence }
}
