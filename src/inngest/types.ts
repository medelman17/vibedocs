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

/**
 * Map of event names to their Zod schemas for runtime validation.
 */
export const eventSchemas = {
  "nda/uploaded": documentUploadedPayload,
  "nda/analysis.requested": analysisRequestedPayload,
  "nda/analysis.progress": analysisProgressPayload,
  "nda/comparison.requested": comparisonRequestedPayload,
} as const
