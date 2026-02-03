/**
 * @fileoverview Admin Bootstrap API
 *
 * Admin-only API route to trigger the reference data ingestion pipeline.
 * Protected by admin role verification.
 *
 * @route POST /api/admin/bootstrap
 *
 * @example Request body:
 * ```json
 * {
 *   "sources": ["cuad", "contract_nli", "bonterms", "commonaccord"],
 *   "forceRefresh": false
 * }
 * ```
 *
 * @module app/api/admin/bootstrap/route
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { organizationMembers } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { inngest } from "@/inngest"
import type { DatasetSource } from "@/lib/datasets"

const ALL_SOURCES: DatasetSource[] = [
  "cuad",
  "contract_nli",
  "bonterms",
  "commonaccord",
]

/**
 * Trigger the bootstrap reference data ingestion pipeline.
 *
 * Requires admin or owner role in the active organization.
 */
export async function POST(request: Request) {
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

  // Parse request body
  let body: { sources?: DatasetSource[]; forceRefresh?: boolean }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const sources = body.sources || ALL_SOURCES
  const forceRefresh = body.forceRefresh || false

  // Validate sources
  const invalidSources = sources.filter((s) => !ALL_SOURCES.includes(s))
  if (invalidSources.length > 0) {
    return NextResponse.json(
      { error: `Invalid sources: ${invalidSources.join(", ")}` },
      { status: 400 }
    )
  }

  // Send event to Inngest
  await inngest.send({
    name: "bootstrap/ingest.requested",
    data: { sources, forceRefresh },
  })

  return NextResponse.json({
    status: "started",
    sources,
    forceRefresh,
    message: "Bootstrap ingestion started. Check Inngest dashboard for progress.",
  })
}

/**
 * Get status/documentation for the bootstrap endpoint.
 */
export async function GET() {
  // Check authentication
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required" },
      { status: 401 }
    )
  }

  return NextResponse.json({
    endpoint: "/api/admin/bootstrap",
    methods: ["POST", "GET"],
    description: "Trigger reference data ingestion pipeline",
    requestBody: {
      sources: {
        type: "array",
        items: ALL_SOURCES,
        default: ALL_SOURCES,
        description: "Which datasets to ingest",
      },
      forceRefresh: {
        type: "boolean",
        default: false,
        description: "Re-download even if cached",
      },
    },
    requiredRole: ["owner", "admin"],
  })
}
