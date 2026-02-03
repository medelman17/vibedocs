/**
 * JSONB validation helpers.
 *
 * Provides runtime validation for JSONB data before database insert/update.
 * Ensures runtime safety matches compile-time types from $type<>().
 */

import { z } from "zod"
import { ValidationError } from "@/lib/errors"

/**
 * Validate and type JSONB data before insert.
 * Throws ValidationError if schema doesn't match.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param columnName - Column name for error messages
 * @returns Validated and typed data
 * @throws ValidationError if validation fails
 */
export function validateJsonb<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  columnName: string
): T {
  const result = schema.safeParse(data)

  if (!result.success) {
    throw new ValidationError(
      `Invalid ${columnName} data`,
      result.error.issues.map((issue) => ({
        field: `${columnName}.${issue.path.join(".")}`,
        message: issue.message,
      }))
    )
  }

  return result.data
}

/**
 * Create a validated JSONB column helper.
 * Provides a parse method for validation and exposes the schema.
 *
 * @example
 * ```typescript
 * const tokenUsage = jsonbColumn(tokenUsageSchema, "tokenUsage")
 *
 * await db.update(analyses).set({
 *   tokenUsage: tokenUsage.parse(rawData),
 * })
 * ```
 */
export function jsonbColumn<T>(schema: z.ZodSchema<T>, columnName: string) {
  return {
    /**
     * Parse and validate data for this column.
     */
    parse: (data: unknown): T => validateJsonb(schema, data, columnName),

    /**
     * The Zod schema for this column.
     */
    schema,

    /**
     * Column name for error messages.
     */
    columnName,
  }
}
