/**
 * @fileoverview NDA Analysis Pipeline Orchestrator
 *
 * Thin orchestrator that invokes 5 sub-functions via step.invoke():
 * Parse → Chunk+Embed → Classify → Score Risks → Analyze Gaps
 *
 * Each sub-function gets its own 1000-step budget, retry config,
 * and cancellation support. Data flows through the database.
 *
 * @module inngest/functions/analyze-nda
 */

import { inngest, CONCURRENCY, RETRY_CONFIG, withTenantContext } from '@/inngest'
import { analyses } from '@/db/schema/analyses'
import { eq, sql } from 'drizzle-orm'
import { analysisChannel } from '@/inngest/channels'
import { ndaParse } from './nda-parse'
import { ndaChunkEmbed } from './nda-chunk-embed'
import { ndaClassify } from './nda-classify'
import { ndaScoreRisks } from './nda-score-risks'
import { ndaAnalyzeGaps } from './nda-analyze-gaps'
import type { AggregatedUsage } from '@/lib/ai/budget'

/** Simple token usage shape returned by risk scorer (RiskScorerOutput.tokenUsage) */
type SimpleTokenUsage = { inputTokens: number; outputTokens: number }

const AGENT_KEYS_BY_INDEX = ['classifier', 'riskScorer', 'gapAnalyst'] as const

function toAggregatedUsage(usage: AggregatedUsage | SimpleTokenUsage, agentKey: string): AggregatedUsage {
  if ('byAgent' in usage && 'total' in usage) return usage as AggregatedUsage
  const input = (usage as SimpleTokenUsage).inputTokens
  const output = (usage as SimpleTokenUsage).outputTokens
  const total = input + output
  const estimatedCost = (input / 1_000_000) * 3 + (output / 1_000_000) * 15
  return {
    byAgent: { [agentKey]: { input, output, total, estimatedCost } },
    total: { input, output, total, estimatedCost },
  }
}

function aggregateTokenUsage(
  ...usages: (AggregatedUsage | SimpleTokenUsage | undefined)[]
): AggregatedUsage {
  const combined: AggregatedUsage = {
    byAgent: {},
    total: { input: 0, output: 0, total: 0, estimatedCost: 0 },
  }
  usages.forEach((usage, i) => {
    if (!usage) return
    const agentKey = AGENT_KEYS_BY_INDEX[i] ?? 'unknown'
    const normalized = toAggregatedUsage(usage, agentKey)
    for (const [agent, tokens] of Object.entries(normalized.byAgent)) {
      const existing = combined.byAgent[agent] ?? { input: 0, output: 0, total: 0, estimatedCost: 0 }
      existing.input += tokens.input
      existing.output += tokens.output
      existing.total += tokens.total
      existing.estimatedCost += tokens.estimatedCost
      combined.byAgent[agent] = existing
    }
    combined.total.input += normalized.total.input
    combined.total.output += normalized.total.output
    combined.total.total += normalized.total.total
    combined.total.estimatedCost += normalized.total.estimatedCost
  })
  return combined
}

/**
 * Main NDA analysis pipeline orchestrator.
 *
 * Invokes 5 sub-functions in sequence, each with its own step budget.
 * Data flows through the database (not invoke payloads) to stay under 512KB.
 */
