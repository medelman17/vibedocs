# Analysis Detail Page Redesign

**Date:** 2026-02-05
**Status:** Approved

## Overview

Redesign the `/analysis/[analysisId]` page with a split-panel layout featuring rich cross-navigation and annotation between the document viewer (left) and analysis panel (right).

## Layout

- `ResizablePanelGroup` with document left (55% default), analysis right (45%)
- Both panels independently scrollable
- Mobile: stack vertically (document top, analysis bottom) with a toggle

## Document Panel (Left)

### Layer 1: Inline Highlights
- Each classified clause gets a low-opacity background tint based on risk level
- Colors (oklch, ~5-8% opacity so text stays readable):
  - Standard: green wash `oklch(0.95 0.05 175)`
  - Cautious: amber wash `oklch(0.95 0.05 65)`
  - Aggressive: red wash `oklch(0.93 0.05 25)`
  - Unknown: no highlight
- Active clause: stronger opacity (~15%) + 2px left border at full risk color

### Layer 2: Margin Gutter
- 24px column on left edge
- Colored dots at each clause's vertical position (risk-level color)
- Atypical language gets an `AlertTriangle` icon
- Dots are clickable (trigger cross-navigation)
- Acts as a minimap for scanning document risk profile

### Layer 3: Hover Tooltips
- `HoverCard` (not Tooltip) on highlight hover or gutter dot hover
- Shows: category name, risk badge, confidence %, one-line risk explanation
- "View details →" link that triggers cross-navigation

### Active Clause Behavior
- Highlight darkens, left border appears
- Smooth scroll to center the clause vertically
- Triggered by: clicking highlight, clicking gutter dot, keyboard nav, or analysis panel selection

## Analysis Panel (Right)

### Sticky Header Bar
- Overall risk score + risk level badge
- Perspective toggle (receiving / disclosing / balanced)
- Filter controls: category dropdown, risk level filter, search
- Actions menu (re-analyze, export, debug info)

### Summary Strip
- Clause count + risk distribution counts (e.g., "24 clauses · 3 aggressive · 8 cautious")
- Coverage progress bar + gap count
- Processing time + token cost (subtle, secondary text)

### Clause Cards (document order)
- Default sort: document position (matches left panel scroll position)
- Alternative sorts: by risk level, by category (via filter controls)
- Each card shows:
  - Category name + risk badge + confidence badge
  - Clause text excerpt (2-3 lines, expandable)
  - Collapsible sub-sections:
    - **Risk explanation**: Why this risk level was assigned
    - **Evidence**: Citations, reference comparisons (CUAD/ContractNLI/Bonterms), baseline comparison
    - **Negotiation tip**: Suggested language changes
  - Atypical language warning (if flagged)
- Active card: ring border + slight elevation, auto-expands sub-sections
- Clicking card triggers cross-navigation to document highlight

### Gap Analysis Section (below clauses)
- Collapsible section header with count: "9 Missing/Incomplete Categories"
- Coverage summary: total categories, present, missing, incomplete, coverage %
- Gap cards:
  - Category + status badge (missing/incomplete) + severity badge (critical/important/informational)
  - Explanation of why this gap matters
  - Suggested language with Copy button
  - Template source attribution

### Chat Drawer (bottom sheet)
- Vaul-based `Drawer` anchored to bottom of analysis panel
- Three snap points:
  - Collapsed (~40px): handle bar with "Ask about this NDA" label, always visible
  - Half (50%): chat + clause cards visible above
  - Full (90%): immersive chat mode
- Chat responses can include clause references as clickable links (trigger cross-navigation)
- Conversation persisted via existing chat persistence system
- RAG-powered: vector search against document chunks + reference embeddings

## Cross-Navigation

### Shared State
- Zustand store (`useClauseSelection`) holds `activeClauseId`
- Both panels subscribe and react to changes
- Active clause ID persisted in URL query param (`?clause={id}`)

