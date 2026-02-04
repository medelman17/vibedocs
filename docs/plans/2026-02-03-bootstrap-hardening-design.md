# Bootstrap Pipeline Hardening Design

> **Status:** ✅ COMPLETE (audited 2026-02-04)
>
> All tasks implemented. See inngest/ and agents/ directories.

**Date:** 2026-02-03
**Author:** Claude + Mike

---

## Problem Statement

The current bootstrap pipeline is brittle when processing ~24,000 records:

- **Long duration:** ~60-90 minutes of continuous operation
- **No resume:** Failures require starting from scratch
- **Monolithic:** One function processes everything sequentially
- **Error accumulation:** Small errors compound over time

### Audit Results

| Component | Status | Notes |
|-----------|--------|-------|
| Parsers | ✅ Working | 24K records, ~150MB memory |
| Embeddings | ✅ Working | ~12s/batch (128 texts) |
| Database | ✅ Working | ~60ms/insert |

The components work individually; the brittleness is in orchestration.

---

## Solution: Chunked Jobs + Resumable State

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  bootstrap/ingest.requested                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Coordinator Function                             │  │
│  │  - Creates progress records                       │  │
│  │  - Dispatches source jobs (parallel)             │  │
│  │  - Waits for completion                           │  │
│  │  - Creates HNSW indexes                           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ bootstrap/      │ │ bootstrap/      │ │ bootstrap/      │
│ source.process  │ │ source.process  │ │ source.process  │
│ (cuad)          │ │ (contract_nli)  │ │ (bonterms)      │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

