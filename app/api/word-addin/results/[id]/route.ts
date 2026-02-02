/**
 * @fileoverview Word Add-in Analysis Results Endpoint
 *
 * Returns completed analysis results including risk scores, clauses,
 * and gap analysis for the Word Add-in task pane.
 *
 * @module app/api/word-addin/results/[id]
 */

import { NextResponse } from "next/server"
import { db } from "@/db"
import { analyses, clauseExtractions } from "@/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { verifyAddInAuth } from "@/lib/word-addin-auth"

/**
 * Clause result shape for the Word Add-in
 */
interface ClauseResult {
  id: string
  category: string
  clauseText: string
  confidence: number
  riskLevel: string
  riskExplanation: string | null
  startPosition: number | null
  endPosition: number | null
}

/**
 * Gap analysis result shape
 */
interface GapAnalysisResult {
  missingClauses: string[]
  weakClauses: Array<{
    category: string
    reason: string
  }>
  recommendations: Array<{
    category: string
    recommendation: string
    priority: "low" | "medium" | "high"
  }>
}

/**
 * Full results response shape
 */
interface AnalysisResults {
  analysisId: string
  documentId: string
  status: string
  version: number
  overallRiskScore: number | null
  overallRiskLevel: string | null
  summary: string | null
  clauses: ClauseResult[]
  gapAnalysis: GapAnalysisResult | null
  tokenUsage: {
    input: number
    output: number
    total: number
  } | null
  processingTimeMs: number | null
  completedAt: string | null
}

/**
 * GET /api/word-addin/results/[id]
 *
 * Fetches completed analysis results including clauses and gap analysis.
 *
 * @description
 * Returns the full analysis results for display in the Word Add-in task pane.
 * The analysis must be in "completed" status to return results.
 *
 * @param request - HTTP request with Authorization header
 * @param params - Route params containing analysis ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: analysisId } = await params

  try {
    // Authenticate the request
    const authContext = await verifyAddInAuth(request)
    const tenantId = authContext.tenantId

    if (!tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "No organization selected",
          },
        },
        { status: 403 }
      )
    }

    // Fetch analysis with tenant check
    const analysis = await db.query.analyses.findFirst({
      where: and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId)),
    })

    if (!analysis) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Analysis not found",
          },
        },
        { status: 404 }
      )
    }

    // Check if analysis is complete
    if (analysis.status !== "completed") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CONFLICT",
            message: `Analysis is not complete. Current status: ${analysis.status}`,
          },
        },
        { status: 409 }
      )
    }

    // Fetch clause extractions
    const clauses = await db
      .select()
      .from(clauseExtractions)
      .where(
        and(
          eq(clauseExtractions.analysisId, analysisId),
          eq(clauseExtractions.tenantId, tenantId)
        )
      )
      .orderBy(desc(clauseExtractions.confidence))

    // Transform clauses for response
    const clauseResults: ClauseResult[] = clauses.map((clause) => ({
      id: clause.id,
      category: clause.category,
      clauseText: clause.clauseText,
      confidence: clause.confidence,
      riskLevel: clause.riskLevel,
      riskExplanation: clause.riskExplanation,
      startPosition: clause.startPosition,
      endPosition: clause.endPosition,
    }))

    // Parse token usage from JSONB
    const tokenUsage = analysis.tokenUsage as {
      input: number
      output: number
      total: number
    } | null

    // Parse gap analysis from JSONB
    const gapAnalysis = analysis.gapAnalysis as GapAnalysisResult | null

    // Build response
    const results: AnalysisResults = {
      analysisId: analysis.id,
      documentId: analysis.documentId,
      status: analysis.status,
      version: analysis.version,
      overallRiskScore: analysis.overallRiskScore,
      overallRiskLevel: analysis.overallRiskLevel,
      summary: analysis.summary,
      clauses: clauseResults,
      gapAnalysis,
      tokenUsage,
      processingTimeMs: analysis.processingTimeMs,
      completedAt: analysis.completedAt?.toISOString() ?? null,
    }

    return NextResponse.json({
      success: true,
      data: results,
    })
  } catch (error) {
    // Handle known error types
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: error.message,
            },
          },
          { status: 401 }
        )
      }

      if (error.name === "ForbiddenError") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: error.message,
            },
          },
          { status: 403 }
        )
      }
    }

    console.error("[GET /api/word-addin/results/[id]]", error)

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch results",
        },
      },
      { status: 500 }
    )
  }
}
