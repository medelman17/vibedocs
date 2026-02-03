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

import { z } from "zod"
import type { DatasetSource } from "@/lib/datasets"

/**
 * Base payload fields included in all tenant-scoped events.
 */
export const baseTenantPayload = z.object({
  /** Organization ID for tenant isolation */
  tenantId: z.string().uuid(),
  /** User who triggered the event (optional for system events) */
  userId: z.string().uuid().optional(),
})

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
})

/**
 * Analysis request event - triggers the full agent pipeline.
 * Sent after document processing completes or manually by user.
 */
export const analysisRequestedPayload = baseTenantPayload.extend({
  /** Document to analyze */
  documentId: z.string().uuid(),
  /** Analysis record ID (pre-created with status='pending') */
  analysisId: z.string().uuid(),
  /** Optional: specific analysis version (for re-analysis) */
  version: z.number().int().positive().optional(),
})

/**
 * Analysis progress event - emitted during pipeline execution.
 * Used for real-time UI updates on analysis status.
 */
export const analysisProgressPayload = z.object({
  /** Analysis record ID */
  analysisId: z.string().uuid(),
  /** Current step name (e.g., 'parsing', 'classification', 'risk-scoring') */
  step: z.string(),
  /** Progress percentage (0-100) */
  percent: z.number().min(0).max(100),
  /** Optional status message */
  message: z.string().optional(),
})

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
})

// =============================================================================
// Demo Events (for testing Inngest setup)
// =============================================================================

/**
 * Demo process event - simulates document processing.
 */
export const demoProcessPayload = z.object({
  documentId: z.string(),
  message: z.string().optional(),
})

/**
 * Demo multi-step event - runs configurable steps with delays.
 */
export const demoMultiStepPayload = z.object({
  steps: z.number().int().positive().optional().default(3),
  delayMs: z.number().int().nonnegative().optional().default(1000),
})

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
]) satisfies z.ZodType<DatasetSource>

/**
 * Bootstrap ingest request event - triggers reference data pipeline.
 * Sent by admin API to initiate dataset ingestion.
 */
export const bootstrapIngestRequestedPayload = z.object({
  /** Which datasets to ingest */
  sources: z.array(datasetSourceSchema).min(1),
  /** Re-download even if cached */
  forceRefresh: z.boolean().optional().default(false),
})

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
})

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
})

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
})

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
})

/**
 * All Inngest event types for the VibeDocs application.
 */
export type InngestEvents = {
  "nda/uploaded": {
    data: z.infer<typeof documentUploadedPayload>
  }
  "nda/analysis.requested": {
    data: z.infer<typeof analysisRequestedPayload>
  }
  "nda/analysis.progress": {
    data: z.infer<typeof analysisProgressPayload>
  }
  "nda/comparison.requested": {
    data: z.infer<typeof comparisonRequestedPayload>
  }
  // Demo events
  "demo/process": {
    data: z.infer<typeof demoProcessPayload>
  }
  "demo/multi-step": {
    data: z.infer<typeof demoMultiStepPayload>
  }
  // Bootstrap events
  "bootstrap/ingest.requested": {
    data: z.infer<typeof bootstrapIngestRequestedPayload>
  }
  "bootstrap/ingest.progress": {
    data: z.infer<typeof bootstrapIngestProgressPayload>
  }
  "bootstrap/ingest.completed": {
    data: z.infer<typeof bootstrapIngestCompletedPayload>
  }
  "bootstrap/source.process": {
    data: z.infer<typeof bootstrapSourceProcessPayload>
  }
  "bootstrap/source.completed": {
    data: z.infer<typeof bootstrapSourceCompletedPayload>
  }
}

/**
 * Payload types exported for function implementations.
 */
export type DocumentUploadedPayload = z.infer<typeof documentUploadedPayload>
export type AnalysisRequestedPayload = z.infer<typeof analysisRequestedPayload>
export type AnalysisProgressPayload = z.infer<typeof analysisProgressPayload>
export type ComparisonRequestedPayload = z.infer<
  typeof comparisonRequestedPayload
>
export type BootstrapIngestRequestedPayload = z.infer<
  typeof bootstrapIngestRequestedPayload
>
export type BootstrapIngestProgressPayload = z.infer<
  typeof bootstrapIngestProgressPayload
>
export type BootstrapIngestCompletedPayload = z.infer<
  typeof bootstrapIngestCompletedPayload
>
export type BootstrapSourceProcessPayload = z.infer<
  typeof bootstrapSourceProcessPayload
>
export type BootstrapSourceCompletedPayload = z.infer<
  typeof bootstrapSourceCompletedPayload
>

/**
 * Map of event names to their Zod schemas for runtime validation.
 */
export const eventSchemas = {
  "nda/uploaded": documentUploadedPayload,
  "nda/analysis.requested": analysisRequestedPayload,
  "nda/analysis.progress": analysisProgressPayload,
  "nda/comparison.requested": comparisonRequestedPayload,
  "bootstrap/ingest.requested": bootstrapIngestRequestedPayload,
  "bootstrap/ingest.progress": bootstrapIngestProgressPayload,
  "bootstrap/ingest.completed": bootstrapIngestCompletedPayload,
  "bootstrap/source.process": bootstrapSourceProcessPayload,
  "bootstrap/source.completed": bootstrapSourceCompletedPayload,
} as const
