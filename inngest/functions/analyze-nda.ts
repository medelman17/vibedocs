/**
 * @fileoverview NDA Analysis Pipeline Function
 *
 * Orchestrates the full NDA analysis pipeline via Inngest:
 * Parser Agent → Chunk → Embed → Persist → Classifier Agent → Risk Scorer Agent → Gap Analyst Agent
 *
 * Supports three paths:
 * - Web uploads: Downloads from blob storage, extracts text
 * - Word Add-in: Uses inline content from Word
 * - Post-OCR: Continues pipeline after OCR extraction
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
  mapExtractionError,
} from '@/agents/validation'
import {
  EncryptedDocumentError,
  CorruptDocumentError,
  OcrRequiredError,
} from '@/lib/errors'
import { BudgetTracker } from '@/lib/ai/budget'
import { analyses, chunkClassifications } from '@/db/schema/analyses'
import { documentChunks } from '@/db/schema/documents'
import { chunkLegalDocument } from '@/lib/document-chunking/legal-chunker'
import { generateChunkMap, computeChunkStats } from '@/lib/document-chunking/chunk-map'
import { getVoyageAIClient, VOYAGE_CONFIG } from '@/lib/embeddings'
import type { LegalChunk } from '@/lib/document-chunking/types'
import type { EmbeddedChunk } from '@/lib/document-chunking/types'
import type { ParserOutput } from '@/agents/parser'
import type { ParsedChunk } from '@/agents/classifier'
import { eq, and, sql } from 'drizzle-orm'
import {
  persistRiskAssessments,
  calculateWeightedRisk,
} from '@/db/queries/risk-scoring'
import type { AnalysisProgressPayload } from '../types'

type ProgressStage = AnalysisProgressPayload['stage']

// ============================================================================
// Shared Chunking Pipeline
// ============================================================================

/**
 * DB insert batch size for chunk persistence.
 * Keeps individual INSERT statements reasonably sized.
 */
const DB_INSERT_BATCH_SIZE = 100

