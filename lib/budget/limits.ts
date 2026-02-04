/**
 * @fileoverview Budget limit constants for NDA analysis pipeline.
 *
 * These limits protect against excessive resource consumption and ensure
 * predictable costs. All limits are enforced before analysis begins.
 *
 * @module lib/budget/limits
 */

/**
 * Central budget limits for document analysis.
 *
 * @property MAX_FILE_SIZE - Maximum file size in bytes (10MB)
 * @property MAX_PAGES - Maximum page count for PDFs
 * @property TOKEN_BUDGET - Maximum tokens after parsing (pre-analysis)
 */
export const BUDGET_LIMITS = {
  /** Maximum file size in bytes (10MB) - enforced at upload */
  MAX_FILE_SIZE: 10 * 1024 * 1024,

  /** Maximum page count for PDFs - checked before parsing */
  MAX_PAGES: 50,

  /** Maximum tokens after document parsing - triggers truncation if exceeded */
  TOKEN_BUDGET: 200_000,
} as const

// Named exports for convenience
export const MAX_FILE_SIZE = BUDGET_LIMITS.MAX_FILE_SIZE
export const MAX_PAGES = BUDGET_LIMITS.MAX_PAGES
export const TOKEN_BUDGET = BUDGET_LIMITS.TOKEN_BUDGET
