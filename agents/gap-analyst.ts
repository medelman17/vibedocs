/**
 * @fileoverview Gap Analyst Agent
 *
 * Fourth stage of the NDA analysis pipeline. Identifies missing clauses,
 * weak protections, and tests ContractNLI hypotheses for coverage gaps.
 *
 * @module agents/gap-analyst
 */

import { generateText, Output, NoObjectGeneratedError } from 'ai'
import { z } from 'zod'
import { getAgentModel } from '@/lib/ai/config'
import { AnalysisFailedError } from '@/lib/errors'
import {
  cuadCategorySchema,
  type CuadCategory,
  CONTRACT_NLI_CATEGORIES,
  type ContractNLICategory,
} from './types'
import {
  createGapAnalystPrompt,
  GAP_ANALYST_SYSTEM_PROMPT,
  CONTRACT_NLI_HYPOTHESES,
} from './prompts'
import type { BudgetTracker } from '@/lib/ai/budget'
import type { ClassifiedClause } from './classifier'
import type { RiskAssessmentResult } from './risk-scorer'

// ============================================================================
// Constants
// ============================================================================

/**
 * Gap score weights for calculating overall gap score.
 * Higher scores indicate more severe gaps or risks.
 */
const GAP_SCORE_WEIGHTS = {
  MISSING_CRITICAL: 15,
  MISSING_IMPORTANT: 8,
  MISSING_OPTIONAL: 3,
  WEAK_CLAUSE: 5,
  HYPOTHESIS_CONTRADICTION: 15,
  HYPOTHESIS_MISSING_CRITICAL: 10,
  HYPOTHESIS_MISSING: 5,
} as const

// ============================================================================
// Types
// ============================================================================

export interface GapAnalystInput {
  clauses: ClassifiedClause[]
  assessments: RiskAssessmentResult[]
  documentSummary: string
  budgetTracker: BudgetTracker
}

export interface GapAnalystOutput {
  gapAnalysis: {
    presentCategories: CuadCategory[]
    missingCategories: Array<{
      category: CuadCategory
      importance: 'critical' | 'important' | 'optional'
      explanation: string
      suggestedLanguage?: string
    }>
    weakClauses: Array<{
      clauseId: string
      category: CuadCategory
      issue: string
      recommendation: string
    }>
    gapScore: number
  }
  hypothesisCoverage: Array<{
    hypothesisId: string
    category: ContractNLICategory
    status: 'entailment' | 'contradiction' | 'not_mentioned'
    supportingClauseId?: string
    explanation: string
  }>
  tokenUsage: { inputTokens: number; outputTokens: number }
}

// ============================================================================
// Schemas
// ============================================================================

const gapAnalysisSchema = z.object({
  presentCategories: z.array(cuadCategorySchema),
  missingCategories: z.array(
    z.object({
      category: cuadCategorySchema,
      importance: z.enum(['critical', 'important', 'optional']),
      explanation: z.string(),
      suggestedLanguage: z.string().optional(),
    })
  ),
  weakClauses: z.array(
    z.object({
      clauseId: z.string(),
      category: cuadCategorySchema,
      issue: z.string(),
      recommendation: z.string(),
    })
  ),
})

const hypothesisSchema = z.object({
  hypothesisId: z.string(),
  category: z.enum(CONTRACT_NLI_CATEGORIES),
  status: z.enum(['entailment', 'contradiction', 'not_mentioned']),
  supportingClauseId: z.string().optional(),
  explanation: z.string(),
})

// ============================================================================
// Gap Analyst Agent
// ============================================================================

/**
 * Runs the gap analyst agent to identify coverage gaps.
 *
 * Performs two types of analysis:
 * 1. CUAD category gap analysis - missing and weak clauses
 * 2. ContractNLI hypothesis testing - NDA completeness verification
 *
 * @param input - Gap analyst input with clauses and assessments
 * @returns Gap analysis with hypothesis coverage
 */
