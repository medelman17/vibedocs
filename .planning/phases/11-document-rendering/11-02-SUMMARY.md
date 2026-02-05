---
phase: 11
plan: 02
subsystem: document-rendering
tags: [zustand, hooks, state-management, text-search]

dependency_graph:
  requires: []
  provides:
    - "Shared clause selection state (useClauseSelection)"
    - "Document text search with paragraph-aware matching (useDocumentSearch)"
  affects:
    - "11-03 (text-to-markdown rendering)"
    - "11-04 (clause overlay components)"
    - "11-05 (analysis panel integration)"
    - "11-06 (bidirectional navigation wiring)"

tech_stack:
  added: []
  patterns:
    - "Zustand store without persistence for ephemeral UI state"
    - "Binary search for paragraph offset lookup"
    - "useMemo-based search computation (no useEffect antipattern)"

key_files:
  created:
    - hooks/use-clause-selection.ts
    - hooks/use-document-search.ts
  modified: []

decisions:
  - id: "11-02-01"
    decision: "No persistence middleware for clause selection"
    rationale: "Selection state is ephemeral -- resets on page navigation"
  - id: "11-02-02"
    decision: "Overlapping match detection in search"
    rationale: "Advancing by 1 char after match allows finding overlapping occurrences"
  - id: "11-02-03"
    decision: "Binary search for paragraph index lookup"
    rationale: "O(log n) lookup vs O(n) linear scan for paragraph offsets"

metrics:
  duration: "3.8 min"
  completed: "2026-02-05"
---

# Phase 11 Plan 02: Shared State Hooks Summary

**One-liner:** Zustand clause selection store and useMemo-based document search hook with paragraph-aware match navigation

## What Was Built

### useClauseSelection (Zustand Store)
Shared state store for bidirectional clause navigation between document and analysis panels:
- **activeClauseId / selectionSource** -- tracks which clause is selected and which panel initiated
- **highlightsEnabled** -- global toggle, defaults to off per user decision
- **activeTab** -- analysis panel tab state (classifications/risk/gaps/chat)
- **askAboutClause** -- switches to chat tab with pending clause context for "Ask about this" feature
- **clearSelection** -- resets selection state (bound to Escape key in future plans)

No persistence middleware -- selection state is ephemeral and resets on navigation.

### useDocumentSearch (React Hook)
Component-local search hook for document text:
- Case-insensitive search with 2-character minimum query threshold
- Match computation via `useMemo` (avoids stale useEffect + setState antipattern)
- Paragraph-aware matching using binary search on paragraph offsets array
- Prev/next navigation with modular arithmetic wraparound
- Overlapping match detection (advances by 1 char, not query length)

## Deviations from Plan

None -- plan executed exactly as written.

## Task Summary

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create clause selection zustand store | d13b5a9 | hooks/use-clause-selection.ts |
| 2 | Create document search hook | a3959f1 | hooks/use-document-search.ts |

## Verification

- `pnpm build` passes with both hooks
- useClauseSelection exports all required state (activeClauseId, selectionSource, highlightsEnabled, activeTab, pendingClauseContext) and actions (selectClause, clearSelection, toggleHighlights, setHighlightsEnabled, setActiveTab, askAboutClause)
- useDocumentSearch returns query/setQuery, matches, activeMatchIndex, nextMatch/prevMatch, totalMatches, activeMatch
- No barrel exports created

## Next Phase Readiness

Both hooks are ready for consumption by:
- **11-03** (text-to-markdown): Will use paragraph offsets compatible with useDocumentSearch
- **11-04** (clause overlays): Will consume useClauseSelection for highlight state
- **11-06** (bidirectional navigation): Will wire useClauseSelection between panels
