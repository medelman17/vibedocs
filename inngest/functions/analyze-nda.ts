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

import { createHash } from 'crypto'
import { inngest, CONCURRENCY, RETRY_CONFIG, withTenantContext, getRateLimitDelay } from '@/inngest'
import { NonRetriableError } from '@/inngest/utils/errors'
import { runParserAgent } from '@/agents/parser'
import { runClassifierAgent } from '@/agents/classifier'
import { runRiskScorerAgent } from '@/agents/risk-scorer'
import { runGapAnalystAgent } from '@/agents/gap-analyst'
import {
  validateParserOutput,
  validateClassifierOutput,
  validateTokenBudget,
} from '@/agents/validation'
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
      // Step 1: Create or update analysis record (idempotent)
      // Deterministic ID: derived from documentId + requestedAt so retries always use same analysisId
      // This works because the same event always produces the same analysis ID
      const requestedAt = event.data.requestedAt ?? Date.now()
      const analysisId = createHash('sha256')
        .update(`analysis:${documentId}:${requestedAt}`)
        .digest('hex')
        .slice(0, 32)
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')

      await step.run('create-analysis', async () => {
        await ctx.db
          .insert(analyses)
          .values({
            id: analysisId,
            documentId,
            tenantId,
            status: 'processing',
            progressStage: 'parsing',
            progressPercent: 0,
          })
          .onConflictDoNothing() // Safe: if ID exists, analysis already started
      })

      // Helper to emit progress events AND persist to DB
      const emitProgress = async (
        stage: ProgressStage,
        progress: number,
        message: string
      ) => {
        // Clamp progress to valid range
        const clampedProgress = Math.max(0, Math.min(100, progress))

        // Persist progress to DB in a durable step
        await step.run(`update-progress-${stage}`, async () => {
          await ctx.db
            .update(analyses)
            .set({
              progressStage: stage,
              progressPercent: clampedProgress,
              updatedAt: new Date(),
            })
            .where(eq(analyses.id, analysisId))
        })

        // Also emit event for real-time consumers (future SSE)
        await step.sendEvent(`emit-progress-${stage}`, {
          name: 'nda/analysis.progress',
          data: {
            documentId,
            analysisId,
            tenantId,
            stage,
            progress: clampedProgress,
            message,
          },
        })
      }

      // Step 2: Parser Agent
      const parserResult = await step.run('parser-agent', () =>
        runParserAgent({ documentId, tenantId, source, content, metadata })
      )

      // Parser validation gate - runs AFTER step completes, OUTSIDE step.run()
      // Validation is fast and deterministic, so no durability needed
      const parserValidation = validateParserOutput(
        parserResult.document.rawText,
        parserResult.document.chunks
      )
      if (!parserValidation.valid) {
        // Persist failure state (durable step for DB write)
        await step.run('mark-parser-failed', async () => {
          await ctx.db
            .update(analyses)
            .set({
              status: 'failed',
              progressStage: 'failed',
              metadata: {
                failedAt: 'parsing',
                errorCode: parserValidation.error!.code,
                errorMessage: parserValidation.error!.userMessage,
              },
            })
            .where(eq(analyses.id, analysisId))
        })
        // Throw non-retriable error with user-friendly message
        throw new NonRetriableError(parserValidation.error!.userMessage)
      }

      // Token budget validation gate - runs AFTER parser validation
      // This gate always passes but may truncate the document
      const budgetValidation = validateTokenBudget(
        parserResult.document.rawText,
        parserResult.document.chunks.map(c => ({
          id: c.id,
          index: c.index,
          content: c.content,
          tokenCount: c.tokenCount ?? 0,
          sectionPath: c.sectionPath,
          startPosition: c.startPosition,
          endPosition: c.endPosition,
        }))
      )

      // Track working document - may be truncated
      let workingDocument = parserResult.document
      let wasTruncated = false

      if (budgetValidation.truncation) {
        // Document was truncated to fit budget
        workingDocument = {
          ...parserResult.document,
          rawText: budgetValidation.truncation.text,
          chunks: budgetValidation.truncation.chunks.map((c, i) => ({
            ...parserResult.document.chunks.find(orig => orig.id === c.id) ?? parserResult.document.chunks[i],
            content: c.content,
          })),
        }
        wasTruncated = true

        console.log('[Budget] Document truncated', {
          analysisId,
          originalTokens: budgetValidation.estimate.tokenCount,
          truncatedTokens: budgetValidation.truncation.truncatedTokens,
          removedSections: budgetValidation.truncation.removedSections,
        })
      }

      // Store estimate and truncation status in a durable step
      await step.run('record-budget-estimate', async () => {
        await ctx.db
          .update(analyses)
          .set({
            estimatedTokens: budgetValidation.estimate.tokenCount,
            wasTruncated,
            ...(wasTruncated && {
              metadata: {
                truncationWarning: budgetValidation.warning?.message,
                removedSections: budgetValidation.truncation?.removedSections,
              },
            }),
          })
          .where(eq(analyses.id, analysisId))
      })

      await emitProgress(
        'parsing',
        20,
        wasTruncated
          ? `Parsed and truncated to ${workingDocument.chunks.length} chunks`
          : `Parsed ${parserResult.document.chunks.length} chunks`
      )

      // Rate limit delay after Claude API call
      await step.sleep('rate-limit-parser', getRateLimitDelay('claude'))

      // Step 3: Classifier Agent
      const classifierResult = await step.run('classifier-agent', () =>
        runClassifierAgent({
          parsedDocument: workingDocument,  // Use truncated version if applicable
          budgetTracker,
        })
      )

      // Classifier validation gate - 0 clauses = always halt (per CONTEXT.md)
      const classifierValidation = validateClassifierOutput(classifierResult.clauses)
      if (!classifierValidation.valid) {
        await step.run('mark-classifier-failed', async () => {
          await ctx.db
            .update(analyses)
            .set({
              status: 'failed',
              progressStage: 'failed',
              metadata: {
                failedAt: 'classifying',
                errorCode: classifierValidation.error!.code,
                errorMessage: classifierValidation.error!.userMessage,
              },
            })
            .where(eq(analyses.id, analysisId))
        })
        throw new NonRetriableError(classifierValidation.error!.userMessage)
      }

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
        const usage = budgetTracker.getUsage()

        await ctx.db
          .update(analyses)
          .set({
            status: 'completed',
            overallRiskScore: riskResult.overallRiskScore,
            overallRiskLevel: riskResult.overallRiskLevel,
            gapAnalysis: gapResult.gapAnalysis,
            tokenUsage: usage,
            // Budget tracking fields
            actualTokens: usage.total.total,
            estimatedCost: usage.total.estimatedCost,
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
