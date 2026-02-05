# Phase 9: Pipeline Orchestration - Research

**Researched:** 2026-02-05
**Domain:** Inngest durable workflows, pipeline orchestration, cancellation, progress tracking
**Confidence:** HIGH

## Summary

This phase wraps the existing four agents (parser, classifier, risk scorer, gap analyst) into a fully resilient Inngest pipeline with fine-grained progress tracking, event-based cancellation, rate limit awareness, and developer tooling. The existing `analyze-nda.ts` already implements the complete sequential flow -- this phase hardens it with cancellation support, chunk-level progress granularity, resumability from failed steps, and a debug/testing panel.

The codebase already has substantial infrastructure: typed event schemas (`inngest/types.ts`), rate limiting utilities (`inngest/utils/rate-limit.ts`), concurrency configuration (`inngest/utils/concurrency.ts`), tenant context management, and a polling-based progress hook (`hooks/use-analysis-progress.ts`). The primary work is:
1. Adding `cancelOn` configuration and a cancellation cleanup handler
2. Extending progress tracking from stage-level to chunk-level granularity
3. Adding a "cancelled" analysis status and resume capability
4. Building sample NDAs and a debug panel for testing
5. Fixing duplicate step ID bugs in the current emitProgress helper

**Primary recommendation:** Use Inngest's declarative `cancelOn` with the existing `nda/analysis.cancelled` event, add an `inngest/function.cancelled` cleanup handler, extend the DB schema with a `cancelled` status and `progressMessage` text column, and fix the step ID naming scheme for sub-stage progress updates.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| inngest | ^3.x | Durable workflow orchestration | Already in use; provides step.run, cancelOn, step.sleep, step.sendEvent |
| drizzle-orm | ^0.38.x | Database queries for progress/status | Already in use for all DB operations |
| zod | ^3.24.x | Event payload validation | Already in use for all schemas |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ms | built-in to inngest | Duration string parsing | Used by step.sleep, cancelOn timeout |
| nanoid | ^5.x | Unique ID generation | Already available for step IDs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cancelOn (declarative) | REST API cancellation | REST is imperative and requires API keys; cancelOn is event-driven and fits the existing architecture |
| DB polling for progress | Server-Sent Events (SSE) | SSE is better UX but deferred to later; DB polling already works via useAnalysisProgress |
| LRU cache for queue position | DB query | DB query is simpler and more accurate for MVP |

**Installation:** No new packages needed. All required dependencies are already installed.

## Architecture Patterns

### Current Project Structure (Relevant Files)
```
inngest/
├── client.ts                        # Inngest client singleton
├── index.ts                         # Barrel (lightweight exports only)
├── types.ts                         # Event schemas (already has cancelled events)
├── functions/
│   ├── index.ts                     # Function registry (serve handler import)
│   ├── analyze-nda.ts               # Main pipeline (modify)
│   ├── analyze-nda.test.ts          # Tests (extend)
│   ├── rescore-analysis.ts          # Re-scoring function (reference)
│   ├── ocr-document.ts              # OCR function (reference)
│   └── [NEW] cleanup-cancelled.ts   # Cancellation cleanup handler
├── utils/
│   ├── rate-limit.ts                # Rate limiting (extend)
│   ├── concurrency.ts               # Concurrency config (extend)
│   ├── errors.ts                    # Error classes
│   └── tenant-context.ts            # Tenant isolation
db/schema/
│   └── analyses.ts                  # Add 'cancelled' status, progressMessage
hooks/
│   └── use-analysis-progress.ts     # Extend for chunk-level detail
app/(main)/(dashboard)/analyses/
│   └── actions.ts                   # Extend cancelAnalysis, add resume
components/
│   └── [NEW] debug/                 # Debug panel components
lib/
│   └── [NEW] sample-ndas/           # Sample NDA documents
```

