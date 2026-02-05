---
phase: 08-gap-analysis
plan: 01
subsystem: agents
tags: [types, zod, gap-analysis, schemas]
dependency-graph:
  requires: [07-01]
  provides: [enhanced-gap-types, gap-severity-enum, enhanced-gap-status-enum, coverage-summary-schema, enhanced-gap-analysis-schema]
  affects: [08-02, 08-03, 08-04]
tech-stack:
  added: []
  patterns: [two-tier-gap-detection, three-tier-severity]
file-tracking:
  key-files:
    created: []
    modified: [agents/types.ts]
decisions:
  - id: "08-01-01"
    description: "New types use ENHANCED_ prefix to avoid collision with existing GAP_STATUS"
    rationale: "Backward compatibility with existing gap analyst references"
metrics:
  duration: "2.4 min"
  completed: "2026-02-05"
---

# Phase 8 Plan 01: Enhanced Gap Analysis Types Summary

**One-liner:** Zod-validated gap severity/status enums, enhanced gap item schema with template attribution, and coverage summary types for two-tier gap detection.

## What Was Done

### Task 1: Add enhanced gap analysis types and schemas (e7afadc)

Added 94 lines to `agents/types.ts` with the following new exports:

**Enums and schemas:**
- `GAP_SEVERITY` / `GapSeverity` / `gapSeveritySchema` -- three tiers: critical, important, informational
- `ENHANCED_GAP_STATUS` / `EnhancedGapStatus` / `enhancedGapStatusSchema` -- two-tier: missing vs incomplete

**Complex types:**
- `enhancedGapItemSchema` / `EnhancedGapItem` -- individual gap with category, status, severity, explanation, suggested language, template source, and style match
- `coverageSummarySchema` / `CoverageSummary` -- aggregate counts (total, present, missing, incomplete, percent)
- `enhancedGapAnalysisSchema` / `EnhancedGapAnalysisOutput` -- LLM structured output schema
- `EnhancedGapResult` -- full JSONB persistence interface including hypothesis coverage and gap score

**Preserved existing types:**
- `GAP_STATUS` (`['present', 'weak', 'missing']`) and `GapStatus` unchanged
- `GapAnalysis` interface unchanged
- All other types untouched

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 08-01-01 | New types use `ENHANCED_` prefix to avoid collision with existing `GAP_STATUS` | Backward compatibility -- Plan 02 will update the gap analyst to use the new types |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `pnpm build` succeeds with no errors
- All 12 new exports confirmed present via grep
- All existing types (GAP_STATUS, GapStatus, GapAnalysis) preserved and unchanged

## Commits

| Hash | Message |
|------|---------|
| e7afadc | feat(08-01): add enhanced gap analysis types and schemas |

## Next Phase Readiness

Plan 02 (agent prompt/schema), Plan 03 (pipeline persistence), and Plan 04 (UI) can now import:
- `GAP_SEVERITY`, `GapSeverity`, `gapSeveritySchema`
- `ENHANCED_GAP_STATUS`, `EnhancedGapStatus`, `enhancedGapStatusSchema`
- `enhancedGapItemSchema`, `EnhancedGapItem`
- `coverageSummarySchema`, `CoverageSummary`
- `enhancedGapAnalysisSchema`, `EnhancedGapAnalysisOutput`
- `EnhancedGapResult`
