/**
 * @fileoverview Word Add-in Realtime Token Endpoint
 *
 * Generates scoped Inngest Realtime subscription tokens for analysis
 * progress streams. The Word Add-in uses this to get a token for
 * subscribing to real-time progress updates via useInngestSubscription.
 *
 * Auth: Bearer token validation via verifyAddInAuth (same as other Word Add-in routes).
 * Tenant isolation: Validates analysis belongs to authenticated tenant before issuing token.
 *
 * @module app/api/word-addin/realtime-token/[id]
 */

import { db } from "@/db"
import { analyses } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { verifyAddInAuth } from "@/lib/word-addin-auth"
import { generateAnalysisToken } from "@/lib/realtime/tokens"
import { ForbiddenError, NotFoundError, toAppError } from "@/lib/errors"
import { error } from "@/lib/api-utils"

/**
 * GET /api/word-addin/realtime-token/[id]
 *
 * Generate an Inngest Realtime subscription token for analysis progress.
 *
 * @param request - HTTP request with Authorization: Bearer <sessionToken>
 * @param params - Route params containing analysis ID
 * @returns JSON { token } containing the scoped subscription token
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: analysisId } = await params

  try {
    const authContext = await verifyAddInAuth(request)
    const tenantId = authContext.tenant.tenantId

    if (!tenantId) {
      throw new ForbiddenError("No organization selected")
    }

    // Verify analysis belongs to tenant before issuing token
    const analysis = await db.query.analyses.findFirst({
      where: and(
        eq(analyses.id, analysisId),
        eq(analyses.tenantId, tenantId)
      ),
      columns: { id: true },
    })

    if (!analysis) {
      throw new NotFoundError("Analysis not found")
    }

    const token = await generateAnalysisToken(analysisId)
    return Response.json({ token })
  } catch (err) {
    return error(toAppError(err))
  }
}
