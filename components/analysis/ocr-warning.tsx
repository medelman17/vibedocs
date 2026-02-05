/**
 * @fileoverview OCR Quality Warning Component
 *
 * Displays warnings about OCR quality to inform users when
 * analysis accuracy may be affected by scanned document quality.
 *
 * @module components/analysis/ocr-warning
 */

'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle, FileWarning } from 'lucide-react'
import { CONFIDENCE_THRESHOLD, CRITICAL_THRESHOLD } from '@/lib/ocr/types'

interface OcrWarningProps {
  /** Average OCR confidence (0-100) */
  confidence: number
  /** Warning message from OCR processing */
  warningMessage?: string | null
  /** Optional className for styling */
  className?: string
}

/**
 * Display OCR quality warning when confidence is below threshold.
 *
 * Shows nothing if confidence is good (>= 85%).
 * Shows warning for low quality (60-84%).
 * Shows critical warning for very low quality (< 60%).
 *
 * @example
 * ```tsx
 * <OcrWarning
 *   confidence={analysis.ocrConfidence}
 *   warningMessage={analysis.ocrWarning}
 * />
 * ```
 */
export function OcrWarning({
  confidence,
  warningMessage,
  className,
}: OcrWarningProps) {
  // No warning needed for good quality
  if (confidence >= CONFIDENCE_THRESHOLD) {
    return null
  }

  const isCritical = confidence < CRITICAL_THRESHOLD
  const Icon = isCritical ? FileWarning : AlertTriangle

  return (
    <Alert
      variant={isCritical ? 'destructive' : 'default'}
      className={className}
      data-slot="ocr-warning"
    >
      <Icon className="h-4 w-4" />
      <AlertTitle>
        {isCritical ? 'Document Quality Issue' : 'OCR Quality Notice'}
      </AlertTitle>
      <AlertDescription>
        {warningMessage || (isCritical
          ? 'This document has very low OCR quality. Analysis results may be significantly inaccurate. Consider uploading a clearer scan or the original document if available.'
          : 'Some parts of this document were difficult to read. Analysis accuracy may be affected.'
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * Check if an analysis has OCR quality issues that should be displayed.
 *
 * Utility function for conditional rendering.
 *
 * @example
 * ```tsx
 * {hasOcrIssues(analysis) && (
 *   <OcrWarning
 *     confidence={analysis.ocrConfidence!}
 *     warningMessage={analysis.ocrWarning}
 *   />
 * )}
 * ```
 */
export function hasOcrIssues(analysis: {
  ocrConfidence?: number | null
  ocrWarning?: string | null
}): boolean {
  if (analysis.ocrConfidence == null) {
    return false
  }
  return analysis.ocrConfidence < CONFIDENCE_THRESHOLD || !!analysis.ocrWarning
}
