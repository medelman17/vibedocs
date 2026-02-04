/**
 * @fileoverview Validation Gates for NDA Analysis Pipeline
 *
 * Validation functions that check agent outputs and halt the pipeline
 * on critical failures (0 clauses, empty document) with user-friendly errors.
 *
 * These gates run AFTER each pipeline step completes (outside step.run)
 * to ensure validation failures use NonRetriableError and don't trigger retries.
 *
 * @module agents/validation/gates
 */

import { formatValidationError, type ValidationResult } from "./messages"

// ============================================================================
// Parser Validation
// ============================================================================

/**
 * Validates parser agent output.
 *
 * Checks for:
 * - Empty or whitespace-only raw text (EMPTY_DOCUMENT)
 * - No chunks generated (NO_CHUNKS)
 *
 * @param rawText - Extracted text from the document
 * @param chunks - Document chunks with id and content
 * @returns ValidationResult indicating pass/fail with error details
 */
export function validateParserOutput(
  rawText: string,
  chunks: Array<{ id: string; content: string }>
): ValidationResult {
  // Check for empty or whitespace-only document
  if (!rawText || rawText.trim().length === 0) {
    return {
      valid: false,
      error: formatValidationError("EMPTY_DOCUMENT", "document parsing"),
    }
  }

  // Check for no chunks generated
  if (chunks.length === 0) {
    return {
      valid: false,
      error: formatValidationError("NO_CHUNKS", "document parsing"),
    }
  }

  return { valid: true }
}

// ============================================================================
// Classifier Validation
// ============================================================================

/**
 * Validates classifier agent output.
 *
 * Implements the "0 clauses = always halt" rule from CONTEXT.md.
 * If clause extraction returns zero results, the pipeline stops immediately.
 *
 * @param clauses - Classified clauses from the classifier agent
 * @returns ValidationResult indicating pass/fail with error details
 */
export function validateClassifierOutput(
  clauses: Array<{ chunkId: string; category: string }>
): ValidationResult {
  // 0 clauses = always halt (per CONTEXT.md decision)
  if (clauses.length === 0) {
    return {
      valid: false,
      error: formatValidationError("ZERO_CLAUSES", "clause extraction"),
    }
  }

  return { valid: true }
}
