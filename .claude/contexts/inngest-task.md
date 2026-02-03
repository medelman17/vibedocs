# Inngest Task Context

## When to Use
Creating durable workflows, background jobs, event-driven functions, scheduled tasks

## Files to Read First
- `inngest/index.ts` - Barrel export (import everything from here)
- `inngest/types.ts` - Event schemas and payload types
- `inngest/utils/errors.ts` - Inngest-specific error classes
- `inngest/functions/*.ts` - Existing function patterns

## Before Writing a New Function

Follow this order:

1. **New event?** → Add Zod schema to `inngest/types.ts` FIRST (see "Adding New Events" section)
2. **Then** create the function file
3. **Import** event type from `@/inngest` (never define inline)
4. **Register** function in `inngest/functions/index.ts`
5. **Create** test file (REQUIRED)

## Critical: Event Type Location

**DO NOT define event payload types inline in function files:**

| Wrong | Correct |
|-------|---------|
| `interface MyEventData { ... }` in function file | Zod schema in `inngest/types.ts` |
| `type EventPayload = { ... }` in function file | `z.infer<typeof myEventPayload>` |

```typescript
// WRONG - inline type definition
export interface AnalysisRetryEventData {  // ❌ Never do this
  tenantId: string
  documentId: string
}

// CORRECT - schema in types.ts, import inferred type
// In inngest/types.ts:
export const analysisRetryPayload = baseTenantPayload.extend({
  documentId: z.string(),
  reason: z.string(),
})

// In your function file:
import type { InngestEvents } from "@/inngest"
type EventData = InngestEvents["nda/analysis.retry"]["data"]  // ✅ Type-safe
```

## Critical: Two Error Systems

**DO NOT CONFUSE THESE:**

| Module | Purpose | Key Property |
|--------|---------|--------------|
| `@/lib/errors` | HTTP responses (API routes) | `statusCode` |
| `@/inngest` | Workflow retry control | `isRetriable` |

```typescript
// WRONG - mixing error systems
import { NotFoundError } from "@/lib/errors"  // HTTP error in Inngest!

// CORRECT - use Inngest errors
import { NotFoundError, RetriableError, NonRetriableError } from "@/inngest"
```

## Required Patterns

### Function Structure
```typescript
import {
  inngest,
  CONCURRENCY,
  RETRY_CONFIG,
  withTenantContext,
  RetriableError,
  NonRetriableError,
} from "@/inngest"

export const myFunction = inngest.createFunction(
  {
    id: "my-function-id",           // Unique, kebab-case
    name: "My Function: Description", // Human-readable
    concurrency: CONCURRENCY.analysis, // Use predefined configs
    retries: RETRY_CONFIG.default.retries,
  },
  { event: "nda/my-event.name" },   // Event naming: domain/entity.action
  async ({ event, step }) => {
    const { tenantId, documentId } = event.data

    // Always use step.run for durable operations
    const result = await step.run("step-name", async () => {
      return await withTenantContext(tenantId, async ({ db }) => {
        // Your logic with tenant-scoped DB
        return await db.query.documents.findFirst({ ... })
      })
    })

    return { success: true, result }
  }
)
```

### Error Handling
```typescript
import {
  RetriableError,     // Network issues, temporary failures → Inngest retries
  NonRetriableError,  // Invalid input, not found → No retry, mark failed
  NotFoundError,      // Resource missing (non-retriable)
  ValidationError,    // Invalid payload (non-retriable)
  ApiError,          // External API error (auto-determines retriability)
  wrapWithErrorHandling,
} from "@/inngest"

// Explicit error throwing
if (!document) {
  throw new NotFoundError("document", documentId)  // Won't retry
}

if (networkError) {
  throw new RetriableError("Failed to connect to service")  // Will retry
}

// API errors auto-determine retriability (5xx = retry, 4xx = no retry)
throw new ApiError("claude", "Rate limited", 429)  // Will retry (429)
throw new ApiError("claude", "Invalid request", 400)  // Won't retry (400)

// Wrap unknown operations
const result = await wrapWithErrorHandling("fetch-data", async () => {
  return await externalService.fetch()
})
```

### Rate Limiting (External APIs)
```typescript
import { RATE_LIMITS, getRateLimitDelay, withRateLimit } from "@/inngest"

// Use step.sleep between API calls
await step.run("call-claude", async () => {
  return withRateLimit("claude", async () => {
    return await claude.messages.create({ ... })
  })
})
await step.sleep("claude-rate-limit", getRateLimitDelay("claude"))  // 1000ms

// Batch processing for Voyage AI
const BATCH_SIZE = RATE_LIMITS.voyageAi.batchSize  // 128
for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  const batch = chunks.slice(i, i + BATCH_SIZE)
  await step.run(`embed-batch-${i}`, async () => {
    return await embedBatch(batch)
  })
  await step.sleep(`voyage-rate-limit-${i}`, getRateLimitDelay("voyageAi"))  // 200ms
}
```

### Tenant Context
```typescript
import { withTenantContext, setTenantContext } from "@/inngest"

// Option 1: Wrapper (preferred)
const result = await step.run("process", async () => {
  return withTenantContext(event.data.tenantId, async ({ db, tenantId }) => {
    return await db.query.documents.findFirst({
      where: eq(documents.tenantId, tenantId)
    })
  })
})

// Option 2: Manual setup
const result = await step.run("process", async () => {
  const { db, tenantId } = await setTenantContext(event.data.tenantId)
  return await db.query.documents.findFirst({ ... })
})
```

### Emitting Progress Events
```typescript
// For real-time UI updates
await step.sendEvent("emit-progress", {
  name: "nda/analysis.progress",
  data: {
    analysisId,
    step: "parsing",
    percent: 25,
    message: "Extracting text from document"
  }
})
```