/**
 * Runs the legal chunking, embedding, and persistence pipeline.
 *
 * This is extracted as a shared helper so both the main pipeline and the
 * post-OCR pipeline use identical chunking logic.
 *
 * Steps:
 * 1. Initialize tokenizer
 * 2. Chunk document using legal-aware chunker
 * 3. Generate chunk map and stats, persist to analysis
 * 4. Embed non-boilerplate chunks in batches of 128
 * 5. Delete old chunks for this document+analysis, then bulk insert new ones
 *
 * @returns Object with embedded chunks and compatibility shim for downstream agents
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InngestStep = any

async function runChunkingPipeline(params: {
  step: InngestStep
  ctx: { db: typeof import('@/db/client').db }
  parserResult: ParserOutput
  analysisId: string
  documentId: string
  tenantId: string
  emitProgress: (stage: ProgressStage, progress: number, message: string) => Promise<void>
  isOcr?: boolean
}): Promise<{
  embeddedChunks: EmbeddedChunk[]
  classifierDocument: { documentId: string; title: string; rawText: string; chunks: ParsedChunk[] }
  wasTruncated: boolean
}> {
  const { step, ctx, parserResult, analysisId, documentId, tenantId, emitProgress, isOcr } = params

  // Step: Initialize tokenizer for accurate Voyage AI token counting
  await step.run('init-tokenizer', async () => {
    const { initVoyageTokenizer } = await import('@/lib/document-chunking/token-counter')
    await initVoyageTokenizer()
  })

  // Step: Token budget estimation (pre-chunking, rawText only)
  const budgetValidation = validateTokenBudget(
    parserResult.document.rawText,
    [] // No chunks yet - estimation only
  )

  let workingRawText = parserResult.document.rawText
  let wasTruncated = false

  if (budgetValidation.truncation && budgetValidation.truncation.truncated) {
    // Simple raw text truncation by character estimate
    // The budget validation with empty chunks returns truncated text
    workingRawText = budgetValidation.truncation.text
    wasTruncated = true

    console.log('[Budget] Document truncated before chunking', {
      analysisId,
      originalTokens: budgetValidation.estimate.tokenCount,
      truncatedTokens: budgetValidation.truncation.truncatedTokens,
    })
  }

  // Persist budget estimate
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
    15,
    wasTruncated
      ? 'Parsed and truncated document'
      : 'Parsed document'
  )

  // Step: Chunk document using legal-aware chunker
  const chunks = await step.run('chunk-document', async () => {
    return await chunkLegalDocument(
      workingRawText,
      parserResult.document.structure,
      { maxTokens: 512, targetTokens: 400, overlapTokens: 50, minChunkTokens: 50 }
    )
  }) as LegalChunk[]

  // Step: Generate and persist chunk map + stats
  await step.run('persist-chunk-metadata', async () => {
    const chunkMap = generateChunkMap(chunks, documentId)
    const chunkStats = computeChunkStats(chunks)

    await ctx.db
      .update(analyses)
      .set({
        chunkMap,
        chunkStats,
      })
      .where(eq(analyses.id, analysisId))
  })

  await emitProgress('chunking', 25, `Chunked into ${chunks.length} legal segments`)

  // Step: Embed non-boilerplate chunks in batches of 128
  // Boilerplate chunks (signature blocks, notices) get null embedding
  const embeddableChunks = chunks.filter(c => c.chunkType !== 'boilerplate')
  const boilerplateChunks = chunks.filter(c => c.chunkType === 'boilerplate')

  const totalBatches = Math.ceil(embeddableChunks.length / VOYAGE_CONFIG.batchLimit)
  const allEmbeddings: (number[] | null)[] = new Array(chunks.length).fill(null)

  // Create a map from chunk index to position in embeddableChunks
  const embeddableIndexMap = new Map<number, number>()
  embeddableChunks.forEach((c, i) => embeddableIndexMap.set(c.index, i))

  for (let batch = 0; batch < totalBatches; batch++) {
    const batchStart = batch * VOYAGE_CONFIG.batchLimit
    const batchEnd = Math.min(batchStart + VOYAGE_CONFIG.batchLimit, embeddableChunks.length)
    const batchChunks = embeddableChunks.slice(batchStart, batchEnd)

    const batchEmbeddings = await step.run(`embed-batch-${batch}`, async () => {
      const voyageClient = getVoyageAIClient()
      const texts = batchChunks.map(c => c.content)
      const result = await voyageClient.embedBatch(texts, 'document')
      return result.embeddings
    }) as number[][]

    // Map embeddings back to original chunk indices
    for (let i = 0; i < batchChunks.length; i++) {
      allEmbeddings[batchChunks[i].index] = batchEmbeddings[i]
    }

    // Rate limit between batches (Voyage AI: 300 RPM)
    if (batch < totalBatches - 1) {
      await step.sleep(`rate-limit-embed-${batch}`, getRateLimitDelay('voyageAi'))
    }
  }

  // Build embedded chunks array
  const embeddedChunks: EmbeddedChunk[] = chunks.map(chunk => ({
    ...chunk,
    embedding: allEmbeddings[chunk.index],
  }))

  await emitProgress(
    'chunking',
    35,
    `Embedded ${embeddableChunks.length} chunks (${boilerplateChunks.length} boilerplate skipped)`
  )

  // Step: Persist chunks to database (delete old, then bulk insert)
  await step.run('persist-chunks', async () => {
    // Delete old chunks for this document+analysis (replace strategy)
    await ctx.db
      .delete(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.analysisId, analysisId)
        )
      )

    // Bulk insert new chunks in batches
    for (let i = 0; i < embeddedChunks.length; i += DB_INSERT_BATCH_SIZE) {
      const batch = embeddedChunks.slice(i, i + DB_INSERT_BATCH_SIZE)

      await ctx.db.insert(documentChunks).values(
        batch.map(chunk => ({
          tenantId,
          documentId,
          analysisId,
          chunkIndex: chunk.index,
          content: chunk.content,
          sectionPath: chunk.sectionPath,
          embedding: chunk.embedding,
          tokenCount: chunk.tokenCount,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
          chunkType: chunk.chunkType,
          overlapTokens: chunk.metadata.overlapTokens,
          metadata: {
            references: chunk.metadata.references,
            structureSource: chunk.metadata.structureSource,
            isOcr: isOcr ?? chunk.metadata.isOcr,
            parentClauseIntro: chunk.metadata.parentClauseIntro,
          },
        }))
      )
    }
  })

  // Build compatibility shim for downstream agents (classifier expects ParsedChunk[])
  // Filter out boilerplate chunks with null embeddings since classifier needs embeddings
  const classifierChunks: ParsedChunk[] = embeddedChunks
    .filter(c => c.embedding !== null)
    .map(c => ({
      id: c.id,
      index: c.index,
      content: c.content,
      sectionPath: c.sectionPath,
      tokenCount: c.tokenCount,
      startPosition: c.startPosition,
      endPosition: c.endPosition,
      embedding: c.embedding!,
    }))

  const classifierDocument = {
    documentId,
    title: parserResult.document.title,
    rawText: workingRawText,
    chunks: classifierChunks,
  }

  return { embeddedChunks, classifierDocument, wasTruncated }
}

// ============================================================================
// Main Pipeline
// ============================================================================

/**
 * Main NDA analysis pipeline function.
 *
 * Triggered by 'nda/analysis.requested' events. Runs extraction, chunking,
 * embedding, classification, risk scoring, and gap analysis in sequence
 * with durable step execution and progress tracking.
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
      // Monotonic counter for unique progress step IDs (prevents duplicate step names)
      let progressCounter = 0

      const emitProgress = async (
        stage: ProgressStage,
        progress: number,
        message: string
      ) => {
        // Clamp progress to valid range
        const clampedProgress = Math.max(0, Math.min(100, progress))
        const stepSuffix = `${stage}-${progressCounter++}`

        // Persist progress to DB in a durable step
        await step.run(`update-progress-${stepSuffix}`, async () => {
          await ctx.db
            .update(analyses)
            .set({
              progressStage: stage,
              progressPercent: clampedProgress,
              progressMessage: message,
              updatedAt: new Date(),
            })
            .where(eq(analyses.id, analysisId))
        })

        // Also emit event for real-time consumers (future SSE)
        await step.sendEvent(`emit-progress-${stepSuffix}`, {
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

      // Step 2: Parser Agent with extraction error handling
      let parserResult: ParserOutput
      try {
        parserResult = await step.run('parser-agent', () =>
          runParserAgent({ documentId, tenantId, source, content, metadata })
        )
      } catch (error) {
        // Map extraction errors to appropriate pipeline errors
        if (
          error instanceof EncryptedDocumentError ||
          error instanceof CorruptDocumentError ||
          error instanceof OcrRequiredError
        ) {
          const mapped = mapExtractionError(error)

          // Persist failure state
          await step.run('persist-extraction-failure', async () => {
            await ctx.db
              .update(analyses)
              .set({
                status: mapped.routeToOcr ? 'pending_ocr' : 'failed',
                progressStage: 'failed',
                metadata: {
                  failedAt: 'extraction',
                  errorCode:
                    error instanceof OcrRequiredError
                      ? 'OCR_REQUIRED'
                      : error instanceof EncryptedDocumentError
                        ? 'ENCRYPTED'
                        : 'CORRUPT',
                  errorMessage: mapped.userMessage,
                },
              })
              .where(eq(analyses.id, analysisId))
          })

          // Trigger OCR processing if this is a scanned document
          if (mapped.routeToOcr) {
            await step.sendEvent('trigger-ocr', {
              name: 'nda/ocr.requested',
              data: { documentId, analysisId, tenantId },
            })
          }

          // Halt this pipeline run - OCR function will continue asynchronously
          throw new NonRetriableError(mapped.userMessage)
        }
        throw error
      }

      // Parser validation gate - runs AFTER step completes, OUTSIDE step.run()
      // Validation is fast and deterministic, so no durability needed
      const parserValidation = validateParserOutput(
        parserResult.document.rawText
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

      // Steps 3-7: Chunking, embedding, and persistence pipeline
      const { classifierDocument } = await runChunkingPipeline({
        step,
        ctx,
        parserResult,
        analysisId,
        documentId,
        tenantId,
        emitProgress,
      })

      // Rate limit delay before Claude API calls
      await step.sleep('rate-limit-parser', getRateLimitDelay('claude'))

      // Step 8: Classifier Agent
      const classifierResult = await step.run('classifier-agent', () =>
        runClassifierAgent({
          parsedDocument: classifierDocument,
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

      // Step: Persist multi-label classifications to chunkClassifications table
      await step.run('persist-classifications', async () => {
        const chunks = classifierDocument.chunks
        const values: Array<{
          tenantId: string
          analysisId: string
          chunkId: string
          documentId: string
          category: string
          confidence: number
          isPrimary: boolean
          rationale: string | null
          chunkIndex: number
          startPosition: number | undefined
          endPosition: number | undefined
        }> = []

        for (const result of classifierResult.rawClassifications) {
          // rawClassifications[i].chunkIndex is the global chunk index
          const chunk = chunks.find(c => c.index === result.chunkIndex)
          if (!chunk) continue

          // Primary classification (always included)
          values.push({
            tenantId,
            analysisId,
            chunkId: chunk.id,
            documentId,
            category: result.primary.category,
            confidence: result.primary.confidence,
            isPrimary: true,
            rationale: result.primary.rationale,
            chunkIndex: chunk.index,
            startPosition: chunk.startPosition,
            endPosition: chunk.endPosition,
          })

          // Secondary classifications (only if confidence >= 0.3)
          for (const sec of result.secondary) {
            if (sec.confidence >= 0.3) {
              values.push({
                tenantId,
                analysisId,
                chunkId: chunk.id,
                documentId,
                category: sec.category,
                confidence: sec.confidence,
                isPrimary: false,
                rationale: null,
                chunkIndex: chunk.index,
                startPosition: chunk.startPosition,
                endPosition: chunk.endPosition,
              })
            }
          }
        }

        // Batch insert with conflict handling (idempotent)
        const PERSIST_BATCH = 100
        for (let i = 0; i < values.length; i += PERSIST_BATCH) {
          const batch = values.slice(i, i + PERSIST_BATCH)
          await ctx.db
            .insert(chunkClassifications)
            .values(batch)
            .onConflictDoNothing()
        }
      })

      await emitProgress(
        'classifying',
        50,
        `Classified ${classifierResult.clauses.length} clauses (${classifierResult.rawClassifications.length} total classifications)`
      )

      // Rate limit delay after Claude API calls
      await step.sleep('rate-limit-classifier', getRateLimitDelay('claude'))

      // Step 9: Risk Scorer Agent
      const riskResult = await step.run('risk-scorer-agent', () =>
        runRiskScorerAgent({
          clauses: classifierResult.clauses,
          budgetTracker,
          perspective: 'balanced', // Default perspective per user decision
        })
      )
      await emitProgress(
        'scoring',
        70,
        `Scored ${riskResult.assessments.length} clauses`
      )

      // Step: Persist per-clause risk assessments to clauseExtractions
      await step.run('persist-risk-assessments', async () => {
        await persistRiskAssessments(
          ctx.db,
          tenantId,
          analysisId,
          documentId,
          riskResult.assessments,
          riskResult.perspective,
        )
      })

      // Rate limit delay after Claude API calls
      await step.sleep('rate-limit-risk', getRateLimitDelay('claude'))

      // Step 10: Gap Analyst Agent
      const uniqueCategories = [...new Set(classifierResult.clauses.map(c => c.category))]
      const documentSummary = `${parserResult.document.title}: ${classifierResult.clauses.length} clauses classified across ${uniqueCategories.length} categories.`
      const gapResult = await step.run('gap-analyst-agent', () =>
        runGapAnalystAgent({
          clauses: classifierResult.clauses,
          assessments: riskResult.assessments,
          documentSummary,
          budgetTracker,
        })
      )
      await emitProgress('analyzing_gaps', 90, 'Gap analysis complete')

      // Step 11: Persist final results
      await step.run('persist-final', async () => {
        const usage = budgetTracker.getUsage()

        // Calculate weighted risk score using category importance from cuadCategories
        const weightedRisk = await calculateWeightedRisk(ctx.db, riskResult.assessments)

        await ctx.db
          .update(analyses)
          .set({
            status: 'completed',
            overallRiskScore: weightedRisk.score,
            overallRiskLevel: weightedRisk.level,
            summary: riskResult.executiveSummary,
            gapAnalysis: gapResult.gapAnalysis,
            tokenUsage: usage,
            // Budget tracking fields
            actualTokens: usage.total.total,
            estimatedCost: usage.total.estimatedCost,
            processingTimeMs: Date.now() - startTime,
            completedAt: new Date(),
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              perspective: riskResult.perspective,
              riskDistribution: riskResult.riskDistribution,
            })}::jsonb`,
          })
          .where(eq(analyses.id, analysisId))
      })

      await emitProgress('complete', 100, 'Analysis complete')

      // Step 12: Emit completion event
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

// ============================================================================
// Post-OCR Pipeline
// ============================================================================

/**
 * Continue analysis pipeline after OCR processing completes.
 *
 * This function handles documents that went through OCR and continues
 * from the parser stage using the OCR-extracted text.
 *
 * Triggered by 'nda/analysis.ocr-complete' events from the OCR document function.
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
  async ({ event, step }) => {
    const { documentId, analysisId, tenantId, ocrText, quality } = event.data

    const budgetTracker = new BudgetTracker()
    const startTime = Date.now()

    return await withTenantContext(tenantId, async (ctx) => {
      // Helper to emit progress events AND persist to DB
      // Monotonic counter for unique progress step IDs (prevents duplicate step names)
      let progressCounter = 0

      const emitProgress = async (
        stage: ProgressStage,
        progress: number,
        message: string
      ) => {
        const clampedProgress = Math.max(0, Math.min(100, progress))
        const stepSuffix = `${stage}-${progressCounter++}`

        await step.run(`update-progress-${stepSuffix}`, async () => {
          await ctx.db
            .update(analyses)
            .set({
              progressStage: stage,
              progressPercent: clampedProgress,
              progressMessage: message,
              updatedAt: new Date(),
            })
            .where(eq(analyses.id, analysisId))
        })

        await step.sendEvent(`emit-progress-${stepSuffix}`, {
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

      // Step 1: Run parser on OCR text
      // Use 'ocr' source type to skip extraction and use provided text
      const parserResult = await step.run('parser-agent-ocr', () =>
        runParserAgent({
          documentId,
          tenantId,
          source: 'ocr',
          ocrText,
          ocrConfidence: quality.confidence,
        })
      )

      // Parser validation gate
      const parserValidation = validateParserOutput(
        parserResult.document.rawText
      )
      if (!parserValidation.valid) {
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
                wasOcr: true,
              },
            })
            .where(eq(analyses.id, analysisId))
        })
        throw new NonRetriableError(parserValidation.error!.userMessage)
      }

      // Steps 2-6: Chunking, embedding, and persistence pipeline
      const { classifierDocument } = await runChunkingPipeline({
        step,
        ctx,
        parserResult,
        analysisId,
        documentId,
        tenantId,
        emitProgress,
        isOcr: true,
      })

      await step.sleep('rate-limit-parser', getRateLimitDelay('claude'))

      // Step 7: Classifier Agent
      const classifierResult = await step.run('classifier-agent', () =>
        runClassifierAgent({
          parsedDocument: classifierDocument,
          budgetTracker,
        })
      )

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
                wasOcr: true,
              },
            })
            .where(eq(analyses.id, analysisId))
        })
        throw new NonRetriableError(classifierValidation.error!.userMessage)
      }

      // Step: Persist multi-label classifications to chunkClassifications table
      await step.run('persist-classifications', async () => {
        const chunks = classifierDocument.chunks
        const values: Array<{
          tenantId: string
          analysisId: string
          chunkId: string
          documentId: string
          category: string
          confidence: number
          isPrimary: boolean
          rationale: string | null
          chunkIndex: number
          startPosition: number | undefined
          endPosition: number | undefined
        }> = []

        for (const result of classifierResult.rawClassifications) {
          // rawClassifications[i].chunkIndex is the global chunk index
          const chunk = chunks.find(c => c.index === result.chunkIndex)
          if (!chunk) continue

          // Primary classification (always included)
          values.push({
            tenantId,
            analysisId,
            chunkId: chunk.id,
            documentId,
            category: result.primary.category,
            confidence: result.primary.confidence,
            isPrimary: true,
            rationale: result.primary.rationale,
            chunkIndex: chunk.index,
            startPosition: chunk.startPosition,
            endPosition: chunk.endPosition,
          })

          // Secondary classifications (only if confidence >= 0.3)
          for (const sec of result.secondary) {
            if (sec.confidence >= 0.3) {
              values.push({
                tenantId,
                analysisId,
                chunkId: chunk.id,
                documentId,
                category: sec.category,
                confidence: sec.confidence,
                isPrimary: false,
                rationale: null,
                chunkIndex: chunk.index,
                startPosition: chunk.startPosition,
                endPosition: chunk.endPosition,
              })
            }
          }
        }

        // Batch insert with conflict handling (idempotent)
        const PERSIST_BATCH = 100
        for (let i = 0; i < values.length; i += PERSIST_BATCH) {
          const batch = values.slice(i, i + PERSIST_BATCH)
          await ctx.db
            .insert(chunkClassifications)
            .values(batch)
            .onConflictDoNothing()
        }
      })

      await emitProgress(
        'classifying',
        50,
        `Classified ${classifierResult.clauses.length} clauses (${classifierResult.rawClassifications.length} total classifications)`
      )

      await step.sleep('rate-limit-classifier', getRateLimitDelay('claude'))

      // Step 8: Risk Scorer Agent
      const riskResult = await step.run('risk-scorer-agent', () =>
        runRiskScorerAgent({
          clauses: classifierResult.clauses,
          budgetTracker,
          perspective: 'balanced', // Default perspective per user decision
        })
      )
      await emitProgress(
        'scoring',
        75,
        `Scored ${riskResult.assessments.length} clauses`
      )

      // Step: Persist per-clause risk assessments to clauseExtractions
      await step.run('persist-risk-assessments', async () => {
        await persistRiskAssessments(
          ctx.db,
          tenantId,
          analysisId,
          documentId,
          riskResult.assessments,
          riskResult.perspective,
        )
      })

      await step.sleep('rate-limit-risk', getRateLimitDelay('claude'))

      // Step 9: Gap Analyst Agent
      const uniqueOcrCategories = [...new Set(classifierResult.clauses.map(c => c.category))]
      const documentSummary = `${parserResult.document.title}: ${classifierResult.clauses.length} clauses classified across ${uniqueOcrCategories.length} categories (via OCR).`
      const gapResult = await step.run('gap-analyst-agent', () =>
        runGapAnalystAgent({
          clauses: classifierResult.clauses,
          assessments: riskResult.assessments,
          documentSummary,
          budgetTracker,
        })
      )
      await emitProgress('analyzing_gaps', 90, 'Gap analysis complete')

      // Step 10: Persist final results
      await step.run('persist-final', async () => {
        const usage = budgetTracker.getUsage()

        // Calculate weighted risk score using category importance from cuadCategories
        const weightedRisk = await calculateWeightedRisk(ctx.db, riskResult.assessments)

        await ctx.db
          .update(analyses)
          .set({
            status: 'completed',
            overallRiskScore: weightedRisk.score,
            overallRiskLevel: weightedRisk.level,
            summary: riskResult.executiveSummary,
            gapAnalysis: gapResult.gapAnalysis,
            tokenUsage: usage,
            actualTokens: usage.total.total,
            estimatedCost: usage.total.estimatedCost,
            processingTimeMs: Date.now() - startTime,
            completedAt: new Date(),
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              perspective: riskResult.perspective,
              riskDistribution: riskResult.riskDistribution,
            })}::jsonb`,
          })
          .where(eq(analyses.id, analysisId))
      })

      await emitProgress('complete', 100, 'Analysis complete')

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

      return { analysisId, success: true, wasOcr: true }
    })
  }
)