### Pattern 1: Declarative Cancellation via cancelOn
**What:** Use Inngest's `cancelOn` to listen for `nda/analysis.cancelled` events and automatically stop the pipeline.
**When to use:** Any long-running function that users should be able to cancel.
**Example:**
```typescript
// Source: Inngest docs (Context7) - verified HIGH confidence
export const analyzeNda = inngest.createFunction(
  {
    id: 'analyze-nda',
    name: 'NDA Analysis Pipeline',
    concurrency: CONCURRENCY.analysis,
    retries: RETRY_CONFIG.default.retries,
    cancelOn: [{
      event: 'nda/analysis.cancelled',
      if: 'async.data.analysisId == event.data.analysisId',
    }],
  },
  { event: 'nda/analysis.requested' },
  async ({ event, step }) => {
    // ... pipeline steps
  }
)
```

**Critical behavior (verified via official docs):** When a function is cancelled via `cancelOn`, any *currently executing* step runs to completion. Only future steps are prevented from starting. This means partial results from completed steps are naturally preserved in the database.

### Pattern 2: Cancellation Cleanup via System Event
**What:** Listen for `inngest/function.cancelled` system event to update the analysis status to "cancelled" and clean up.
**When to use:** After any pipeline cancellation to ensure DB state is consistent.
**Example:**
```typescript
// Source: Inngest docs - inngest/function.cancelled system event
export const cleanupCancelledAnalysis = inngest.createFunction(
  {
    id: 'cleanup-cancelled-analysis',
    name: 'Cleanup After Cancelled Analysis',
    retries: RETRY_CONFIG.nonCritical.retries,
  },
  { event: 'inngest/function.cancelled' },
  async ({ event, step }) => {
    // Filter for analyze-nda function only
    if (event.data.function_id !== 'analyze-nda') return

    const originalEvent = event.data.event // The triggering event payload
    const { analysisId, tenantId } = originalEvent.data

    await step.run('mark-cancelled', async () => {
      // Update analysis status to 'cancelled' (not 'failed')
      await withTenantContext(tenantId, async (ctx) => {
        await ctx.db
          .update(analyses)
          .set({
            status: 'cancelled',
            progressStage: 'cancelled',
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || '{"cancelledAt": "${new Date().toISOString()}"}'::jsonb`,
          })
          .where(eq(analyses.id, analysisId))
      })
    })
  }
)
```

### Pattern 3: Unique Step IDs for Sub-Stage Progress
**What:** Use monotonically increasing counters or composite IDs for progress steps to avoid duplicate step ID conflicts.
**When to use:** Any time a progress update can be called multiple times for the same stage.
**Example:**
```typescript
// BAD: Duplicate step IDs when emitProgress('chunking', ...) called twice
await step.run(`update-progress-${stage}`, ...)

