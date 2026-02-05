---
phase: 11
plan: 05
subsystem: document-rendering
tags: [split-panel, resizable, analysis-route, navigation, document-viewer]

dependency_graph:
  requires:
    - "11-03 (DocumentRenderer, DocumentSkeleton, ClauseHighlight)"
    - "11-04 (AnalysisView with AnalysisTabs)"
  provides:
    - "/analysis/[analysisId] route with split-panel layout"
    - "Rewritten DocumentViewer using real DocumentRenderer"
    - "Chat-to-analysis navigation (upload and showArtifact)"
  affects:
    - "11-06 (bidirectional clause navigation between panels)"
    - "11-07 (chat tab integration in analysis view)"
    - "11-08 (responsive layout enhancements)"

tech_stack:
  added: []
  patterns:
    - "ResizablePanelGroup (react-resizable-panels) for split layout"
    - "useSidebar().setOpen(false) for auto-collapse on mount"
    - "useIsMobile() for responsive stacking"
    - "Server action data fetch with cancelled flag for cleanup"

key_files:
  created:
    - app/(main)/analysis/[analysisId]/page.tsx
    - app/(main)/analysis/[analysisId]/layout.tsx
  modified:
    - components/artifact/document-viewer.tsx
    - app/(main)/chat/page.tsx

decisions:
  - id: "11-05-01"
    decision: "Reuse ChatLayoutClient for analysis route layout"
    rationale: "ChatLayoutClient provides sidebar, header, and auth shell generically; no need for a separate layout component"
  - id: "11-05-02"
    decision: "Use orientation prop (not direction) for ResizablePanelGroup"
    rationale: "react-resizable-panels v3 renamed direction to orientation"
  - id: "11-05-03"
    decision: "Analysis mentions and showArtifact navigate to /analysis/[id] instead of opening artifact panel"
    rationale: "Full analysis page is the primary interface per user decision; artifact panel reserved for document/comparison types"

metrics:
  duration: "7.0 min"
  completed: "2026-02-05"
  files_created: 2
  files_modified: 2
---

# Phase 11 Plan 05: Split-Panel Layout and Analysis Navigation Summary

**One-liner:** /analysis/[analysisId] route with resizable 55/45 split-panel layout (DocumentRenderer left, AnalysisView right), rewritten DocumentViewer, and chat-to-analysis navigation

## What Was Built

### Analysis Route Layout (`layout.tsx`)
Server component that:
- Calls `verifySession()` for auth check
- Reuses `ChatLayoutClient` from chat module for sidebar/header shell
- Maps session user to the AppSidebar User type
- Analysis route appears as dynamic route (`/analysis/[analysisId]`) in build output

### Analysis Detail Page (`page.tsx`)
Client component with split-panel analysis interface:
- Uses `useParams()` to extract `analysisId` from URL
- Fetches document rendering data via `getDocumentForRendering` server action
- Desktop: `ResizablePanelGroup` with orientation="horizontal", 55/45 default split
  - Left panel: `DocumentRenderer` with rawText, sections, clauses, metadata
  - Right panel: `AnalysisView` with analysisId (renders AnalysisTabs internally)
  - `ResizableHandle` with drag grip between panels
  - minSize constraints: 35% document, 30% analysis
- Mobile: Vertical stack (document top, analysis bottom) via `useIsMobile()`
- Auto-collapses sidebar on mount via `useSidebar().setOpen(false)` for maximum horizontal space
- Loading state: `DocumentSkeleton` in document panel, AnalysisView has own progress state
- Error state: Centered error icon with message

### DocumentViewer Rewrite
Replaced mock data viewer with real implementation:
- Fetches document data via `getDocumentForRendering` (accepts analysisId despite prop name `documentId`)
- Renders using `DocumentRenderer` with clause highlights, toolbar, and search
- Loading state via `DocumentSkeleton`
- Error state with descriptive message and ID display
- Used in artifact panel for document-type artifacts

### Chat Navigation Updates
Three navigation changes in chat page:
1. **File upload success**: `router.push('/analysis/${analysisResult.data.id}')` instead of `openArtifact()`
2. **showArtifact tool (analysis type)**: Navigate to `/analysis/[id]` instead of opening artifact panel
3. **@mention (analysis type)**: Navigate to `/analysis/[id]` instead of opening artifact panel
4. Artifact panel preserved for "document" and "comparison" types

## Task Summary

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create analysis detail route with split-panel layout | 9e9c02a | layout.tsx, page.tsx |
| 2 | Rewrite DocumentViewer and update chat page navigation | 8921409 | document-viewer.tsx, page.tsx (chat) |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Reuse ChatLayoutClient for analysis layout | Generic sidebar/header shell; avoids duplicating layout logic |
| orientation prop (not direction) | react-resizable-panels v3 API change |
| Navigate to /analysis/[id] for all analysis references | Full split-panel page is the primary analysis interface |
| Keep artifact panel for document/comparison types | These don't have dedicated routes yet |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `pnpm build` succeeds with zero errors
- `/analysis/[analysisId]` listed as dynamic route in build output
- ResizablePanelGroup renders horizontal split with 55/45 default
- DocumentRenderer in left panel, AnalysisView in right panel
- Mobile responsive: vertical stacking via useIsMobile()
- Sidebar auto-collapses on mount
- DocumentViewer uses real document data (no mock data)
- Chat upload navigates to analysis page
- showArtifact for analyses navigates to analysis route

## Next Phase Readiness

Plan 11-05 provides the split-panel layout that:
- **11-06** will wire bidirectional clause navigation between panels
- **11-07** will populate the Chat tab in AnalysisTabs with document-scoped chat
- **11-08** will add responsive refinements and progressive reveal
