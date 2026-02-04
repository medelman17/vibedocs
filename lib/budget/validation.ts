/**
 * @fileoverview Upload validation utilities for budget enforcement.
 *
 * These validations run before document processing to reject files
 * that would exceed resource limits.
 *
 * @module lib/budget/validation
 */

import { BUDGET_LIMITS } from './limits'

/**
 * Error codes for validation failures.
 */
export type ValidationErrorCode = 'FILE_TOO_LARGE' | 'TOO_MANY_PAGES'

/**
 * Detailed validation error information.
 */
export interface ValidationErrorInfo {
  code: ValidationErrorCode
  message: string
  limit: number
  actual: number
}

/**
 * Result of upload validation check.
 */
export interface UploadValidationResult {
  valid: boolean
  error?: ValidationErrorInfo
}

/**
 * Validates that file size is within acceptable limits.
 *
 * @param sizeBytes - File size in bytes
 * @returns Validation result with error details if invalid
 */
export function validateFileSize(sizeBytes: number): UploadValidationResult {
  if (sizeBytes > BUDGET_LIMITS.MAX_FILE_SIZE) {
    const limitMB = BUDGET_LIMITS.MAX_FILE_SIZE / (1024 * 1024)
    return {
      valid: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `File exceeds ${limitMB}MB limit. Please upload a smaller document.`,
        limit: BUDGET_LIMITS.MAX_FILE_SIZE,
        actual: sizeBytes,
      },
    }
  }
  return { valid: true }
}

/**
 * Validates that PDF page count is within acceptable limits.
 *
 * Note: Only validates PDFs - DOCX page count requires rendering which
 * is unreliable. Token-based truncation handles oversized DOCX files.
 *
 * Uses dynamic import for pdf-parse to avoid barrel export issues
 * (pdf-parse pulls in browser-only dependencies).
 *
 * @param buffer - File buffer to check
 * @param mimeType - MIME type of the file
 * @returns Validation result with error details if invalid
 */
export async function validatePageCount(
  buffer: Buffer,
  mimeType: string
): Promise<UploadValidationResult> {
  // Only check PDF - DOCX page count requires rendering
  if (mimeType === 'application/pdf') {
    // Dynamic import to avoid loading pdf-parse unless needed
    // This prevents barrel export issues with browser-only deps
    const { PDFParse } = await import('pdf-parse')
    const pdfParser = new PDFParse({ data: buffer })
    const result = await pdfParser.getText()
    const pageCount = result.pages.length

    if (pageCount > BUDGET_LIMITS.MAX_PAGES) {
      return {
        valid: false,
        error: {
          code: 'TOO_MANY_PAGES',
          message: `Document exceeds ${BUDGET_LIMITS.MAX_PAGES} page limit. Please upload a shorter document.`,
          limit: BUDGET_LIMITS.MAX_PAGES,
          actual: pageCount,
        },
      }
    }
  }

  return { valid: true }
}
