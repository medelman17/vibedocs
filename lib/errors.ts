/**
 * Custom error classes for structured error handling.
 *
 * Usage:
 *   throw new NotFoundError("Document not found")
 *   throw new ValidationError("Invalid input", [{ field: "email", message: "Invalid format" }])
 *   throw new UnauthorizedError() // Uses default message
 *
 * In API routes:
 *   catch (error) {
 *     if (error instanceof AppError) {
 *       return NextResponse.json(error.toJSON(), { status: error.statusCode })
 *     }
 *   }
 */

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DUPLICATE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  // Domain-specific error codes for NDA analysis pipeline
  | "ANALYSIS_FAILED"
  | "EMBEDDING_FAILED"
  | "LLM_FAILED"

export interface ErrorDetail {
  field?: string
  message: string
  code?: string
}

export interface SerializedError {
  code: ErrorCode
  message: string
  details?: ErrorDetail[]
}

/**
 * Base application error class.
 * All custom errors extend this for consistent handling.
 */
export class AppError extends Error {
  public readonly isOperational = true

  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: ErrorDetail[]
  ) {
    super(message)
    this.name = this.constructor.name
    Object.setPrototypeOf(this, new.target.prototype)
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON(): SerializedError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    }
  }
}

/**
 * 400 Bad Request - Generic client error
 */
export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: ErrorDetail[]) {
    super("BAD_REQUEST", message, 400, details)
  }
}

/**
 * 400 Validation Error - Input validation failed
 */
export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: ErrorDetail[]) {
    super("VALIDATION_ERROR", message, 400, details)
  }

  static fromZodError(error: { issues: Array<{ path: (string | number)[]; message: string }> }): ValidationError {
    const details = error.issues.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }))
    return new ValidationError("Validation failed", details)
  }
}

/**
 * 401 Unauthorized - Authentication required or failed
 */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401)
  }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to perform this action") {
    super("FORBIDDEN", message, 403)
  }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, 404)
  }
}

/**
 * 409 Conflict - Resource state conflict (duplicate, already exists, etc.)
 */
export class ConflictError extends AppError {
  constructor(message = "Resource conflict") {
    super("CONFLICT", message, 409)
  }
}

/**
 * 429 Rate Limited - Too many requests
 */
export class RateLimitError extends AppError {
  constructor(
    message = "Too many requests",
    public readonly retryAfter?: number
  ) {
    super("RATE_LIMITED", message, 429)
  }
}

/**
 * 500 Internal Error - Unexpected server error
 */
export class InternalError extends AppError {
  constructor(message = "An unexpected error occurred") {
    super("INTERNAL_ERROR", message, 500)
  }
}

/**
 * 503 Service Unavailable - Dependency unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable") {
    super("SERVICE_UNAVAILABLE", message, 503)
  }
}

/**
 * 409 Duplicate - Resource already exists (more specific than Conflict)
 */
export class DuplicateError extends AppError {
  constructor(message = "Resource already exists") {
    super("DUPLICATE", message, 409)
  }
}

/**
 * 500 Analysis Failed - NDA analysis pipeline error
 */
export class AnalysisFailedError extends AppError {
  constructor(message = "Analysis failed", details?: ErrorDetail[]) {
    super("ANALYSIS_FAILED", message, 500, details)
  }
}

/**
 * 500 Embedding Failed - Vector embedding generation error
 */
export class EmbeddingFailedError extends AppError {
  constructor(message = "Embedding generation failed") {
    super("EMBEDDING_FAILED", message, 500)
  }
}

/**
 * 500 LLM Failed - Language model API error
 */
export class LlmFailedError extends AppError {
  constructor(message = "Language model request failed") {
    super("LLM_FAILED", message, 500)
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * Convert any error to an AppError for consistent handling.
 * Preserves AppErrors, wraps others in InternalError.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  if (error instanceof Error) {
    // Don't expose internal error messages in production
    const message =
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : error.message

    return new InternalError(message)
  }

  return new InternalError("An unexpected error occurred")
}
