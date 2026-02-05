---
phase: 10-progress-streaming
plan: 03
subsystem: web-ui-realtime
tags: [inngest-realtime, useInngestSubscription, server-action, polling-fallback]

dependency-graph:
  requires: [10-01]
  provides: [web-ui-realtime-progress]
  affects: []

tech-stack:
  added: []
  patterns: [realtime-primary-polling-fallback, late-join-snapshot]

key-files:
  modified:
    - app/(main)/(dashboard)/analyses/actions.ts
    - hooks/use-analysis-progress.ts
    - hooks/use-analysis-progress.test.ts

decisions:
  - id: realtime-token-throws
    choice: "fetchRealtimeToken throws on error instead of returning ApiResponse"
    reason: "useInngestSubscription refreshToken expects promise rejection for error handling, not envelope pattern"
  - id: polling-fallback-5s
    choice: "Degraded polling at 5s (was 2s) when realtime unavailable"
    reason: "Polling is fallback only; 5s reduces server load while still providing updates"
  - id: late-join-snapshot
    choice: "Initial DB fetch on mount before realtime subscription starts"
    reason: "Ensures user immediately sees current progress state, not blank, before first realtime event arrives"

metrics:
  duration: 8.5 min
  completed: 2026-02-05
  tasks: 2/2
---

# Phase 10 Plan 03: Web UI Realtime Hook Summary

**One-liner:** Inngest Realtime subscription in useAnalysisProgress with late-join DB snapshot and 5s polling fallback

## What Was Done

### Task 1: Add fetchRealtimeToken server action
Added `fetchRealtimeToken` to `app/(main)/(dashboard)/analyses/actions.ts`:
- Imported `generateAnalysisToken` and `AnalysisToken` from `lib/realtime/tokens`
- Re-exported `AnalysisToken` type for client consumption
- Server action validates tenant ownership via `withTenant()` before generating token
- Throws on auth/not-found errors (suitable for `useInngestSubscription` refreshToken pattern)

### Task 2: Refactor useAnalysisProgress hook for Inngest Realtime
Rewrote `hooks/use-analysis-progress.ts` in-place:
- **Primary transport**: `useInngestSubscription` from `@inngest/realtime/hooks` with `refreshToken` callback
- **Late-join snapshot**: Initial `getAnalysisStatus()` call on mount for immediate state
- **Polling fallback**: Activates at 5s interval only when `subscription.error` is set and no realtime events received
- **Terminal detection**: Maps realtime stage names ("complete", "failed", "cancelled") to `AnalysisStatus`
- **Public interface unchanged**: Same `AnalysisProgressState` return type, same function signature
- Updated test file to mock `useInngestSubscription` and `fetchRealtimeToken`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test mock needed for useInngestSubscription**
- **Found during:** Task 2 verification
- **Issue:** Existing tests failed because `@inngest/realtime/hooks` was not mocked
- **Fix:** Added `vi.mock("@inngest/realtime/hooks")` and `fetchRealtimeToken` mock to test file
- **Files modified:** `hooks/use-analysis-progress.test.ts`

**2. [Rule 3 - Blocking] Task 2 commit absorbed by 10-04 lint-staged**
- **Found during:** Task 2 commit
- **Issue:** Pre-commit lint-staged stash/restore cycle caused our hook changes to be committed as part of the concurrent 10-04 plan execution
- **Resolution:** Changes are committed (in 52b0f8d), just attributed to 10-04 commit message. Code is correct and verified.

## Decisions Made

| Decision | Choice | Reason |
|----------|--------|--------|
| Token action error handling | Throw instead of ApiResponse | useInngestSubscription refreshToken expects promise rejection |
| Polling interval | 5000ms (was 2000ms) | Polling is degraded fallback only; reduces server load |
| Initial state source | DB fetch on mount | Late-join snapshot ensures immediate progress visibility |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 2b00b2a | feat(10-03): add fetchRealtimeToken server action |
| 2 | 52b0f8d | Changes included in 10-04 commit (lint-staged merge) |

## Next Phase Readiness

- Plan 10-04 (Word Add-in realtime) can proceed - already executed concurrently
- Web UI consumers (analysis-view.tsx) need no changes - hook interface unchanged
- End-to-end verification requires running Inngest dev server with realtime enabled