**Key properties:**
- Parallel by source (CUAD + ContractNLI run simultaneously)
- Independent failures (one source failing doesn't stop others)
- Resumable (each source checks progress table on start)
- Smaller blast radius (one batch fails, not the whole pipeline)

---

## Progress Tracking Schema

```typescript
// src/db/schema/bootstrap.ts
export const bootstrapProgress = pgTable("bootstrap_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),           // "cuad", "contract_nli", etc.
  status: text("status").notNull(),           // "pending", "in_progress", "completed", "failed"

  // Progress tracking
  totalRecords: integer("total_records"),
  processedRecords: integer("processed_records").default(0),
  embeddedRecords: integer("embedded_records").default(0),
  errorCount: integer("error_count").default(0),

  // Resume support
  lastProcessedHash: text("last_processed_hash"),
  lastBatchIndex: integer("last_batch_index").default(0),

  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),

  ...timestamps,
})
```

---

## Resume Logic

Two-layer deduplication for fast resume:

1. **Hash check:** Query existing `contentHash` values from `reference_embeddings`
2. **Batch index:** Skip batches below `lastBatchIndex` (faster than re-checking hashes)

```typescript
async function processSource(source: DatasetSource, progressId: string) {
  const progress = await getProgress(progressId)

  // Get already-embedded hashes (one indexed query)
  const existingHashes = new Set(
    await getExistingHashes(source)
  )

  let batchIndex = 0
  let batch: NormalizedRecord[] = []

  for await (const record of parser(path)) {
    if (!record.content?.trim()) continue
    if (existingHashes.has(record.contentHash)) continue

    batch.push(record)

    if (batch.length >= BATCH_SIZE) {
      // Skip already-completed batches
      if (batchIndex < progress.lastBatchIndex) {
        batchIndex++
        batch = []
        continue
      }

      await step.run(`batch-${batchIndex}`, () => processBatch(batch))
      await updateProgress(progressId, { lastBatchIndex: batchIndex })

      batchIndex++
      batch = []
    }
  }
}
```

### Resume Scenarios

| Scenario | Behavior |
|----------|----------|
| Fresh start | `existingHashes` empty, process all |
| Partial completion | Skip hashes that exist, resume from `lastBatchIndex` |
| Re-run after success | All hashes exist, nothing to do |
| New records added | Only new hashes get processed |

---

## Error Handling Strategy

### Per-Batch Handling

```typescript
async function processBatch(batch, source, batchIndex, progressId) {
  // 1. Embedding - retry transient errors
  let embeddings
  try {
    embeddings = await withRetry(
      () => voyageClient.embedBatch(batch.map(r => r.content)),
      { maxAttempts: 3, backoff: [1000, 2000, 4000] }
    )
  } catch (error) {
    await updateProgress(progressId, { errorCount: sql`error_count + ${batch.length}` })
    return { processed: 0, embedded: 0, errors: batch.length }
  }

  // 2. Insert - individual failures don't fail batch
  for (let i = 0; i < batch.length; i++) {
    try {
      await insertRecord(batch[i], embeddings[i])
      result.processed++
    } catch (error) {
      result.errors++
    }
  }

  // 3. Update progress
  await updateProgress(progressId, { lastBatchIndex: batchIndex, ... })

  return result
}
```

### Error Response Matrix

| Error Type | Response |
|------------|----------|
| Voyage API timeout | Retry 3x with backoff |
| Voyage API rate limit | Retry with longer delay |
| Voyage API auth error | Fail immediately (NonRetriableError) |
| DB connection drop | Inngest auto-retries the step |
| Single insert fails | Log, increment error count, continue |
| Error rate >10% | Mark source as "failed", stop |

### Circuit Breaker

```typescript
const errorRate = result.errors / (result.processed + result.errors)
if (errorRate > 0.1 && result.processed > 100) {
  throw new NonRetriableError(
    `Error rate ${(errorRate * 100).toFixed(1)}% exceeds 10% threshold`
  )
}
```

---

## File Structure

```
src/
├── db/schema/
│   └── bootstrap.ts              # New: progress tracking table
├── inngest/functions/bootstrap/
│   ├── ingest-coordinator.ts     # New: orchestrates sources
│   ├── ingest-source.ts          # New: processes one source
│   ├── ingest-reference-data.ts  # Delete (replaced by above)
│   └── utils/
│       ├── batch-processor.ts    # New: shared batch logic
│       ├── progress-tracker.ts   # New: progress DB operations
│       └── retry.ts              # New: retry with backoff
└── lib/datasets/
    └── (unchanged)
```

---

## Events

```typescript
// Coordinator triggers
"bootstrap/ingest.requested"      // Start full bootstrap
"bootstrap/ingest.resume"         // Resume failed bootstrap

// Coordinator dispatches
"bootstrap/source.process"        // Process one source
  { source: "cuad", progressId: "uuid", forceRefresh: false }

// Progress events (for UI)
"bootstrap/source.progress"       // Batch completed
"bootstrap/source.completed"      // Source done
"bootstrap/ingest.completed"      // All sources done
```

---

## Timing Estimates

| Source | Records | Batches | Time |
|--------|---------|---------|------|
| CUAD | 14,084 | 110 | ~25 min |
| ContractNLI | 10,178 | 80 | ~18 min |
| Bonterms | 9 | 1 | ~15 sec |
| CommonAccord | 78 | 1 | ~15 sec |

**With parallelism:** ~25 minutes total (CUAD + ContractNLI run simultaneously)

---

## Implementation Tasks

1. Create `bootstrap_progress` schema and push to DB
2. Create `progress-tracker.ts` utility
3. Create `retry.ts` utility with exponential backoff
4. Create `batch-processor.ts` with error handling
5. Create `ingest-source.ts` worker function
6. Create `ingest-coordinator.ts` orchestrator
7. Update Inngest event types
8. Delete old `ingest-reference-data.ts`
9. Add integration tests
10. Test full pipeline end-to-end

---

## Success Criteria

- [ ] Full bootstrap completes in <30 minutes
- [ ] Can resume from any failure point
- [ ] Error rate <1% for clean data
- [ ] Progress visible via events
- [ ] HNSW indexes created after completion
