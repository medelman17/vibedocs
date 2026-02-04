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

import { generateObject } from 'ai'
import { getAgentModel } from '@/lib/ai/config'
import { riskAssessmentSchema, type RiskLevel } from './types'
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
}

export interface RiskAssessmentResult {
  clauseId: string
  clause: ClassifiedClause
  riskLevel: RiskLevel
  confidence: number
  explanation: string
  evidence: {
    citations: string[]
    comparisons: string[]
    statistic?: string
  }
  startPosition: number
  endPosition: number
}

export interface RiskScorerOutput {
  assessments: RiskAssessmentResult[]
  overallRiskScore: number
  overallRiskLevel: RiskLevel
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
    const { object, usage } = await generateObject({
      model: getAgentModel('riskScorer'),
      system: RISK_SCORER_SYSTEM_PROMPT,
      prompt,
      schema: riskAssessmentSchema,
    })

    totalInputTokens += usage?.inputTokens ?? 0
    totalOutputTokens += usage?.outputTokens ?? 0

    assessments.push({
      clauseId: clause.chunkId,
      clause,
      riskLevel: object.riskLevel,
      confidence: object.confidence,
      explanation: object.explanation,
      evidence: object.evidence,
      startPosition: clause.startPosition,
      endPosition: clause.endPosition,
    })
  }

  // Calculate overall risk
  const { score, level } = calculateOverallRisk(assessments)

  // Record budget
  budgetTracker.record('riskScorer', totalInputTokens, totalOutputTokens)

  return {
    assessments,
    overallRiskScore: score,
    overallRiskLevel: level,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
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
