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
import {
  OcrRequiredError,
  EncryptedDocumentError,
  CorruptDocumentError,
} from "@/lib/errors"
import type { ExtractionResult } from "@/lib/document-extraction"

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

// ============================================================================
// Token Budget Validation
// ============================================================================

import {
  checkTokenBudget,
  truncateToTokenBudget,
  type TokenEstimate,
  type TruncationResult,
} from "@/lib/budget"
import type { DocumentChunk } from "@/lib/document-processing"

/**
 * Result of token budget validation.
 */
export interface TokenBudgetValidation {
  /** Whether validation passed (always true - truncation handles excess) */
  passed: boolean
  /** Token estimate for the document */
  estimate: TokenEstimate
  /** Truncation result if document exceeded budget */
  truncation?: TruncationResult
  /** Warning if document was truncated */
  warning?: {
    code: "DOCUMENT_TRUNCATED"
    message: string
    removedSections: string[]
  }
}

/**
 * Validates document against token budget after parsing.
 *
 * Unlike other validation gates, this gate ALWAYS passes because it
 * truncates oversized documents instead of rejecting them outright.
 * The truncation result is returned for the pipeline to use.
 *
 * @param rawText - The full extracted document text
 * @param chunks - Document chunks with section boundaries
 * @returns Validation result with optional truncation data
 */
export function validateTokenBudget(
  rawText: string,
  chunks: DocumentChunk[]
): TokenBudgetValidation {
  const estimate = checkTokenBudget(rawText)

  if (estimate.withinBudget) {
    return { passed: true, estimate }
  }

  // Document exceeds budget - truncate at section boundaries
  const truncation = truncateToTokenBudget(rawText, chunks)

  return {
    passed: true, // Truncated version passes
    estimate,
    truncation,
    warning: {
      code: "DOCUMENT_TRUNCATED",
      message: `Document exceeded ${estimate.tokenCount.toLocaleString()} tokens (limit: ${(200_000).toLocaleString()}). Analysis will cover the first ${truncation.truncatedTokens.toLocaleString()} tokens.`,
      removedSections: truncation.removedSections,
    },
  }
}

// ============================================================================
// Extraction Validation
// ============================================================================

/**
 * Result of extraction validation.
 */
export interface ExtractionValidation {
  /** Whether extraction passed validation */
  valid: boolean
  /** Error details if validation failed */
  error?: {
    code:
      | "EXTRACTION_FAILED"
      | "OCR_REQUIRED"
      | "ENCRYPTED"
      | "CORRUPT"
      | "NON_ENGLISH"
    message: string
    userFacing: string
  }
  /** Warnings that don't block processing */
  warnings: string[]
}

/**
 * Validates extraction result before proceeding to chunking.
 *
 * Checks for:
 * - OCR requirement (routes to Phase 4)
 * - Encryption (user action required)
 * - Corruption (user action required)
 * - Quality issues (warnings only)
 *
 * @param result - Extraction result from extractDocument
 * @returns Validation result with error details
 */
export function validateExtractionResult(
  result: ExtractionResult
): ExtractionValidation {
  const warnings: string[] = result.quality.warnings.map((w) => w.message)

  // OCR requirement is a soft failure - document can be routed to OCR phase
  if (result.quality.requiresOcr) {
    return {
      valid: false,
      error: {
        code: "OCR_REQUIRED",
        message: "Document requires OCR processing",
        userFacing: "Document requires OCR processing (may take longer)",
      },
      warnings,
    }
  }

  // Low confidence is a warning, not a failure
  if (result.quality.confidence < 0.3) {
    warnings.push(
      `Low extraction confidence: ${(result.quality.confidence * 100).toFixed(0)}%`
    )
  }

  return { valid: true, warnings }
}

/**
 * Maps extraction errors to pipeline-appropriate errors.
 *
 * Returns { retriable: false } for user-fixable errors (encrypted, corrupt)
 * and { retriable: false, routeToOcr: true } for OCR-required documents.
 */
export function mapExtractionError(error: unknown): {
  retriable: boolean
  routeToOcr?: boolean
  userMessage: string
} {
  if (error instanceof EncryptedDocumentError) {
    return {
      retriable: false,
      userMessage:
        "Document is password-protected. Please upload an unprotected version.",
    }
  }

  if (error instanceof CorruptDocumentError) {
    return {
      retriable: false,
      userMessage:
        "Could not process this file. Try re-uploading or use a different format.",
    }
  }

  if (error instanceof OcrRequiredError) {
    return {
      retriable: false,
      routeToOcr: true,
      userMessage: "Document requires OCR processing (may take longer)",
    }
  }

  // Unknown error - don't retry, show generic message
  return {
    retriable: false,
    userMessage:
      "Failed to extract text from document. Please try a different file.",
  }
}
