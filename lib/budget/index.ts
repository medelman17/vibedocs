/**
 * @fileoverview Budget protection utilities for NDA analysis pipeline.
 *
 * This module provides centralized budget enforcement including:
 * - Token limits and file size constraints
 * - Token estimation for pre-flight budget checks
 * - Upload validation (file size, page count)
 * - Section-boundary truncation for oversized documents
 *
 * Usage:
 * ```typescript
 * import {
 *   BUDGET_LIMITS,
 *   estimateTokens,
 *   checkTokenBudget,
 *   validateFileSize,
 *   validatePageCount,
 *   truncateToTokenBudget,
 * } from '@/lib/budget'
 * ```
 *
 * Note: This barrel export is safe because all utilities are lightweight.
 * The validation module uses dynamic import for pdf-parse to avoid
 * pulling browser-only dependencies into the bundle.
 *
 * @module lib/budget
 */

export * from './limits'
export * from './estimation'
export * from './validation'
export * from './truncation'
