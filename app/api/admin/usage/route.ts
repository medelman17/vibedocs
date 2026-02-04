/**
 * @fileoverview Admin Usage API
 *
 * Admin-only API route to query usage statistics for the organization.
 * Returns aggregate token usage and estimated costs.
 *
 * @route GET /api/admin/usage
 *
 * @example Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 *
 * @module app/api/admin/usage/route
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { organizationMembers, analyses } from "@/db/schema"
import { eq, and, gte, lte, sql, sum, count } from "drizzle-orm"

/**
 * Get usage statistics for the organization.
 *
 * Requires admin or owner role.
 */
export async function GET(request: Request) {
  // Check authentication
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required" },
      { status: 401 }
    )
  }

  // Check admin role
  const organizationId = session.activeOrganizationId

  if (!organizationId) {
    return NextResponse.json(
      { error: "Forbidden: No active organization" },
      { status: 403 }
    )
  }

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, session.user.id),
      eq(organizationMembers.organizationId, organizationId)
    ),
  })

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 }
    )
  }

  // Parse query params
  const url = new URL(request.url)
  const startDate = url.searchParams.get("startDate")
  const endDate = url.searchParams.get("endDate")

  // Build query conditions
  const conditions = [eq(analyses.tenantId, organizationId)]
  if (startDate) {
    conditions.push(gte(analyses.createdAt, new Date(startDate)))
  }
  if (endDate) {
    conditions.push(lte(analyses.createdAt, new Date(endDate)))
  }

  try {
    // Query aggregate usage
    const [usage] = await db
      .select({
        totalAnalyses: count(),
        completedAnalyses: sql<number>`count(*) filter (where ${analyses.status} = 'completed')`,
        failedAnalyses: sql<number>`count(*) filter (where ${analyses.status} = 'failed')`,
        processingAnalyses: sql<number>`count(*) filter (where ${analyses.status} = 'processing')`,
        totalEstimatedTokens: sum(analyses.estimatedTokens),
        totalActualTokens: sum(analyses.actualTokens),
        totalEstimatedCost: sum(analyses.estimatedCost),
        truncatedDocuments: sql<number>`count(*) filter (where ${analyses.wasTruncated} = true)`,
        avgProcessingTimeMs: sql<number>`avg(${analyses.processingTimeMs})`,
      })
      .from(analyses)
      .where(and(...conditions))

    return NextResponse.json({
      organizationId,
      period: {
        startDate: startDate ?? null,
        endDate: endDate ?? null,
      },
      usage: {
        analyses: {
          total: Number(usage.totalAnalyses ?? 0),
          completed: Number(usage.completedAnalyses ?? 0),
          failed: Number(usage.failedAnalyses ?? 0),
          processing: Number(usage.processingAnalyses ?? 0),
          truncated: Number(usage.truncatedDocuments ?? 0),
        },
        tokens: {
          estimated: Number(usage.totalEstimatedTokens ?? 0),
          actual: Number(usage.totalActualTokens ?? 0),
        },
        cost: {
          estimated: Number(usage.totalEstimatedCost ?? 0),
        },
        performance: {
          avgProcessingTimeMs: usage.avgProcessingTimeMs
            ? Math.round(Number(usage.avgProcessingTimeMs))
            : null,
        },
      },
    })
  } catch (error) {
    console.error("[admin/usage] Error querying usage:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
