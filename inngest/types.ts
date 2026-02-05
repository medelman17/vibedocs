/**
 * @fileoverview Inngest Event Type Definitions
 *
 * Defines all event schemas for the VibeDocs durable workflow system.
 * Events follow the naming convention: `nda/<domain>.<action>`
 *
 * All events are validated at runtime using Zod schemas before processing.
 *
 * @module inngest/types
 */

import { z } from "zod";
import type { DatasetSource } from "@/lib/datasets";

/**
 * Base payload fields included in all tenant-scoped events.
 */
export const baseTenantPayload = z.object({
  /** Organization ID for tenant isolation */
  tenantId: z.string().uuid(),
  /** User who triggered the event (optional for system events) */
  userId: z.string().uuid().optional(),
});

/**
 * Document upload event - triggers processing pipeline.
 * Sent after a document is uploaded to blob storage.
 */
export const documentUploadedPayload = baseTenantPayload.extend({
  /** Database ID of the uploaded document */
  documentId: z.string().uuid(),
  /** Original filename */
  fileName: z.string(),
  /** MIME type */
  fileType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  /** Blob storage URL */
  fileUrl: z.string().url(),
});

/**
 * Analysis request event - triggers the full agent pipeline.
 * Supports both web upload and Word Add-in sources.
 */
export const analysisRequestedPayload = baseTenantPayload.extend({
  /** Document to analyze */
  documentId: z.string().uuid(),
  /** Analysis record ID (pre-created with status='pending') - optional for Word Add-in */
  analysisId: z.string().uuid().optional(),
  /** Optional: specific analysis version (for re-analysis) */
  version: z.number().int().positive().optional(),
  /** Source of the document */
  source: z.enum(["web", "web-upload", "word-addin"]).default("web"),
  /** Timestamp when analysis was requested (for deterministic ID generation) */
  requestedAt: z.number().int().positive().optional(),
  /** User's optional prompt/instructions for the analysis */
  userPrompt: z.string().optional(),
  /** Word Add-in content (required when source='word-addin') */
  content: z
    .object({
      rawText: z.string(),
      paragraphs: z.array(
        z.object({
          text: z.string(),
          style: z.string(),
          isHeading: z.boolean(),
        })
      ),
    })
    .optional(),
  /** Word Add-in metadata (optional) */
  metadata: z
    .object({
      title: z.string(),
      author: z.string().optional(),
    })
    .optional(),
});

/**
 * Analysis progress event - emitted during pipeline execution.
 * Used for real-time UI updates on analysis status.
 */
