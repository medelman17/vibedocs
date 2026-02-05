---
phase: 08-gap-analysis
plan: 04
subsystem: ui
tags: [gap-analysis, analysis-view, coverage-summary, gap-cards, copy-clipboard, ui-component]
dependency-graph:
  requires: [08-03]
  provides: [gap-analysis-ui, coverage-visualization, gap-card-components]
  affects: []
tech-stack:
  added: []
  patterns: [useEffect-fetch-on-mount, collapsible-card, clipboard-api, severity-sorted-display]
file-tracking:
  key-files:
    created: []
    modified: [components/artifact/analysis-view.tsx]
decisions: []
metrics:
  duration: "3 min"
  completed: "2026-02-05"
---

# Phase 8 Plan 04: Gap Analysis UI Summary

**One-liner:** GapsView component with coverage summary progress bar, severity-sorted expandable gap cards, status/severity badges, and copy-to-clipboard for individual and all gaps.

## What Was Done

### Task 1: Add GapsView component with coverage summary and gap cards (654ae65)

**Updated `components/artifact/analysis-view.tsx`:**

**New imports:**
- `ClipboardCopyIcon`, `ClipboardCheckIcon` from lucide-react
- `fetchGapAnalysis`, `EnhancedGapResult` from analyses actions
- `GapSeverity`, `EnhancedGapStatus`, `EnhancedGapItem` from agents/types

**New configuration objects:**
- `gapSeverityConfig`: Maps critical/important/informational to oklch colors and icons (follows `riskConfig` pattern)
- `gapStatusConfig`: Maps missing/incomplete to oklch colors

**New components:**
- `GapSeverityBadge`: Colored badge with icon for critical/important/informational
- `GapStatusBadge`: Colored badge for missing/incomplete status
- `CopyButton`: Generic copy-to-clipboard button with copied state feedback (2s timeout)
- `GapCard`: Expandable card showing category, status badge, severity badge, explanation; expands to show recommended language blockquote with template source attribution and copy button
- `GapsView`: Container fetching gap data via `fetchGapAnalysis` on mount, displaying coverage summary card (present/total with progress bar, missing/incomplete badge counts), "Copy all gaps" button, and sorted gap cards

**Wiring into AnalysisView:**
- Added "Gap Analysis" section between "CUAD Classifications" and "Clause list" (Risk Assessments)
- Passes `analysisId` prop to `GapsView`

**Key patterns:**
- `useEffect` fetch on mount matching `ClassificationView` pattern
- Severity sorting: critical > important > informational
- Copy All generates formatted markdown with headers, explanations, and source attributions
- Collapsible pattern matching existing `ClauseCard` component

## Decisions Made

None -- plan executed exactly as written.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `pnpm build` succeeds with no errors
- All components confirmed present: GapsView, GapCard, GapSeverityBadge, GapStatusBadge, CopyButton
- Section ordering verified: CUAD Classifications -> Gap Analysis -> Risk Assessments
- `fetchGapAnalysis` called on mount with analysisId
- Coverage summary displays present/total with progress bar
- Gap cards show category, status badge, severity badge, explanation
- Expanding gap card reveals recommended language blockquote with copy button and source attribution
- Copy All button copies all gap data as formatted markdown
- Gap cards sorted by severity (critical first)
- End-to-end type flow: `EnhancedGapResult` referenced in all 4 files (agents/types.ts, db/queries/gap-analysis.ts, actions.ts, analysis-view.tsx)

## Commits

| Hash | Message |
|------|---------|
| 654ae65 | feat(08-04): add GapsView component with coverage summary and gap cards |

## Next Phase Readiness

Phase 8 (Gap Analysis) is complete. All 4 plans delivered:
1. Enhanced types and schemas (08-01)
2. Enhanced gap analyst agent with two-tier gaps and suggested language (08-02)
3. Pipeline persistence and fetchGapAnalysis server action (08-03)
4. Gap Analysis UI with coverage summary and expandable gap cards (08-04)

The full gap analysis pipeline is end-to-end functional:
Upload -> Parse -> Classify -> Risk Score -> Gap Analyze -> Display with coverage summary and actionable recommended language.
