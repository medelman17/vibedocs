---
phase: 11
plan: 04
subsystem: document-rendering
tags: [refactor, tabs, analysis-panel, zustand, clause-selection]

dependency_graph:
  requires:
    - "11-02 (useClauseSelection store)"
  provides:
    - "Tabbed analysis panel (AnalysisTabs container)"
    - "Classification, Risk, and Gaps tab components"
    - "Shared risk/gap config for document renderer colors"
    - "Clause click -> shared selection wiring"
  affects:
    - "11-05 (split-panel layout integration)"
    - "11-06 (bidirectional clause navigation)"
    - "11-07 (Chat tab population)"

tech_stack:
  added: []
  patterns:
    - "Extracted monolithic component into tab-based architecture"
    - "Shared config.ts for cross-component color/label constants"
    - "Zustand store bridging tab components and document panel"
    - "Direct type imports from source modules (Turbopack compatibility)"

key_files:
  created:
    - components/analysis/config.ts
    - components/analysis/classification-tab.tsx
    - components/analysis/risk-tab.tsx
    - components/analysis/gaps-tab.tsx
    - components/analysis/analysis-tabs.tsx
  modified:
    - components/artifact/analysis-view.tsx
    - app/(main)/(dashboard)/analyses/actions.ts

decisions:
  - id: "11-04-01"
    decision: "Remove export type re-exports from use server modules"
    rationale: "Turbopack cannot resolve type-only re-exports in use server files when multiple client components import functions from the same module"
  - id: "11-04-02"
    decision: "Import types directly from source modules"
    rationale: "Avoids Turbopack bundler errors; types come from db/queries, agents/types, lib/realtime instead of re-export chain"

metrics:
  duration: "15.0 min"
  completed: "2026-02-05"
---

# Phase 11 Plan 04: Analysis Tabs Refactor Summary

**One-liner:** Refactored 1394-line monolithic AnalysisView into tabbed interface with 5 extracted components and shared clause selection wiring

## What Was Built

### Shared Config (config.ts)
Extracted all visual configuration objects from analysis-view.tsx into a shared module:
- `riskConfig` -- risk level labels, oklch colors, icons for standard/cautious/aggressive/unknown
- `gapSeverityConfig` -- critical/important/informational severity display
- `gapStatusConfig` -- missing/incomplete status display
- `sourceConfig` -- CUAD/ContractNLI/Bonterms/CommonAccord source badge colors
- `RiskLevel` type exported for cross-component use

### ClassificationTab
Extracted from ClassificationView with added clause selection:
- Category/position toggle (existing functionality preserved)
- ClassificationCard with `isActive` prop and ring indicator on active clause
- Click handler wired to `useClauseSelection.selectClause(id, 'analysis')`
- Auto-scroll into view when clause selected from document panel (selectionSource === 'document')

### RiskTab
Extracted ClauseCard, RiskBadge, SourceBadge, ExecutiveSummaryCard with clause selection:
- Evidence citations, references, baseline comparison all preserved
- Active clause highlight via ring-2 ring-primary styling
- Auto-expand clause card when activated from document panel
- Click-to-stop-propagation on collapsible triggers to prevent double-fire

### GapsTab
Extracted GapsView, GapCard, GapSeverityBadge, GapStatusBadge, CopyButton:
- Coverage summary with progress bar and missing/incomplete counts
- Copy all gaps to clipboard functionality
- Severity-sorted display (critical > important > informational)
- No clause selection wiring (gaps don't have clause positions)

### AnalysisTabs Container
Tab container using shadcn Tabs:
- 4 tabs: Risk (default), Classifications, Gaps, Chat (placeholder)
- Active tab synced with `useClauseSelection.activeTab` for programmatic switching
- Each tab content wrapped in ScrollArea for independent scrolling
- PerspectiveToggle co-located here (shared above-tabs control)
- Chat tab shows placeholder with MessageSquare icon

### AnalysisView Refactor
Slimmed from 1394 lines to 358 lines:
- Kept: ProgressView, ErrorView, CancelledView (status screens)
- Kept: Data fetching logic, rescore polling, metadata parsing
- Replaced: Inline sections with single `<AnalysisTabs>` component
- Kept: Summary bar with RiskBadge and risk distribution counts above tabs
- Added: `min-h-0` and `shrink-0` for proper flex layout in tab container

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed export type re-exports from use server module**
- **Found during:** Task 2 build verification
- **Issue:** Turbopack 16.1.6 cannot resolve `export type { X }` re-exports in "use server" modules when multiple client components import server action functions from the same module. Results in "Export X doesn't exist in target module" error.
- **Fix:** Removed all type re-exports from `analyses/actions.ts` (lines 136-139). Added comment directing consumers to import types from source modules directly.
- **Files modified:** `app/(main)/(dashboard)/analyses/actions.ts`, `components/analysis/classification-tab.tsx`, `components/analysis/gaps-tab.tsx`
- **Commits:** f8b3ab2

**2. [Rule 3 - Blocking] Import types from source instead of actions barrel**
- **Found during:** Task 2 build verification (related to above)
- **Issue:** `ChunkClassificationRow` and `ClassificationsByCategory` imported from actions would trigger the Turbopack error
- **Fix:** Import directly from `@/db/queries/classifications` and `@/agents/types`
- **Files modified:** `components/analysis/classification-tab.tsx`, `components/analysis/gaps-tab.tsx`
- **Commits:** f8b3ab2

## Task Summary

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract tab components from AnalysisView | 9ad7a7c | config.ts, classification-tab.tsx, risk-tab.tsx, gaps-tab.tsx |
| 2 | Create AnalysisTabs container and refactor AnalysisView | f8b3ab2 | analysis-tabs.tsx, analysis-view.tsx, actions.ts, classification-tab.tsx, gaps-tab.tsx |

## Verification

- `pnpm build` passes (clean build from empty .next/)
- `npx tsc --noEmit` passes with 0 errors in target files
- AnalysisView renders via AnalysisTabs component
- Clause card clicks call useClauseSelection.selectClause
- Active clause highlighted with ring-2 ring-primary ring-offset-1
- Tab switching does not re-fetch data (each tab manages own state)
- Config objects shared via config.ts (no duplication)
- No barrel exports in components/analysis/

## Next Phase Readiness

Tab components ready for:
- **11-05** (split-panel layout): AnalysisTabs plugs into right panel
- **11-06** (bidirectional navigation): Clause selection wired, scroll-into-view on document selection
- **11-07** (Chat tab): Replace placeholder with actual chat component
