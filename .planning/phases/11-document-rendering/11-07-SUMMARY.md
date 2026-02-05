---
phase: 11
plan: 7
subsystem: document-rendering
tags: [scroll-navigation, keyboard-controls, zustand, virtualizer, bidirectional-sync]
dependency_graph:
  requires: [11-02, 11-04, 11-05]
  provides: [bidirectional-scroll-navigation, keyboard-clause-navigation, clause-ids-store]
  affects: [11-08]
tech_stack:
  added: []
  patterns: [zustand-get-for-actions, virtualizer-ref-pattern, individual-zustand-selectors]
key_files:
  created: []
  modified:
    - hooks/use-clause-selection.ts
    - components/document/document-renderer.tsx
decisions:
  - id: d11-07-01
    description: "Individual Zustand selectors instead of destructured object for fine-grained re-render control"
    rationale: "Prevents entire DocumentRenderer from re-rendering when unrelated store fields change"
  - id: d11-07-02
    description: "nextClause/prevClause set selectionSource to 'document' to trigger analysis-side scroll"
    rationale: "Keyboard navigation in document panel should scroll analysis cards into view"
  - id: d11-07-03
    description: "No changes needed for risk-tab.tsx and classification-tab.tsx (already correct from 11-04)"
    rationale: "Both already have useEffect for auto-scroll and auto-expand when selectionSource === 'document'"
metrics:
  duration: 3.9 min
  completed: 2026-02-05
---

# Phase 11 Plan 7: Bidirectional Scroll Navigation and Keyboard Controls Summary

**One-liner:** Zustand store navigation helpers with virtualizer scroll-to-clause and j/k keyboard controls

## What Was Built

Added bidirectional scroll synchronization between document and analysis panels, plus keyboard navigation for stepping through clauses. When a clause is selected in the analysis panel, the document auto-scrolls to show it. Keyboard shortcuts (j/k, ArrowDown/Up, Escape) allow navigating between clauses without a mouse.

## Task Summary

| # | Task | Status | Commit | Key Changes |
|---|------|--------|--------|-------------|
| 1 | Document-side scroll and keyboard navigation | Done | 7fddb1a | Added clauseIds/nextClause/prevClause to store; scroll-to-clause effect; keyboard listener |
| 2 | Analysis-side scroll and auto-expand verification | Done (no changes) | N/A | Verified existing behavior in risk-tab.tsx and classification-tab.tsx is correct |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| d11-07-01 | Individual Zustand selectors instead of destructured object | Prevents entire DocumentRenderer from re-rendering when unrelated store fields change |
| d11-07-02 | nextClause/prevClause set selectionSource to 'document' | Keyboard navigation in document panel should trigger analysis-side auto-scroll and expand |
| d11-07-03 | No changes needed for analysis tabs | Both risk-tab.tsx and classification-tab.tsx already had correct auto-scroll/expand from 11-04 |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `pnpm build` passes with no errors (pre-existing warning for useVirtualizer incompatible-library is expected)
- All type-checks pass
- Store correctly uses `get()` for reading state in `nextClause`/`prevClause` actions

## Next Phase Readiness

- Clause navigation store is complete with ordered traversal support
- Document renderer supports bidirectional sync with analysis panel
- Ready for Plan 11-08 (final integration/polish)
