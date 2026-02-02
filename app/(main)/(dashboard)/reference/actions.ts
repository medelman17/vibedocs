"use server"

/**
 * Reference Data Server Actions
 *
 * Server actions for querying shared reference data (CUAD categories,
 * ContractNLI hypotheses, etc.). This data is shared across all tenants
 * and does not require tenant isolation - only authentication.
 *
 * @module app/(dashboard)/reference/actions
 */

import { z } from "zod"
import { verifySession } from "@/lib/dal"
import { ok, err, type ApiResponse } from "@/lib/api-response"
import { db, cuadCategories } from "@/db"
import { eq } from "drizzle-orm"

/**
 * Input schema for getCategories action.
 * All fields are optional for maximum flexibility.
 */
const getCategoriesSchema = z
  .object({
    /** If true, only return categories relevant to NDA analysis */
    ndaRelevantOnly: z.boolean().optional(),
  })
  .optional()

/**
 * CUAD category returned by getCategories.
 */
export type Category = {
  /** Auto-incrementing primary key */
  id: number
  /** Category name (e.g., "Non-Compete", "Governing Law") */
  name: string
  /** Human-readable description of the category */
  description: string | null
  /** Relative importance weight for composite risk scoring (default 1.0) */
  riskWeight: number
  /** Whether this category is relevant for NDA analysis */
  isNdaRelevant: boolean
}

/**
 * Get CUAD category taxonomy for UI filtering.
 *
 * Retrieves the 41-category CUAD taxonomy used for clause classification.
 * This is shared reference data that does not require tenant isolation.
 *
 * @param input - Optional filter parameters
 * @param input.ndaRelevantOnly - If true, only return NDA-relevant categories
 * @returns List of CUAD categories with risk weights and relevance flags
 *
 * @example
 * ```typescript
 * // Get all categories
 * const result = await getCategories()
 * if (result.success) {
 *   console.log(result.data) // Category[]
 * }
 *
 * // Get only NDA-relevant categories
 * const ndaResult = await getCategories({ ndaRelevantOnly: true })
 * ```
 */
export async function getCategories(
  input?: z.infer<typeof getCategoriesSchema>
): Promise<ApiResponse<Category[]>> {
  // Verify authenticated (no tenant isolation needed for reference data)
  await verifySession()

  try {
    // Parse and validate input
    const parsed = getCategoriesSchema.safeParse(input)
    if (!parsed.success) {
      return err("VALIDATION_ERROR", "Invalid input parameters")
    }

    // Build query - base select from cuadCategories
    let query = db
      .select({
        id: cuadCategories.id,
        name: cuadCategories.name,
        description: cuadCategories.description,
        riskWeight: cuadCategories.riskWeight,
        isNdaRelevant: cuadCategories.isNdaRelevant,
      })
      .from(cuadCategories)

    // Apply NDA relevance filter if requested
    if (parsed.data?.ndaRelevantOnly) {
      query = query.where(eq(cuadCategories.isNdaRelevant, true)) as typeof query
    }

    const categories = await query

    // Map results to ensure non-null defaults for optional DB fields
    const mappedCategories: Category[] = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      riskWeight: cat.riskWeight ?? 1.0,
      isNdaRelevant: cat.isNdaRelevant ?? true,
    }))

    return ok(mappedCategories)
  } catch (error) {
    console.error("Failed to fetch categories:", error)
    return err("INTERNAL_ERROR", "Failed to fetch categories")
  }
}
