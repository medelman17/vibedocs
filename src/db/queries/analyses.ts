// src/db/queries/analyses.ts
// Analysis CRUD operations with tenant isolation
import { eq, and, desc, sql } from "drizzle-orm"
import { db } from "../client"
import { analyses, clauseExtractions } from "../schema/analyses"

export type AnalysisStatus = "pending" | "running" | "complete" | "failed"
export type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown"

/**
 * Get analysis by document ID
 */
export async function getAnalysisByDocument(
  documentId: string,
  tenantId: string
) {
  const [analysis] = await db
    .select()
    .from(analyses)
    .where(
      and(eq(analyses.documentId, documentId), eq(analyses.tenantId, tenantId))
    )
    .orderBy(desc(analyses.createdAt))
    .limit(1)

  return analysis ?? null
}

/**
 * Get analysis by ID with tenant isolation
 */
export async function getAnalysisById(analysisId: string, tenantId: string) {
  const [analysis] = await db
    .select()
    .from(analyses)
    .where(
      and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId))
    )
    .limit(1)

  return analysis ?? null
}

/**
 * Get analysis with all clause extractions
 */
export async function getAnalysisWithClauses(
  analysisId: string,
  tenantId: string
) {
  const analysis = await getAnalysisById(analysisId, tenantId)
  if (!analysis) return null

  const clauses = await db
    .select()
    .from(clauseExtractions)
    .where(
      and(
        eq(clauseExtractions.analysisId, analysisId),
        eq(clauseExtractions.tenantId, tenantId)
      )
    )
    .orderBy(clauseExtractions.startPosition)

  return { ...analysis, clauses }
}

/**
 * Create a new analysis for a document
 */
export async function createAnalysis(
  tenantId: string,
  documentId: string,
  inngestRunId?: string
) {
  const [analysis] = await db
    .insert(analyses)
    .values({
      tenantId,
      documentId,
      status: "pending",
      inngestRunId: inngestRunId ?? null,
    })
    .returning()

  return analysis
}

/**
 * Update analysis status and results
 */
export async function updateAnalysisStatus(
  analysisId: string,
  tenantId: string,
  status: AnalysisStatus,
  results?: {
    overallRiskScore?: number
    overallRiskLevel?: RiskLevel
    summary?: string
    gapAnalysis?: Record<string, unknown>
    tokenUsage?: { input: number; output: number; cost_usd: number }
    processingTimeMs?: number
  }
) {
  const [updated] = await db
    .update(analyses)
    .set({
      status,
      overallRiskScore: results?.overallRiskScore ?? undefined,
      overallRiskLevel: results?.overallRiskLevel ?? undefined,
      summary: results?.summary ?? undefined,
      gapAnalysis: results?.gapAnalysis ?? undefined,
      tokenUsage: results?.tokenUsage ?? undefined,
      processingTimeMs: results?.processingTimeMs ?? undefined,
      completedAt: status === "complete" ? new Date() : undefined,
      updatedAt: new Date(),
      version: sql`${analyses.version} + 1`,
    })
    .where(and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId)))
    .returning()

  return updated ?? null
}

/**
 * Create clause extractions in batch
 */
export async function createClauseExtractions(
  tenantId: string,
  analysisId: string,
  documentId: string,
  clauses: Array<{
    chunkId?: string
    category: string
    secondaryCategories?: string[]
    clauseText: string
    startPosition?: number
    endPosition?: number
    confidence: number
    riskLevel: RiskLevel
    riskExplanation?: string
    evidence?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }>
) {
  if (clauses.length === 0) return []

  const values = clauses.map((clause) => ({
    tenantId,
    analysisId,
    documentId,
    chunkId: clause.chunkId ?? null,
    category: clause.category,
    secondaryCategories: clause.secondaryCategories ?? null,
    clauseText: clause.clauseText,
    startPosition: clause.startPosition ?? null,
    endPosition: clause.endPosition ?? null,
    confidence: clause.confidence,
    riskLevel: clause.riskLevel,
    riskExplanation: clause.riskExplanation ?? null,
    evidence: clause.evidence ?? null,
    metadata: clause.metadata ?? {},
  }))

  return db.insert(clauseExtractions).values(values).returning()
}

/**
 * Get clause extractions by category
 */
export async function getClausesByCategory(
  analysisId: string,
  tenantId: string,
  category: string
) {
  return db
    .select()
    .from(clauseExtractions)
    .where(
      and(
        eq(clauseExtractions.analysisId, analysisId),
        eq(clauseExtractions.tenantId, tenantId),
        eq(clauseExtractions.category, category)
      )
    )
    .orderBy(clauseExtractions.confidence)
}

/**
 * Get high-risk clauses across an analysis
 */
export async function getHighRiskClauses(
  analysisId: string,
  tenantId: string,
  minConfidence: number = 0.7
) {
  return db
    .select()
    .from(clauseExtractions)
    .where(
      and(
        eq(clauseExtractions.analysisId, analysisId),
        eq(clauseExtractions.tenantId, tenantId),
        eq(clauseExtractions.riskLevel, "aggressive")
      )
    )
    .orderBy(desc(clauseExtractions.confidence))
}
