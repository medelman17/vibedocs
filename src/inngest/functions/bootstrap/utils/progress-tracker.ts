/**
 * @fileoverview Progress Tracker for Bootstrap Pipeline
 *
 * Utilities for creating, updating, and querying bootstrap progress records.
 * Enables resume from failure and progress monitoring.
 *
 * @module inngest/functions/bootstrap/utils/progress-tracker
 */

import { db } from "@/db/client"
import {
  bootstrapProgress,
  type BootstrapProgress,
  type BootstrapStatus,
} from "@/db/schema/bootstrap"
import { eq, sql, desc } from "drizzle-orm"
import type { DatasetSource } from "@/lib/datasets"

/**
 * Create a new progress record for a source.
 */
export async function createProgress(
  source: DatasetSource
): Promise<BootstrapProgress> {
  const [record] = await db
    .insert(bootstrapProgress)
    .values({
      source,
      status: "pending",
      startedAt: new Date(),
    })
    .returning()

  return record
}

/**
 * Update progress fields.
 */
export async function updateProgress(
  progressId: string,
  updates: {
    status?: BootstrapStatus
    totalRecords?: number
    processedRecords?: number | ReturnType<typeof sql>
    embeddedRecords?: number | ReturnType<typeof sql>
    errorCount?: number | ReturnType<typeof sql>
    lastProcessedHash?: string
    lastBatchIndex?: number
    startedAt?: Date
    completedAt?: Date
  }
): Promise<void> {
  await db
    .update(bootstrapProgress)
    .set(updates)
    .where(eq(bootstrapProgress.id, progressId))
}

/**
 * Get progress record by ID.
 */
export async function getProgress(
  progressId: string
): Promise<BootstrapProgress | null> {
  const [record] = await db
    .select()
    .from(bootstrapProgress)
    .where(eq(bootstrapProgress.id, progressId))

  return record ?? null
}

/**
 * Get the latest progress record for a source.
 */
export async function getLatestProgress(
  source: DatasetSource
): Promise<BootstrapProgress | null> {
  const [record] = await db
    .select()
    .from(bootstrapProgress)
    .where(eq(bootstrapProgress.source, source))
    .orderBy(desc(bootstrapProgress.createdAt))
    .limit(1)

  return record ?? null
}

/**
 * Mark progress as started.
 */
export async function markStarted(
  progressId: string,
  totalRecords?: number
): Promise<void> {
  await updateProgress(progressId, {
    status: "in_progress",
    totalRecords,
    startedAt: new Date(),
  })
}

/**
 * Mark progress as completed.
 */
export async function markCompleted(progressId: string): Promise<void> {
  await updateProgress(progressId, {
    status: "completed",
    completedAt: new Date(),
  })
}

/**
 * Mark progress as failed.
 */
export async function markFailed(progressId: string): Promise<void> {
  await updateProgress(progressId, {
    status: "failed",
    completedAt: new Date(),
  })
}

/**
 * Increment progress counters atomically.
 */
export async function incrementProgress(
  progressId: string,
  counts: {
    processed?: number
    embedded?: number
    errors?: number
  }
): Promise<void> {
  const updates: Parameters<typeof updateProgress>[1] = {}

  if (counts.processed) {
    updates.processedRecords = sql`${bootstrapProgress.processedRecords} + ${counts.processed}`
  }
  if (counts.embedded) {
    updates.embeddedRecords = sql`${bootstrapProgress.embeddedRecords} + ${counts.embedded}`
  }
  if (counts.errors) {
    updates.errorCount = sql`${bootstrapProgress.errorCount} + ${counts.errors}`
  }

  if (Object.keys(updates).length > 0) {
    await updateProgress(progressId, updates)
  }
}
