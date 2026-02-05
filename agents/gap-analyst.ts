/**
 * @fileoverview Gap Analyst Agent
 *
 * Fourth stage of the NDA analysis pipeline. Identifies missing clauses,
 * weak protections, and tests ContractNLI hypotheses for coverage gaps.
 *
 * Enhanced with:
 * - Two-tier gap detection (missing vs incomplete)
 * - Bonterms-presence severity (critical/important/informational)
 * - Template-grounded recommended language via findTemplateBaselines
 * - Coverage summary with present/missing/incomplete counts
 *
 * @module agents/gap-analyst
 */

import { generateText, Output, NoObjectGeneratedError } from 'ai'
import { z } from 'zod'
import { getAgentModel } from '@/lib/ai/config'
import { AnalysisFailedError } from '@/lib/errors'
import { findTemplateBaselines } from './tools/vector-search'
import type { VectorSearchResult } from './tools/vector-search'
import { db } from '@/db/client'
import { cuadCategories } from '@/db/schema/reference'
import { eq } from 'drizzle-orm'
import {
  type CuadCategory,
  CONTRACT_NLI_CATEGORIES,
  type ContractNLICategory,
  type GapSeverity,
  type EnhancedGapResult,
  type EnhancedGapItem,
  type CoverageSummary,
  enhancedGapAnalysisSchema,
  CLASSIFICATION_THRESHOLDS,
} from './types'
import {
  createGapAnalystPrompt,
  GAP_ANALYST_SYSTEM_PROMPT,
  CONTRACT_NLI_HYPOTHESES,
  CRITICAL_CATEGORIES,
  IMPORTANT_CATEGORIES,
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
 *
 * MISSING_INFORMATIONAL maps to the 'informational' severity tier
 * (categories not covered by Bonterms templates).
 */
const GAP_SCORE_WEIGHTS = {
  MISSING_CRITICAL: 15,
  MISSING_IMPORTANT: 8,
  MISSING_INFORMATIONAL: 3,
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
  gapAnalysis: EnhancedGapResult
  hypothesisCoverage: Array<{
    hypothesisId: string
    category: ContractNLICategory
    status: 'entailment' | 'contradiction' | 'not_mentioned'
    supportingClauseId?: string
    explanation: string
  }>
  tokenUsage: { inputTokens: number; outputTokens: number }
}

/** Internal type for pre-LLM gap detection */
interface DetectedGap {
  category: string
  status: 'missing' | 'incomplete'
  severity: GapSeverity
  riskWeight: number
  templateContext: Array<{ content: string; source: string }>
}

// ============================================================================
// Schemas
// ============================================================================

const hypothesisOutputSchema = z.object({
  hypothesisId: z.string(),
  category: z.enum(CONTRACT_NLI_CATEGORIES),
  status: z.enum(['entailment', 'contradiction', 'not_mentioned']),
  supportingClauseId: z.string().optional(),
  explanation: z.string(),
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Retrieves NDA-relevant categories from the cuadCategories table.
 *
 * Falls back to hardcoded CRITICAL_CATEGORIES + IMPORTANT_CATEGORIES
 * when the table is empty (bootstrap not run).
 *
 * @returns Array of NDA-relevant categories with descriptions and risk weights
 */
async function getNdaRelevantCategories(): Promise<
  Array<{ name: string; description: string | null; riskWeight: number }>
> {
  const categories = await db
    .select({
      name: cuadCategories.name,
      description: cuadCategories.description,
      riskWeight: cuadCategories.riskWeight,
    })
    .from(cuadCategories)
    .where(eq(cuadCategories.isNdaRelevant, true))

  if (categories.length > 0) {
    return categories.map((cat) => ({
      name: cat.name,
      description: cat.description,
      riskWeight: cat.riskWeight ?? 1.0,
    }))
  }

  // Fallback: bootstrap not run, use hardcoded lists
  console.warn(
    '[GapAnalyst] cuadCategories table empty, using fallback list'
  )

  const fallback: Array<{
    name: string
    description: string | null
    riskWeight: number
  }> = []

  for (const cat of CRITICAL_CATEGORIES) {
    fallback.push({ name: cat, description: null, riskWeight: 1.5 })
  }
  for (const cat of IMPORTANT_CATEGORIES) {
    fallback.push({ name: cat, description: null, riskWeight: 1.0 })
  }

  return fallback
}

/**
 * Determines gap severity based on Bonterms template presence.
 *
 * Locked decision #3: "Bonterms presence sets the severity tier,
 * LLM provides the explanation for why it matters."
 *
 * - Category has Bonterms template baselines AND riskWeight >= 1.5 -> critical
 * - Category has Bonterms template baselines AND riskWeight < 1.5 -> important
 * - Category has NO Bonterms template baselines -> informational
 */
function determineSeverity(
  hasBontermsBaselines: boolean,
  riskWeight: number
): GapSeverity {
  if (hasBontermsBaselines && riskWeight >= 1.5) return 'critical'
  if (hasBontermsBaselines) return 'important'
  return 'informational'
}

/**
 * Detects whether a category is present, incomplete, or missing from the NDA.
 *
 * Two-tier detection:
 * - 'missing': Zero classifications reference this category
 * - 'incomplete': Has classifications but with low confidence or aggressive/unknown risk
 * - 'present': Adequate coverage
 */
function detectGapStatus(
  categoryName: string,
  clauses: ClassifiedClause[],
  assessments: RiskAssessmentResult[]
): 'present' | 'incomplete' | 'missing' {
  // Filter clauses where primary category matches
  const matchingClauses = clauses.filter(
    (c) => c.category === categoryName
  )

  if (matchingClauses.length === 0) {
    return 'missing'
  }

  // Check if any match has confidence >= LOW_CONFIDENCE threshold (0.7)
  const hasHighConfidence = matchingClauses.some(
    (c) => c.confidence >= CLASSIFICATION_THRESHOLDS.LOW_CONFIDENCE
  )

  if (!hasHighConfidence) {
    return 'incomplete'
  }

  // Check risk assessments for this category -- if all are 'aggressive' or 'unknown', mark incomplete
  const categoryAssessments = assessments.filter(
    (a) => a.clause.category === categoryName
  )

  if (categoryAssessments.length > 0) {
    const allAggressiveOrUnknown = categoryAssessments.every(
      (a) => a.riskLevel === 'aggressive' || a.riskLevel === 'unknown'
    )
    if (allAggressiveOrUnknown) {
      return 'incomplete'
    }
  }

  return 'present'
}

// ============================================================================
// Gap Analyst Agent
// ============================================================================

/**
 * Runs the gap analyst agent to identify coverage gaps.
 *
 * Performs two types of analysis:
 * 1. Enhanced CUAD category gap analysis with two-tier detection,
 *    Bonterms-presence severity, and template-grounded language
 * 2. ContractNLI hypothesis testing - NDA completeness verification
 *
 * @param input - Gap analyst input with clauses and assessments
 * @returns Enhanced gap analysis with hypothesis coverage
 */
export async function runGapAnalystAgent(
  input: GapAnalystInput
): Promise<GapAnalystOutput> {
  const { clauses, assessments, documentSummary, budgetTracker } = input
  let totalInputTokens = 0
  let totalOutputTokens = 0

  // 1. Get NDA-relevant categories from DB (with fallback)
  const ndaCategories = await getNdaRelevantCategories()

  // 2. Extract present categories from classified clauses
  const presentCategories = [
    ...new Set(clauses.map((c) => c.category)),
  ] as CuadCategory[]

  // 3. Detect gaps and retrieve templates
  const gaps: DetectedGap[] = []

  for (const cat of ndaCategories) {
    const status = detectGapStatus(cat.name, clauses, assessments)

    if (status === 'missing' || status === 'incomplete') {
      // Retrieve template baselines using category description for better embeddings
      const searchText = cat.description ?? cat.name
      let templates: VectorSearchResult[] = []
      try {
        templates = await findTemplateBaselines(searchText, { limit: 2 })
      } catch {
        // Template retrieval is best-effort; continue with empty templates
        console.warn(
          `[GapAnalyst] Template retrieval failed for "${cat.name}", continuing without templates`
        )
      }

      // Determine severity based on Bonterms presence (locked decision #3)
      const severity = determineSeverity(
        templates.length > 0,
        cat.riskWeight
      )

      gaps.push({
        category: cat.name,
        status,
        severity,
        riskWeight: cat.riskWeight,
        templateContext: templates.map((t) => ({
          content: t.content,
          source: t.source,
        })),
      })
    }
  }

  // 4. Prepare clause data for prompt
  const classifiedClauses = clauses.map((c) => ({
    id: c.chunkId,
    category: c.category,
    text: c.clauseText,
  }))

  // Sample clauses for style reference (first 5)
  const sampleClauses = clauses.slice(0, 5).map((c) => ({
    category: c.category,
    text: c.clauseText,
  }))

  // 5. Build enhanced prompt with gap data and template context
  const gapPrompt = createGapAnalystPrompt(
    documentSummary,
    presentCategories as string[],
    classifiedClauses,
    gaps.map((g) => ({
      category: g.category,
      status: g.status,
      severity: g.severity,
      templateContext: g.templateContext,
    })),
    sampleClauses
  )

  // 6. LLM call with enhanced schema
  let gapGenResult
  try {
    gapGenResult = await generateText({
      model: getAgentModel('gapAnalyst'),
      system: GAP_ANALYST_SYSTEM_PROMPT,
      prompt: gapPrompt,
      output: Output.object({ schema: enhancedGapAnalysisSchema }),
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
  const { output: llmResult, usage: gapUsage } = gapGenResult

  totalInputTokens += gapUsage?.inputTokens ?? 0
  totalOutputTokens += gapUsage?.outputTokens ?? 0

  // 7. Compute coverage summary from pre-computed detection data
  const missingCount = gaps.filter((g) => g.status === 'missing').length
  const coverageSummary: CoverageSummary = {
    totalCategories: ndaCategories.length,
    presentCount: ndaCategories.length - gaps.length,
    missingCount,
    incompleteCount: gaps.filter((g) => g.status === 'incomplete').length,
    coveragePercent: Math.round(
      ((ndaCategories.length - missingCount) / ndaCategories.length) * 100
    ),
  }

  // 8. Merge LLM-generated explanations with pre-computed severity/status
  // The LLM may reorder or adjust gaps. Use pre-computed data as the source
  // of truth for severity and status, LLM data for explanations and language.
  const enhancedGaps: EnhancedGapItem[] = gaps.map((precomputed) => {
    // Find matching LLM gap by category
    const llmGap = llmResult.gaps.find(
      (g) => g.category === precomputed.category
    )

    return {
      category: precomputed.category as CuadCategory,
      status: precomputed.status,
      severity: precomputed.severity,
      explanation:
        llmGap?.explanation ??
        `${precomputed.category} is ${precomputed.status} from this NDA.`,
      suggestedLanguage:
        llmGap?.suggestedLanguage ??
        `[No recommended language available for ${precomputed.category}]`,
      templateSource: llmGap?.templateSource,
      styleMatch: llmGap?.styleMatch,
    }
  })

  // 9. Test ContractNLI hypotheses (limit to first 5 for budget constraints).
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
        output: Output.object({ schema: hypothesisOutputSchema }),
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

  // 10. Calculate gap score
  const gapScore = calculateGapScore(enhancedGaps, hypothesisCoverage)

  // Record budget
  budgetTracker.record('gapAnalyst', totalInputTokens, totalOutputTokens)

  return {
    gapAnalysis: {
      gaps: enhancedGaps,
      coverageSummary,
      presentCategories: llmResult.presentCategories,
      weakClauses: llmResult.weakClauses,
      hypothesisCoverage,
      gapScore,
    },
    hypothesisCoverage,
    tokenUsage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    },
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
    .map(
      (c) =>
        `- [${c.chunkId}] ${c.category}: ${c.clauseText.slice(0, 150)}...`
    )
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
 * Calculates overall gap score based on enhanced findings.
 *
 * Uses severity tiers from enhanced gaps and hypothesis coverage
 * to compute a composite score. Higher scores = more severe gaps.
 */
function calculateGapScore(
  gaps: EnhancedGapItem[],
  hypotheses: Array<{ status: string; category: string }>
): number {
  let score = 0

  // Score based on severity tiers
  for (const gap of gaps) {
    if (gap.severity === 'critical')
      score += GAP_SCORE_WEIGHTS.MISSING_CRITICAL
    else if (gap.severity === 'important')
      score += GAP_SCORE_WEIGHTS.MISSING_IMPORTANT
    else score += GAP_SCORE_WEIGHTS.MISSING_INFORMATIONAL
  }

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
