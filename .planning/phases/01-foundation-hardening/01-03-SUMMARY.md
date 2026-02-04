---
phase: 01-foundation-hardening
plan: 03
subsystem: inngest
tags: [inngest, validation, idempotency, drizzle, pipeline]

# Dependency graph
requires:
  - phase: 01-01
    provides: validateParserOutput and validateClassifierOutput in agents/validation
  - phase: 01-02
    provides: AI SDK 6 migrated agents with AnalysisFailedError handling
provides:
  - Validation gates integrated into analyze-nda pipeline
  - Deterministic analysis ID for idempotent inserts
  - Unique constraint on clauseExtractions for safe retries
  - Pipeline halts with user-friendly errors on validation failures
affects: [pipeline-orchestration, error-handling, user-feedback]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deterministic ID from crypto hash for idempotent database writes"
    - "Validation gates run OUTSIDE step.run() for immediate NonRetriableError"
    - "Failure persistence runs INSIDE step.run() for durability"

key-files:
  created: []
  modified:
    - inngest/functions/analyze-nda.ts
    - db/schema/analyses.ts
    - inngest/types.ts
    - inngest/functions/analyze-nda.test.ts

key-decisions:
  - "Validation gates run outside step.run() - deterministic, no durability needed"
  - "Failure state persisted inside step.run() - ensures DB write survives"
  - "Deterministic ID uses documentId + requestedAt for unique analysis per request"
  - "requestedAt added to event schema for ID determinism"

patterns-established:
  - "Idempotent writes: deterministic ID + onConflictDoNothing"
  - "Pipeline validation: gate → mark-failed step → NonRetriableError"

# Metrics
duration: 3min
completed: 2026-02-04
---

# Phase 01 Plan 03: Validation Gates Integration Summary

**Validation gates halt pipeline on empty documents or 0 clauses with user-friendly errors, using deterministic IDs for idempotent retries**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-04T21:15:04Z
- **Completed:** 2026-02-04T21:18:34Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Parser validation gate halts on empty document or no chunks
- Classifier validation gate halts on 0 clauses (per CONTEXT.md decision)
- Deterministic analysis ID prevents duplicate records on retry
- Unique constraint on clauseExtractions for idempotent clause persistence
- Failed analyses have status='failed' with error details in metadata

## Task Commits

Each task was committed atomically:

1. **Task 1: Add unique constraint for clause extractions** - `a51cd70` (feat)
2. **Task 2: Integrate validation gates and upserts into pipeline** - `45d3f9d` (feat)
3. **Task 3: Push schema changes to database** - N/A (runtime operation, no code change)

**Test fix:** `c2f7a70` (test) - Updated mock for onConflictDoNothing

## Files Created/Modified
- `db/schema/analyses.ts` - Added unique constraint on (analysisId, chunkId) and imported unique
- `inngest/functions/analyze-nda.ts` - Validation gates, deterministic ID, NonRetriableError handling
- `inngest/types.ts` - Added requestedAt field to analysisRequestedPayload
- `inngest/functions/analyze-nda.test.ts` - Mock updated for onConflictDoNothing

## Decisions Made
- **Validation outside step.run():** Validation is fast and deterministic, so running it outside the durable step boundary lets us throw NonRetriableError immediately without wasting retries
- **Failure persistence inside step.run():** The DB update marking analysis as failed needs durability in case the update fails
- **requestedAt in event schema:** Added to enable deterministic ID generation - callers should set this to ensure retry idempotency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated test mock for onConflictDoNothing**
- **Found during:** Task 2 verification (test run)
- **Issue:** Test mock for db.insert didn't include onConflictDoNothing method
- **Fix:** Added onConflictDoNothing mock returning resolved promise
- **Files modified:** inngest/functions/analyze-nda.test.ts
- **Verification:** All 4 tests pass
- **Committed in:** c2f7a70

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Test infrastructure needed updating for new code pattern. No scope creep.

## Issues Encountered
- drizzle-orm type declarations have upstream errors in gel-core module (optional peer dep) - these don't affect our code and were safely ignored

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 01 (Foundation Hardening) complete
- Validation infrastructure ready for use in all pipeline stages
- Pattern established for adding validation gates to other pipeline functions

---
*Phase: 01-foundation-hardening*
*Completed: 2026-02-04*
