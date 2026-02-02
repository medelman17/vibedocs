/**
 * Result type for composable error handling.
 *
 * Represents either success (Ok) or failure (Err).
 * Enables functional error handling without try/catch pyramids.
 *
 * @example
 * ```typescript
 * const result = await getDocument(id, tenantId)
 *
 * if (!result.ok) {
 *   return { success: false, error: result.error.toJSON() }
 * }
 *
 * return { success: true, data: result.value }
 * ```
 */

/**
 * Result type - represents either success or failure.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

/**
 * Create a success result.
 */
export const Ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
})

/**
 * Create a failure result.
 */
export const Err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
})

/**
 * Transform the success value.
 * Error passes through unchanged.
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return result.ok ? Ok(fn(result.value)) : result
}

/**
 * Chain operations that might fail.
 * Short-circuits on first error.
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.ok ? fn(result.value) : result
}

/**
 * Unwrap the value or throw the error.
 * Use at boundaries where throwing is appropriate.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value
  throw result.error
}

/**
 * Unwrap with a default value for errors.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue
}

/**
 * Wrap an async operation that might throw.
 */
export async function tryCatch<T>(
  fn: () => Promise<T>
): Promise<Result<T, Error>> {
  try {
    return Ok(await fn())
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Wrap with a custom error mapper.
 */
export async function tryCatchWith<T, E>(
  fn: () => Promise<T>,
  mapError: (e: unknown) => E
): Promise<Result<T, E>> {
  try {
    return Ok(await fn())
  } catch (e) {
    return Err(mapError(e))
  }
}

/**
 * Check if a Result is Ok.
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok
}

/**
 * Check if a Result is Err.
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok
}