### Interactions
| Action | Document Panel | Analysis Panel |
|--------|---------------|----------------|
| Click highlight | Darkens highlight, shows left border | Scrolls to card, expands it |
| Click gutter dot | Same as click highlight | Same |
| Click clause card | Scrolls to clause, darkens highlight | Card gets ring + expands |
| Hover highlight | Shows HoverCard tooltip | Card gets subtle highlight |
| Hover clause card | Highlight gets subtle pulse | — |
| Keyboard ↑/↓ | Moves to prev/next clause | Follows active clause |
| Escape | Deselects active clause | Collapses expanded card |

### Scroll Behavior
- Cross-navigation uses `scrollIntoView({ behavior: 'smooth', block: 'center' })`
- No synchronized scrolling (panels scroll independently)
- Only scroll-to on explicit clause selection, not passive scrolling

## Progress States

### Processing (pipeline in progress)
- Document panel: skeleton → raw text (after parse) → styled sections (after chunk) → highlights (after classify) → colored highlights (after score)
- Analysis panel: pipeline stepper showing completed/active/pending stages with timing
  - ✓ Parsing (2.1s)
  - ✓ Chunking (1.4s)
  - ◉ Classifying... 40%
  - ○ Risk Scoring
  - ○ Gap Analysis
- Progress bar + cancel button
- Progressive reveal: each stage completion animates new content in

### Failed State
- Alert banner with error message + retry/upload actions
- Partial results shown (whatever completed before failure)
- Debug info expandable section

### Cancelled State
- Info banner explaining cancellation
- Partial results if available
- "Start fresh" action

## Implementation Plan

### Step 1: Document Annotation Components
- `ClauseHighlight` — renders highlighted spans with risk-level tinting
- `MarginGutter` — positioned column with colored dots
- `ClauseTooltip` — HoverCard with clause summary
- Update `DocumentRenderer` to accept clause data and render annotations

### Step 2: Analysis Panel Restructure
- `AnalysisHeader` — sticky bar with risk score, perspective toggle, filters
- `SummaryStrip` — KPI cards row
- `ClauseCard` — redesigned card with collapsible evidence/tips sub-sections
- `GapSection` — collapsible gap analysis with gap cards
- Replace tab-based layout with scrollable sections

### Step 3: Chat Drawer
- `ChatDrawer` — Vaul Drawer anchored to analysis panel bottom
- Wire to existing chat API route + persistence
- Add clause reference links in chat responses

### Step 4: Cross-Navigation Wiring
- Enhance `useClauseSelection` store with scroll-to helpers
- Add keyboard navigation (↑/↓/Escape handlers)
- Wire hover states between panels
- URL state sync for active clause

### Step 5: Progress & Error States
- `PipelineStepper` — stage-by-stage progress display
- Progressive reveal logic (re-fetch + animate on stage transitions)
- Partial results display on failure

### Step 6: Polish
- Smooth scroll animations
- `prefers-reduced-motion` support
- Mobile responsive layout (stacked panels + toggle)
- Accessibility: focus management, aria-labels on gutter dots, keyboard nav

## Existing Components to Reuse
- `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle`
- `Card` / `CardHeader` / `CardContent`
- `Badge` for risk levels, categories, confidence
- `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent`
- `HoverCard` / `HoverCardTrigger` / `HoverCardContent`
- `Progress` for coverage bar and pipeline progress
- `Drawer` (Vaul) for chat bottom sheet
- `ScrollArea` for both panels
- `Alert` for error/warning states
- `Separator` between sections
- `Skeleton` for loading states
- `Button` / `DropdownMenu` for actions

## Existing Code to Build On
- `components/artifact/analysis-view.tsx` — refactor into new section-based layout
- `components/analysis/risk-tab.tsx` — extract clause card rendering into standalone `ClauseCard`
- `components/analysis/gaps-tab.tsx` — extract into `GapSection`
- `components/analysis/config.ts` — risk/severity color config (keep as-is)
- `components/document/document-renderer.tsx` — add annotation layer
- `hooks/use-clause-selection.ts` — enhance with scroll-to and keyboard nav
- `hooks/use-analysis-progress.ts` — keep for polling, add stage transition detection
- `app/(main)/(dashboard)/analyses/actions.ts` — all data fetching already exists
