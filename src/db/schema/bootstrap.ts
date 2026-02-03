/**
 * @fileoverview Bootstrap Progress Tracking Schema
 *
 * Tracks progress of reference data ingestion for resume support.
 * Each source (cuad, contract_nli, etc.) has its own progress record.
 *
 * This enables the bootstrap pipeline to:
 * - Resume from any failure point after a crash or timeout
 * - Track processing statistics per source
 * - Monitor ingestion progress in real-time
 *
 * @module db/schema/bootstrap
 */

import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core"
import { timestamps } from "../_columns"

/**
 * Valid status values for bootstrap progress.
 *
 * - `pending`: Ingestion not yet started
 * - `in_progress`: Currently processing records
 * - `completed`: All records successfully processed
 * - `failed`: Ingestion stopped due to errors (can be resumed)
 */
export type BootstrapStatus = "pending" | "in_progress" | "completed" | "failed"

/**
 * Tracks progress of reference data ingestion per source.
 *
 * Each row represents the ingestion state for a single data source
 * (cuad, contract_nli, bonterms, etc.). The progress tracking enables
 * resumable ingestion - if the pipeline fails partway through, it can
 * resume from `lastBatchIndex` rather than starting over.
 *
 * ## Progress Tracking Fields
 *
 * | Field             | Purpose                                             |
 * |-------------------|-----------------------------------------------------|
 * | totalRecords      | Expected total (set once source is downloaded)      |
 * | processedRecords  | Records successfully parsed and inserted            |
 * | embeddedRecords   | Records with embeddings generated                   |
 * | errorCount        | Records that failed processing                      |
 * | lastBatchIndex    | Last completed batch (for resume)                   |
 * | lastProcessedHash | Hash of last processed record (for verification)    |
 *
 * ## Resume Logic
 *
 * When resuming a failed ingestion:
 * 1. Query for progress record with matching source
 * 2. If `status` is `failed` or `in_progress`, resume from `lastBatchIndex`
 * 3. Skip batches 0..lastBatchIndex and continue from lastBatchIndex+1
 * 4. Update progress after each batch completes
 *
 * @example
 * ```typescript
 * // Check for existing progress
 * const [existing] = await db
 *   .select()
 *   .from(bootstrapProgress)
 *   .where(eq(bootstrapProgress.source, 'cuad'))
 *
 * if (existing?.status === 'completed') {
 *   console.log('Source already ingested, skipping')
 *   return
 * }
 *
 * const startBatch = existing?.lastBatchIndex ?? 0
 *
 * // Update progress after each batch
 * await db
 *   .update(bootstrapProgress)
 *   .set({
 *     processedRecords: sql`processed_records + ${batchSize}`,
 *     lastBatchIndex: currentBatch,
 *     updatedAt: new Date(),
 *   })
 *   .where(eq(bootstrapProgress.source, 'cuad'))
 * ```
 */
export const bootstrapProgress = pgTable("bootstrap_progress", {
  /** UUID primary key, auto-generated */
  id: uuid("id").primaryKey().defaultRandom(),

  /**
   * Source identifier for the data being ingested.
   * One of: 'cuad' | 'contract_nli' | 'bonterms' | 'commonaccord' | 'kleister'
   */
  source: text("source").notNull(),

  /**
   * Current status of the ingestion for this source.
   * @see BootstrapStatus
   */
  status: text("status").notNull().$type<BootstrapStatus>(),

  /**
   * Total number of records expected for this source.
   * Set once the source data is downloaded and counted.
   * Null until the total is known.
   */
  totalRecords: integer("total_records"),

  /**
   * Number of records successfully processed (parsed and inserted).
   * Updated after each batch completes.
   */
  processedRecords: integer("processed_records").notNull().default(0),

  /**
   * Number of records with embeddings successfully generated.
   * May lag behind processedRecords if embedding generation is separate.
   */
  embeddedRecords: integer("embedded_records").notNull().default(0),

  /**
   * Number of records that failed processing.
   * Individual errors don't stop the batch - they're counted here.
   */
  errorCount: integer("error_count").notNull().default(0),

  /**
   * Content hash of the last successfully processed record.
   * Used for verification when resuming - ensures we don't have gaps.
   */
  lastProcessedHash: text("last_processed_hash"),

  /**
   * Index of the last completed batch (0-based).
   * When resuming, start from lastBatchIndex + 1.
   */
  lastBatchIndex: integer("last_batch_index").notNull().default(0),

  /**
   * Timestamp when ingestion started for this source.
   * Set when status changes to 'in_progress'.
   */
  startedAt: timestamp("started_at", { withTimezone: true }),

  /**
   * Timestamp when ingestion completed for this source.
   * Set when status changes to 'completed'.
   */
  completedAt: timestamp("completed_at", { withTimezone: true }),

  /** Standard created_at and updated_at timestamps */
  ...timestamps,
})

/** Type for inserting a new bootstrap progress record */
export type NewBootstrapProgress = typeof bootstrapProgress.$inferInsert

/** Type for a bootstrap progress record from the database */
export type BootstrapProgress = typeof bootstrapProgress.$inferSelect
