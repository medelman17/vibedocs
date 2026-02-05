---
phase: 09-pipeline-orchestration
plan: 02
subsystem: api
tags: [inngest, cancellation, server-actions, progress-polling]

# Dependency graph
requires:
  - phase: 09-pipeline-orchestration
    provides: "cancelOn configuration on analyze-nda functions (Plan 01)"
provides:
  - "Cancellation cleanup handler for inngest/function.cancelled system event"
  - "Event-based cancelAnalysis server action"
  - "resumeAnalysis server action for cancelled/failed analyses"
  - "Progress hook with message field and cancelled terminal state"
affects: [09-pipeline-orchestration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "inngest/function.cancelled system event handler for cleanup after cancelOn"
    - "Optimistic DB update + event emission for immediate UI feedback"
    - "Inngest step memoization for resume from cancelled/failed state"

key-files:
  created:
    - "inngest/functions/cleanup-cancelled.ts"
  modified:
    - "inngest/functions/index.ts"
    - "app/(main)/(dashboard)/analyses/actions.ts"
    - "hooks/use-analysis-progress.ts"

key-decisions:
  - "Optimistic DB update in cancelAnalysis for immediate UI feedback; cleanup handler also sets status as safety net"
  - "pending_ocr added to cancellable statuses (analyses can be cancelled during OCR wait)"
  - "resumeAnalysis re-sends nda/analysis.requested event relying on Inngest step memoization"
  - "ts-expect-error used for inngest/function.cancelled since it's a system event not in InngestEvents type map"

patterns-established:
  - "System event handlers use @ts-expect-error for untyped Inngest internal events"
  - "Cancellation uses event emission + optimistic DB update pattern"

# Metrics
duration: 5min
completed: 2026-02-05
---

# Phase 9 Plan 02: Cancellation Cleanup & Resume Summary

**Event-based cancellation cleanup handler, updated cancelAnalysis with Inngest event emission, resumeAnalysis action for pipeline restart, and progress hook message field**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-05T14:05:49Z
- **Completed:** 2026-02-05T14:10:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Cancellation cleanup handler listens for `inngest/function.cancelled` system event and updates analysis status to 'cancelled'
- cancelAnalysis now sends `nda/analysis.cancelled` event (triggers cancelOn) instead of directly setting status to 'failed'
- New resumeAnalysis action re-triggers pipeline for cancelled/failed analyses via Inngest step memoization
- Progress hook extended with `message` field in AnalysisProgressState interface

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cancellation cleanup handler** - `58b40e4` (feat)
2. **Task 2: Update cancel action, add resume action, extend progress hook** - `cbf7972` (feat)

## Files Created/Modified
- `inngest/functions/cleanup-cancelled.ts` - System event handler for inngest/function.cancelled, marks analysis as cancelled
- `inngest/functions/index.ts` - Registered cleanupCancelledAnalysis in function array
- `app/(main)/(dashboard)/analyses/actions.ts` - Updated cancelAnalysis (event-based), added resumeAnalysis
- `hooks/use-analysis-progress.ts` - Added message field, updated JSDoc for cancelled terminal state

## Decisions Made
- **Optimistic update pattern:** cancelAnalysis sets status to 'cancelled' immediately in DB AND sends the cancellation event. The cleanup handler also sets status as a safety net. This ensures immediate UI feedback without waiting for the Inngest event round-trip.
- **pending_ocr cancellable:** Added to cancellable statuses since analyses waiting for OCR should also be cancellable by users.
- **@ts-expect-error for system events:** `inngest/function.cancelled` is an Inngest internal system event not present in the typed InngestEvents map. Used @ts-expect-error with any casts for event data access.
- **Step memoization for resume:** resumeAnalysis simply re-sends the analysis.requested event. Inngest's step memoization replays completed steps instantly, so the pipeline effectively resumes from the last incomplete step.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cancellation flow is end-to-end: user cancels -> event fires -> pipeline stops -> cleanup handler updates DB -> UI reflects cancelled state
- Resume flow wired: user can restart cancelled/failed analyses
- Ready for Plan 01 (cancelOn wiring on analyze-nda functions) which completes the integration
- Ready for Plan 03+ (progress granularity, debug panel)

---
*Phase: 09-pipeline-orchestration*
*Completed: 2026-02-05*
