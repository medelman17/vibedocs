/**
 * @fileoverview Token estimation utilities for budget enforcement.
 *
 * Uses gpt-tokenizer as a proxy for Claude tokenization. While Claude uses
 * a different tokenizer, the GPT-4 tokenizer provides a reasonable estimate
 * (~10-15% variance) sufficient for budget enforcement.
 *
 * @module lib/budget/estimation
 */

import { encode } from 'gpt-tokenizer'
import { BUDGET_LIMITS } from './limits'

/**
 * Result of checking a document against the token budget.
 */
export interface TokenEstimate {
  /** Total token count for the text */
  tokenCount: number
  /** Whether the document fits within budget */
  withinBudget: boolean
  /** Tokens remaining before hitting budget limit */
  budgetRemaining: number
  /** Whether truncation is needed to fit budget */
  truncationNeeded: boolean
}

/**
 * Estimates token count for document text.
 *
 * Uses gpt-tokenizer as proxy - Claude tokenizer may differ by ~10-15%
 * but this is sufficient for budget enforcement.
 *
 * @param text - Document text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return encode(text).length
}

/**
 * Checks whether document text fits within the token budget.
 *
 * @param text - Document text to check
 * @param budget - Token budget limit (defaults to BUDGET_LIMITS.TOKEN_BUDGET)
 * @returns Token estimate with budget status
 */
export function checkTokenBudget(
  text: string,
  budget: number = BUDGET_LIMITS.TOKEN_BUDGET
): TokenEstimate {
  const tokenCount = estimateTokens(text)
  const withinBudget = tokenCount <= budget

  return {
    tokenCount,
    withinBudget,
    budgetRemaining: Math.max(0, budget - tokenCount),
    truncationNeeded: !withinBudget,
  }
}