export const analyzeNda = inngest.createFunction(
  {
    id: 'analyze-nda',
    name: 'NDA Analysis Pipeline',
    concurrency: CONCURRENCY.analysis,
    retries: RETRY_CONFIG.default.retries,
    cancelOn: [{
      event: 'nda/analysis.cancelled',
      if: 'async.data.analysisId == event.data.analysisId',
    }],
  },
  { event: 'nda/analysis.requested' },
  async ({ event, step, publish }) => {
    const { documentId, tenantId, analysisId, source } = event.data
    const content = 'content' in event.data ? event.data.content : undefined
    const metadata = 'metadata' in event.data ? event.data.metadata : undefined
    const startTime = Date.now()

    return await withTenantContext(tenantId, async (ctx) => {
      // Initialize analysis record
      await step.run('init-analysis', async () => {
        await ctx.db
          .update(analyses)
          .set({
            status: 'processing',
            progressStage: 'parsing',
            progressPercent: 0,
            updatedAt: new Date(),
          })
          .where(eq(analyses.id, analysisId))
      })

      // 1. Parse document
      const parseResult = await step.invoke('invoke-parse', {
        function: ndaParse,
        data: { documentId, tenantId, analysisId, source, content, metadata },
      })

      // 2. Chunk + Embed
      await step.invoke('invoke-chunk-embed', {
        function: ndaChunkEmbed,
        data: {
          documentId,
          tenantId,
          analysisId,
          title: parseResult.title,
        },
      })

      // 3. Classify
      const classifyResult = await step.invoke('invoke-classify', {
        function: ndaClassify,
        data: { documentId, tenantId, analysisId, title: parseResult.title },
      })

      // 4. Score Risks
      const scoreResult = await step.invoke('invoke-score-risks', {
        function: ndaScoreRisks,
        data: { documentId, tenantId, analysisId },
      })

      // 5. Gap Analysis
      const gapSummary = `${parseResult.title}: ${classifyResult.clauseCount} clauses classified.`
      const gapResult = await step.invoke('invoke-analyze-gaps', {
        function: ndaAnalyzeGaps,
        data: { documentId, tenantId, analysisId, documentSummary: gapSummary },
      })

      // Persist final results
      await step.run('persist-final', async () => {
        const usage = aggregateTokenUsage(
          classifyResult.tokenUsage,
          scoreResult.tokenUsage,
          gapResult.tokenUsage,
        )

        await ctx.db
          .update(analyses)
          .set({
            status: 'completed',
            progressStage: 'complete',
            progressPercent: 100,
            progressMessage: 'Analysis complete',
            overallRiskScore: scoreResult.weightedRiskScore,
            overallRiskLevel: scoreResult.weightedRiskLevel,
            summary: scoreResult.executiveSummary,
            gapAnalysis: gapResult.gapAnalysis,
            tokenUsage: usage,
            actualTokens: usage.total.total,
            estimatedCost: usage.total.estimatedCost,
            processingTimeMs: Date.now() - startTime,
            completedAt: new Date(),
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              perspective: scoreResult.perspective,
              riskDistribution: scoreResult.riskDistribution,
            })}::jsonb`,
          })
          .where(eq(analyses.id, analysisId))
      })

      // Publish realtime completion
      await publish(
        analysisChannel(analysisId).progress({
          stage: 'complete',
          percent: 100,
          message: 'Analysis complete',
        })
      )

      // Emit completion event
      await step.sendEvent('analysis-completed', {
        name: 'nda/analysis.completed',
        data: {
          documentId,
          analysisId,
          tenantId,
          overallRiskScore: scoreResult.overallRiskScore,
          overallRiskLevel: scoreResult.overallRiskLevel,
        },
      })

      return { analysisId, success: true }
    })
  }
)

/**
 * Post-OCR analysis pipeline.
 *
 * Continues analysis after OCR extraction by invoking the same sub-functions
 * with source='ocr' and OCR-specific data.
 */
export const analyzeNdaAfterOcr = inngest.createFunction(
  {
    id: 'analyze-nda-after-ocr',
    name: 'NDA Analysis Pipeline (Post-OCR)',
    concurrency: CONCURRENCY.analysis,
    retries: RETRY_CONFIG.default.retries,
    cancelOn: [{
      event: 'nda/analysis.cancelled',
      if: 'async.data.analysisId == event.data.analysisId',
    }],
  },
  { event: 'nda/analysis.ocr-complete' },
  async ({ event, step, publish }) => {
    const { documentId, analysisId, tenantId, ocrText, quality } = event.data
    const startTime = Date.now()

    return await withTenantContext(tenantId, async (ctx) => {
      // 1. Parse OCR text
      const parseResult = await step.invoke('invoke-parse', {
        function: ndaParse,
        data: {
          documentId,
          tenantId,
          analysisId,
          source: 'ocr' as const,
          ocrText,
          ocrConfidence: quality.confidence,
        },
      })

      // 2. Chunk + Embed
      await step.invoke('invoke-chunk-embed', {
        function: ndaChunkEmbed,
        data: {
          documentId,
          tenantId,
          analysisId,
          title: parseResult.title,
          isOcr: true,
        },
      })

      // 3. Classify
      const classifyResult = await step.invoke('invoke-classify', {
        function: ndaClassify,
        data: { documentId, tenantId, analysisId, title: parseResult.title },
      })

      // 4. Score Risks
      const scoreResult = await step.invoke('invoke-score-risks', {
        function: ndaScoreRisks,
        data: { documentId, tenantId, analysisId },
      })

      // 5. Gap Analysis
      const gapSummary = `${parseResult.title}: ${classifyResult.clauseCount} clauses classified (via OCR).`
      const gapResult = await step.invoke('invoke-analyze-gaps', {
        function: ndaAnalyzeGaps,
        data: { documentId, tenantId, analysisId, documentSummary: gapSummary },
      })

      // Persist final results
      await step.run('persist-final', async () => {
        const usage = aggregateTokenUsage(
          classifyResult.tokenUsage,
          scoreResult.tokenUsage,
          gapResult.tokenUsage,
        )

        await ctx.db
          .update(analyses)
          .set({
            status: 'completed',
            progressStage: 'complete',
            progressPercent: 100,
            progressMessage: 'Analysis complete',
            overallRiskScore: scoreResult.weightedRiskScore,
            overallRiskLevel: scoreResult.weightedRiskLevel,
            summary: scoreResult.executiveSummary,
            gapAnalysis: gapResult.gapAnalysis,
            tokenUsage: usage,
            actualTokens: usage.total.total,
            estimatedCost: usage.total.estimatedCost,
            processingTimeMs: Date.now() - startTime,
            completedAt: new Date(),
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              perspective: scoreResult.perspective,
              riskDistribution: scoreResult.riskDistribution,
            })}::jsonb`,
          })
          .where(eq(analyses.id, analysisId))
      })

      await publish(
        analysisChannel(analysisId).progress({
          stage: 'complete',
          percent: 100,
          message: 'Analysis complete',
        })
      )

      await step.sendEvent('analysis-completed', {
        name: 'nda/analysis.completed',
        data: {
          documentId,
          analysisId,
          tenantId,
          overallRiskScore: scoreResult.overallRiskScore,
          overallRiskLevel: scoreResult.overallRiskLevel,
        },
      })

      return { analysisId, success: true, wasOcr: true }
    })
  }
)
