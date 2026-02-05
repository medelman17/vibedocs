/**
 * @fileoverview OCR quality assessment
 * @module lib/ocr/quality
 */

import type { OcrResult, OcrQuality } from "./types"
import { CONFIDENCE_THRESHOLD, CRITICAL_THRESHOLD } from "./types"

/**
 * Assess OCR quality and determine if user warning is needed.
 *
 * Thresholds (from RESEARCH.md):
 * - >= 85%: Good quality, no warning
 * - 60-84%: Low quality, show warning about potential accuracy issues
 * - < 60%: Critical quality, warn that results may be significantly inaccurate
 *
 * @param result - OCR result with per-page confidence scores
 * @returns Quality assessment with optional warning message
 */
export function assessOcrQuality(result: OcrResult): OcrQuality {
  const { averageConfidence, lowConfidencePages } = result

  // Critical threshold - results may be unusable
  if (averageConfidence < CRITICAL_THRESHOLD) {
    return {
      confidence: averageConfidence,
      isLowQuality: true,
      warningMessage:
        "This document has very low OCR quality. Analysis results may be significantly inaccurate. " +
        "Consider uploading a clearer scan or the original document if available.",
      affectedPages: lowConfidencePages,
    }
  }

  // Warning threshold - results may have issues
  if (averageConfidence < CONFIDENCE_THRESHOLD) {
    const pagesText =
      lowConfidencePages.length > 5
        ? `${lowConfidencePages.slice(0, 5).join(", ")} and ${lowConfidencePages.length - 5} more`
        : lowConfidencePages.join(", ")

    return {
      confidence: averageConfidence,
      isLowQuality: true,
      warningMessage:
        `Some parts of this document were difficult to read. ` +
        `Analysis accuracy may be affected on pages ${pagesText}.`,
      affectedPages: lowConfidencePages,
    }
  }

  // Good quality - no warning needed
  return {
    confidence: averageConfidence,
    isLowQuality: false,
    affectedPages: [],
  }
}