export const analysisProgressPayload = z.object({
  /** Document being analyzed */
  documentId: z.string().uuid(),
  /** Analysis record ID */
  analysisId: z.string().uuid(),
  /** Tenant ID for routing */
  tenantId: z.string().uuid(),
  /** Pipeline stage */
  stage: z.enum([
    "parsing",
    "chunking",
    "ocr_processing",
    "classifying",
    "scoring",
    "analyzing_gaps",
    "complete",
    "failed",
  ]),
  /** Progress percentage (0-100) */
  progress: z.number().min(0).max(100),
  /** Status message */
  message: z.string(),
  /** Additional metadata */
  metadata: z
    .object({
      chunksProcessed: z.number().int().nonnegative().optional(),
      totalChunks: z.number().int().nonnegative().optional(),
      clausesClassified: z.number().int().nonnegative().optional(),
      embeddingBatchesCompleted: z.number().int().nonnegative().optional(),
      totalEmbeddingBatches: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

/**
 * Analysis completed event - emitted when pipeline finishes.
 * Used to trigger downstream actions (notifications, Word Add-in sync).
 */
export const analysisCompletedPayload = z.object({
  /** Document that was analyzed */
  documentId: z.string().uuid(),
  /** Analysis record ID */
  analysisId: z.string().uuid(),
  /** Tenant ID */
  tenantId: z.string().uuid(),
  /** Overall risk score (0-100) */
  overallRiskScore: z.number().min(0).max(100),
  /** Overall risk level */
  overallRiskLevel: z.enum(["standard", "cautious", "aggressive", "unknown"]),
});

/**
 * Comparison request event - triggers side-by-side comparison.
 */
export const comparisonRequestedPayload = baseTenantPayload.extend({
  /** Comparison record ID (pre-created with status='pending') */
  comparisonId: z.string().uuid(),
  /** First document in comparison */
  documentAId: z.string().uuid(),
  /** Second document in comparison */
  documentBId: z.string().uuid(),
});

// =============================================================================
// Demo Events (for testing Inngest setup)
// =============================================================================

/**
 * Demo process event - simulates document processing.
 */
export const demoProcessPayload = z.object({
  documentId: z.string(),
  message: z.string().optional(),
});

/**
 * Demo multi-step event - runs configurable steps with delays.
 */
export const demoMultiStepPayload = z.object({
  steps: z.number().int().positive().optional().default(3),
  delayMs: z.number().int().nonnegative().optional().default(1000),
});

// =============================================================================
// Bootstrap Events (for reference data ingestion)
// =============================================================================

/**
 * Dataset source enum for validation.
 */
const datasetSourceSchema = z.enum([
  "cuad",
  "contract_nli",
  "bonterms",
  "commonaccord",
]) satisfies z.ZodType<DatasetSource>;

/**
 * Bootstrap ingest request event - triggers reference data pipeline.
 * Sent by admin API to initiate dataset ingestion.
 */
export const bootstrapIngestRequestedPayload = z.object({
  /** Which datasets to ingest */
  sources: z.array(datasetSourceSchema).min(1),
  /** Re-download even if cached */
  forceRefresh: z.boolean().optional().default(false),
});

/**
 * Bootstrap ingest progress event - emitted during pipeline execution.
 * Used for monitoring/logging bootstrap progress.
 */
export const bootstrapIngestProgressPayload = z.object({
  /** Dataset being processed */
  source: datasetSourceSchema,
  /** Current processing step */
  step: z.enum([
    "downloading",
    "parsing",
    "embedding",
    "inserting",
    "indexing",
    "complete",
  ]),
  /** Records processed so far */
  recordsProcessed: z.number().int().nonnegative(),
  /** Total records if known */
  totalRecords: z.number().int().nonnegative().optional(),
  /** Progress percentage (0-100) */
  percent: z.number().min(0).max(100).optional(),
});

/**
 * Bootstrap ingest completed event - emitted when pipeline finishes.
 */
export const bootstrapIngestCompletedPayload = z.object({
  /** Datasets that were ingested */
  sources: z.array(datasetSourceSchema),
  /** Total records processed across all sources */
  totalRecords: z.number().int().nonnegative(),
  /** Total embeddings created */
  totalEmbeddings: z.number().int().nonnegative(),
  /** Total duration in milliseconds */
  durationMs: z.number().int().nonnegative(),
});

/**
 * Bootstrap source process event - triggers per-source worker.
 * Dispatched by coordinator to process one dataset.
 */
export const bootstrapSourceProcessPayload = z.object({
  /** Dataset to process */
  source: datasetSourceSchema,
  /** Progress record ID for tracking */
  progressId: z.string().uuid(),
  /** Re-download even if cached */
  forceRefresh: z.boolean().optional().default(false),
});

/**
 * Bootstrap source completed event - emitted when a source finishes.
 */
export const bootstrapSourceCompletedPayload = z.object({
  /** Dataset that completed */
  source: datasetSourceSchema,
  /** Progress record ID */
  progressId: z.string().uuid(),
  /** Final status */
  status: z.enum(["completed", "failed"]),
  /** Records processed */
  processedRecords: z.number().int().nonnegative(),
  /** Embeddings created */
  embeddedRecords: z.number().int().nonnegative(),
  /** Errors encountered */
  errorCount: z.number().int().nonnegative(),
});

// =============================================================================
// OCR Events
// =============================================================================

/**
 * OCR processing request event - triggers OCR for scanned documents.
 * Sent when extraction detects a document that requires OCR processing.
 */
export const ocrRequestedPayload = baseTenantPayload.extend({
  /** Document requiring OCR */
  documentId: z.string().uuid(),
  /** Analysis record ID (pre-created with status='pending_ocr') */
  analysisId: z.string().uuid(),
});

/**
 * OCR quality assessment result structure.
 */
export const ocrQualityPayload = z.object({
  /** Average confidence 0-100 */
  confidence: z.number().min(0).max(100),
  /** True if warning should be shown to user */
  isLowQuality: z.boolean(),
  /** User-facing warning message (if applicable) */
  warningMessage: z.string().optional(),
  /** Pages with confidence below threshold */
  affectedPages: z.array(z.number().int().positive()),
});

/**
 * OCR processing completed event - triggers pipeline continuation.
 * Sent after OCR extracts text from a scanned document.
 */
export const ocrCompletedPayload = baseTenantPayload.extend({
  /** Processed document ID */
  documentId: z.string().uuid(),
  /** Analysis record ID */
  analysisId: z.string().uuid(),
  /** OCR-extracted text */
  ocrText: z.string(),
  /** OCR quality assessment */
  quality: ocrQualityPayload,
});

/**
 * Analysis re-score event - triggers re-scoring with a different perspective.
 * Sent when user toggles perspective in the analysis view.
 */
export const analysisRescorePayload = baseTenantPayload.extend({
  /** Analysis to re-score */
  analysisId: z.string().uuid(),
  /** New perspective to apply */
  perspective: z.enum(["receiving", "disclosing", "balanced"]),
});

/**
 * Analysis cancelled event - triggers cancellation of running analysis.
 * Sent when user deletes document or explicitly cancels analysis.
 */
export const analysisCancelledPayload = baseTenantPayload.extend({
  /** Analysis to cancel */
  analysisId: z.string().uuid(),
  /** Reason for cancellation */
  reason: z.enum(["document_deleted", "user_cancelled", "superseded"]),
});

/**
 * Document deleted event - triggers cleanup and cancellation.
 */
export const documentDeletedPayload = baseTenantPayload.extend({
  /** Deleted document ID */
  documentId: z.string().uuid(),
});

/**
 * All Inngest event types for the VibeDocs application.
 */
export type InngestEvents = {
  "nda/uploaded": {
    data: z.infer<typeof documentUploadedPayload>;
  };
  "nda/analysis.requested": {
    data: z.infer<typeof analysisRequestedPayload>;
  };
  "nda/analysis.progress": {
    data: z.infer<typeof analysisProgressPayload>;
  };
  "nda/analysis.completed": {
    data: z.infer<typeof analysisCompletedPayload>;
  };
  "nda/analysis.rescore": {
    data: z.infer<typeof analysisRescorePayload>;
  };
  "nda/analysis.cancelled": {
    data: z.infer<typeof analysisCancelledPayload>;
  };
  "nda/document.deleted": {
    data: z.infer<typeof documentDeletedPayload>;
  };
  "nda/comparison.requested": {
    data: z.infer<typeof comparisonRequestedPayload>;
  };
  // OCR events
  "nda/ocr.requested": {
    data: z.infer<typeof ocrRequestedPayload>;
  };
  "nda/analysis.ocr-complete": {
    data: z.infer<typeof ocrCompletedPayload>;
  };
  // Demo events
  "demo/process": {
    data: z.infer<typeof demoProcessPayload>;
  };
  "demo/multi-step": {
    data: z.infer<typeof demoMultiStepPayload>;
  };
  // Bootstrap events
  "bootstrap/ingest.requested": {
    data: z.infer<typeof bootstrapIngestRequestedPayload>;
  };
  "bootstrap/ingest.progress": {
    data: z.infer<typeof bootstrapIngestProgressPayload>;
  };
  "bootstrap/ingest.completed": {
    data: z.infer<typeof bootstrapIngestCompletedPayload>;
  };
  "bootstrap/source.process": {
    data: z.infer<typeof bootstrapSourceProcessPayload>;
  };
  "bootstrap/source.completed": {
    data: z.infer<typeof bootstrapSourceCompletedPayload>;
  };
};

/**
 * Payload types exported for function implementations.
 */
export type DocumentUploadedPayload = z.infer<typeof documentUploadedPayload>;
export type AnalysisRequestedPayload = z.infer<typeof analysisRequestedPayload>;
export type AnalysisProgressPayload = z.infer<typeof analysisProgressPayload>;
export type AnalysisCompletedPayload = z.infer<typeof analysisCompletedPayload>;
export type ComparisonRequestedPayload = z.infer<
  typeof comparisonRequestedPayload
>;
export type AnalysisRescorePayload = z.infer<typeof analysisRescorePayload>;
export type AnalysisCancelledPayload = z.infer<typeof analysisCancelledPayload>;
export type DocumentDeletedPayload = z.infer<typeof documentDeletedPayload>;
export type BootstrapIngestRequestedPayload = z.infer<
  typeof bootstrapIngestRequestedPayload
>;
export type BootstrapIngestProgressPayload = z.infer<
  typeof bootstrapIngestProgressPayload
>;
export type BootstrapIngestCompletedPayload = z.infer<
  typeof bootstrapIngestCompletedPayload
>;
export type BootstrapSourceProcessPayload = z.infer<
  typeof bootstrapSourceProcessPayload
>;
export type BootstrapSourceCompletedPayload = z.infer<
  typeof bootstrapSourceCompletedPayload
>;
export type OcrRequestedPayload = z.infer<typeof ocrRequestedPayload>;
export type OcrCompletedPayload = z.infer<typeof ocrCompletedPayload>;
export type OcrQualityPayload = z.infer<typeof ocrQualityPayload>;

/**
 * Map of event names to their Zod schemas for runtime validation.
 */
export const eventSchemas = {
  "nda/uploaded": documentUploadedPayload,
  "nda/analysis.requested": analysisRequestedPayload,
  "nda/analysis.progress": analysisProgressPayload,
  "nda/analysis.completed": analysisCompletedPayload,
  "nda/analysis.rescore": analysisRescorePayload,
  "nda/analysis.cancelled": analysisCancelledPayload,
  "nda/document.deleted": documentDeletedPayload,
  "nda/comparison.requested": comparisonRequestedPayload,
  // OCR events
  "nda/ocr.requested": ocrRequestedPayload,
  "nda/analysis.ocr-complete": ocrCompletedPayload,
  // Demo events
  "demo/process": demoProcessPayload,
  "demo/multi-step": demoMultiStepPayload,
  // Bootstrap events
  "bootstrap/ingest.requested": bootstrapIngestRequestedPayload,
  "bootstrap/ingest.progress": bootstrapIngestProgressPayload,
  "bootstrap/ingest.completed": bootstrapIngestCompletedPayload,
  "bootstrap/source.process": bootstrapSourceProcessPayload,
  "bootstrap/source.completed": bootstrapSourceCompletedPayload,
} as const;
