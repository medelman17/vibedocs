/**
 * @fileoverview Re-Score Analysis Inngest Function
 *
 * Triggered when a user changes the assessment perspective (receiving/disclosing/balanced).
 * Loads existing classifications, runs the risk scorer agent with the new perspective,
 * and persists updated risk assessments via upsert.
 *
 * @module inngest/functions/rescore-analysis
 * @see {@link ../../agents/risk-scorer.ts} for the risk scoring agent
 * @see {@link ../../db/queries/risk-scoring.ts} for persistence functions
 */

import {
  inngest,
  CONCURRENCY,
  RETRY_CONFIG,
  withTenantContext,
  getRateLimitDelay,
} from '@/inngest'
import { runRiskScorerAgent } from '@/agents/risk-scorer'
import {
  persistRiskAssessments,
  calculateWeightedRisk,
} from '@/db/queries/risk-scoring'
import { BudgetTracker } from '@/lib/ai/budget'
import { analyses, chunkClassifications } from '@/db/schema/analyses'
import { documentChunks } from '@/db/schema/documents'
import { eq, and, sql } from 'drizzle-orm'
import type { Perspective } from '@/agents/types'
import type { ClassifiedClause } from '@/agents/classifier'

/**
 * Inngest function for re-scoring an analysis with a different perspective.
 *
 * Steps:
 * 1. Load existing primary classifications from chunkClassifications
 * 2. Mark analysis as re-scoring (progressStage = 'scoring')
 * 3. Run risk scorer agent with the new perspective
 * 4. Persist updated risk assessments via ON CONFLICT DO UPDATE
 * 5. Update analysis with new scores, summary, and metadata
 */
export const rescoreAnalysis = inngest.createFunction(
  {
    id: 'rescore-analysis',
    name: 'Re-Score Analysis (Perspective Change)',
    concurrency: CONCURRENCY.analysis,
    retries: RETRY_CONFIG.default.retries,
  },
  { event: 'nda/analysis.rescore' },
  async ({ event, step }) => {
    const { analysisId, tenantId, perspective } = event.data as {
      analysisId: string
      tenantId: string
      perspective: Perspective
    }

    const budgetTracker = new BudgetTracker()

    return await withTenantContext(tenantId, async (ctx) => {
      // Step 1: Load existing classifications and reconstruct ClassifiedClause[]
      const clauses = await step.run('load-classifications', async () => {
        const analysis = await ctx.db.query.analyses.findFirst({
          where: and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId)),
          columns: { documentId: true },
        })
        if (!analysis) throw new Error(`Analysis ${analysisId} not found`)

        const classifications = await ctx.db
          .select({
            chunkId: chunkClassifications.chunkId,
            category: chunkClassifications.category,
            confidence: chunkClassifications.confidence,
            chunkIndex: chunkClassifications.chunkIndex,
            startPosition: chunkClassifications.startPosition,
            endPosition: chunkClassifications.endPosition,
            content: documentChunks.content,
          })
          .from(chunkClassifications)
          .innerJoin(documentChunks, eq(chunkClassifications.chunkId, documentChunks.id))
          .where(
            and(
              eq(chunkClassifications.analysisId, analysisId),
              eq(chunkClassifications.tenantId, tenantId),
              eq(chunkClassifications.isPrimary, true)
            )
          )
          .orderBy(chunkClassifications.chunkIndex)

        return classifications.map((c) => ({
          chunkId: c.chunkId,
          chunkIndex: c.chunkIndex,
          category: c.category,
          secondaryCategories: [] as string[],
          confidence: c.confidence,
          clauseText: c.content,
          reasoning: '',
          startPosition: c.startPosition ?? 0,
          endPosition: c.endPosition ?? 0,
        })) as ClassifiedClause[]
      })

      // Step 2: Mark analysis as re-scoring
      await step.run('mark-rescoring', async () => {
        await ctx.db
          .update(analyses)
          .set({
            progressStage: 'scoring',
            progressPercent: 30,
            updatedAt: new Date(),
          })
          .where(eq(analyses.id, analysisId))
      })

      // Step 3: Run risk scorer agent with new perspective
      await step.sleep('rate-limit-rescore', getRateLimitDelay('claude'))

      const riskResult = await step.run('risk-scorer-agent', () =>
        runRiskScorerAgent({ clauses, budgetTracker, perspective })
      )

      // Step 4: Get documentId for persistence
      const analysis = await step.run('get-analysis', async () => {
        return await ctx.db.query.analyses.findFirst({
          where: eq(analyses.id, analysisId),
          columns: { documentId: true },
        })
      })

      // Step 5: Persist updated risk assessments (ON CONFLICT DO UPDATE)
      await step.run('persist-risk-assessments', async () => {
        await persistRiskAssessments(
          ctx.db,
          tenantId,
          analysisId,
          analysis!.documentId,
          riskResult.assessments,
          perspective
        )
      })

      // Step 6: Update analysis with new scores and metadata
      await step.run('update-analysis-scores', async () => {
        const weightedRisk = await calculateWeightedRisk(ctx.db, riskResult.assessments)
        await ctx.db
          .update(analyses)
          .set({
            overallRiskScore: weightedRisk.score,
            overallRiskLevel: weightedRisk.level,
            summary: riskResult.executiveSummary,
            progressStage: 'complete',
            progressPercent: 100,
            updatedAt: new Date(),
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              perspective,
              riskDistribution: riskResult.riskDistribution,
            })}::jsonb`,
          })
          .where(eq(analyses.id, analysisId))
      })

      return { analysisId, perspective, success: true }
    })
  }
)
