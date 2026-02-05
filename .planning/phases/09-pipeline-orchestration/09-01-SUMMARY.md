# Phase 9 Plan 01: Cancellation Foundation & Progress Fix Summary

**One-liner:** Added cancelled status, progressMessage column, fixed duplicate emitProgress step IDs, and wired cancelOn to both pipeline functions.

## What Was Done

### Task 1: Schema changes and event type updates
- Added `progressMessage` text column to `analyses` table (after `progressPercent`)
- Added `'cancelled'` to `AnalysisStatus` type (now includes `pending_ocr` too, which was missing)
- Added `'cancelled'` stage to `analysisProgressPayload` in `inngest/types.ts`
- Added `'cancelled'` to `paginationSchema.status` enum for filtering
- Added `cancelled: "Analysis cancelled"` to stage messages in `getAnalysisStatus`
- Updated `useAnalysisProgress` hook to treat `'cancelled'` as terminal state (stops polling)
- **Commit:** `b6b3925`

### Task 2: Fix emitProgress duplicate step IDs and add cancelOn
- Replaced `update-progress-${stage}` / `emit-progress-${stage}` with monotonic counter pattern: `update-progress-${stage}-${progressCounter++}`
- Added `progressMessage` to the DB update in every `emitProgress` call
- Added `cancelOn` config to `analyzeNda` function matching on `nda/analysis.cancelled` event with `analysisId` correlation
- Added identical `cancelOn` config to `analyzeNdaAfterOcr` function
- **Commit:** `9e4db87`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] AnalysisStatus was missing 'pending_ocr'**
- **Found during:** Task 1
- **Issue:** The `AnalysisStatus` type in `actions.ts` only had `"pending" | "processing" | "completed" | "failed"` but the DB already uses `'pending_ocr'` status (added in Phase 3/4). The pagination schema was also missing it.
- **Fix:** Added `'pending_ocr'` alongside `'cancelled'` to both the type and the Zod enum
- **Files modified:** `app/(main)/(dashboard)/analyses/actions.ts`

**2. [Rule 2 - Missing Critical] useAnalysisProgress hook needed 'cancelled' terminal state**
- **Found during:** Task 1
- **Issue:** The `useAnalysisProgress` hook only stopped polling for `completed` and `failed` statuses. Without treating `cancelled` as terminal, it would poll indefinitely for cancelled analyses.
- **Fix:** Added `cancelled` check to the terminal state condition
- **Files modified:** `hooks/use-analysis-progress.ts`

## Decisions Made

| Decision | Context | Rationale |
|----------|---------|-----------|
| Monotonic counter per function instance | emitProgress called multiple times for same stage (e.g., 'chunking' called twice) | Counter guarantees globally unique step IDs within a function run |
| progressMessage as plain text column | Could have used metadata JSONB | Dedicated column is queryable, indexable, and explicit per plan requirement |

## Key Files Modified

| File | Changes |
|------|---------|
| `db/schema/analyses.ts` | Added `progressMessage` text column, documented `cancelled` status |
| `inngest/types.ts` | Added `'cancelled'` to progress stage enum |
| `inngest/functions/analyze-nda.ts` | cancelOn config on both functions, fixed emitProgress with monotonic counter and progressMessage |
| `app/(main)/(dashboard)/analyses/actions.ts` | Added `cancelled` and `pending_ocr` to AnalysisStatus type and pagination schema |
| `hooks/use-analysis-progress.ts` | Added `cancelled` as terminal state for polling |

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm lint` passes | Yes (only pre-existing index.js error) |
| `cancelOn` in analyze-nda.ts | 2 matches (line 304, line 686) |
| `progressMessage` in analyses.ts | Column defined |
| No `update-progress-${stage}` patterns | Confirmed - all use `${stepSuffix}` |

## Duration

- **Start:** 2026-02-05T14:05:14Z
- **End:** 2026-02-05T14:07:53Z
- **Duration:** 2.7 min
