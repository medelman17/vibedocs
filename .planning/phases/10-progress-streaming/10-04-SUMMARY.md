---
phase: 10-progress-streaming
plan: 04
subsystem: word-addin-realtime
tags: [inngest-realtime, word-addin, bearer-auth, sse-deprecated]

dependency-graph:
  requires: [10-01]
  provides: [word-addin-realtime-progress]
  affects: []

tech-stack:
  added: []
  patterns: [bearer-auth-token-route, useInngestSubscription]

key-files:
  created:
    - app/api/word-addin/realtime-token/[id]/route.ts
  modified:
    - app/(word-addin)/word-addin/taskpane/hooks/useAnalysisProgress.ts
    - app/api/word-addin/status/[id]/route.ts

decisions:
  - id: 10-04-disconnect-pattern
    choice: "Track disconnectedFor analysisId instead of boolean flag"
    reason: "React 19 lint rules prohibit ref access during render and setState inside effects; storing the analysisId that triggered disconnect auto-resets on ID change without refs"
  - id: 10-04-progress-derivation
    choice: "Derive progress via useMemo from subscription.latestData instead of setState in effect"
    reason: "React 19 set-state-in-effect lint rule; useMemo derives state synchronously from subscription data"
  - id: 10-04-terminal-disconnect
    choice: "setTimeout(0) for auto-disconnect on terminal stages"
    reason: "Cannot call setState during render (useMemo body); setTimeout defers to next microtask"

metrics:
  duration: 7.0 min
  completed: 2026-02-05
  tasks: 2/2
---

# Phase 10 Plan 04: Word Add-in Realtime Hook Summary

**One-liner:** Inngest Realtime subscription hook for Word Add-in progress with Bearer auth token route and deprecated SSE fallback.

## What Was Done

### Task 1: Word Add-in Realtime Token API Route

Created `app/api/word-addin/realtime-token/[id]/route.ts`:
- GET endpoint that generates scoped Inngest Realtime subscription tokens
- Uses `verifyAddInAuth()` for Bearer token validation (same pattern as all Word Add-in routes)
- Validates analysis belongs to authenticated tenant before issuing token
- Returns `{ token }` JSON response via `generateAnalysisToken()` from Plan 10-01
- Error handling uses `toAppError()` + `error()` pattern consistent with codebase

### Task 2: Refactored Progress Hook + Deprecated SSE Endpoint

**Part A - Hook Refactoring** (`useAnalysisProgress.ts`):
- Replaced manual fetch + ReadableStream SSE reader with `useInngestSubscription` from `@inngest/realtime/hooks`
- Token refresher fetches from new `/api/word-addin/realtime-token/{id}` endpoint with Bearer auth
- Maps `latestData.data` fields to existing `ProgressState` interface (stage, percent, message)
- Return type `UseAnalysisProgressReturn` unchanged (progress, isConnected, error, disconnect)
- Auto-disconnects on terminal stages (completed, failed, cancelled)
- Uses subscription `key` parameter for automatic reset when analysisId changes
- `useInngestSubscription` handles reconnection internally by re-calling `refreshToken`

**Part B - SSE Deprecation** (`status/[id]/route.ts`):
- Added `@deprecated` JSDoc comment pointing to new realtime-token endpoint
- Endpoint preserved for backward compatibility during transition

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] React 19 lint: setState in effect**
- **Found during:** Task 2, initial implementation
- **Issue:** React 19 eslint rules (`react-hooks/set-state-in-effect`) prohibit calling `setState` synchronously inside `useEffect` bodies
- **Fix:** Replaced `useEffect` + `setProgress()` with `useMemo` derivation from `subscription.latestData`; auto-disconnect uses `setTimeout(0)` to defer setState out of render
- **Files modified:** `app/(word-addin)/word-addin/taskpane/hooks/useAnalysisProgress.ts`

**2. [Rule 1 - Bug] React 19 lint: ref access during render**
- **Found during:** Task 2, second iteration
- **Issue:** React 19 eslint rules (`react-hooks/refs`) prohibit accessing `useRef.current` during render to detect prop changes
- **Fix:** Replaced ref-based previous-analysisId tracking with `disconnectedFor` state that stores the analysisId that triggered disconnect; comparing `disconnectedFor === analysisId` naturally resets when analysisId changes
- **Files modified:** `app/(word-addin)/word-addin/taskpane/hooks/useAnalysisProgress.ts`

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 10-04-disconnect-pattern | Track `disconnectedFor` analysisId instead of boolean + ref | React 19 prohibits ref access during render; ID comparison auto-resets on change |
| 10-04-progress-derivation | Derive progress via `useMemo` not `setState` in effect | React 19 `set-state-in-effect` lint rule |
| 10-04-terminal-disconnect | `setTimeout(0)` for terminal stage disconnect | Cannot setState during render (useMemo); defers to next microtask |

## Commits

| Hash | Message |
|------|---------|
| 2d8e37f | feat(10-04): add Word Add-in realtime token API route |
| 52b0f8d | feat(10-04): refactor Word Add-in progress hook to Inngest Realtime |

## Next Phase Readiness

- Word Add-in now subscribes to Inngest Realtime for progress (Plan 10-01 infrastructure + Plan 10-04 hook)
- Old SSE endpoint preserved with deprecation notice for safe migration
- Plan 10-03 (main web UI hook) can proceed independently
- No blockers for remaining Phase 10 work
