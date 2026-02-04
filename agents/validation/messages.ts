/**
 * @fileoverview Validation Error Messages for NDA Analysis Pipeline
 *
 * Provides user-friendly error messages with actionable suggestions
 * for validation failures during pipeline execution.
 *
 * @module agents/validation/messages
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a validation gate check.
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean
  /** Error details if validation failed */
  error?: {
    /** Error code for logging (e.g., ZERO_CLAUSES, EMPTY_DOCUMENT) */
    code: string
    /** Plain language message for UI display */
    userMessage: string
    /** Which pipeline stage failed (e.g., parsing, clause extraction) */
    stage: string
    /** Actionable guidance for the user */
    suggestion?: string
  }
}

// ============================================================================
// Message Templates
// ============================================================================

/**
 * Plain language validation error messages per CONTEXT.md decisions.
 *
 * Each message includes:
 * - userMessage: Friendly, non-technical description of the problem
 * - suggestion: Actionable guidance to help the user resolve the issue
 */
export const VALIDATION_MESSAGES = {
  ZERO_CLAUSES: {
    userMessage: "We couldn't find any clauses in this document.",
    suggestion:
      "Check that the file contains actual contract text, not just headers or images.",
  },
  EMPTY_DOCUMENT: {
    userMessage: "We couldn't extract any text from this document.",
    suggestion:
      "Try uploading a different file format or check that the PDF isn't encrypted.",
  },
  NO_CHUNKS: {
    userMessage: "The document couldn't be processed into analyzable sections.",
    suggestion: "Try a different document or file format.",
  },
} as const

// ============================================================================
// Error Formatting
// ============================================================================

/**
 * Formats a validation error with the appropriate message template.
 *
 * @param code - The error code from VALIDATION_MESSAGES
 * @param stage - Which pipeline stage failed (e.g., "parsing", "clause extraction")
 * @returns Formatted error object for ValidationResult
 */
export function formatValidationError(
  code: keyof typeof VALIDATION_MESSAGES,
  stage: string
): NonNullable<ValidationResult["error"]> {
  const message = VALIDATION_MESSAGES[code]
  return {
    code,
    stage,
    userMessage: message.userMessage,
    suggestion: message.suggestion,
  }
}
