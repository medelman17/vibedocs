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
 * Lightweight PDF page count by scanning the buffer for /Count in the Pages tree.
 * Avoids loading pdf-parse/pdfjs-dist in the Next.js server (where the worker path
 * is broken in Turbopack). If the count cannot be determined, returns null and
 * upload is allowed; the token budget check after parsing will catch oversized docs.
 */
function getPdfPageCountFromBuffer(buffer: Buffer): number | null {
  const str = buffer.toString('latin1')
  // Match /Count N where N is a positive integer (PDF Pages dictionary)
  const countMatches = str.matchAll(/\/Count\s+(\d+)/g)
  let maxCount = 0
  for (const m of countMatches) {
    const n = parseInt(m[1], 10)
    if (n > maxCount) maxCount = n
  }
  return maxCount > 0 ? maxCount : null
}

/**
 * Validates that PDF page count is within acceptable limits.
 *
 * Note: Only validates PDFs - DOCX page count requires rendering which
 * is unreliable. Token-based truncation handles oversized DOCX files.
 *
 * Uses a lightweight buffer scan for /Count to avoid loading pdf-parse
 * in the Next.js server (pdfjs-dist worker path is broken in Turbopack).
 * If page count cannot be determined, upload is allowed and the token
 * budget check after parsing will catch oversized documents.
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
    const pageCount = getPdfPageCountFromBuffer(buffer)
    if (pageCount !== null && pageCount > BUDGET_LIMITS.MAX_PAGES) {
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
