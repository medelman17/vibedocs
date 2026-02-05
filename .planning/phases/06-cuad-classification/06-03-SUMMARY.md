---
phase: "06"
plan: "03"
subsystem: "pipeline"
tags: ["inngest", "classification", "persistence", "multi-label", "cuad"]

dependency-graph:
  requires: ["06-01", "06-02"]
  provides: ["pipeline-classification-persistence", "multi-label-db-storage"]
  affects: ["06-04", "07"]

tech-stack:
  added: []
  patterns: ["batch-db-insert", "onConflictDoNothing-idempotency", "persist-after-classify"]

file-tracking:
  key-files:
    created: []
    modified:
      - "inngest/functions/analyze-nda.ts"

decisions:
  - id: "06-03-01"
    decision: "Single persist-classifications step rather than per-batch steps"
    rationale: "Classifier handles batching internally; persistence as single post-classification step is simpler and still idempotent via ON CONFLICT DO NOTHING"

metrics:
  duration: "2.1 min"
  completed: "2026-02-05"
---

# Phase 06 Plan 03: Pipeline Integration Summary

Wire enhanced batch classifier into Inngest pipeline with multi-label classification persistence to chunkClassifications table.

## What Was Done

### Task 1: Replace single classifier step with batch classification pipeline

Added `persist-classifications` step to both `analyzeNda` and `analyzeNdaAfterOcr` pipelines in `inngest/functions/analyze-nda.ts`:

1. **Import**: Added `chunkClassifications` from `@/db/schema/analyses`
2. **Persist step**: New `step.run('persist-classifications')` after classifier agent that:
   - Iterates `classifierResult.rawClassifications` to build insert rows
   - Maps each `chunkIndex` (global index) back to the chunk for `chunkId`, position data
   - Inserts primary classification for every chunk
   - Inserts secondary classifications only if confidence >= 0.3
   - Batch inserts 100 rows at a time with `onConflictDoNothing()` for idempotency
3. **Progress message**: Updated to include total classification count: `Classified N clauses (M total classifications)`
4. **No breaking changes**: Risk-scorer and gap-analyst still receive `classifierResult.clauses` (ClassifiedClause[]) unchanged

Both pipelines (main and post-OCR) have identical persistence logic.

## Verification Results

| Check | Status |
|-------|--------|
| `pnpm build` passes | Pass |
| `chunkClassifications` import present | Pass |
| `persist-classifications` in both pipelines | Pass |
| Classifier validation gate uses `classifierResult.clauses` | Pass |
| Risk-scorer receives `classifierResult.clauses` | Pass |
| `onConflictDoNothing` for idempotent inserts | Pass |
| Progress message shows total count | Pass |

## Decisions Made

1. **Single persist step vs per-batch steps**: Kept classifier as single step (it handles batching internally). Added one `persist-classifications` step afterward. This is simpler and still idempotent - if the step fails partway, retry re-inserts everything and `ON CONFLICT DO NOTHING` handles duplicates.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| a9fd8a2 | feat(06-03): wire batch classifier into pipeline with classification persistence |

## Next Phase Readiness

Plan 06-04 (testing and verification) can proceed. The pipeline now:
- Persists multi-label classifications to `chunkClassifications` table
- Continues to pass `ClassifiedClause[]` to risk-scorer and gap-analyst unchanged
- Handles Inngest retries via idempotent inserts
