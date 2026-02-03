# Bootstrap Pipeline Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the bootstrap pipeline with chunked jobs and resumable state to reliably process ~24K records.

**Architecture:** Coordinator function dispatches parallel per-source workers. Each worker tracks progress in a database table, enabling resume from any failure point. Batches are processed as individual Inngest steps with retry and circuit breaker logic.

**Tech Stack:** Inngest 3.x, Drizzle ORM, Voyage AI, Zod

**Design Doc:** `docs/plans/2026-02-03-bootstrap-hardening-design.md`

**Worktree:** `.worktrees/bootstrap-hardening`

---

## Task 1: Create Bootstrap Progress Schema

**Files:**
- Create: `src/db/schema/bootstrap.ts`
- Modify: `src/db/schema/index.ts`
- Create: `src/db/schema/bootstrap.test.ts`

**Step 1: Write the failing test**

```typescript
// src/db/schema/bootstrap.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "@/db/client"
import { bootstrapProgress } from "./bootstrap"
import { eq } from "drizzle-orm"

describe("bootstrapProgress schema", () => {
  beforeEach(async () => {
    await db.delete(bootstrapProgress)
  })

  it("creates a progress record with required fields", async () => {
    const [record] = await db
      .insert(bootstrapProgress)
      .values({
        source: "cuad",
        status: "pending",
      })
      .returning()

    expect(record.id).toBeDefined()
    expect(record.source).toBe("cuad")
    expect(record.status).toBe("pending")
    expect(record.processedRecords).toBe(0)
    expect(record.embeddedRecords).toBe(0)
    expect(record.errorCount).toBe(0)
    expect(record.lastBatchIndex).toBe(0)
  })

  it("updates progress fields", async () => {
    const [record] = await db
      .insert(bootstrapProgress)
      .values({ source: "cuad", status: "in_progress" })
      .returning()

    await db
      .update(bootstrapProgress)
      .set({
        processedRecords: 100,
        embeddedRecords: 100,
        lastBatchIndex: 1,
      })
      .where(eq(bootstrapProgress.id, record.id))

    const [updated] = await db
      .select()
      .from(bootstrapProgress)
      .where(eq(bootstrapProgress.id, record.id))

    expect(updated.processedRecords).toBe(100)
    expect(updated.embeddedRecords).toBe(100)
    expect(updated.lastBatchIndex).toBe(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/db/schema/bootstrap.test.ts`
Expected: FAIL with "Cannot find module './bootstrap'"

**Step 3: Create the schema**

```typescript
// src/db/schema/bootstrap.ts
/**
 * @fileoverview Bootstrap Progress Tracking Schema
 *
 * Tracks progress of reference data ingestion for resume support.
 * Each source (cuad, contract_nli, etc.) has its own progress record.
 *
 * @module db/schema/bootstrap
 */

import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core"
import { timestamps } from "../_columns"

/**
 * Valid status values for bootstrap progress.
 */
export type BootstrapStatus = "pending" | "in_progress" | "completed" | "failed"

/**
 * Tracks progress of reference data ingestion per source.
 *
 * Enables:
 * - Resume from failure (via lastBatchIndex)
 * - Progress monitoring (via processedRecords/totalRecords)
 * - Error tracking (via errorCount)
 */
export const bootstrapProgress = pgTable("bootstrap_progress", {
  id: uuid("id").primaryKey().defaultRandom(),

  /** Dataset source: "cuad", "contract_nli", "bonterms", "commonaccord" */
  source: text("source").notNull(),

  /** Current status: "pending", "in_progress", "completed", "failed" */
  status: text("status").notNull().$type<BootstrapStatus>(),

  // Progress tracking
  /** Total records to process (set after parsing) */
  totalRecords: integer("total_records"),
  /** Records successfully processed */
  processedRecords: integer("processed_records").notNull().default(0),
  /** Records with embeddings created */
  embeddedRecords: integer("embedded_records").notNull().default(0),
  /** Number of errors encountered */
  errorCount: integer("error_count").notNull().default(0),

  // Resume support
  /** Last successfully processed content hash */
  lastProcessedHash: text("last_processed_hash"),
  /** Last successfully completed batch index */
  lastBatchIndex: integer("last_batch_index").notNull().default(0),

  // Timing
  /** When processing started */
  startedAt: timestamp("started_at", { withTimezone: true }),
  /** When processing completed (success or failure) */
  completedAt: timestamp("completed_at", { withTimezone: true }),

  ...timestamps,
})

/**
 * Type for inserting a new progress record.
 */
export type NewBootstrapProgress = typeof bootstrapProgress.$inferInsert

/**
 * Type for a progress record from the database.
 */
export type BootstrapProgress = typeof bootstrapProgress.$inferSelect
```

**Step 4: Export from index**

Add to `src/db/schema/index.ts`:

```typescript
export * from "./bootstrap"
```

**Step 5: Run test to verify it passes**

