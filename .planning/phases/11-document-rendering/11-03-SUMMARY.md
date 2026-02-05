---
phase: 11-document-rendering
plan: 03
subsystem: document-rendering
tags: [react-markdown, virtual-scrolling, clause-highlights, search, components]

dependency_graph:
  requires:
    - "11-01 (text-to-markdown conversion, offset mapper, types)"
    - "11-02 (clause selection store, document search hook)"
  provides:
    - "DocumentRenderer component with virtual scrolling and clause overlays"
    - "ClauseHighlight component with risk-colored tooltip"
    - "DocumentToolbar with highlight toggle and search"
    - "DocumentSearch with match navigation"
    - "DocumentSkeleton loading state"
  affects:
    - "11-05 (split-panel layout consumes DocumentRenderer)"
    - "11-07 (bidirectional navigation uses ClauseHighlight data-clause-id)"
    - "11-08 (progressive reveal and responsive layout)"

tech_stack:
  added:
    - "react-markdown ^10.1.0"
    - "@tanstack/react-virtual ^3.13.18"
  patterns:
    - "useVirtualizer for paragraph-level windowed rendering"
    - "Pre-computed paragraph-to-clause mapping (Map<number, ClauseOverlay[]>)"
    - "Text segment splitting for clause/non-clause boundaries within paragraphs"
    - "React.memo ParagraphRow for render performance"
    - "useMemo-derived section tracking (avoids setState in effect)"

key_files:
  created:
    - components/document/clause-highlight.tsx
    - components/document/document-skeleton.tsx
    - components/document/document-search.tsx
    - components/document/document-renderer.tsx
    - components/document/document-toolbar.tsx
  modified:
    - package.json
    - pnpm-lock.yaml

decisions:
  - id: "11-03-01"
    decision: "useMemo for section tracking instead of useEffect + setState"
    rationale: "Avoids React 19 set-state-in-effect lint warning and infinite update risk"
  - id: "11-03-02"
    decision: "Paper styling uses bg-card (semantic token) not hardcoded white"
    rationale: "Automatically adapts to dark mode without manual color overrides"
  - id: "11-03-03"
    decision: "estimateSize only (no measureElement) for virtual scrolling"
    rationale: "Per research pitfall 2 -- measureElement with smooth scroll causes jank"

metrics:
  duration: "8 min"
  completed: "2026-02-05"
  files_created: 5
  files_modified: 2
---

# Phase 11 Plan 03: Document Renderer with Virtual Scrolling and Clause Highlights Summary

**One-liner:** Five document rendering components with react-markdown, @tanstack/react-virtual paragraph windowing, risk-colored clause highlights with tooltips, and embedded search with match navigation

## What Was Built

### ClauseHighlight (`components/document/clause-highlight.tsx`)
Wrapper component for clause text spans with risk-based visual treatment:
- When `isVisible=false`: renders children transparently (just a clickable span)
- When `isVisible=true`: risk-colored background at 15% opacity with data-clause-id attribute
- When `isActive=true`: stronger 40% opacity background + 3px left border accent
- Hover tooltip shows CUAD category, risk level badge, confidence percentage
- Risk colors: standard (teal), cautious (amber), aggressive (red), unknown (gray)
- Uses existing shadcn Tooltip, Badge components

### DocumentSkeleton (`components/document/document-skeleton.tsx`)
Paper-style loading state with:
- Header bar skeleton (filename, date, status)
- Toolbar skeleton (highlight toggle, search button)
- Paper container with 12-15 text line skeletons of varying widths
- Matches the paper styling (bg-card, rounded-lg, shadow-sm, max-w-3xl)

### DocumentSearch (`components/document/document-search.tsx`)
Search bar using useDocumentSearch hook:
- Compact input with magnifying glass icon
- Match count: "3 of 12 matches" or "No matches" (red text)
- Up/Down arrow buttons for prev/next navigation
- Keyboard: Enter=next, Shift+Enter=prev, Escape=close
- Auto-focuses on open, scrolls virtualizer to active match paragraph

### DocumentToolbar (`components/document/document-toolbar.tsx`)
Toolbar strip above the document:
- Highlight toggle via Switch component with clause count badge
- Current section indicator (derived from first visible paragraph)
- Search button (toggles search bar open/closed)
- Export button placeholder (disabled, handler deferred)

### DocumentRenderer (`components/document/document-renderer.tsx`)
Main document rendering component:
- Converts raw text to markdown via convertToMarkdown + splitIntoParagraphs (useMemo)
- Maps clause positions to markdown coordinates via mapClausePositions (useMemo)
- Pre-computes paragraph-to-clause overlap Map (useMemo)
- Virtual scrolling via @tanstack/react-virtual useVirtualizer (estimateSize=80, overscan=10)
- Each paragraph rendered as ParagraphRow (React.memo):
  - No clauses: plain Markdown render with custom h1-h3 + p components
  - With clauses: split into TextSegments, wrap clause segments in ClauseHighlight
- Paper styling: bg-card, max-w-3xl, rounded-lg, shadow-sm, px-8 py-10
- Metadata header: title, upload date, page count, status badge
- Section tracking: useMemo-derived from first visible virtual item

## Task Summary

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install deps + clause highlight, skeleton, search | 0ed55ff | clause-highlight.tsx, document-skeleton.tsx, document-search.tsx, package.json |
| 2 | Document renderer with virtual scrolling and toolbar | 215c17f | document-renderer.tsx, document-toolbar.tsx |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| useMemo for section tracking | Avoids React 19 set-state-in-effect warning; derived state pattern is more correct |
| bg-card semantic token for paper | Adapts to dark mode automatically without manual overrides |
| estimateSize only (no measureElement) | Research pitfall 2: measureElement + smooth scroll causes jank |
| ParagraphRow as React.memo | Prevents re-render of all paragraphs when clause selection changes |
| Pre-computed paragraph-clause Map | O(1) lookup per paragraph during render instead of O(clauses) filter |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- TypeScript compilation: zero errors in components/document/
- ESLint: zero errors (only pre-existing index.js parse error)
- `pnpm build` succeeds
- react-markdown and @tanstack/react-virtual installed in package.json
- DocumentRenderer accepts rawText, sections, clauses props and renders styled markdown
- ClauseHighlight shows risk-colored spans with tooltip on hover
- Virtual scrolling renders only visible paragraphs via useVirtualizer
- Search bar finds and navigates between matches

## Next Phase Readiness

Plan 11-03 provides all five document rendering components that Plan 11-05 (split-panel layout) will compose into the analysis page. Plan 11-07 (bidirectional navigation) will use data-clause-id attributes for scroll-to targeting. No blockers for downstream plans.
