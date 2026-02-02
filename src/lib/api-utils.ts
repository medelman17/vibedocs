import { NextResponse } from "next/server"
import { AppError, isAppError, toAppError, type SerializedError } from "./errors"

/**
 * Standard API response shape for all endpoints.
 */
export type ApiResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: SerializedError }

/**
 * Create a success response.
 */
export function success<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status })
}

/**
 * Create an error response from an AppError.
 */
export function error(err: AppError): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    { success: false, error: err.toJSON() },
    { status: err.statusCode }
  )
}

/**
 * Wrap an async handler with consistent error handling.
 *
 * Usage in API routes:
 *   export const GET = withErrorHandling(async (request) => {
 *     const data = await fetchData()
 *     return success(data)
 *   })
 */
export function withErrorHandling<T>(
  handler: (request: Request) => Promise<NextResponse<ApiResponse<T>>>
) {
  return async (request: Request): Promise<NextResponse<ApiResponse<T>>> => {
    try {
      return await handler(request)
    } catch (err) {
      const appError = toAppError(err)

      // Log non-operational errors (unexpected)
      if (!appError.isOperational || appError.statusCode >= 500) {
        console.error("[API Error]", {
          code: appError.code,
          message: appError.message,
          stack: err instanceof Error ? err.stack : undefined,
          url: request.url,
          method: request.method,
        })
      }

      return error(appError)
    }
  }
}

/**
 * Result type for server actions (can't use NextResponse).
 * Use this instead of throwing in server actions for better UX.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: SerializedError }

/**
 * Create a success result for server actions.
 */
export function actionSuccess<T>(data: T): ActionResult<T> {
  return { success: true, data }
}

/**
 * Create an error result for server actions.
 */
export function actionError(err: unknown): ActionResult<never> {
  const appError = toAppError(err)
  return { success: false, error: appError.toJSON() }
}

/**
 * Wrap a server action with consistent error handling.
 *
 * Usage:
 *   export const createDocument = withActionErrorHandling(async (formData: FormData) => {
 *     const doc = await saveDocument(formData)
 *     return actionSuccess(doc)
 *   })
 */
export function withActionErrorHandling<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<ActionResult<TResult>>
) {
  return async (...args: TArgs): Promise<ActionResult<TResult>> => {
    try {
      return await action(...args)
    } catch (err) {
      const appError = toAppError(err)

      // Log server-side
      if (!appError.isOperational || appError.statusCode >= 500) {
        console.error("[Action Error]", {
          code: appError.code,
          message: appError.message,
          stack: err instanceof Error ? err.stack : undefined,
        })
      }

      return actionError(appError)
    }
  }
}
