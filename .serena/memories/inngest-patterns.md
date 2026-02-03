# Inngest Patterns Reference

## Idiomatic Fan-out Pattern

Use a **single `step.sendEvent()` with an array** instead of looping:

```typescript
// ✅ CORRECT - Idiomatic batch fan-out
await step.sendEvent(
  "fan-out-items",
  items.map((item) => ({
    name: "feature/process",
    data: { itemId: item.id, tenantId },
  }))
);

// ❌ AVOID - Loop-based fan-out (creates multiple steps)
for (const item of items) {
  await step.sendEvent(`dispatch-${item.id}`, { ... });
}
```

## Waiting for Completion (Fan-out + Wait)

```typescript
// Fan-out
await step.sendEvent("fan-out", events);

// Wait for all workers
await Promise.all(
  items.map((item) =>
    step.waitForEvent(`wait-for-${item.id}`, {
      event: "feature/process.completed",
      if: `async.data.itemId == "${item.id}"`,
      timeout: "2h",
    })
  )
);

// Now safe to run dependent steps
await step.run("post-processing", async () => { ... });
```

## Event Batching (High-Volume)

Process multiple events in single invocation:

```typescript
export const bulkProcess = inngest.createFunction(
  {
    id: "bulk-process",
    batchEvents: {
      maxSize: 100,                    // Max events per batch
      timeout: "10s",                  // Wait before invoking
      key: "event.data.tenantId",      // Group by tenant (optional)
      if: "event.data.priority != 'urgent'"  // Skip batching for urgent
    }
  },
  { event: "record/created" },
  async ({ events, step }) => {  // Note: events (plural)
    await step.run("bulk-insert", async () => {
      return await db.insert(table).values(events.map(e => e.data))
    })
  }
)
```

**Limitations:** Incompatible with `cancelOn`, rate limiting, idempotency, priority.

## Function Cancellation

```typescript
export const analyzeDocument = inngest.createFunction(
  {
    id: "nda-analyze",
    cancelOn: [
      { event: "nda/analysis.cancelled", if: "async.data.analysisId == event.data.analysisId" },
      { event: "nda/document.deleted", if: "async.data.documentId == event.data.documentId" }
    ]
  },
  { event: "nda/analysis.requested" },
  async ({ event, step }) => { ... }
)
```

## When to Use Each Pattern

| Use Case | Pattern |
|----------|---------|
| Need aggregated results in same function | Step parallelism (`Promise.all` in step) |
| Independent retries per item | Fan-out (`step.sendEvent` with array) |
| >1000 items | Fan-out (parallelism caps at 1000 steps) |
| High-volume ingestion (webhooks, logs) | Event batching (`batchEvents`) |
| Batch DB writes | Event batching |
| Long-running function with abort trigger | `cancelOn` |

## References

- [Fan-out Docs](https://www.inngest.com/docs/guides/fan-out-jobs)
- [step.sendEvent Reference](https://www.inngest.com/docs/reference/functions/step-send-event)
- [Event Batching](https://www.inngest.com/docs/guides/batching)
- [Cancellation](https://www.inngest.com/docs/features/inngest-functions/cancellation)