// GOOD: Include sub-step identifier for uniqueness
let progressCounter = 0
const emitProgress = async (stage, progress, message) => {
  const stepSuffix = `${stage}-${progressCounter++}`
  await step.run(`update-progress-${stepSuffix}`, async () => {
    await ctx.db.update(analyses).set({
      progressStage: stage,
      progressPercent: progress,
      progressMessage: message, // NEW column
    }).where(eq(analyses.id, analysisId))
  })
  await step.sendEvent(`emit-progress-${stepSuffix}`, {
    name: 'nda/analysis.progress',
    data: { ... }
  })
}
```

### Pattern 4: Resumable Pipeline with Step Memoization
**What:** Inngest's step.run() memoizes results. On retry/resume, completed steps return their cached result instantly, and execution picks up at the first uncompleted step.
**When to use:** This is automatic behavior of Inngest. The key insight is that the existing pipeline is already resumable because each step persists its results to the DB AND Inngest memoizes step outputs.
**Example:**
```typescript
// When pipeline resumes after failure:
// 1. step.run('parser-agent') -> returns memoized result (instant)
// 2. step.run('chunk-document') -> returns memoized result (instant)
// 3. step.run('classifier-agent') -> FAILS -> throws error
// On retry:
// 1-2 skip (memoized), 3 re-executes
```

### Pattern 5: Queue Position via Concurrency Metadata
**What:** Query active + queued analysis count per tenant to show queue position.
**When to use:** When rate limits or concurrency limits cause delays.
**Example:**
```typescript
export async function getQueuePosition(analysisId: string): Promise<number> {
  const { db, tenantId } = await withTenant()
  const pending = await db
    .select({ count: count() })
    .from(analyses)
    .where(and(
      eq(analyses.tenantId, tenantId),
      inArray(analyses.status, ['pending', 'processing']),
    ))
  // Position is count of analyses ahead of this one
  return pending[0]?.count ?? 0
}
```

### Anti-Patterns to Avoid
- **Creating new step IDs dynamically from user input:** Step IDs must be deterministic and stable across retries. Never use timestamps, random values, or user-provided strings in step IDs.
- **Calling emitProgress with same stage twice without unique suffix:** Current code calls `emitProgress('chunking', ...)` twice, which creates duplicate step IDs `update-progress-chunking` and `emit-progress-chunking`. This is a BUG that must be fixed.
- **Putting cleanup logic inside the cancelled function:** When a function is cancelled, remaining steps don't execute. Use the `inngest/function.cancelled` system event instead.
- **Using the Inngest REST API for cancellation in the happy path:** Use `cancelOn` (declarative) for event-driven cancellation. Reserve the REST API for admin/emergency bulk cancellation only.
- **Heavy imports in the cancellation cleanup function:** The cleanup function is lightweight (just a DB update). Don't import agents, PDF libraries, etc.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Function cancellation | Custom cancellation flag polling | Inngest `cancelOn` + `inngest/function.cancelled` | Inngest handles cancellation atomically; polling is racy and unreliable |
| Step retry/resumability | Custom retry logic with exponential backoff | Inngest `step.run()` memoization + built-in retries | Inngest serializes step results and auto-retries; hand-rolled retry loses state |
| Rate limit enforcement | Token bucket / leaky bucket | `step.sleep()` with `getRateLimitDelay()` | Already implemented; Inngest handles sleep durably (survives restarts) |
| Progress persistence | Custom event bus | DB column + Inngest `step.sendEvent()` | DB is source of truth for page reloads; events for real-time (future SSE) |
| Concurrency limiting | Custom queue/lock | Inngest `concurrency` config with `key` | Inngest manages per-key queues atomically; custom locks are fragile in serverless |

**Key insight:** Inngest provides all the infrastructure for durable execution, cancellation, and concurrency. The work here is integration and UX, not building orchestration primitives.

## Common Pitfalls

### Pitfall 1: Duplicate Step IDs
**What goes wrong:** Inngest step IDs must be unique within a function execution. If you call `step.run('update-progress-chunking', ...)` twice, the second call returns the memoized result of the first instead of executing.
**Why it happens:** The current `emitProgress` helper constructs step IDs from stage name only, not from a unique counter.
**How to avoid:** Add a monotonic counter or sub-step identifier to all step IDs within emitProgress.
**Warning signs:** Progress appears to "skip" stages or show stale messages.

### Pitfall 2: Cancelled Step Still Runs to Completion
**What goes wrong:** When `cancelOn` fires, the currently executing step.run() continues to completion. Only subsequent steps are prevented. If the current step is a Claude API call taking 30 seconds, that call completes and its cost is incurred.
**Why it happens:** This is by design in Inngest -- steps are atomic units of work.
**How to avoid:** Accept this behavior. Don't try to abort in-progress API calls. The cost of one extra API call is acceptable. Document this for users: "Cancellation takes effect between pipeline stages."
**Warning signs:** Users complain that cancellation didn't happen "instantly."

### Pitfall 3: cancelOn Match Expression Syntax
**What goes wrong:** The `if` expression in `cancelOn` uses CEL (Common Expression Language) syntax, where `event` refers to the ORIGINAL triggering event and `async` refers to the cancellation event.
**Why it happens:** The naming is counterintuitive -- `event` is the trigger, `async` is the incoming cancel event.
**How to avoid:** Always use this pattern: `"async.data.analysisId == event.data.analysisId"` where `async` is the cancel event being matched.
**Warning signs:** Cancellation events fire but don't cancel the right function run.

### Pitfall 4: Analysis Status "failed" vs "cancelled"
**What goes wrong:** Currently, cancellation sets status to "failed", making it indistinguishable from actual failures.
**Why it happens:** The DB schema doesn't have a "cancelled" status value.
**How to avoid:** Add "cancelled" to the analysis status enum. Update the `cancelAnalysis` server action and the `inngest/function.cancelled` handler to use it.
**Warning signs:** Dashboard shows cancelled analyses as "failed," confusing users.

### Pitfall 5: Missing inngestRunId for REST API Cancellation
**What goes wrong:** The current `triggerAnalysis` action sets `inngestRunId: 'pending_${Date.now()}'` which is a placeholder, not a real Inngest run ID.
**Why it happens:** The real run ID is assigned by Inngest when the function starts, not when the event is sent.
**How to avoid:** Capture the actual run ID inside the function and persist it. The function receives the run ID via the context. Alternatively, rely on `cancelOn` (event-based) rather than REST API cancellation.
**Warning signs:** `cancelAnalysis` tries to use inngestRunId but it's just a placeholder string.

### Pitfall 6: Barrel Export Trap for New Functions
**What goes wrong:** Adding the cleanup function to the barrel export could pull in heavy dependencies.
**Why it happens:** See CLAUDE.md barrel export anti-pattern documentation.
**How to avoid:** Add new functions to `inngest/functions/index.ts` ONLY. Never re-export from `inngest/index.ts`. The cleanup function is lightweight (just drizzle queries) so it's safe for the functions barrel.
**Warning signs:** Production crash with `DOMMatrix is not defined` or similar browser-only API errors.

### Pitfall 7: Progress Message Column vs JSONB
**What goes wrong:** Storing detailed progress messages in the existing `metadata` JSONB column makes querying slow and schema unclear.
**Why it happens:** Temptation to avoid schema migrations.
**How to avoid:** Add a dedicated `progressMessage` text column to the analyses table for the human-readable progress string (e.g., "Scoring clause 7 of 15..."). Keep it separate from metadata JSONB.
**Warning signs:** Complex JSONB extraction queries in the progress polling endpoint.

## Code Examples

### Example 1: cancelOn Configuration for analyze-nda
```typescript
// Source: Inngest docs + existing analyze-nda.ts
export const analyzeNda = inngest.createFunction(
  {
    id: 'analyze-nda',
    name: 'NDA Analysis Pipeline',
    concurrency: CONCURRENCY.analysis,
    retries: RETRY_CONFIG.default.retries,
    cancelOn: [{
      event: 'nda/analysis.cancelled',
      // async = the cancel event, event = the original trigger
      if: 'async.data.analysisId == event.data.analysisId',
    }],
  },
  { event: 'nda/analysis.requested' },
  async ({ event, step }) => {
    // existing pipeline logic...
  }
)
```

### Example 2: Cancel Analysis Server Action (Updated)
```typescript
// Source: existing analyses/actions.ts - extend
export async function cancelAnalysis(analysisId: string): Promise<ApiResponse<void>> {
  const { db, tenantId } = await withTenant()

  // Validate & fetch current status
  const analysis = await db.query.analyses.findFirst({
    where: and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId)),
    columns: { id: true, status: true },
  })

  if (!analysis) return err("NOT_FOUND", "Analysis not found")
  if (!['pending', 'processing'].includes(analysis.status)) {
    return err("CONFLICT", `Cannot cancel analysis with status: ${analysis.status}`)
  }

  // Send cancellation event (triggers cancelOn in analyze-nda)
  await inngest.send({
    name: 'nda/analysis.cancelled',
    data: {
      analysisId,
      tenantId,
      reason: 'user_cancelled',
    },
  })

  // Optimistically update status (cleanup handler also updates)
  await db.update(analyses).set({
    status: 'cancelled',
    updatedAt: new Date(),
  }).where(eq(analyses.id, analysisId))

  return ok(undefined)
}
```

### Example 3: Chunk-Level Progress Emission
```typescript
// Inside classifier step, emit per-batch progress
const totalBatches = Math.ceil(chunks.length / CLASSIFIER_BATCH_SIZE)
for (let batch = 0; batch < totalBatches; batch++) {
  const batchChunks = chunks.slice(
    batch * CLASSIFIER_BATCH_SIZE,
    (batch + 1) * CLASSIFIER_BATCH_SIZE
  )

  const batchResult = await step.run(`classify-batch-${batch}`, () =>
    runClassifierBatch(batchChunks, budgetTracker)
  )

  // Chunk-level progress: "Classifying clause 7 of 15..."
  const processed = Math.min((batch + 1) * CLASSIFIER_BATCH_SIZE, chunks.length)
  await emitProgress(
    'classifying',
    40 + Math.round((processed / chunks.length) * 20), // 40-60%
    `Classifying clause ${processed} of ${chunks.length}...`,
    `classifying-batch-${batch}` // unique sub-step suffix
  )

  if (batch < totalBatches - 1) {
    await step.sleep(`rate-limit-classify-${batch}`, getRateLimitDelay('claude'))
  }
}
```

### Example 4: Resume Analysis Server Action
```typescript
export async function resumeAnalysis(analysisId: string): Promise<ApiResponse<Analysis>> {
  const { db, tenantId } = await withTenant()

  const analysis = await db.query.analyses.findFirst({
    where: and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId)),
    columns: { id: true, status: true, documentId: true },
  })

  if (!analysis) return err("NOT_FOUND", "Analysis not found")
  if (!['cancelled', 'failed'].includes(analysis.status)) {
    return err("CONFLICT", `Cannot resume analysis with status: ${analysis.status}`)
  }

  // Reset to processing and re-send event
  // Inngest step memoization means completed steps replay instantly
  await db.update(analyses).set({
    status: 'processing',
    progressStage: 'parsing', // Will skip to first incomplete step
    updatedAt: new Date(),
  }).where(eq(analyses.id, analysisId))

  await inngest.send({
    name: 'nda/analysis.requested',
    data: {
      tenantId,
      documentId: analysis.documentId,
      analysisId: analysis.id,
      source: 'web-upload',
    },
  })

  return ok(analysis)
}
```

### Example 5: Debug Panel Data Structure
```typescript
// Types for the debug panel
interface PipelineDebugInfo {
  analysisId: string
  steps: PipelineStep[]
  totalDurationMs: number
  tokenUsage: {
    parser: { input: number; output: number }
    classifier: { input: number; output: number }
    riskScorer: { input: number; output: number }
    gapAnalyst: { input: number; output: number }
    total: { input: number; output: number; estimatedCost: number }
  }
}

