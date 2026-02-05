/**
 * @fileoverview Risk Scoring Data Access Layer
 *
 * Provides functions for persisting per-clause risk assessments to the
 * clauseExtractions table, computing weighted document-level risk scores
 * using cuadCategories.riskWeight, and updating analysis records with
 * risk results, executive summary, and perspective metadata.
 *
 * @module db/queries/risk-scoring
 * @see {@link ../schema/analyses.ts} for clauseExtractions and analyses tables
 * @see {@link ../schema/reference.ts} for cuadCategories table
 * @see {@link ../../agents/risk-scorer.ts} for RiskAssessmentResult type
 */

import { eq, sql } from "drizzle-orm"
import type { Database } from "../client"
import { clauseExtractions, analyses } from "../schema/analyses"
import { cuadCategories } from "../schema/reference"
import type { RiskAssessmentResult, RiskScorerOutput } from "@/agents/risk-scorer"
import type { RiskLevel, Perspective } from "@/agents/types"

/** Batch size for clause extraction inserts */
const PERSIST_BATCH_SIZE = 100

/**
 * Persist per-clause risk assessments to the clauseExtractions table.
 *
 * Maps each RiskAssessmentResult to a clauseExtractions row and batch-inserts
 * with ON CONFLICT DO UPDATE on (analysisId, chunkId) to support re-scoring.
 *
 * @param dbClient - Database client (tenant-scoped from withTenantContext)
 * @param tenantId - Tenant UUID for multi-org isolation
 * @param analysisId - Parent analysis UUID
 * @param documentId - Source document UUID
 * @param assessments - Array of risk assessment results from the agent
 * @param perspective - Assessment perspective used (receiving/disclosing/balanced)
 * @returns Count of persisted records
 */
export async function persistRiskAssessments(
  dbClient: Database,
  tenantId: string,
  analysisId: string,
  documentId: string,
  assessments: RiskAssessmentResult[],
  perspective: Perspective
): Promise<number> {
  if (assessments.length === 0) return 0

  let persisted = 0

  // Build insert values from assessments
  const values = assessments.map((assessment) => ({
    tenantId,
    analysisId,
    documentId,
    chunkId: assessment.clauseId,
    category: assessment.clause.category,
    secondaryCategories: assessment.clause.secondaryCategories ?? [],
    clauseText: assessment.clause.clauseText,
    startPosition: assessment.startPosition,
    endPosition: assessment.endPosition,
    confidence: assessment.clause.confidence,
    riskLevel: assessment.riskLevel,
    riskExplanation: assessment.explanation,
    evidence: {
      citations: assessment.evidence.citations,
      references: assessment.evidence.references,
      baselineComparison: assessment.evidence.baselineComparison,
    },
    metadata: {
      perspective,
      riskConfidence: assessment.confidence,
      atypicalLanguage: assessment.atypicalLanguage,
      atypicalLanguageNote: assessment.atypicalLanguageNote,
      negotiationSuggestion: assessment.negotiationSuggestion,
    },
  }))

  // Batch insert in groups of PERSIST_BATCH_SIZE
  for (let i = 0; i < values.length; i += PERSIST_BATCH_SIZE) {
    const batch = values.slice(i, i + PERSIST_BATCH_SIZE)

    await dbClient
      .insert(clauseExtractions)
      .values(batch)
      .onConflictDoUpdate({
        target: [clauseExtractions.analysisId, clauseExtractions.chunkId],
        set: {
          riskLevel: sql`excluded.risk_level`,
          riskExplanation: sql`excluded.risk_explanation`,
          evidence: sql`excluded.evidence`,
          metadata: sql`excluded.metadata`,
          updatedAt: new Date(),
        },
      })

    persisted += batch.length
  }

  return persisted
}

/**
 * Calculate a weighted document-level risk score using category importance.
 *
 * Queries the cuadCategories table for riskWeight values, then computes a
 * weighted average risk score. Falls back to uniform weights if the
 * cuadCategories table is empty (bootstrap not run).
 *
 * Risk value mapping:
 * - aggressive = 1.0
 * - cautious = 0.5
 * - standard = 0.0
 * - unknown = 0.25
 *
 * Score formula: sum(riskValue * categoryWeight) / sum(categoryWeight) * 100
 *
 * @param dbClient - Database client
 * @param assessments - Array of risk assessment results
 * @returns Object with score (0-100 integer) and risk level
 */
export async function calculateWeightedRisk(
  dbClient: Database,
  assessments: RiskAssessmentResult[]
): Promise<{ score: number; level: RiskLevel }> {
  if (assessments.length === 0) {
    return { score: 0, level: "standard" }
  }

  // Risk value mapping per risk level
  const riskValues: Record<RiskLevel, number> = {
    aggressive: 1.0,
    cautious: 0.5,
    standard: 0.0,
    unknown: 0.25,
  }

  // Query cuadCategories for risk weights
  let weightMap: Map<string, number>
  try {
    const categories = await dbClient
      .select({
        name: cuadCategories.name,
        riskWeight: cuadCategories.riskWeight,
      })
      .from(cuadCategories)

    weightMap = new Map(
      categories.map((c) => [c.name, c.riskWeight ?? 1.0])
    )
  } catch {
    // Table may not exist or be empty - fall back to uniform weights
    weightMap = new Map()
  }

  // Compute weighted score
  let weightedSum = 0
  let totalWeight = 0

  for (const assessment of assessments) {
    const riskValue = riskValues[assessment.riskLevel] ?? 0.25
    const categoryWeight = weightMap.get(assessment.clause.category) ?? 1.0

    weightedSum += riskValue * categoryWeight
    totalWeight += categoryWeight
  }

  // Avoid division by zero
  if (totalWeight === 0) {
    return { score: 0, level: "standard" }
  }

  const score = Math.round((weightedSum / totalWeight) * 100)

  // Determine level from score
  const level: RiskLevel =
    score >= 60 ? "aggressive" : score >= 30 ? "cautious" : "standard"

  return { score, level }
}

/**
 * Update the analysis record with risk scoring results.
 *
 * Stores the weighted risk score, risk level, executive summary, and merges
 * perspective/riskDistribution into the existing metadata JSONB.
 *
 * @param dbClient - Database client
 * @param analysisId - Analysis UUID to update
 * @param riskOutput - Full risk scorer output
 * @param weightedRisk - Pre-computed weighted risk from calculateWeightedRisk
 */
export async function updateAnalysisWithRiskResults(
  dbClient: Database,
  analysisId: string,
  riskOutput: Pick<RiskScorerOutput, "executiveSummary" | "perspective" | "riskDistribution">,
  weightedRisk: { score: number; level: RiskLevel }
): Promise<void> {
  await dbClient
    .update(analyses)
    .set({
      overallRiskScore: weightedRisk.score,
      overallRiskLevel: weightedRisk.level,
      summary: riskOutput.executiveSummary,
      metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
        perspective: riskOutput.perspective,
        riskDistribution: riskOutput.riskDistribution,
      })}::jsonb`,
    })
    .where(eq(analyses.id, analysisId))
}