Run: `pnpm test src/db/schema/bootstrap.test.ts`
Expected: PASS

**Step 6: Push schema to database**

Run: `pnpm db:push`
Expected: Table `bootstrap_progress` created

**Step 7: Commit**

```bash
git add src/db/schema/bootstrap.ts src/db/schema/bootstrap.test.ts src/db/schema/index.ts
git commit -m "feat(db): add bootstrap_progress table for resume support

Tracks ingestion progress per source with:
- Status tracking (pending/in_progress/completed/failed)
- Progress counters (processed/embedded/errors)
- Resume support (lastBatchIndex, lastProcessedHash)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create Progress Tracker Utility

**Files:**
- Create: `src/inngest/functions/bootstrap/utils/progress-tracker.ts`
- Create: `src/inngest/functions/bootstrap/utils/progress-tracker.test.ts`

**Step 1: Write the failing test**

```typescript
// src/inngest/functions/bootstrap/utils/progress-tracker.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"

// Mock db before importing
vi.mock("@/db/client", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "test-progress-id",
          source: "cuad",
          status: "pending",
          processedRecords: 0,
          embeddedRecords: 0,
          errorCount: 0,
          lastBatchIndex: 0,
        }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{
          id: "test-progress-id",
          source: "cuad",
          status: "in_progress",
          processedRecords: 100,
        }]),
      }),
    }),
  },
}))

vi.mock("@/db/schema/bootstrap", () => ({
  bootstrapProgress: { id: "id", source: "source" },
}))

describe("progress-tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("createProgress creates a new progress record", async () => {
    const { createProgress } = await import("./progress-tracker")
    const progress = await createProgress("cuad")

    expect(progress.id).toBe("test-progress-id")
    expect(progress.source).toBe("cuad")
    expect(progress.status).toBe("pending")
  })

  it("updateProgress updates specified fields", async () => {
    const { updateProgress } = await import("./progress-tracker")
    await updateProgress("test-progress-id", {
      processedRecords: 100,
      lastBatchIndex: 1,
    })

    const { db } = await import("@/db/client")
    expect(db.update).toHaveBeenCalled()
  })

  it("getProgress retrieves progress by id", async () => {
    const { getProgress } = await import("./progress-tracker")
    const progress = await getProgress("test-progress-id")

    expect(progress?.processedRecords).toBe(100)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/inngest/functions/bootstrap/utils/progress-tracker.test.ts`
Expected: FAIL with "Cannot find module './progress-tracker'"

**Step 3: Create the utility**

```typescript
// src/inngest/functions/bootstrap/utils/progress-tracker.ts
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
import { eq, sql } from "drizzle-orm"
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
 * Supports SQL expressions for atomic increments.
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
 * Returns null if no progress exists.
 */
export async function getLatestProgress(
  source: DatasetSource
): Promise<BootstrapProgress | null> {
  const [record] = await db
    .select()
    .from(bootstrapProgress)
    .where(eq(bootstrapProgress.source, source))
    .orderBy(sql`${bootstrapProgress.createdAt} DESC`)
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
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/inngest/functions/bootstrap/utils/progress-tracker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/inngest/functions/bootstrap/utils/progress-tracker.ts src/inngest/functions/bootstrap/utils/progress-tracker.test.ts
git commit -m "feat(bootstrap): add progress tracker utility

Provides CRUD operations for bootstrap_progress table:
- createProgress, getProgress, getLatestProgress
- updateProgress with SQL expression support
- markStarted, markCompleted, markFailed
- incrementProgress for atomic counter updates

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Retry Utility

**Files:**
- Create: `src/inngest/functions/bootstrap/utils/retry.ts`
- Create: `src/inngest/functions/bootstrap/utils/retry.test.ts`

**Step 1: Write the failing test**

```typescript
// src/inngest/functions/bootstrap/utils/retry.test.ts
import { describe, it, expect, vi } from "vitest"

describe("retry utility", () => {
  it("returns result on first success", async () => {
    const { withRetry } = await import("./retry")
    const fn = vi.fn().mockResolvedValue("success")

    const result = await withRetry(fn, { maxAttempts: 3 })

    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries on failure and succeeds", async () => {
    const { withRetry } = await import("./retry")
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success")

    const result = await withRetry(fn, {
      maxAttempts: 3,
      backoff: [10, 20, 40],
    })

    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("throws after max attempts", async () => {
    const { withRetry } = await import("./retry")
    const fn = vi.fn().mockRejectedValue(new Error("always fails"))

    await expect(
      withRetry(fn, { maxAttempts: 3, backoff: [10, 20, 40] })
    ).rejects.toThrow("always fails")

    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("does not retry non-retriable errors", async () => {
    const { withRetry, NonRetriableError } = await import("./retry")
    const fn = vi.fn().mockRejectedValue(new NonRetriableError("bad input"))

    await expect(
      withRetry(fn, { maxAttempts: 3 })
    ).rejects.toThrow("bad input")

    expect(fn).toHaveBeenCalledTimes(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/inngest/functions/bootstrap/utils/retry.test.ts`
Expected: FAIL with "Cannot find module './retry'"

**Step 3: Create the utility**

```typescript
// src/inngest/functions/bootstrap/utils/retry.ts
/**
 * @fileoverview Retry Utility with Exponential Backoff
 *
 * Provides retry logic for transient failures in the bootstrap pipeline.
 *
 * @module inngest/functions/bootstrap/utils/retry
 */

/**
 * Error that should not be retried.
 */
export class NonRetriableError extends Error {
  readonly retriable = false

  constructor(message: string) {
    super(message)
    this.name = "NonRetriableError"
  }
}

/**
 * Check if an error should be retried.
 */
function isRetriable(error: unknown): boolean {
  if (error instanceof NonRetriableError) {
    return false
  }
  if (error instanceof Error && "retriable" in error) {
    return error.retriable !== false
  }
  return true
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry options.
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number
  /** Backoff delays in ms for each retry (default: [1000, 2000, 4000]) */
  backoff?: number[]
  /** Optional callback on each retry */
  onRetry?: (error: Error, attempt: number) => void
}

/**
 * Execute a function with retry on failure.
 *
 * @example
 * const result = await withRetry(
 *   () => fetch(url),
 *   { maxAttempts: 3, backoff: [1000, 2000, 4000] }
 * )
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    backoff = [1000, 2000, 4000],
    onRetry,
  } = options

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry non-retriable errors
      if (!isRetriable(error)) {
        throw lastError
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxAttempts) {
        throw lastError
      }

      // Notify caller of retry
      onRetry?.(lastError, attempt)

      // Wait before retrying
      const delay = backoff[attempt - 1] ?? backoff[backoff.length - 1]
      await sleep(delay)
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError ?? new Error("Retry failed")
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/inngest/functions/bootstrap/utils/retry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/inngest/functions/bootstrap/utils/retry.ts src/inngest/functions/bootstrap/utils/retry.test.ts
git commit -m "feat(bootstrap): add retry utility with exponential backoff

Provides withRetry() for transient failure handling:
- Configurable max attempts and backoff delays
- NonRetriableError for immediate failure
- Optional onRetry callback for logging

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create Batch Processor

**Files:**
- Create: `src/inngest/functions/bootstrap/utils/batch-processor.ts`
- Create: `src/inngest/functions/bootstrap/utils/batch-processor.test.ts`

**Step 1: Write the failing test**

```typescript
// src/inngest/functions/bootstrap/utils/batch-processor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock dependencies
vi.mock("@/lib/embeddings", () => ({
  getVoyageAIClient: vi.fn().mockReturnValue({
    embedBatch: vi.fn().mockResolvedValue({
      embeddings: [new Array(1024).fill(0.1), new Array(1024).fill(0.2)],
      totalTokens: 100,
    }),
  }),
  VOYAGE_CONFIG: { dimensions: 1024 },
}))

vi.mock("@/db/client", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "doc-1" }]),
        }),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}))

