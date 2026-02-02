/**
 * Server Action response utilities.
 *
 * This module provides the standard response envelope for all Server Actions.
 * Re-exports and extends the core types from api-utils.ts and errors.ts.
 *
 * Usage:
 *   import { ok, err, type ApiResponse } from "@/lib/api-response"
 *
 *   export async function myAction(input: Input): Promise<ApiResponse<Output>> {
 *     if (!valid) return err("VALIDATION_ERROR", "Invalid input")
 *     return ok({ result: "success" })
 *   }
 */

import type { ActionResult } from "./api-utils"
import { actionSuccess, actionError } from "./api-utils"
import { AppError, type ErrorCode, type ErrorDetail } from "./errors"

// Re-export types
export type { ErrorCode, ErrorDetail } from "./errors"
export type { ActionResult } from "./api-utils"

/**
 * Standard API response type for Server Actions.
 * Alias for ActionResult to match the design specification naming.
 */
export type ApiResponse<T> = ActionResult<T>

/**
 * Create a success response.
 * Alias for actionSuccess() to match design specification.
 *
 * @example
 * return ok({ id: "123", name: "Document" })
 */
export function ok<T>(data: T): ApiResponse<T> {
  return actionSuccess(data)
}

/**
 * Create an error response.
 * Wrapper around AppError for convenient inline error creation.
 *
 * @example
 * return err("NOT_FOUND", "Document not found")
 * return err("VALIDATION_ERROR", "Invalid email", [{ field: "email", message: "Invalid format" }])
 */
export function err<T = never>(
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[]
): ApiResponse<T> {
  const error = new AppError(code, message, 400, details)
  return actionError(error)
}

/**
 * Wrap an existing error in the standard response format.
 *
 * @example
 * catch (e) {
 *   return wrapError(e)
 * }
 */
export function wrapError<T = never>(error: unknown): ApiResponse<T> {
  return actionError(error)
}
