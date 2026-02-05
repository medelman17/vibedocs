/**
 * @fileoverview OCR Document Processing Function
 *
 * Processes scanned PDFs that require OCR before analysis.
 * Triggered when extraction detects a document with status 'pending_ocr'.
 *
 * @module inngest/functions/ocr-document
 */

import {
  inngest,
  CONCURRENCY,
  withTenantContext,
} from "@/inngest"
import { NonRetriableError } from "@/inngest/utils/errors"
import { ocrPdf } from "@/lib/ocr/ocr-processor"
import { assessOcrQuality } from "@/lib/ocr/quality"
import { analyses } from "@/db/schema/analyses"
import { documents } from "@/db/schema/documents"
import { eq } from "drizzle-orm"

/**
 * OCR Document Processing Function
 *
 * Handles scanned PDFs that couldn't be text-extracted normally:
 * 1. Fetches document from blob storage
 * 2. Runs OCR on all pages
 * 3. Persists OCR results to analysis record
 * 4. Triggers continuation of main analysis pipeline
 *
 * Memory considerations:
 * - OCR is memory-intensive (~100MB for large documents)
 * - Pages processed sequentially (not parallel)
 * - Limited retries due to cost (OCR is slow)
 */
export const ocrDocument = inngest.createFunction(
  {
    id: "ocr-document",
    name: "OCR Document Processing",
    concurrency: CONCURRENCY.analysis, // Share concurrency with main pipeline
    retries: 2, // Limited retries - OCR is expensive
  },
  { event: "nda/ocr.requested" },
  async ({ event, step }) => {
    const { documentId, analysisId, tenantId } = event.data
    const startTime = Date.now()

    return await withTenantContext(tenantId, async (ctx) => {
      // Step 1: Fetch document metadata and blob URL
      const document = await step.run("fetch-document-info", async () => {
        const doc = await ctx.db.query.documents.findFirst({
          where: eq(documents.id, documentId),
          columns: {
            id: true,
            fileUrl: true,
            fileName: true,
            fileType: true,
          },
        })

        if (!doc) {
          throw new NonRetriableError(`Document ${documentId} not found`)
        }

        if (!doc.fileUrl) {
          throw new NonRetriableError("Document has no file URL")
        }

        return doc
      })

      // Step 2: Update status to show OCR in progress
      await step.run("update-status-processing", async () => {
        await ctx.db
          .update(analyses)
          .set({
            progressStage: "ocr_processing",
            progressPercent: 10,
            updatedAt: new Date(),
          })
          .where(eq(analyses.id, analysisId))
      })

      // Step 3: Download document and run OCR
      // Combined into single step because Buffer doesn't serialize cleanly for Inngest
      // This step is idempotent: if it succeeds once, Inngest won't re-run it
      const ocrResult = await step.run("download-and-ocr", async () => {
        console.log("[OCR] Starting OCR processing", {
          documentId,
          analysisId,
          fileName: document.fileName,
        })

        // Download document from blob storage
        const response = await fetch(document.fileUrl!)

        if (!response.ok) {
          throw new NonRetriableError(
            `Failed to download document: ${response.status}`
          )
        }

        const arrayBuffer = await response.arrayBuffer()
        const pdfBuffer = Buffer.from(arrayBuffer)

        // Run OCR (potentially long-running, 10-30s per page)
        return await ocrPdf(pdfBuffer)
      })

      // Step 5: Assess quality
      const quality = assessOcrQuality(ocrResult)

      console.log("[OCR] Processing complete", {
        analysisId,
        pages: ocrResult.pages.length,
        averageConfidence: ocrResult.averageConfidence.toFixed(1),
        isLowQuality: quality.isLowQuality,
        processingTimeMs: Date.now() - startTime,
      })

      // Step 6: Persist OCR results
      await step.run("persist-ocr-result", async () => {
        await ctx.db
          .update(analyses)
          .set({
            status: "processing", // Resume normal pipeline status
            ocrText: ocrResult.text,
            ocrConfidence: ocrResult.averageConfidence,
            ocrWarning: quality.isLowQuality ? quality.warningMessage : null,
            ocrCompletedAt: new Date(),
            progressStage: "parsing", // Next stage after OCR
            progressPercent: 20,
            metadata: {
              ocrPageCount: ocrResult.pages.length,
              ocrLowConfidencePages: quality.affectedPages,
              ocrProcessingTimeMs: Date.now() - startTime,
            },
          })
          .where(eq(analyses.id, analysisId))
      })

      // Step 7: Trigger continuation of main analysis pipeline
      await step.sendEvent("resume-analysis", {
        name: "nda/analysis.ocr-complete",
        data: {
          documentId,
          analysisId,
          tenantId,
          ocrText: ocrResult.text,
          quality: {
            confidence: quality.confidence,
            isLowQuality: quality.isLowQuality,
            warningMessage: quality.warningMessage,
            affectedPages: quality.affectedPages,
          },
        },
      })

      return {
        success: true,
        analysisId,
        pages: ocrResult.pages.length,
        confidence: ocrResult.averageConfidence,
        isLowQuality: quality.isLowQuality,
      }
    })
  }
)
