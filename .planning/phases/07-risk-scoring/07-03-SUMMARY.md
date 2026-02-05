# Phase 7 Plan 3: Risk Scoring Persistence & Weighted Scoring Summary

**One-liner:** Risk assessment persistence to clauseExtractions with batch upsert, weighted document-level scoring via cuadCategories.riskWeight, and executive summary/perspective metadata stored on analysis records.

---

## Frontmatter

- **Phase:** 07-risk-scoring
- **Plan:** 03
- **Subsystem:** db/queries, inngest/functions
- **Tags:** persistence, weighted-scoring, upsert, inngest, risk-scoring
- **Requires:** 07-01 (Risk Assessment Schema & Types)
- **Provides:** Risk scoring persistence layer and pipeline integration for Plans 04 (UI)
- **Affects:** 07-04 (UI can now query clauseExtractions for per-clause risk data)

### Tech Stack

- **Added:** None (no new libraries)
- **Patterns:** Batch upsert with ON CONFLICT DO UPDATE, JSONB merge via sql template literal, weighted scoring with DB-driven category weights

### Key Files

- **Created:** `db/queries/risk-scoring.ts`
- **Modified:** `inngest/functions/analyze-nda.ts`

---

## What Was Done

### Task 1: Create risk scoring queries module (db/queries/risk-scoring.ts)

Created `db/queries/risk-scoring.ts` with three functions:

1. **`persistRiskAssessments`**: Takes a database client, tenant context, analysis/document IDs, assessment results, and perspective. Maps each `RiskAssessmentResult` to a `clauseExtractions` insert value with structured evidence and metadata. Batch-inserts in groups of 100 with `onConflictDoUpdate` targeting the `(analysisId, chunkId)` unique constraint -- updates riskLevel, riskExplanation, evidence, metadata, and updatedAt on conflict. Returns persisted count.

2. **`calculateWeightedRisk`**: Queries `cuadCategories` for `name` and `riskWeight`, builds a weight map, applies risk value mapping (aggressive=1.0, cautious=0.5, standard=0.0, unknown=0.25), computes `sum(riskValue * categoryWeight) / sum(categoryWeight) * 100`, rounds to integer. Falls back to uniform weight 1.0 if cuadCategories table is empty. Returns `{ score, level }`.

3. **`updateAnalysisWithRiskResults`**: Updates analysis record with weighted risk score/level, executive summary, and merges perspective/riskDistribution into metadata via JSONB concatenation.

### Task 2: Wire persistence into Inngest pipeline (inngest/functions/analyze-nda.ts)

Applied identical changes to both `analyzeNda` and `analyzeNdaAfterOcr`:

1. **Import**: Added `persistRiskAssessments` and `calculateWeightedRisk` from `@/db/queries/risk-scoring`, added `sql` from `drizzle-orm`
2. **Perspective**: Explicitly passes `perspective: 'balanced'` to `runRiskScorerAgent` calls (honors user decision for default perspective)
3. **New step**: Added `persist-risk-assessments` step after risk-scorer-agent to batch-upsert per-clause assessments
4. **Updated persist-final**: Replaced `riskResult.overallRiskScore/Level` with `calculateWeightedRisk(ctx.db, riskResult.assessments)` for importance-weighted scoring
5. **Executive summary**: Stored `riskResult.executiveSummary` in `analyses.summary`
6. **Metadata merge**: Uses `sql` template literal for JSONB concat to preserve existing metadata while adding perspective and riskDistribution

---

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | ON CONFLICT DO UPDATE (not DO NOTHING) for clauseExtractions | Supports re-scoring: same analysis with new perspective overwrites risk data |
| 2 | JSONB merge via `COALESCE(metadata, '{}'::jsonb) || ...::jsonb` | Preserves existing metadata (truncation warnings, error codes) while adding new fields |
| 3 | Fallback to uniform weight 1.0 when cuadCategories empty | Graceful degradation when bootstrap hasn't run; scoring still works without DB weights |
| 4 | `updateAnalysisWithRiskResults` function exported but not used in pipeline | Pipeline does a single combined update in persist-final; function available for standalone use |

---

## Deviations from Plan

None -- plan executed exactly as written.

---

## Verification

- `pnpm build` passes (zero TypeScript errors)
- `pnpm lint` clean on modified files (pre-existing `index.js` error unrelated)
- `db/queries/risk-scoring.ts` exports `persistRiskAssessments`, `calculateWeightedRisk`, `updateAnalysisWithRiskResults`
- Both `analyzeNda` and `analyzeNdaAfterOcr` include `persist-risk-assessments` step
- Both functions use `calculateWeightedRisk` in persist-final
- Both functions pass `perspective: 'balanced'` to risk scorer
- Executive summary stored in `analyses.summary`
- Perspective and riskDistribution merged into `analyses.metadata`

---

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `154d1d5` | feat(07-03): add risk scoring persistence and weighted scoring queries |
| 2 | `31fee4f` | feat(07-03): wire risk scoring persistence into Inngest pipeline |

---

## Metrics

- **Duration:** ~5 min
- **Completed:** 2026-02-05
- **Tasks:** 2/2

---

## Next Phase Readiness

Plan 07-04 can proceed immediately. It will:
1. Add UI components for displaying per-clause risk levels from clauseExtractions
2. Show weighted overall risk score and executive summary from analyses record
3. Display risk distribution breakdown

No blockers or concerns.