### Parallel Execution
```typescript
// Option 1: Promise.all (works fine)
const [result1, result2] = await Promise.all([
  step.run("task-1", async () => task1()),
  step.run("task-2", async () => task2()),
])

// Option 2: step.parallel (native Inngest)
const results = await step.parallel(
  () => step.run("task-1", async () => task1()),
  () => step.run("task-2", async () => task2()),
)
```

### Waiting for Events
```typescript
// Wait for another event with timeout
const payment = await step.waitForEvent("wait-for-payment", {
  event: "stripe/payment.succeeded",
  timeout: "1h",
  if: "async.data.userId == event.data.userId"  // Match condition
})

if (!payment) {
  // Timeout - handle gracefully
  throw new NonRetriableError("Payment timeout")
}
```

### Invoking Other Functions
```typescript
// Call another Inngest function directly
const emailResult = await step.invoke("send-notification", {
  function: sendEmailFunction,
  data: { userId, template: "welcome" }
})
```

## Advanced Patterns

### Function Cancellation
```typescript
export const longTask = inngest.createFunction(
  {
    id: "long-task",
    cancelOn: [
      {
        event: "task/cancelled",
        if: "async.data.taskId == event.data.taskId"
      }
    ]
  },
  { event: "task/started" },
  async ({ event, step }) => { ... }
)
```

### Event Batching
```typescript
export const bulkProcess = inngest.createFunction(
  {
    id: "bulk-process",
    batchEvents: {
      maxSize: 100,        // Up to 100 events per invocation
      timeout: "10s",      // Or after 10 seconds
      key: "event.data.tenantId"  // Group by tenant
    }
  },
  { event: "record/created" },
  async ({ events, step }) => {  // Note: events (plural)
    return await step.run("bulk-insert", async () => {
      return await db.bulkInsert(events.map(e => e.data))
    })
  }
)
```

### Priority Execution
```typescript
export const prioritizedTask = inngest.createFunction(
  {
    id: "process-task",
    priority: {
      run: "event.data.isPremium ? 100 : 0"  // Premium users first
    }
  },
  { event: "task/created" },
  async ({ event, step }) => { ... }
)
```

### Scheduled (Cron) Functions
```typescript
export const dailyCleanup = inngest.createFunction(
  { id: "daily-cleanup" },
  { cron: "0 0 * * *" },  // Midnight daily
  async ({ step }) => {
    await step.run("cleanup", async () => {
      return await cleanupOldRecords()
    })
  }
)
```

## Event Naming Convention

Format: `domain/entity.action`

```typescript
// NDA pipeline events
"nda/uploaded"              // Document uploaded
"nda/analysis.requested"    // Start analysis
"nda/analysis.progress"     // Progress update
"nda/comparison.requested"  // Start comparison

// Bootstrap events
"bootstrap/ingest.requested"
"bootstrap/source.process"
"bootstrap/source.completed"

// Demo events
"demo/process"
"demo/multi-step"
```

## Concurrency Configs

```typescript
import { CONCURRENCY } from "@/inngest"

CONCURRENCY.analysis          // { limit: 5, key: "event.data.tenantId" }
CONCURRENCY.embeddings        // { limit: 3, key: "event.data.tenantId" }
CONCURRENCY.documentProcessing // { limit: 10, key: "event.data.tenantId" }
CONCURRENCY.comparison        // { limit: 3, key: "event.data.tenantId" }
CONCURRENCY.generation        // { limit: 5, key: "event.data.tenantId" }
CONCURRENCY.bootstrap         // { limit: 1 } (global, no tenant key)
```

## Adding New Events

1. Add Zod schema to `inngest/types.ts`:
```typescript
export const myEventPayload = baseTenantPayload.extend({
  myField: z.string(),
})
```

2. Add to `InngestEvents` type:
```typescript
export type InngestEvents = {
  // ... existing events
  "nda/my.event": {
    data: z.infer<typeof myEventPayload>
  }
}
```

3. Add to `eventSchemas` map:
```typescript
export const eventSchemas = {
  // ... existing schemas
  "nda/my.event": myEventPayload,
}
```

## Test Template (REQUIRED)

Create colocated test or use `__tests__/` folder:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock inngest client
vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((config, trigger, handler) => ({
      ...config,
      ...trigger,
      handler,
    })),
  },
}))

// Mock database
vi.mock("@/db/client", () => ({
  db: { query: {}, execute: vi.fn() },
}))

import { myFunction } from "./my-function"

describe("myFunction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("processes event correctly", async () => {
    const mockEvent = {
      data: { tenantId: "org-123", documentId: "doc-456" }
    }
    const mockStep = {
      run: vi.fn((name, fn) => fn()),
      sleep: vi.fn(),
      sendEvent: vi.fn(),
    }

    // Access the handler from the mocked function
    const result = await myFunction.handler({ event: mockEvent, step: mockStep })

    expect(result.success).toBe(true)
    expect(mockStep.run).toHaveBeenCalled()
  })
})
```

## Checklist Before Completing
- [ ] Imported from `@/inngest` barrel (not individual files)?
- [ ] Used Inngest error classes (not `@/lib/errors`)?
- [ ] Wrapped operations in `step.run()` for durability?
- [ ] Used `withTenantContext()` for tenant-scoped DB access?
- [ ] Added rate limiting with `step.sleep()` for external APIs?
- [ ] Used predefined `CONCURRENCY` and `RETRY_CONFIG`?
- [ ] **NEW EVENT? → Added Zod schema to `inngest/types.ts` FIRST** (no inline types!)
- [ ] Registered function in `inngest/functions/index.ts`?
- [ ] **Created test file?** ← REQUIRED
- [ ] Used kebab-case for function `id`?
- [ ] Used `domain/entity.action` format for event names?