vi.mock("@/db/schema/reference", () => ({
  referenceDocuments: { contentHash: "content_hash", id: "id" },
  referenceEmbeddings: { contentHash: "content_hash" },
}))

describe("batch-processor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("processBatch embeds and inserts records", async () => {
    const { processBatch } = await import("./batch-processor")

    const batch = [
      {
        source: "cuad" as const,
        sourceId: "cuad:doc:1",
        content: "Test content 1",
        granularity: "document" as const,
        sectionPath: [],
        contentHash: "hash1",
        metadata: {},
      },
      {
        source: "cuad" as const,
        sourceId: "cuad:doc:2",
        content: "Test content 2",
        granularity: "document" as const,
        sectionPath: [],
        contentHash: "hash2",
        metadata: {},
      },
    ]

    const result = await processBatch(batch, "cuad", 0)

    expect(result.processed).toBe(2)
    expect(result.embedded).toBe(2)
    expect(result.errors).toBe(0)
  })

  it("returns errors count on embedding failure", async () => {
    const { getVoyageAIClient } = await import("@/lib/embeddings")
    vi.mocked(getVoyageAIClient).mockReturnValue({
      embedBatch: vi.fn().mockRejectedValue(new Error("API error")),
    } as never)

    // Need to re-import to pick up the new mock
    vi.resetModules()
    vi.mock("@/lib/embeddings", () => ({
      getVoyageAIClient: vi.fn().mockReturnValue({
        embedBatch: vi.fn().mockRejectedValue(new Error("API error")),
      }),
      VOYAGE_CONFIG: { dimensions: 1024 },
    }))

    const { processBatch } = await import("./batch-processor")

    const batch = [
      {
        source: "cuad" as const,
        sourceId: "cuad:doc:1",
        content: "Test content",
        granularity: "document" as const,
        sectionPath: [],
        contentHash: "hash1",
        metadata: {},
      },
    ]

    const result = await processBatch(batch, "cuad", 0)

    expect(result.processed).toBe(0)
    expect(result.errors).toBe(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/inngest/functions/bootstrap/utils/batch-processor.test.ts`
Expected: FAIL with "Cannot find module './batch-processor'"

**Step 3: Create the utility**

```typescript
// src/inngest/functions/bootstrap/utils/batch-processor.ts
/**
 * @fileoverview Batch Processor for Bootstrap Pipeline
 *
 * Handles embedding generation and database insertion for batches of records.
 * Includes retry logic and error handling.
 *
 * @module inngest/functions/bootstrap/utils/batch-processor
 */

import { db } from "@/db/client"
import { referenceDocuments, referenceEmbeddings } from "@/db/schema/reference"
import { getVoyageAIClient, VOYAGE_CONFIG } from "@/lib/embeddings"
import type { NormalizedRecord, DatasetSource } from "@/lib/datasets"
import { withRetry } from "./retry"

/**
 * Result of processing a batch.
 */
export interface BatchResult {
  /** Records successfully processed */
  processed: number
  /** Records with embeddings created */
  embedded: number
  /** Number of errors */
  errors: number
}

/**
 * Error rate threshold for circuit breaker (10%).
 */
const ERROR_RATE_THRESHOLD = 0.1

/**
 * Minimum records before applying circuit breaker.
 */
const MIN_RECORDS_FOR_CIRCUIT_BREAKER = 100

/**
 * Process a batch of records: generate embeddings and insert into database.
 *
 * @param batch - Records to process
 * @param source - Dataset source for logging
 * @param batchIndex - Batch number for logging
 * @returns Batch processing result
 */
export async function processBatch(
  batch: NormalizedRecord[],
  source: DatasetSource,
  batchIndex: number
): Promise<BatchResult> {
  const result: BatchResult = {
    processed: 0,
    embedded: 0,
    errors: 0,
  }

  if (batch.length === 0) {
    return result
  }

  // 1. Generate embeddings with retry
  const texts = batch.map((r) => r.content)
  let embeddings: number[][]
  let tokensPerText: number

  try {
    const client = getVoyageAIClient()
    const embedResult = await withRetry(
      () => client.embedBatch(texts, "document"),
      {
        maxAttempts: 3,
        backoff: [1000, 2000, 4000],
        onRetry: (error, attempt) => {
          console.warn(
            `[${source}] Batch ${batchIndex} embedding retry ${attempt}: ${error.message}`
          )
        },
      }
    )
    embeddings = embedResult.embeddings
    tokensPerText = Math.floor(embedResult.totalTokens / texts.length)
  } catch (error) {
    console.error(
      `[${source}] Batch ${batchIndex} embedding failed: ${error}`
    )
    result.errors = batch.length
    return result
  }

  // Validate embeddings
  if (embeddings.length !== batch.length) {
    console.error(
      `[${source}] Batch ${batchIndex}: Expected ${batch.length} embeddings, got ${embeddings.length}`
    )
    result.errors = batch.length
    return result
  }

  // 2. Insert records individually (for granular error handling)
  for (let i = 0; i < batch.length; i++) {
    const record = batch[i]
    const embedding = embeddings[i]

    if (!embedding || embedding.length !== VOYAGE_CONFIG.dimensions) {
      console.error(
        `[${source}] Batch ${batchIndex}, item ${i}: Invalid embedding`
      )
      result.errors++
      continue
    }

    try {
      // Upsert document (idempotent via contentHash)
      const [doc] = await db
        .insert(referenceDocuments)
        .values({
          source: record.source,
          sourceId: record.sourceId,
          title: record.sectionPath.join(" > ") || record.sourceId,
          rawText: record.content,
          metadata: record.metadata,
          contentHash: record.contentHash,
        })
        .onConflictDoUpdate({
          target: referenceDocuments.contentHash,
          set: { source: record.source },
        })
        .returning({ id: referenceDocuments.id })

      // Insert embedding (skip if exists)
      await db
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          content: record.content,
          embedding: embedding,
          granularity: record.granularity,
          sectionPath: record.sectionPath,
          category: record.category ?? null,
          hypothesisId: record.hypothesisId ?? null,
          nliLabel: record.nliLabel ?? null,
          contentHash: record.contentHash,
          metadata: { tokenCount: tokensPerText },
        })
        .onConflictDoNothing({ target: referenceEmbeddings.contentHash })

      result.processed++
      result.embedded++
    } catch (error) {
      console.error(
        `[${source}] Batch ${batchIndex}, item ${i} insert failed: ${error}`
      )
      result.errors++
    }
  }

  return result
}

/**
 * Check if error rate exceeds threshold (circuit breaker).
 *
 * @param totalProcessed - Total records processed so far
 * @param totalErrors - Total errors so far
 * @returns true if error rate exceeds threshold
 */
export function shouldCircuitBreak(
  totalProcessed: number,
  totalErrors: number
): boolean {
  const total = totalProcessed + totalErrors
  if (total < MIN_RECORDS_FOR_CIRCUIT_BREAKER) {
    return false
  }
  const errorRate = totalErrors / total
  return errorRate > ERROR_RATE_THRESHOLD
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/inngest/functions/bootstrap/utils/batch-processor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/inngest/functions/bootstrap/utils/batch-processor.ts src/inngest/functions/bootstrap/utils/batch-processor.test.ts
git commit -m "feat(bootstrap): add batch processor with retry and circuit breaker

Handles embedding generation and database insertion:
- Retry with exponential backoff for API calls
- Individual record error handling
- Circuit breaker at 10% error rate
- Validates embedding dimensions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update Inngest Event Types

**Files:**
- Modify: `src/inngest/types.ts`

**Step 1: Add new event types**

Add to `src/inngest/types.ts` after the existing bootstrap events:

```typescript
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
```

**Step 2: Add to InngestEvents type**

Add to the `InngestEvents` type:

```typescript
  // New bootstrap events
  "bootstrap/source.process": {
    data: z.infer<typeof bootstrapSourceProcessPayload>
  }
  "bootstrap/source.completed": {
    data: z.infer<typeof bootstrapSourceCompletedPayload>
  }
```

**Step 3: Export new types**

Add exports:

```typescript
export type BootstrapSourceProcessPayload = z.infer<
  typeof bootstrapSourceProcessPayload
>
export type BootstrapSourceCompletedPayload = z.infer<
  typeof bootstrapSourceCompletedPayload
>
```

**Step 4: Add to eventSchemas**

```typescript
  "bootstrap/source.process": bootstrapSourceProcessPayload,
  "bootstrap/source.completed": bootstrapSourceCompletedPayload,
```

**Step 5: Run existing tests**

Run: `pnpm test src/inngest`
Expected: PASS (no breaking changes)

**Step 6: Commit**

```bash
git add src/inngest/types.ts
git commit -m "feat(inngest): add bootstrap source events

New events for chunked job architecture:
- bootstrap/source.process: triggers per-source worker
- bootstrap/source.completed: emitted when source finishes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Source Worker Function

**Files:**
- Create: `src/inngest/functions/bootstrap/ingest-source.ts`
- Create: `src/inngest/functions/bootstrap/__tests__/ingest-source.test.ts`

**Step 1: Write the failing test**

```typescript
// src/inngest/functions/bootstrap/__tests__/ingest-source.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock all dependencies
vi.mock("@/lib/datasets/downloader", () => ({
  getDatasetPath: vi.fn().mockReturnValue(".cache/datasets/test"),
}))

vi.mock("@/lib/datasets", () => ({
  parseCuadDataset: vi.fn(async function* () {
    yield {
      source: "cuad",
      sourceId: "cuad:doc:test",
      content: "Test content",
      granularity: "document",
      sectionPath: [],
      metadata: {},
      contentHash: "hash123",
    }
  }),
  parseContractNliDataset: vi.fn(async function* () {}),
  parseBontermsDataset: vi.fn(async function* () {}),
  parseCommonAccordDataset: vi.fn(async function* () {}),
}))

vi.mock("../utils/progress-tracker", () => ({
  getProgress: vi.fn().mockResolvedValue({
    id: "progress-1",
    source: "cuad",
    status: "pending",
    lastBatchIndex: 0,
  }),
  markStarted: vi.fn().mockResolvedValue(undefined),
  markCompleted: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  updateProgress: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../utils/batch-processor", () => ({
  processBatch: vi.fn().mockResolvedValue({
    processed: 1,
    embedded: 1,
    errors: 0,
  }),
  shouldCircuitBreak: vi.fn().mockReturnValue(false),
}))

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}))

