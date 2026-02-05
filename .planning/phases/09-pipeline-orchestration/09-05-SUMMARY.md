---
phase: 09-pipeline-orchestration
plan: 05
subsystem: ui
tags: [progress-polling, queue-position, cancelled-state, server-actions, analysis-view]

# Dependency graph
requires:
  - phase: 09-pipeline-orchestration
    provides: "progressMessage column and emitProgress utility (Plan 01)"
  - phase: 09-pipeline-orchestration
    provides: "cancelAnalysis and resumeAnalysis server actions (Plan 02)"
provides:
  - "getAnalysisStatus with detailed progressMessage and queue position"
  - "useAnalysisProgress hook with message and queuePosition fields"
  - "CancelledView component with Resume and Start Fresh buttons"
  - "ProgressView with queue position indicator"
affects: [09-pipeline-orchestration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Queue position via count of pending/processing analyses per tenant"
    - "CancelledView with resume (memoized replay) and start-fresh (new version)"

# File tracking
key-files:
  modified:
    - app/(main)/(dashboard)/analyses/actions.ts
    - hooks/use-analysis-progress.ts
    - components/artifact/analysis-view.tsx

# Decisions
decisions:
  - id: "09-05-01"
    decision: "Queue position counts all pending+processing+pending_ocr analyses for the tenant"
    reason: "Gives user a sense of how many analyses are ahead of theirs"
  - id: "09-05-02"
    decision: "CancelledView uses window.location.reload() after resume/start-fresh for clean state reset"
    reason: "Simpler than propagating new analysisId through component tree; polling restarts cleanly"

# Metrics
duration: "2.7 min"
completed: 2026-02-05
---

# Phase 09 Plan 05: Progress Messages & Cancelled State Summary

Extended progress polling with detailed pipeline messages and queue position, added cancelled analysis UI with resume/restart options.

## What Was Done

### Task 1: Extend getAnalysisStatus with progressMessage and queue position (dd2ec06)

- Added `progressMessage` to the columns queried in `getAnalysisStatus`
- Added `message` and `queuePosition` fields to `AnalysisStatusResponse` interface
- Detailed message populated from `progressMessage` DB column with fallback to generic stage label
- Queue position calculated for `pending` and `pending_ocr` statuses by counting all active analyses per tenant
- Added missing stages to stageMessages map: `chunking`, `ocr_processing`
- Imported `inArray` from drizzle-orm for queue position query

### Task 2: Update progress hook and analysis view for cancelled state (11dfd1d)

- Added `queuePosition` field to `AnalysisProgressState` interface
- Updated hook to populate `message` from the new `result.data.message` field (detailed pipeline messages)
- Created `CancelledView` component with:
  - "Analysis Cancelled" heading with ban icon
  - Progress message showing where analysis stopped
  - "Resume" button calling `resumeAnalysis` (Inngest step memoization replays completed steps)
  - "Start Fresh" button calling `triggerAnalysis` to create new analysis version
  - Error display for failed actions
- Enhanced `ProgressView` to display queue position when available
- Added `pending_ocr` to progress state rendering conditions

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. `pnpm lint` passes (only pre-existing `index.js` error)
2. `useAnalysisProgress` hook has `message` and `queuePosition` in its return type
3. `analysis-view.tsx` handles `cancelled` status with Resume/Start Fresh buttons
4. `getAnalysisStatus` returns `progressMessage` from DB column
5. Queue position calculated for pending analyses using `inArray` query
