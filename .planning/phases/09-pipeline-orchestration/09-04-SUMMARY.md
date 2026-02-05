# Phase 9 Plan 4: Per-Batch Risk Scorer Steps Summary

**One-liner:** Split monolithic risk scorer into per-batch Inngest steps (SCORER_BATCH_SIZE=3) with clause-level progress and independent retry

## Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Split risk scorer into per-batch Inngest steps | `85c0df5` | Done |

**Duration:** ~1.5 min
**Completed:** 2026-02-05

## What Was Done

### Task 1: Split risk scorer into per-batch Inngest steps

Replaced the single monolithic `step.run('risk-scorer-agent', ...)` with a per-batch loop that creates `score-batch-0`, `score-batch-1`, etc. steps in both `analyzeNda` and `analyzeNdaAfterOcr`.

Key implementation details:
- **Batch size:** `SCORER_BATCH_SIZE = 3` clauses per batch
- **Type safety:** `RiskScorerResultType = Awaited<ReturnType<typeof runRiskScorerAgent>>` keeps types in sync with the agent
- **Accumulator pattern:** `const allAssessments` with `push()` (mutates content, not reference - same pattern as classifier batching in 09-03)
- **Progress range:** 60-80% allocated to scoring stage, messages show "Scoring clause X of Y..."
- **Rate limiting:** `step.sleep('rate-limit-score-{N}', getRateLimitDelay('claude'))` between batches
- **Final assembly:** After all batches complete, assembles `riskResult` from accumulated assessments + last batch's summary fields (overallRiskScore, overallRiskLevel, executiveSummary, perspective, riskDistribution)

### Files Modified

| File | Changes |
|------|---------|
| `inngest/functions/analyze-nda.ts` | Replaced monolithic risk scorer with per-batch steps in both pipeline functions |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint prefer-const for accumulator array**
- **Found during:** Task 1 verification
- **Issue:** `let allAssessments` flagged by ESLint since `push()` doesn't reassign the variable
- **Fix:** Changed to `const allAssessments` (same pattern as 09-03 classifier batching)
- **Files modified:** `inngest/functions/analyze-nda.ts`
- **Commit:** `85c0df5`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| SCORER_BATCH_SIZE = 3 | Per plan specification; smaller than classifier (4) since risk scoring is more token-intensive per clause |
| Progress range 60-80% for scoring | Follows classifier at 40-60%, leaves 80-100% for gap analysis and completion |
| const accumulator with push | Consistent with 09-03 pattern; ESLint-compliant since push mutates content not reference |

## Verification

- [x] `pnpm lint` passes (only pre-existing index.js error)
- [x] `score-batch-` found in both analyzeNda (line 636) and analyzeNdaAfterOcr (line 1025)
- [x] No remaining `step.run('risk-scorer-agent'` (old monolithic step removed)
- [x] emitProgress calls show "Scoring clause X of Y..." in both functions
- [x] Rate limit sleeps between batches in both functions

## Next Phase Readiness

No blockers. Plans 09-06 and 09-07 can proceed independently.
