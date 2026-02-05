---
phase: 08-gap-analysis
plan: 03
subsystem: pipeline
tags: [gap-analysis, persistence, server-action, query, enhanced-gap-result]
dependency-graph:
  requires: [08-02]
  provides: [gap-analysis-query, fetchGapAnalysis-action, enhanced-pipeline-persistence]
  affects: [08-04]
tech-stack:
  added: []
  patterns: [typed-jsonb-query, server-action-envelope, enriched-document-summary]
file-tracking:
  key-files:
    created: [db/queries/gap-analysis.ts]
    modified: [app/(main)/(dashboard)/analyses/actions.ts, inngest/functions/analyze-nda.ts]
decisions: []
metrics:
  duration: "3 min"
  completed: "2026-02-05"
---

# Phase 8 Plan 03: Pipeline Persistence & Server Action Summary

**One-liner:** Gap analysis query function, fetchGapAnalysis server action returning typed EnhancedGapResult, and enriched pipeline document summary for better gap context.

## What Was Done

### Task 1: Create gap analysis query and server action (6a73a81)

**New file `db/queries/gap-analysis.ts`:**
- `getGapAnalysis(analysisId, tenantId)` queries the analyses table for gap data
- Returns `EnhancedGapResult | null` with type assertion from JSONB
- Only returns data for completed analyses
- Follows same pattern as `db/queries/risk-scoring.ts` and `db/queries/classifications.ts`
- NOT added to any barrel export (per CLAUDE.md)

**Updated `app/(main)/(dashboard)/analyses/actions.ts`:**
- Added import of `getGapAnalysis` from new query module
- Added import and re-export of `EnhancedGapResult` type for UI consumption
- Added `fetchGapAnalysis(analysisId)` server action returning `ApiResponse<EnhancedGapResult>`
  - Validates UUID input
  - Tenant-scoped via `withTenant()`
  - Returns empty result structure when gap data not available
- Marked legacy `getAnalysisGaps` with `@deprecated` JSDoc pointing to `fetchGapAnalysis`
- Legacy function preserved for backward compatibility

### Task 2: Update pipeline persistence for enhanced gap data (f78ebfc)

**Updated `inngest/functions/analyze-nda.ts`:**
- Enriched `documentSummary` with unique category count in both main and post-OCR pipelines
  - Main: `"Title: N clauses classified across M categories."`
  - Post-OCR: `"Title: N clauses classified across M categories (via OCR)."`
- `gapResult.gapAnalysis` (now `EnhancedGapResult` from Plan 02) flows to persist-final step unchanged
- Both pipelines store enhanced gap data in the JSONB column automatically since the type was updated upstream

## Decisions Made

None -- plan executed exactly as written.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `pnpm build` succeeds with no errors
- `db/queries/gap-analysis.ts` exists with `getGapAnalysis` export
- `app/(main)/(dashboard)/analyses/actions.ts` exports `fetchGapAnalysis`
- `inngest/functions/analyze-nda.ts` persist-final step stores enhanced gap data (2 pipelines)
- Old `getAnalysisGaps` preserved with `@deprecated` tag
- No barrel exports created (per CLAUDE.md)
- `EnhancedGapResult` type re-exported for UI consumption

## Commits

| Hash | Message |
|------|---------|
| 6a73a81 | feat(08-03): create gap analysis query and fetchGapAnalysis server action |
| f78ebfc | feat(08-03): enhance pipeline document summary for gap analyst context |

## Next Phase Readiness

Plan 04 (UI) can now:
- Call `fetchGapAnalysis(analysisId)` to get typed `EnhancedGapResult`
- Access gaps with severity, status, explanation, suggested language, template source
- Display coverage summary (present/missing/incomplete counts)
- Show hypothesis coverage and gap score
- Use re-exported `EnhancedGapResult` type for component props
