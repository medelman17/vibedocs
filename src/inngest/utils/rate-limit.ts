// src/inngest/utils/rate-limit.ts
/**
 * @fileoverview Rate Limiting Utilities for Inngest Functions
 *
 * Provides helpers for rate-limited API calls to external services.
 * Uses step.sleep() for durable delays between calls.
 *
 * Rate limits:
 * - Voyage AI: 300 RPM (200ms between calls)
 * - Claude API: 60 RPM (1000ms between calls)
 *
 * @module inngest/utils/rate-limit
 */

import { RetriableError } from "./errors"

/**
 * Rate limit configurations for external APIs.
 */
export const RATE_LIMITS = {
  /**
   * Voyage AI embedding API.
   * 300 requests per minute, batch limit ~128 texts per request.
   */
  voyageAi: {
    requestsPerMinute: 300,
    delayMs: 200, // 60000ms / 300 RPM
    batchSize: 128,
  },

  /**
   * Anthropic Claude API.
   * 60 requests per minute (tier 1).
   */
  claude: {
    requestsPerMinute: 60,
    delayMs: 1000, // 60000ms / 60 RPM
  },
} as const

/**
 * Get delay string for step.sleep().
 *
 * @example
 * await step.sleep("voyage-rate-limit", getRateLimitDelay("voyageAi"))
 */
export function getRateLimitDelay(service: keyof typeof RATE_LIMITS): string {
  const ms = RATE_LIMITS[service].delayMs
  return `${ms}ms`
}

/**
 * Get optimal batch size for a service.
 */
export function getBatchSize(service: keyof typeof RATE_LIMITS): number {
  const config = RATE_LIMITS[service]
  return "batchSize" in config ? config.batchSize : 1
}

/**
 * Estimate processing time in seconds.
 */
export function estimateProcessingTime(
  service: keyof typeof RATE_LIMITS,
  itemCount: number
): number {
  const config = RATE_LIMITS[service]
  const batchSize = "batchSize" in config ? config.batchSize : 1
  const batches = Math.ceil(itemCount / batchSize)
  return (batches * config.delayMs) / 1000
}

/**
 * Rate limit error with retry information.
 */
export class RateLimitError extends RetriableError {
  readonly service: string
  readonly retryAfterMs: number

  constructor(service: string, retryAfterMs: number) {
    super(`Rate limit exceeded for ${service}. Retry after ${retryAfterMs}ms`, {
      service,
      retryAfterMs,
    })
    this.service = service
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * Check if error is rate limit related.
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes("rate limit") ||
      message.includes("429") ||
      message.includes("too many requests")
    )
  }
  return false
}

/**
 * Extract retry-after value from error.
 */
function extractRetryAfter(error: unknown): number {
  if (error instanceof Error && "headers" in error) {
    const headers = (error as Error & { headers?: Record<string, string> }).headers
    const retryAfter = headers?.["retry-after"]
    if (retryAfter) {
      return parseInt(retryAfter, 10) * 1000
    }
  }
  return 60000 // Default 60 seconds
}

/**
 * Wrapper for rate-limited API calls.
 *
 * @example
 * const result = await step.run("call-claude", async () => {
 *   return withRateLimit("claude", async () => {
 *     return await claude.messages.create({ ... })
 *   })
 * })
 */
export async function withRateLimit<T>(
  service: keyof typeof RATE_LIMITS,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (isRateLimitError(error)) {
      const retryAfter = extractRetryAfter(error)
      throw new RateLimitError(service, retryAfter)
    }
    throw error
  }
}
