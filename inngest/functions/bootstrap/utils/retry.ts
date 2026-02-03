/**
 * @fileoverview Retry Utility with Exponential Backoff
 *
 * Provides retry logic for transient failures in the bootstrap pipeline.
 *
 * @module inngest/functions/bootstrap/utils/retry
 */

/**
 * Error that should not be retried.
 */
export class NonRetriableError extends Error {
  readonly retriable = false

  constructor(message: string) {
    super(message)
    this.name = "NonRetriableError"
  }
}

/**
 * Check if an error should be retried.
 */
function isRetriable(error: unknown): boolean {
  if (error instanceof NonRetriableError) {
    return false
  }
  if (error instanceof Error && "retriable" in error) {
    return error.retriable !== false
  }
  return true
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry options.
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number
  /** Backoff delays in ms for each retry (default: [1000, 2000, 4000]) */
  backoff?: number[]
  /** Optional callback on each retry */
  onRetry?: (error: Error, attempt: number) => void
}

/**
 * Execute a function with retry on failure.
 *
 * @example
 * const result = await withRetry(
 *   () => fetch(url),
 *   { maxAttempts: 3, backoff: [1000, 2000, 4000] }
 * )
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, backoff = [1000, 2000, 4000], onRetry } = options

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry non-retriable errors
      if (!isRetriable(error)) {
        throw lastError
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxAttempts) {
        throw lastError
      }

      // Notify caller of retry
      onRetry?.(lastError, attempt)

      // Wait before retrying
      const delay = backoff[attempt - 1] ?? backoff[backoff.length - 1]
      await sleep(delay)
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError ?? new Error("Retry failed")
}
