/**
 * @fileoverview NDA Classify Sub-Function
 *
 * Reads chunks from documentChunks table, classifies all chunks in a single
 * classifier agent call (single LLM invocation), and persists results to
 * chunkClassifications.
 *
 * Invoked by the orchestrator via step.invoke().
 *
 * @module inngest/functions/nda-classify
 */

import { inngest, RETRY_CONFIG, withTenantContext } from '@/inngest'
import { NonRetriableError } from '@/inngest/utils/errors'
import { runClassifierAgent } from '@/agents/classifier'
import { validateClassifierOutput } from '@/agents/validation'
import { BudgetTracker } from '@/lib/ai/budget'
import { analyses, chunkClassifications } from '@/db/schema/analyses'
import { documents } from '@/db/schema/documents'
import { documentChunks } from '@/db/schema/documents'
import type { ParsedChunk } from '@/agents/classifier'
import { eq, and, isNotNull, asc } from 'drizzle-orm'


export const ndaClassify = inngest.createFunction(
  {
    id: 'nda-classify',
    name: 'NDA Classify',
    retries: RETRY_CONFIG.default.retries,
    cancelOn: [{
      event: 'nda/analysis.cancelled',
      if: 'async.data.analysisId == event.data.analysisId',
    }],
  },
  { event: 'nda/classify.requested' },
  async ({ event, step }) => {
    const { documentId, tenantId, analysisId, title } = event.data

    return await withTenantContext(tenantId, async (ctx) => {
      // ================================================================
      // Step 1: Read chunks and rawText from DB
      // ================================================================
      const sourceData = await step.run('read-source-data', async () => {
        const chunks = await ctx.db
          .select({
            id: documentChunks.id,
            chunkIndex: documentChunks.chunkIndex,
            content: documentChunks.content,
            sectionPath: documentChunks.sectionPath,
            tokenCount: documentChunks.tokenCount,
            startPosition: documentChunks.startPosition,
            endPosition: documentChunks.endPosition,
          })
          .from(documentChunks)
          .where(
            and(
              eq(documentChunks.documentId, documentId),
              eq(documentChunks.analysisId, analysisId),
              isNotNull(documentChunks.embedding)
            )
          )
          .orderBy(asc(documentChunks.chunkIndex))

        const [doc] = await ctx.db
          .select({ rawText: documents.rawText })
          .from(documents)
          .where(eq(documents.id, documentId))
          .limit(1)

        return { chunks, rawText: doc?.rawText ?? '' }
      })

      // Build classifier-compatible chunks (handle nullable DB columns)
      const classifierChunks: ParsedChunk[] = sourceData.chunks.map(c => ({
        id: c.id,
        index: c.chunkIndex,
        content: c.content,
        sectionPath: c.sectionPath ?? [],
        tokenCount: c.tokenCount ?? 0,
        startPosition: c.startPosition ?? 0,
        endPosition: c.endPosition ?? 0,
      }))

      // ================================================================
      // Step 2: Classify ALL chunks in a single agent call
      // ================================================================
      //
      // BEFORE: N steps (classify-batch-0..N), each calling the agent
      //   with 4 chunks. The agent already does a single LLM call
      //   internally, so this was 6 sequential LLM calls for 24 chunks
      //   with scheduler round-trip gaps between each.
      //
      // AFTER: 1 step, 1 agent call, 1 LLM call for all chunks.
      //
      // Input budget for 24 chunks:
      //   ~24K chars clause text + ~3K refs + ~2K system = ~30K chars
      //   ≈ ~8K tokens = 4% of Sonnet 4.5's 200K context window.
      //
      // Output budget:
      //   24 classifications × ~150 tokens ≈ 3.6K output tokens.
      //
      // If documents ever exceed ~100 chunks (~25K tokens of clause text),
      // split into 2 large batches, not N micro-batches. But typical
      // NDAs produce 15-40 chunks, well within a single call.
      //
      const classifierResult = await step.run('classify-chunks', async () => {
        const budgetTracker = new BudgetTracker()

        // Fire-and-forget progress update before starting
        ctx.db
          .update(analyses)
          .set({
            progressStage: 'classifying',
            progressPercent: 40,
            progressMessage: `Classifying ${classifierChunks.length} chunks...`,
            updatedAt: new Date(),
          })
          .where(eq(analyses.id, analysisId))
          .catch(() => {})

        const result = await runClassifierAgent({
          parsedDocument: {
            documentId,
            title,
            rawText: sourceData.rawText,
            chunks: classifierChunks,
          },
          budgetTracker,
        })

        return {
          rawClassifications: result.rawClassifications,
          clauses: result.clauses,
          tokenUsage: budgetTracker.getUsage(),
        }
      }) as unknown as Awaited<ReturnType<typeof runClassifierAgent>>

      // Validation gate
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

      // ================================================================
      // Step 3: Persist classifications
      // ================================================================
      await step.run('persist-classifications', async () => {
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
          const chunk = classifierChunks.find(c => c.index === result.chunkIndex)
          if (!chunk) continue

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

        const PERSIST_BATCH = 100
        for (let i = 0; i < values.length; i += PERSIST_BATCH) {
          const batch = values.slice(i, i + PERSIST_BATCH)
          await ctx.db
            .insert(chunkClassifications)
            .values(batch)
            .onConflictDoNothing()
        }

        // Update progress
        await ctx.db
          .update(analyses)
          .set({
            progressStage: 'classifying',
            progressPercent: 60,
            progressMessage: `Classified ${classifierResult.clauses.length} clauses (${classifierResult.rawClassifications.length} total classifications)`,
          })
          .where(eq(analyses.id, analysisId))
      })

      return {
        clauseCount: classifierResult.clauses.length,
        classificationCount: classifierResult.rawClassifications.length,
        tokenUsage: classifierResult.tokenUsage,
      }
    })
  }
)
