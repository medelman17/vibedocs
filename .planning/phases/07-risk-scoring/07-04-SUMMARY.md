# Phase 7 Plan 4: Risk Scoring UI & Re-Scoring Summary

Inngest-based re-scoring with perspective toggle, evidence-expandable clause cards with source-labeled references, executive summary card, and risk distribution display.

## Execution Details

- **Duration**: ~10 min
- **Completed**: 2026-02-05
- **Tasks**: 3/3

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 84811ac | Inngest rescore function and server actions |
| 2 | b8c19f6 | Perspective toggle and executive summary card |
| 3 | e693596 | Risk assessment list with expandable evidence |

## What Was Built

### Task 1: Inngest Re-Score Function + Server Actions

**Files created/modified:**
- `inngest/functions/rescore-analysis.ts` (new) - Inngest function that loads existing primary classifications from `chunkClassifications`, runs risk scorer agent with new perspective, persists via `ON CONFLICT DO UPDATE`, and updates analysis metadata
- `inngest/types.ts` - Added `nda/analysis.rescore` event type with analysisId and perspective
- `inngest/functions/index.ts` - Registered `rescoreAnalysis` in function registry
- `db/queries/risk-scoring.ts` - Added `getRiskAssessments(analysisId, tenantId)` query ordered by startPosition
- `app/(main)/(dashboard)/analyses/actions.ts` - Added `triggerRescore` server action (no-op if same perspective) and `fetchRiskAssessments` server action

### Task 2: Perspective Toggle + Executive Summary

**Files modified:**
- `components/artifact/analysis-view.tsx` - Added `PerspectiveToggle` component (three-button toggle with receiving/balanced/disclosing, optimistic UI, 2s debounce) and `ExecutiveSummaryCard` (overall score badge, risk distribution badges, summary text). Wired poll-based refresh (3s interval) after re-score completion.

### Task 3: Evidence Expandable + Source Labels

**Files modified:**
- `components/artifact/analysis-view.tsx` - Enhanced `ClauseCard` with expandable evidence section (citations with left-border styling, references with color-coded source labels: CUAD=blue, ContractNLI=purple, Bonterms=green, baseline comparison blocks), confidence badge, atypical language warning badge, and negotiation suggestion with "Tip:" prefix. Added `SourceBadge` component and evidence type interfaces.

## Key Technical Decisions

- **Re-score via Inngest**: Avoids serverless timeout; runs risk scorer agent in durable steps
- **No-op check**: `triggerRescore` compares current perspective from analysis metadata before dispatching
- **Poll-based refresh**: 3-second interval polling `getAnalysisStatus` until `progressStage` returns to `complete`, then bumps `rescoreVersion` state to trigger data re-fetch
- **`fetchRiskAssessments` replaces `getAnalysisClauses`**: Returns clauseExtractions ordered by `startPosition` for document-order display
- **Evidence parsed from JSONB**: ClauseEvidence and ClauseMetadata interfaces type the `evidence` and `metadata` JSONB columns

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] `pnpm build` succeeds
- [x] `pnpm lint` passes (pre-existing index.js error only)
- [x] `rescoreAnalysis` exported from `inngest/functions/rescore-analysis.ts`
- [x] `triggerRescore` and `fetchRiskAssessments` exported from actions.ts
- [x] Perspective toggle with three options rendered
- [x] Executive summary card with overall score and risk distribution
- [x] Evidence expandable with citations, source-labeled references, baseline comparison
- [x] Atypical language badge and negotiation suggestion displayed
- [x] Risk distribution shows color-coded count per level

## Phase 7 Completion Status

This was the final plan (07-04) of Phase 7 (Risk Scoring). All 4 plans complete:
1. 07-01: Enhanced risk assessment schema + evidence types
2. 07-02: Evidence retrieval + budget-aware references + executive summary
3. 07-03: Risk scoring persistence + weighted scoring + analysis updates
4. 07-04: Re-scoring via Inngest + UI components (perspective toggle, evidence display, executive summary)