export async function runGapAnalystAgent(
  input: GapAnalystInput
): Promise<GapAnalystOutput> {
  const { clauses, documentSummary, budgetTracker } = input
  let totalInputTokens = 0
  let totalOutputTokens = 0

  // Extract present categories from classified clauses
  const presentCategories = [
    ...new Set(clauses.map((c) => c.category)),
  ] as CuadCategory[]

  // Prepare clause data for prompt
  const classifiedClauses = clauses.map((c) => ({
    id: c.chunkId,
    category: c.category,
    text: c.clauseText,
  }))

  // Analyze gaps in CUAD coverage
  const gapPrompt = createGapAnalystPrompt(
    documentSummary,
    presentCategories,
    classifiedClauses
  )

  let gapGenResult
  try {
    gapGenResult = await generateText({
      model: getAgentModel('gapAnalyst'),
      system: GAP_ANALYST_SYSTEM_PROMPT,
      prompt: gapPrompt,
      output: Output.object({ schema: gapAnalysisSchema }),
    })
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      console.error('[GapAnalyst] Gap analysis generation failed', {
        cause: error.cause,
        text: error.text?.slice(0, 500),
      })
      throw new AnalysisFailedError(
        'Gap analysis failed to produce valid output',
        [{ field: 'gaps', message: 'Model output invalid' }]
      )
    }
    throw error
  }
  const { output: gapResult, usage: gapUsage } = gapGenResult

  totalInputTokens += gapUsage?.inputTokens ?? 0
  totalOutputTokens += gapUsage?.outputTokens ?? 0

  // Test ContractNLI hypotheses (limit to first 5 for budget constraints).
  // Rationale: The PRD allocates ~52K tokens for the gap analyst agent.
  // Each hypothesis test consumes ~10K tokens (prompt + classification).
  // Testing 5 hypotheses (50K tokens) plus gap analysis (2K tokens) stays
  // within budget. In production, this limit should be configurable or
  // budget-aware. The first 5 hypotheses cover the most critical NDA clauses:
  // Purpose Limitation, Standard of Care, Legal Compulsion, Public Info, and
  // Governing Law (see CONTRACT_NLI_HYPOTHESES in agents/prompts/index.ts).
  const hypothesisCoverage: GapAnalystOutput['hypothesisCoverage'] = []
  const hypothesesToTest = CONTRACT_NLI_HYPOTHESES.slice(0, 5)

  for (const hypothesis of hypothesesToTest) {
    let hypResult
    try {
      hypResult = await generateText({
        model: getAgentModel('gapAnalyst'),
        system: GAP_ANALYST_SYSTEM_PROMPT,
        prompt: buildHypothesisPrompt(hypothesis, clauses),
        output: Output.object({ schema: hypothesisSchema }),
      })
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        console.error('[GapAnalyst] Hypothesis test failed', {
          hypothesisId: hypothesis.id,
          cause: error.cause,
        })
        // Continue with next hypothesis rather than failing entire analysis
        continue
      }
      throw error
    }
    const { output, usage } = hypResult

    totalInputTokens += usage?.inputTokens ?? 0
    totalOutputTokens += usage?.outputTokens ?? 0

    hypothesisCoverage.push({
      hypothesisId: hypothesis.id,
      category: hypothesis.category as ContractNLICategory,
      status: output.status,
      supportingClauseId: output.supportingClauseId,
      explanation: output.explanation,
    })
  }

  // Calculate gap score
  const gapScore = calculateGapScore(gapResult, hypothesisCoverage)

  // Record budget
  budgetTracker.record('gapAnalyst', totalInputTokens, totalOutputTokens)

  return {
    gapAnalysis: {
      presentCategories: gapResult.presentCategories,
      missingCategories: gapResult.missingCategories,
      weakClauses: gapResult.weakClauses,
      gapScore,
    },
    hypothesisCoverage,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  }
}

/**
 * Builds a prompt for testing a single ContractNLI hypothesis.
 */
function buildHypothesisPrompt(
  hypothesis: (typeof CONTRACT_NLI_HYPOTHESES)[number],
  clauses: ClassifiedClause[]
): string {
  const clauseSummary = clauses
    .slice(0, 10) // Limit for token budget
    .map((c) => `- [${c.chunkId}] ${c.category}: ${c.clauseText.slice(0, 150)}...`)
    .join('\n')

  return `Test this hypothesis against the document:

Hypothesis ID: ${hypothesis.id}
Category: ${hypothesis.category}
Importance: ${hypothesis.importance}
Hypothesis: "${hypothesis.hypothesis}"

Document clauses:
${clauseSummary || 'No clauses provided.'}

Determine if the document supports (entailment), opposes (contradiction), or doesn't address (not_mentioned) this hypothesis. Return JSON only.`
}

/**
 * Calculates overall gap score based on findings.
 *
 * Uses weights from GAP_SCORE_WEIGHTS to compute a composite score.
 * Higher scores indicate more severe gaps or risks in the NDA.
 */
function calculateGapScore(
  gapResult: z.infer<typeof gapAnalysisSchema>,
  hypotheses: Array<{ status: string; category: string }>
): number {
  let score = 0

  // Missing categories
  for (const missing of gapResult.missingCategories) {
    if (missing.importance === 'critical') score += GAP_SCORE_WEIGHTS.MISSING_CRITICAL
    else if (missing.importance === 'important') score += GAP_SCORE_WEIGHTS.MISSING_IMPORTANT
    else score += GAP_SCORE_WEIGHTS.MISSING_OPTIONAL
  }

  // Weak clauses (simplified - applies flat weight per weak clause)
  score += gapResult.weakClauses.length * GAP_SCORE_WEIGHTS.WEAK_CLAUSE

  // Hypothesis coverage
  const criticalCategories = [
    'Purpose Limitation',
    'Standard of Care',
    'Legal Compulsion',
    'Public Information Exception',
    'Governing Law',
  ]

  for (const h of hypotheses) {
    if (h.status === 'contradiction') {
      score += GAP_SCORE_WEIGHTS.HYPOTHESIS_CONTRADICTION
    } else if (h.status === 'not_mentioned') {
      if (criticalCategories.includes(h.category)) {
        score += GAP_SCORE_WEIGHTS.HYPOTHESIS_MISSING_CRITICAL
      } else {
        score += GAP_SCORE_WEIGHTS.HYPOTHESIS_MISSING
      }
    }
  }

  return Math.min(100, score)
}
