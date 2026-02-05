/**
 * @fileoverview Risk Scorer Agent
 *
 * Third stage of the NDA analysis pipeline. Assesses risk levels for
 * classified clauses with evidence-based explanations.
 *
 * Uses PRD-aligned risk levels: standard, cautious, aggressive, unknown
 * (not low/medium/high).
 *
 * @module agents/risk-scorer
 */

import { generateText, Output, NoObjectGeneratedError } from 'ai'
import { getAgentModel } from '@/lib/ai/config'
import { AnalysisFailedError } from '@/lib/errors'
import { riskAssessmentSchema, type RiskLevel } from './types'
import type { Perspective } from './types'
import { findSimilarClauses } from './tools/vector-search'
import { createRiskScorerPrompt, RISK_SCORER_SYSTEM_PROMPT } from './prompts'
import type { BudgetTracker } from '@/lib/ai/budget'
import type { ClassifiedClause } from './classifier'

// ============================================================================
// Types
// ============================================================================

export interface RiskScorerInput {
  clauses: ClassifiedClause[]
  budgetTracker: BudgetTracker
  /** Assessment perspective. Default: 'balanced' */
  perspective?: Perspective
}

export interface RiskAssessmentResult {
  clauseId: string
  clause: ClassifiedClause
  riskLevel: RiskLevel
  confidence: number
  explanation: string
  negotiationSuggestion?: string
  atypicalLanguage: boolean
  atypicalLanguageNote?: string
  evidence: {
    citations: Array<{
      text: string
      sourceType: 'clause' | 'reference' | 'template'
    }>
    references: Array<{
      sourceId: string
      source: 'cuad' | 'contract_nli' | 'bonterms' | 'commonaccord'
      section?: string
      similarity: number
      summary: string
    }>
    baselineComparison?: string
  }
  startPosition: number
  endPosition: number
}

export interface RiskScorerOutput {
  assessments: RiskAssessmentResult[]
  overallRiskScore: number
  overallRiskLevel: RiskLevel
  perspective: Perspective
  executiveSummary: string
  riskDistribution: Record<RiskLevel, number>
  tokenUsage: { inputTokens: number; outputTokens: number }
}

// ============================================================================
// Risk Scorer Agent
// ============================================================================

/**
 * Runs the risk scorer agent to assess clause risk levels.
 *
 * For each classified clause:
 * 1. Fetches similar reference clauses for comparison
 * 2. Generates risk assessment with evidence-based explanation
 * 3. Calculates overall document risk score
 *
 * @param input - Risk scorer input with classified clauses
 * @returns Risk assessments with overall score
 */
export async function runRiskScorerAgent(
  input: RiskScorerInput
): Promise<RiskScorerOutput> {
  const { clauses, budgetTracker } = input
  const perspective = input.perspective ?? 'balanced'
  const assessments: RiskAssessmentResult[] = []
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (const clause of clauses) {
    // Fetch reference clauses for comparison
    const references = await findSimilarClauses(clause.clauseText, {
      category: clause.category,
      limit: 5,
    })

    // Build prompt with clause and references
    const prompt = createRiskScorerPrompt(
      clause.clauseText,
      clause.category,
      references
    )

    // Generate risk assessment
    // TODO(07-02): Switch to enhancedRiskAssessmentSchema and perspective-aware prompt
    let result
    try {
      result = await generateText({
        model: getAgentModel('riskScorer'),
        system: RISK_SCORER_SYSTEM_PROMPT,
        prompt,
        output: Output.object({ schema: riskAssessmentSchema }),
      })
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        console.error('[RiskScorer] Object generation failed', {
          clauseId: clause.chunkId,
          cause: error.cause,
          text: error.text?.slice(0, 500),
        })
        throw new AnalysisFailedError(
          'Risk scoring failed to produce valid output',
          [{ field: 'clause', message: clause.chunkId }]
        )
      }
      throw error
    }

    const { output, usage } = result

    totalInputTokens += usage?.inputTokens ?? 0
    totalOutputTokens += usage?.outputTokens ?? 0

    // Transform legacy evidence shape to enhanced structure
    // TODO(07-02): Remove transformation when switching to enhancedRiskAssessmentSchema
    assessments.push({
      clauseId: clause.chunkId,
      clause,
      riskLevel: output.riskLevel,
      confidence: output.confidence,
      explanation: output.explanation,
      atypicalLanguage: false,
      evidence: {
        citations: output.evidence.citations.map((c: string) => ({
          text: c,
          sourceType: 'clause' as const,
        })),
        references: references.map((ref) => ({
          sourceId: ref.id,
          source: 'cuad' as const,
          similarity: ref.similarity,
          summary: ref.content.slice(0, 200),
        })),
      },
      startPosition: clause.startPosition,
      endPosition: clause.endPosition,
    })
  }

  // Calculate overall risk
  const { score, level } = calculateOverallRisk(assessments)

  // Compute risk distribution
  const riskDistribution = computeRiskDistribution(assessments)

  // Record budget
  budgetTracker.record('riskScorer', totalInputTokens, totalOutputTokens)

  return {
    assessments,
    overallRiskScore: score,
    overallRiskLevel: level,
    perspective,
    executiveSummary: '', // Placeholder -- populated in Plan 03
    riskDistribution,
    tokenUsage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    },
  }
}

/**
 * Calculates overall risk score and level from individual assessments.
 *
 * Scoring:
 * - aggressive = 3 points
 * - cautious = 1.5 points
 * - standard = 0 points
 * - unknown = 0.5 points
 *
 * Final score is percentage of maximum possible risk.
 */
function calculateOverallRisk(
  assessments: RiskAssessmentResult[]
): { score: number; level: RiskLevel } {
  if (assessments.length === 0) {
    return { score: 0, level: 'unknown' }
  }

  const weights: Record<RiskLevel, number> = {
    aggressive: 3,
    cautious: 1.5,
    standard: 0,
    unknown: 0.5,
  }

  const totalWeight = assessments.reduce(
    (sum, a) => sum + weights[a.riskLevel],
    0
  )
  const maxWeight = assessments.length * 3
  const score = Math.round((totalWeight / maxWeight) * 100)

  const level: RiskLevel =
    score >= 60 ? 'aggressive' : score >= 30 ? 'cautious' : 'standard'

  return { score, level }
}

/**
 * Computes the count of assessments per risk level.
 */
function computeRiskDistribution(
  assessments: RiskAssessmentResult[]
): Record<RiskLevel, number> {
  const distribution: Record<RiskLevel, number> = {
    standard: 0,
    cautious: 0,
    aggressive: 0,
    unknown: 0,
  }
  for (const a of assessments) {
    distribution[a.riskLevel]++
  }
  return distribution
}
