---
phase: 10-progress-streaming
plan: 01
subsystem: realtime-infrastructure
tags: [inngest-realtime, middleware, channels, tokens, sse]

dependency-graph:
  requires: [09-pipeline-orchestration]
  provides: [realtime-middleware, typed-channels, token-generation]
  affects: [10-02, 10-03, 10-04]

tech-stack:
  added: ["@inngest/realtime@0.4.5"]
  patterns: [inngest-realtime-publish-subscribe, scoped-subscription-tokens, channel-per-analysis]

key-files:
  created:
    - inngest/channels.ts
    - lib/realtime/tokens.ts
  modified:
    - inngest/client.ts
    - inngest/functions/cleanup-cancelled.ts
    - package.json

decisions:
  - id: barrel-safety
    choice: "No @inngest/realtime exports in inngest/index.ts barrel"
    reason: "Barrel export anti-pattern documented in CLAUDE.md and Issue #43; realtime imports go direct"
  - id: token-auth-separation
    choice: "generateAnalysisToken has no auth checks; callers verify ownership"
    reason: "Shared by web UI (withTenant) and Word Add-in (verifyAddInAuth) with different auth mechanisms"
  - id: channel-scoping
    choice: "Channel per analysis ID: analysis:{analysisId}"
    reason: "Isolates progress streams; clients only receive events for their analysis"

metrics:
  duration: 4.8 min
  completed: 2026-02-05
  tasks: 2/2
---

# Phase 10 Plan 01: Realtime Infrastructure Foundation Summary

**One-liner:** Inngest Realtime infrastructure with realtimeMiddleware, typed analysis channel (progress topic), and scoped token generation helper.

## What Was Done

### Task 1: Install @inngest/realtime and add realtimeMiddleware to Inngest client
- Installed `@inngest/realtime@0.4.5` package
- Added `realtimeMiddleware()` import from `@inngest/realtime/middleware` to `inngest/client.ts`
- Registered middleware in Inngest constructor options (`middleware: [realtimeMiddleware()]`)
- Created `inngest/channels.ts` with typed `analysisChannel` definition:
  - Channel function: `(analysisId: string) => \`analysis:${analysisId}\``
  - Progress topic with Zod schema: `stage`, `percent`, `message`, optional `metadata` with chunk counts
- Verified no new exports added to `inngest/index.ts` barrel

### Task 2: Create server-side token generation helper
- Created `lib/realtime/tokens.ts` with:
  - `AnalysisToken` type: `Realtime.Token<typeof analysisChannel, ["progress"]>`
  - `generateAnalysisToken(analysisId: string)` function calling `getSubscriptionToken`
- Auth-agnostic design: callers handle auth (web UI via `withTenant()`, Word Add-in via `verifyAddInAuth()`)
- Direct imports from `@/inngest/client` and `@/inngest/channels` (not barrel)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed stale @ts-expect-error in cleanup-cancelled.ts**
- **Found during:** Task 1 (build verification)
- **Issue:** Adding `realtimeMiddleware()` changed the Inngest client type so that `inngest/function.cancelled` is now recognized as a valid event. The existing `@ts-expect-error` directive became unused, causing a build failure.
- **Fix:** Removed the `@ts-expect-error` comment and updated the file-level JSDoc to reflect the type resolution change.
- **Files modified:** `inngest/functions/cleanup-cancelled.ts`
- **Commit:** aae14df

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Barrel export safety | No realtime exports in `inngest/index.ts` | Documented anti-pattern; import channels/tokens directly |
| Token auth separation | `generateAnalysisToken` has no auth checks | Shared by two consumers with different auth mechanisms |
| Channel scoping | `analysis:{analysisId}` per analysis | Isolates progress streams between concurrent analyses |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | aae14df | Install @inngest/realtime, register middleware, create channels |
| 2 | 29e5b4b | Create server-side token generation helper |

## Next Phase Readiness

Plan 10-02 (Pipeline Publishing) can proceed immediately:
- `realtimeMiddleware()` is registered, enabling `publish()` in function handlers
- `analysisChannel` is defined with progress topic schema
- Token generation helper is ready for Plan 10-03 (Web UI) and Plan 10-04 (Word Add-in)

No blockers or concerns.
