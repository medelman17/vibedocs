---
phase: 10-progress-streaming
plan: 02
subsystem: pipeline-publishing
tags: [inngest-realtime, publish, throttle, analyze-nda]

dependency-graph:
  requires: [10-01]
  provides: [realtime-progress-publishing]
  affects: [10-03, 10-04]

tech-stack:
  added: []
  patterns: [throttled-publish, fire-and-forget-realtime]

key-files:
  modified:
    - inngest/functions/analyze-nda.ts

decisions:
  - id: throttle-interval
    choice: "1 second throttle with terminal bypass"
    reason: "Per CONTEXT.md decision: max 1 publish/sec for non-terminal events. Terminal events (complete, failed, cancelled) always publish regardless of throttle to ensure clients get the final state."
  - id: fire-and-forget
    choice: "publish() outside step.run(), not wrapped in durable step"
    reason: "Realtime publish is at-most-once delivery. Wrapping in step.run() would add unnecessary overhead and step count. DB persistence (inside step.run) remains the durable source of truth."

metrics:
  duration: 3.9 min
  completed: 2026-02-05
  tasks: 1/1
---

# Phase 10 Plan 02: Pipeline Publishing Summary

**One-liner:** Replaced step.sendEvent progress broadcasting with throttled Inngest Realtime publish() in both analyzeNda and analyzeNdaAfterOcr pipeline functions.

## What Was Done

### Task 1: Add realtime publish to emitProgress in both pipeline functions

Updated `inngest/functions/analyze-nda.ts` with these changes applied to BOTH `analyzeNda` and `analyzeNdaAfterOcr`:

1. **Added import**: `import { analysisChannel } from '@/inngest/channels'` at top of file
2. **Destructured `publish`**: Changed `async ({ event, step })` to `async ({ event, step, publish })` in both function handlers
3. **Added throttle tracking**: `let lastPublishTime = 0` alongside existing `progressCounter`
4. **Replaced `step.sendEvent('emit-progress-...')`** with throttled `publish()` call using `analysisChannel(analysisId).progress(...)`
5. **Preserved**: All DB persistence in `step.run()`, `step.sendEvent('trigger-ocr')`, and both `step.sendEvent('analysis-completed')` calls

The throttle logic: terminal events (complete/failed/cancelled) always publish immediately. Non-terminal events publish at most once per second. This prevents flooding the realtime channel during rapid progress updates while ensuring clients always receive the final state.

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| throttle-interval | 1s throttle with terminal bypass | CONTEXT.md specified max 1/sec; terminal events must always reach client |
| fire-and-forget | publish() not wrapped in step.run() | At-most-once is acceptable for realtime; DB persistence is the durable fallback |

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 794f126 | feat(10-02): add realtime publish to pipeline emitProgress | inngest/functions/analyze-nda.ts |

## Verification Results

- `grep -c "step.sendEvent.*emit-progress"`: **0** (all removed)
- `grep -c "publish"`: **4** (2 destructurings + 2 publish calls)
- `grep -c "analysisChannel"`: **3** (1 import + 2 usages)
- `step.sendEvent('analysis-completed')`: preserved on lines 734 and 1123
- `step.sendEvent('trigger-ocr')`: preserved on line 425
- TypeScript: no errors in analyze-nda.ts

## Next Phase Readiness

Plan 10-03 (Client Subscription Hook) is unblocked:
- `analysisChannel` is defined and being published to
- Token generation API from 10-01 provides subscription tokens
- Client hook can now subscribe to the progress topic and receive throttled updates
