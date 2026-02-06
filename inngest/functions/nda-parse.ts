/**
 * @fileoverview NDA Parse Sub-Function
 *
 * Extracts and validates text from uploaded documents.
 * Stores rawText on the documents table and structure in analyses.metadata.
 *
 * Invoked by the orchestrator via step.invoke().
 *
 * @module inngest/functions/nda-parse
 */

import { inngest, withTenantContext } from '@/inngest'
import { NonRetriableError } from '@/inngest/utils/errors'
import { runParserAgent } from '@/agents/parser'
import {
  validateParserOutput,
  validateTokenBudget,
  mapExtractionError,
} from '@/agents/validation'
import {
  EncryptedDocumentError,
  CorruptDocumentError,
  OcrRequiredError,
} from '@/lib/errors'
import { analyses } from '@/db/schema/analyses'
import { documents } from '@/db/schema/documents'
import { eq } from 'drizzle-orm'

export const ndaParse = inngest.createFunction(
  {
    id: 'nda-parse',
    name: 'NDA Parse',
    retries: 1,
    cancelOn: [{
      event: 'nda/analysis.cancelled',
      if: 'async.data.analysisId == event.data.analysisId',
    }],
  },
  { event: 'nda/parse.requested' },
  async ({ event, step }) => {
    const { documentId, tenantId, analysisId, source, content, metadata, ocrText, ocrConfidence } = event.data

    return await withTenantContext(tenantId, async (ctx) => {
      // Run parser agent
      let parserResult
      try {
        parserResult = await step.run('parser-agent', () =>
          runParserAgent({ documentId, tenantId, source, content, metadata, ocrText, ocrConfidence })
        )
      } catch (error) {
        if (
          error instanceof EncryptedDocumentError ||
          error instanceof CorruptDocumentError ||
          error instanceof OcrRequiredError
        ) {
          const mapped = mapExtractionError(error)

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

          if (mapped.routeToOcr) {
            await step.sendEvent('trigger-ocr', {
              name: 'nda/ocr.requested',
              data: { documentId, analysisId, tenantId },
            })
          }

          throw new NonRetriableError(mapped.userMessage)
        }
        throw error
      }

      // Validation gate
      const parserValidation = validateParserOutput(parserResult.document.rawText)
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
              },
            })
            .where(eq(analyses.id, analysisId))
        })
        throw new NonRetriableError(parserValidation.error!.userMessage)
      }

      // Token budget estimation + truncation
      const budgetValidation = validateTokenBudget(parserResult.document.rawText, [])
      let workingRawText = parserResult.document.rawText
      let wasTruncated = false

      if (budgetValidation.truncation && budgetValidation.truncation.truncated) {
        workingRawText = budgetValidation.truncation.text
        wasTruncated = true
      }

      // Persist rawText to documents table + structure/budget to analyses
      await step.run('persist-parse-results', async () => {
        await ctx.db
          .update(documents)
          .set({ rawText: workingRawText })
          .where(eq(documents.id, documentId))

        await ctx.db
          .update(analyses)
          .set({
            progressStage: 'parsing',
            progressPercent: 15,
            progressMessage: wasTruncated ? 'Parsed and truncated document' : 'Parsed document',
            estimatedTokens: budgetValidation.estimate.tokenCount,
            wasTruncated,
            metadata: {
              structure: parserResult.document.structure,
              ...(wasTruncated && {
                truncationWarning: budgetValidation.warning?.message,
                removedSections: budgetValidation.truncation?.removedSections,
              }),
            },
          })
          .where(eq(analyses.id, analysisId))
      })

      return {
        title: parserResult.document.title,
        quality: parserResult.quality,
        rawTextLength: workingRawText.length,
        wasTruncated,
      }
    })
  }
)
