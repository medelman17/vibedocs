/**
 * @fileoverview Gap Analysis Queries
 *
 * Queries for retrieving enhanced gap analysis data from the analyses table.
 * The gapAnalysis column stores JSONB data matching EnhancedGapResult.
 *
 * @module db/queries/gap-analysis
 * @see {@link ../schema/analyses.ts} for analyses table definition
 * @see {@link ../../agents/types.ts} for EnhancedGapResult type
 */

import { eq, and } from "drizzle-orm"
import { db } from "../client"
import { analyses } from "../schema/analyses"
import type { EnhancedGapResult } from "@/agents/types"

/**
 * Retrieves the enhanced gap analysis data for an analysis.
 *
 * The gapAnalysis column stores JSONB data matching EnhancedGapResult.
 * Returns null if analysis not found, not completed, or gap data not available.
 *
 * @param analysisId - UUID of the analysis
 * @param tenantId - UUID of the tenant for isolation
 * @returns Enhanced gap analysis result or null
 */
export async function getGapAnalysis(
  analysisId: string,
  tenantId: string
): Promise<EnhancedGapResult | null> {
  const result = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: {
      gapAnalysis: true,
      status: true,
    },
  })

  if (!result || result.status !== "completed") return null

  return (result.gapAnalysis as EnhancedGapResult) ?? null
}
