/**
 * @fileoverview NDA Analysis Pipeline Function
 *
 * Orchestrates the full NDA analysis pipeline via Inngest:
 * Parser Agent → Classifier Agent → Risk Scorer Agent → Gap Analyst Agent
 *
 * Supports both web uploads (blob storage) and Word Add-in (inline content).
 *
 * @module inngest/functions/analyze-nda
 */

import { inngest, CONCURRENCY, RETRY_CONFIG, withTenantContext, getRateLimitDelay } from '@/inngest'
import { runParserAgent } from '@/agents/parser'
import { runClassifierAgent } from '@/agents/classifier'
import { runRiskScorerAgent } from '@/agents/risk-scorer'
import { runGapAnalystAgent } from '@/agents/gap-analyst'
import { BudgetTracker } from '@/lib/ai/budget'
import { analyses } from '@/db/schema/analyses'
import { eq } from 'drizzle-orm'
import type { AnalysisProgressPayload } from '../types'

type ProgressStage = AnalysisProgressPayload['stage']

/**
 * Main NDA analysis pipeline function.
 *
 * Triggered by 'nda/analysis.requested' events. Runs all four agents
 * in sequence with durable step execution and progress tracking.
 */
export const analyzeNda = inngest.createFunction(
  {
    id: 'analyze-nda',
    name: 'NDA Analysis Pipeline',
    concurrency: CONCURRENCY.analysis,
    retries: RETRY_CONFIG.default.retries,
  },
  { event: 'nda/analysis.requested' },
  async ({ event, step }) => {
    const { documentId, tenantId, source } = event.data
    const content = 'content' in event.data ? event.data.content : undefined
    const metadata = 'metadata' in event.data ? event.data.metadata : undefined

    const budgetTracker = new BudgetTracker()
    const startTime = Date.now()

    // Wrap all tenant-scoped operations in withTenantContext
    return await withTenantContext(tenantId, async (ctx) => {
      // Step 1: Create analysis record
      const analysisId = await step.run('create-analysis', async () => {
        const [analysis] = await ctx.db
          .insert(analyses)
          .values({
            documentId,
            tenantId,
            status: 'processing',
          })
          .returning({ id: analyses.id })
        return analysis.id
      })

      // Helper to emit progress events
      const emitProgress = async (
        stage: ProgressStage,
        progress: number,
        message: string
      ) => {
        await step.sendEvent('emit-progress', {
          name: 'nda/analysis.progress',
          data: {
            documentId,
            analysisId,
            tenantId,
            stage,
            progress,
            message,
          },
        })
      }

      // Step 2: Parser Agent
      const parserResult = await step.run('parser-agent', () =>
        runParserAgent({ documentId, tenantId, source, content, metadata })
      )
      await emitProgress(
        'parsing',
        20,
        `Parsed ${parserResult.document.chunks.length} chunks`
      )

      // Rate limit delay after Claude API call
      await step.sleep('rate-limit-parser', getRateLimitDelay('claude'))

      // Step 3: Classifier Agent
      const classifierResult = await step.run('classifier-agent', () =>
        runClassifierAgent({
          parsedDocument: parserResult.document,
          budgetTracker,
        })
      )
      await emitProgress(
        'classifying',
        45,
        `Classified ${classifierResult.clauses.length} clauses`
      )

      // Rate limit delay after Claude API calls
      await step.sleep('rate-limit-classifier', getRateLimitDelay('claude'))

      // Step 4: Risk Scorer Agent
      const riskResult = await step.run('risk-scorer-agent', () =>
        runRiskScorerAgent({
          clauses: classifierResult.clauses,
          budgetTracker,
        })
      )
      await emitProgress(
        'scoring',
        70,
        `Scored ${riskResult.assessments.length} clauses`
      )

      // Rate limit delay after Claude API calls
      await step.sleep('rate-limit-risk', getRateLimitDelay('claude'))

      // Step 5: Gap Analyst Agent
      const documentSummary = `${parserResult.document.title}: ${classifierResult.clauses.length} clauses identified.`
      const gapResult = await step.run('gap-analyst-agent', () =>
        runGapAnalystAgent({
          clauses: classifierResult.clauses,
          assessments: riskResult.assessments,
          documentSummary,
          budgetTracker,
        })
      )
      await emitProgress('analyzing_gaps', 90, 'Gap analysis complete')

      // Step 6: Persist final results
      await step.run('persist-final', async () => {
        await ctx.db
          .update(analyses)
          .set({
            status: 'completed',
            overallRiskScore: riskResult.overallRiskScore,
            overallRiskLevel: riskResult.overallRiskLevel,
            gapAnalysis: gapResult.gapAnalysis,
            tokenUsage: budgetTracker.getUsage(),
            processingTimeMs: Date.now() - startTime,
            completedAt: new Date(),
          })
          .where(eq(analyses.id, analysisId))
      })

      await emitProgress('complete', 100, 'Analysis complete')

      // Step 7: Emit completion event
      await step.sendEvent('analysis-completed', {
        name: 'nda/analysis.completed',
        data: {
          documentId,
          analysisId,
          tenantId,
          overallRiskScore: riskResult.overallRiskScore,
          overallRiskLevel: riskResult.overallRiskLevel,
        },
      })

      return { analysisId, success: true }
    })
  }
)
