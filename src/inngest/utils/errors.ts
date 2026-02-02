// src/inngest/utils/errors.ts
/**
 * @fileoverview Error Handling Utilities for Inngest Functions
 *
 * Provides custom error classes for Inngest workflows. Unlike src/lib/errors.ts
 * (HTTP-focused with statusCode), these use `isRetriable` for Inngest retry control.
 *
 * @module inngest/utils/errors
 */

/**
 * Base class for Inngest workflow errors.
 */
export abstract class InngestWorkflowError extends Error {
  /** Whether Inngest should retry this error */
  abstract readonly isRetriable: boolean
  /** Optional context for debugging */
  readonly context?: Record<string, unknown>

  constructor(message: string, context?: Record<string, unknown>) {
    super(message)
    this.name = this.constructor.name
    this.context = context
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Temporary failure that should be retried.
 * Use for: network timeouts, temporary unavailability, connection issues.
 */
export class RetriableError extends InngestWorkflowError {
  readonly isRetriable = true
}

/**
 * Permanent failure that should NOT be retried.
 * Use for: invalid input, missing resources, authorization failures.
 */
export class NonRetriableError extends InngestWorkflowError {
  readonly isRetriable = false
}

/**
 * Validation failure. Non-retriable since input won't change.
 */
export class ValidationError extends NonRetriableError {
  readonly validationErrors: Array<{ path: string; message: string }>

  constructor(
    message: string,
    validationErrors: Array<{ path: string; message: string }>,
    context?: Record<string, unknown>
  ) {
    super(message, context)
    this.validationErrors = validationErrors
  }

  /**
   * Create from Zod error (uses .issues per Zod 4).
   */
  static fromZodError(
    error: { issues: Array<{ path: (string | number)[]; message: string }> }
  ): ValidationError {
    const validationErrors = error.issues.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }))
    return new ValidationError("Validation failed", validationErrors)
  }
}

/**
 * Resource not found. Non-retriable since it won't appear.
 */
export class NotFoundError extends NonRetriableError {
  readonly resourceType: string
  readonly resourceId: string

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`, { resourceType, resourceId })
    this.resourceType = resourceType
    this.resourceId = resourceId
  }
}

/**
 * External API failure. Retriability depends on status code.
 */
export class ApiError extends InngestWorkflowError {
  readonly service: string
  readonly statusCode?: number
  readonly isRetriable: boolean

  constructor(
    service: string,
    message: string,
    statusCode?: number,
    context?: Record<string, unknown>
  ) {
    super(`${service} API error: ${message}`, context)
    this.service = service
    this.statusCode = statusCode
    // 5xx and specific 4xx codes are retriable
    this.isRetriable = statusCode
      ? statusCode >= 500 || statusCode === 408 || statusCode === 429
      : true
  }
}

/**
 * Check if an error should trigger Inngest retry.
 */
export function isRetriableError(error: unknown): boolean {
  if (error instanceof InngestWorkflowError) {
    return error.isRetriable
  }
  // Default: retry unknown errors (conservative approach)
  return true
}

/**
 * Wrap async function with error classification.
 */
export async function wrapWithErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    // Already classified errors pass through
    if (error instanceof InngestWorkflowError) {
      throw error
    }

    // Classify common error patterns
    if (error instanceof Error) {
      const message = error.message.toLowerCase()

      // Network/connection errors are retriable
      if (
        message.includes("timeout") ||
        message.includes("econnrefused") ||
        message.includes("network")
      ) {
        throw new RetriableError(`${operation}: ${error.message}`, {
          originalError: error.name,
        })
      }

      // Not found errors are not retriable
      if (message.includes("not found") || message.includes("404")) {
        throw new NonRetriableError(`${operation}: ${error.message}`)
      }
    }

    // Default: wrap as retriable
    throw new RetriableError(
      `${operation}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