interface PipelineStep {
  name: string
  status: 'completed' | 'running' | 'pending' | 'failed' | 'skipped'
  startedAt?: string
  completedAt?: string
  durationMs?: number
  output?: unknown  // Raw AI output for inspection
  error?: string
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| REST API cancellation | `cancelOn` event-based | Inngest v3+ | Declarative, no API keys needed, event-driven |
| Manual progress polling | DB column + future SSE | Current | DB is fallback; SSE deferred but architecture supports it |
| Separate retry logic | `step.run()` memoization | Inngest core feature | Steps are automatically idempotent and retriable |
| Custom queue implementation | Inngest `concurrency` config | Inngest core feature | Per-tenant queuing is configuration, not code |

**Deprecated/outdated:**
- `inngest.cancel(runId)`: While the REST API exists, it requires signing keys and is mainly for bulk/admin operations. Prefer `cancelOn` for user-initiated cancellation.

## Codebase Findings (Project-Specific)

### Existing Infrastructure That Phase 9 Builds On
1. **Event schemas already defined:** `nda/analysis.cancelled`, `nda/analysis.progress`, `nda/analysis.completed` all exist in `inngest/types.ts`
2. **Progress polling hook exists:** `hooks/use-analysis-progress.ts` polls every 2s via `getAnalysisStatus` server action
3. **Progress columns exist:** `progressStage` (text) and `progressPercent` (integer) already in analyses schema
4. **Concurrency config exists:** `CONCURRENCY.analysis = { limit: 5, key: 'event.data.tenantId' }` in `inngest/utils/concurrency.ts`
5. **Rate limit delays exist:** `getRateLimitDelay('claude')` and `getRateLimitDelay('voyageAi')` in `inngest/utils/rate-limit.ts`
6. **Cancellation action exists (partial):** `cancelAnalysis` in analyses actions has a TODO for Inngest cancellation
7. **Analysis view exists:** `components/artifact/analysis-view.tsx` with progress display

### Bugs to Fix
1. **Duplicate step IDs in emitProgress:** `emitProgress('chunking', ...)` is called twice in `runChunkingPipeline`, creating duplicate step IDs `update-progress-chunking` and `emit-progress-chunking`. Must add unique suffixes.
2. **Cancel sets status to 'failed':** `cancelAnalysis` action updates status to 'failed' instead of 'cancelled'. Need new status value.
3. **inngestRunId is placeholder:** `triggerAnalysis` sets `inngestRunId: 'pending_${Date.now()}'` -- never updated with real run ID.

### Schema Changes Needed
1. Add `'cancelled'` to analysis status values (currently: pending, pending_ocr, processing, completed, failed)
2. Add `progressMessage` text column to analyses table for detailed progress strings
3. Consider adding `cancelledAt` timestamp column

### What Already Works (No Changes Needed)
- Sequential pipeline flow (parser -> chunking -> classifier -> risk scorer -> gap analyst)
- Step memoization for resumability (Inngest handles this automatically)
- Rate limit delays between API calls
- Token budget tracking via BudgetTracker
- Validation gates outside step.run()
- OCR branching flow (nda/analysis.ocr-complete -> analyzeNdaAfterOcr)
- Re-scoring flow (nda/analysis.rescore -> rescoreAnalysis)

## Open Questions

1. **Chunk-level progress for classifier/risk scorer**
   - What we know: The classifier currently runs as a single `step.run('classifier-agent')` call that processes all chunks at once. To show "Scoring clause 7 of 15...", the classifier would need to be split into per-batch steps.
   - What's unclear: The existing `runClassifierAgent` processes chunks in batches internally but reports a single result. Splitting into per-batch Inngest steps means each batch becomes separately retriable but also adds step overhead.
   - Recommendation: Split classifier into per-batch steps (like embedding batches already are). This aligns with the user's decision for chunk-level progress and makes individual batches retriable.

2. **Resume vs Fresh Analysis UX**
   - What we know: User decided both "resume" and "start fresh" should be available after cancellation/failure.
   - What's unclear: For resumability, the same analysisId needs to be re-sent with the same event, relying on step memoization. But if the requestedAt deterministic ID differs, a new analysis record would be created.
   - Recommendation: Resume uses the original analysisId (step memoization handles skip). Fresh creates a new analysis record with a new requestedAt timestamp.

3. **Sample NDA Content**
   - What we know: User wants 2-3 built-in sample NDAs (short, medium, complex) for one-click testing.
   - What's unclear: Whether to embed NDA text inline, store as files in the repo, or fetch from a URL.
   - Recommendation: Store as TypeScript constant objects in `lib/sample-ndas/` with title, raw text, and expected clause count. Keep them small enough to not bloat the bundle (< 10KB each).

4. **Debug Panel Scope**
   - What we know: User wants step timings, status, AND raw AI input/output. Should feel like "Inngest dashboard embedded in the app."
   - What's unclear: Raw AI input/output could be very large (10K+ tokens). How to display without performance issues.
   - Recommendation: Store debug data in analyses.metadata JSONB (already exists). Show truncated previews in the debug panel with "expand" buttons. Only available in dev mode or for admin users.

## Sources

### Primary (HIGH confidence)
- Context7 `/llmstxt/inngest_llms-full_txt` - cancelOn configuration, step.run behavior, concurrency keys
- Inngest official docs: [Cancellation](https://www.inngest.com/docs/features/inngest-functions/cancellation)
- Inngest official docs: [Cancel on Events](https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-events)
- Inngest official docs: [inngest/function.cancelled](https://www.inngest.com/docs/reference/system-events/inngest-function-cancelled)
- Inngest official docs: [Bulk Cancellation](https://www.inngest.com/docs/guides/cancel-running-functions)
- Existing codebase: `inngest/functions/analyze-nda.ts`, `inngest/types.ts`, `inngest/utils/`

### Secondary (MEDIUM confidence)
- Inngest blog: [Bulk cancellation API](https://www.inngest.com/blog/bulk-cancellation-api) - REST API details
- Inngest docs: [cancelOn reference](https://www.inngest.com/docs/reference/typescript/functions/cancel-on)

### Tertiary (LOW confidence)
- None - all findings verified against official documentation or codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies
- Architecture: HIGH - patterns verified against Inngest docs and existing codebase
- Pitfalls: HIGH - multiple confirmed via codebase inspection (duplicate step IDs, missing cancelled status)
- Cancellation: HIGH - verified via Context7 and official docs
- Debug panel/sample NDAs: MEDIUM - these are new features without prior art in the codebase

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (stable - Inngest API is mature)