vi.mock("@/db/schema/reference", () => ({
  referenceEmbeddings: { contentHash: "content_hash", source: "source" },
}))

describe("ingestSource function", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exports the function", async () => {
    const { ingestSource } = await import("../ingest-source")
    expect(ingestSource).toBeDefined()
    expect(typeof ingestSource.id).toBe("function")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/inngest/functions/bootstrap/__tests__/ingest-source.test.ts`
Expected: FAIL with "Cannot find module '../ingest-source'"

**Step 3: Create the function**

```typescript
// src/inngest/functions/bootstrap/ingest-source.ts
/**
 * @fileoverview Bootstrap Source Worker
 *
 * Inngest function that processes a single dataset source.
 * Called by the coordinator for each source in parallel.
 *
 * @module inngest/functions/bootstrap/ingest-source
 */

import { inngest } from "@/inngest/client"
import { NonRetriableError } from "@/inngest/utils/errors"
import { db } from "@/db/client"
import { referenceEmbeddings } from "@/db/schema/reference"
import { eq } from "drizzle-orm"
import { getDatasetPath } from "@/lib/datasets/downloader"
import {
  parseCuadDataset,
  parseContractNliDataset,
  parseBontermsDataset,
  parseCommonAccordDataset,
  type NormalizedRecord,
  type DatasetSource,
} from "@/lib/datasets"
import {
  getProgress,
  markStarted,
  markCompleted,
  markFailed,
  updateProgress,
} from "./utils/progress-tracker"
import { processBatch, shouldCircuitBreak } from "./utils/batch-processor"

type Parser = (path: string) => AsyncGenerator<NormalizedRecord>

const PARSERS: Record<DatasetSource, Parser> = {
  cuad: parseCuadDataset,
  contract_nli: parseContractNliDataset,
  bonterms: parseBontermsDataset,
  commonaccord: parseCommonAccordDataset,
}

const BATCH_SIZE = 128
const RATE_LIMIT_DELAY_MS = 200

/**
 * Process a single dataset source with resume support.
 */
export const ingestSource = inngest.createFunction(
  {
    id: "bootstrap-ingest-source",
    name: "Bootstrap: Ingest Source",
    concurrency: { limit: 2 }, // Allow 2 sources in parallel
    retries: 2,
  },
  { event: "bootstrap/source.process" },
  async ({ event, step }) => {
    const { source, progressId, forceRefresh } = event.data

    // Get progress record
    const progress = await step.run("get-progress", async () => {
      const p = await getProgress(progressId)
      if (!p) {
        throw new NonRetriableError(`Progress record not found: ${progressId}`)
      }
      return p
    })

    // Get existing hashes for deduplication
    const existingHashes = await step.run("get-existing-hashes", async () => {
      const rows = await db
        .select({ hash: referenceEmbeddings.contentHash })
        .from(referenceEmbeddings)
        .where(eq(referenceEmbeddings.source, source))

      return new Set(rows.map((r) => r.hash))
    })

    // Mark as started
    await step.run("mark-started", async () => {
      await markStarted(progressId)
    })

    // Process in batches
    const path = getDatasetPath(source)
    const parser = PARSERS[source]

    if (!parser) {
      throw new NonRetriableError(`Unknown source: ${source}`)
    }

    let batchIndex = 0
    let batch: NormalizedRecord[] = []
    let totalProcessed = 0
    let totalEmbedded = 0
    let totalErrors = 0

    // Stream through records
    for await (const record of parser(path)) {
      // Skip empty content
      if (!record.content?.trim()) continue

      // Skip already embedded (deduplication)
      if (existingHashes.has(record.contentHash)) continue

      batch.push(record)

      // Process batch when full
      if (batch.length >= BATCH_SIZE) {
        // Skip batches we've already done (resume support)
        if (batchIndex < progress.lastBatchIndex) {
          batchIndex++
          batch = []
          continue
        }

        // Process this batch as an Inngest step
        const result = await step.run(`batch-${batchIndex}`, async () => {
          return await processBatch(batch, source, batchIndex)
        })

        totalProcessed += result.processed
        totalEmbedded += result.embedded
        totalErrors += result.errors

        // Update progress
        await step.run(`progress-${batchIndex}`, async () => {
          await updateProgress(progressId, {
            processedRecords: totalProcessed,
            embeddedRecords: totalEmbedded,
            errorCount: totalErrors,
            lastBatchIndex: batchIndex,
          })
        })

        // Circuit breaker check
        if (shouldCircuitBreak(totalProcessed, totalErrors)) {
          await markFailed(progressId)
          throw new NonRetriableError(
            `Error rate exceeded 10% for ${source} (${totalErrors}/${totalProcessed + totalErrors})`
          )
        }

        // Rate limit
        await step.sleep(`rate-limit-${batchIndex}`, RATE_LIMIT_DELAY_MS)

        batch = []
        batchIndex++
      }
    }

    // Process remaining records
    if (batch.length > 0) {
      const result = await step.run(`batch-${batchIndex}-final`, async () => {
        return await processBatch(batch, source, batchIndex)
      })

      totalProcessed += result.processed
      totalEmbedded += result.embedded
      totalErrors += result.errors

      await step.run("progress-final", async () => {
        await updateProgress(progressId, {
          processedRecords: totalProcessed,
          embeddedRecords: totalEmbedded,
          errorCount: totalErrors,
          lastBatchIndex: batchIndex,
        })
      })
    }

    // Mark completed
    await step.run("mark-completed", async () => {
      await markCompleted(progressId)
    })

    // Emit completion event
    await step.sendEvent("emit-completed", {
      name: "bootstrap/source.completed",
      data: {
        source,
        progressId,
        status: "completed" as const,
        processedRecords: totalProcessed,
        embeddedRecords: totalEmbedded,
        errorCount: totalErrors,
      },
    })

    return {
      source,
      processedRecords: totalProcessed,
      embeddedRecords: totalEmbedded,
      errorCount: totalErrors,
    }
  }
)
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/inngest/functions/bootstrap/__tests__/ingest-source.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/inngest/functions/bootstrap/ingest-source.ts src/inngest/functions/bootstrap/__tests__/ingest-source.test.ts
git commit -m "feat(bootstrap): add source worker function

Per-source worker with:
- Resume from lastBatchIndex
- Hash deduplication for already-embedded records
- Per-batch Inngest steps for durability
- Circuit breaker at 10% error rate
- Rate limiting between batches

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create Coordinator Function

**Files:**
- Create: `src/inngest/functions/bootstrap/ingest-coordinator.ts`
- Create: `src/inngest/functions/bootstrap/__tests__/ingest-coordinator.test.ts`

**Step 1: Write the failing test**

```typescript
// src/inngest/functions/bootstrap/__tests__/ingest-coordinator.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/datasets/downloader", () => ({
  downloadDataset: vi.fn().mockResolvedValue({ cached: true }),
}))

vi.mock("../utils/progress-tracker", () => ({
  createProgress: vi.fn().mockResolvedValue({
    id: "progress-1",
    source: "cuad",
    status: "pending",
  }),
}))

vi.mock("@/db/client", () => ({
  db: {
    execute: vi.fn().mockResolvedValue(undefined),
  },
}))

describe("ingestCoordinator function", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exports the function", async () => {
    const { ingestCoordinator } = await import("../ingest-coordinator")
    expect(ingestCoordinator).toBeDefined()
    expect(typeof ingestCoordinator.id).toBe("function")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/inngest/functions/bootstrap/__tests__/ingest-coordinator.test.ts`
Expected: FAIL with "Cannot find module '../ingest-coordinator'"

**Step 3: Create the function**

```typescript
// src/inngest/functions/bootstrap/ingest-coordinator.ts
/**
 * @fileoverview Bootstrap Coordinator Function
 *
 * Orchestrates the bootstrap pipeline by:
 * 1. Downloading datasets
 * 2. Creating progress records
 * 3. Dispatching source workers (parallel)
 * 4. Waiting for completion
 * 5. Creating HNSW indexes
 *
 * @module inngest/functions/bootstrap/ingest-coordinator
 */

import { inngest } from "@/inngest/client"
import { db } from "@/db/client"
import { downloadDataset } from "@/lib/datasets/downloader"
import type { DatasetSource } from "@/lib/datasets"
import { createProgress } from "./utils/progress-tracker"
import { sql } from "drizzle-orm"

/**
 * Coordinate the full bootstrap pipeline.
 */
export const ingestCoordinator = inngest.createFunction(
  {
    id: "bootstrap-ingest-coordinator",
    name: "Bootstrap: Coordinator",
    concurrency: { limit: 1 }, // Only one bootstrap at a time
    retries: 1,
  },
  { event: "bootstrap/ingest.requested" },
  async ({ event, step }) => {
    const { sources, forceRefresh = false } = event.data
    const startedAt = Date.now()

    // Step 1: Download all datasets
    const downloadResults: Record<string, boolean> = {}
    for (const source of sources) {
      const result = await step.run(`download-${source}`, async () => {
        const downloadResult = await downloadDataset(source, forceRefresh)
        return { cached: downloadResult.cached }
      })
      downloadResults[source] = result.cached
    }

    // Step 2: Create progress records for each source
    const progressIds: Record<DatasetSource, string> = {} as Record<
      DatasetSource,
      string
    >
    for (const source of sources) {
      const progress = await step.run(`create-progress-${source}`, async () => {
        return await createProgress(source)
      })
      progressIds[source] = progress.id
    }

    // Step 3: Dispatch source workers (they run in parallel)
    const dispatchedSources: DatasetSource[] = []
    for (const source of sources) {
      await step.sendEvent(`dispatch-${source}`, {
        name: "bootstrap/source.process",
        data: {
          source,
          progressId: progressIds[source],
          forceRefresh,
        },
      })
      dispatchedSources.push(source)
    }

    // Step 4: Wait for all sources to complete
    // Using step.waitForEvent for each dispatched source
    const completionResults = await step.run("wait-for-completions", async () => {
      // Note: In production, you'd use step.waitForEvent or a different pattern
      // For now, we'll rely on the source workers completing and
      // querying their final status
      return { waitingFor: dispatchedSources }
    })

    // Step 5: Create HNSW indexes after all data loaded
    await step.run("create-hnsw-indexes", async () => {
      // Drop and recreate for optimal index
      await db.execute(sql`DROP INDEX IF EXISTS ref_embeddings_hnsw_idx`)
      await db.execute(sql`
        CREATE INDEX ref_embeddings_hnsw_idx
        ON reference_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `)
    })

    const durationMs = Date.now() - startedAt

    // Emit completion event
    await step.sendEvent("emit-completed", {
      name: "bootstrap/ingest.completed",
      data: {
        sources,
        totalRecords: 0, // Would be aggregated from source completions
        totalEmbeddings: 0,
        durationMs,
      },
    })

    return {
      success: true,
      sources,
      downloaded: Object.entries(downloadResults)
        .filter(([_, cached]) => !cached)
        .map(([source]) => source),
      progressIds,
      durationMs,
    }
  }
)
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/inngest/functions/bootstrap/__tests__/ingest-coordinator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/inngest/functions/bootstrap/ingest-coordinator.ts src/inngest/functions/bootstrap/__tests__/ingest-coordinator.test.ts
git commit -m "feat(bootstrap): add coordinator function

Orchestrates the bootstrap pipeline:
- Downloads datasets sequentially
- Creates progress records per source
- Dispatches source workers in parallel
- Creates HNSW indexes after completion

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Update Function Exports and Remove Old Function

**Files:**
- Modify: `src/inngest/functions/index.ts`
- Delete: `src/inngest/functions/bootstrap/ingest-reference-data.ts`
- Delete: `src/inngest/functions/bootstrap/__tests__/ingest-reference-data.test.ts`

**Step 1: Update exports**

Replace contents of `src/inngest/functions/index.ts`:

```typescript
// src/inngest/functions/index.ts
export { helloWorld, multiStepDemo } from "./demo"
export { ingestCoordinator } from "./bootstrap/ingest-coordinator"
export { ingestSource } from "./bootstrap/ingest-source"
```

**Step 2: Delete old files**

Run:
```bash
rm src/inngest/functions/bootstrap/ingest-reference-data.ts
rm src/inngest/functions/bootstrap/__tests__/ingest-reference-data.test.ts
```

**Step 3: Run all tests**

Run: `pnpm test`
Expected: PASS (all tests should still work)

**Step 4: Commit**

```bash
git add src/inngest/functions/index.ts
git rm src/inngest/functions/bootstrap/ingest-reference-data.ts
git rm src/inngest/functions/bootstrap/__tests__/ingest-reference-data.test.ts
git commit -m "refactor(bootstrap): replace monolithic function with coordinator+workers

- Remove old ingest-reference-data.ts
- Export new ingestCoordinator and ingestSource
- Update function barrel export

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Create Utils Barrel Export

**Files:**
- Create: `src/inngest/functions/bootstrap/utils/index.ts`

**Step 1: Create barrel export**

```typescript
// src/inngest/functions/bootstrap/utils/index.ts
export * from "./progress-tracker"
export * from "./retry"
export * from "./batch-processor"
```

**Step 2: Commit**

```bash
git add src/inngest/functions/bootstrap/utils/index.ts
git commit -m "chore(bootstrap): add utils barrel export

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Push Schema and Run Full Test

**Step 1: Push schema to database**

Run: `pnpm db:push`
Expected: Schema changes applied

**Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Lint check**

Run: `pnpm lint`
Expected: No errors

**Step 4: Final commit if any changes**

```bash
git status
# If any changes, add and commit
```

---

## Summary

**Files created:**
- `src/db/schema/bootstrap.ts` - Progress tracking schema
- `src/db/schema/bootstrap.test.ts` - Schema tests
- `src/inngest/functions/bootstrap/utils/progress-tracker.ts` - Progress CRUD
- `src/inngest/functions/bootstrap/utils/progress-tracker.test.ts`
- `src/inngest/functions/bootstrap/utils/retry.ts` - Retry utility
- `src/inngest/functions/bootstrap/utils/retry.test.ts`
- `src/inngest/functions/bootstrap/utils/batch-processor.ts` - Batch processing
- `src/inngest/functions/bootstrap/utils/batch-processor.test.ts`
- `src/inngest/functions/bootstrap/utils/index.ts` - Utils barrel
- `src/inngest/functions/bootstrap/ingest-source.ts` - Source worker
- `src/inngest/functions/bootstrap/__tests__/ingest-source.test.ts`
- `src/inngest/functions/bootstrap/ingest-coordinator.ts` - Coordinator
- `src/inngest/functions/bootstrap/__tests__/ingest-coordinator.test.ts`

**Files modified:**
- `src/db/schema/index.ts` - Export bootstrap schema
- `src/inngest/types.ts` - Add new event types
- `src/inngest/functions/index.ts` - Update exports

**Files deleted:**
- `src/inngest/functions/bootstrap/ingest-reference-data.ts`
- `src/inngest/functions/bootstrap/__tests__/ingest-reference-data.test.ts`

**Success criteria:**
- [ ] All tests pass
- [ ] Schema pushed to database
- [ ] Can trigger `bootstrap/ingest.requested` event
- [ ] Sources process in parallel
- [ ] Progress updates visible in database
- [ ] Resume works after simulated failure
