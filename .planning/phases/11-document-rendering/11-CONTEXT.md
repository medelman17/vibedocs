# Phase 11: Document Rendering - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Display extracted documents with clause highlighting and bidirectional navigation in the UI. The document view becomes the primary analysis interface — document on the left, analysis tabs (Classifications, Risk, Gaps, Chat) on the right. Users can click clauses in either panel to navigate to the corresponding position in the other. Progressive reveal shows the document immediately after upload, with analysis results appearing as pipeline stages complete.

</domain>

<decisions>
## Implementation Decisions

### Document Layout
- Flat with styled headings — sections flow top-to-bottom with typographic hierarchy (bold/size) like a real contract, no indentation
- Full text always visible — no collapsible sections
- No visible clause boundaries — text flows naturally; boundaries only become visible on hover or when highlighted
- Clean/modern typography — sans-serif, generous spacing, matches the rest of the app
- Paper style rendering — white card with shadow, constrained width, page-like feel (like Notion/Google Docs)
- Metadata header bar — sticky header above document with file name, upload date, page count, status badge
- Full text selection plus convenience copy button per clause
- Virtual scrolling via @tanstack/react-virtual for handling long documents
- Built-in text search with match highlighting and prev/next navigation
- Print/export button with user toggle for including analysis annotations
- Skeleton loader while document data is being fetched

### Clause Highlighting
- Toggle on/off — global toggle, default off for clean reading, on for analysis mode
- Rich tooltip on hover — shows CUAD category, risk level badge, confidence score
- Modify existing shadcn components as needed for tooltips/popovers

### Bidirectional Navigation
- Smooth scroll + center when clicking a clause in the analysis panel — animated scroll, clause centered in viewport
- Scroll + expand when clicking a clause in the document — analysis panel scrolls to that clause and auto-expands its detail card
- Chat auto-context — chat tab automatically knows which clause is selected

### Column Layout
- Document replaces chat as the primary left panel when viewing an analysis
- Analysis panel on the right with tabbed views: Classifications | Risk | Gaps | Chat
- Chat embedded as a tab in the analysis panel (existing /chat route feature-flagged/secondary)
- Document panel has its own toolbar strip (search, highlight toggle, export controls)
- Analysis panel has tab bar + toolbar with view-specific controls (filter, sort, search within analysis)
- Progressive reveal — document view opens immediately after upload, text appears as extraction completes, highlights/analysis added as stages finish
- Document view is the primary analysis interface — navigated to directly when clicking an analysis

### Component Strategy
- Extend existing artifact panel — build document view inside the existing artifact panel component
- Modify existing shadcn components as needed (not create new libraries)
- Markdown renderer (react-markdown) with custom renderers for headings/paragraphs
- @tanstack/react-virtual for document virtualization
- Chat integration — selecting text in document with 'Ask about this' sends clause context to chat tab

### Claude's Discretion
- Color-coding scheme for clause highlights (risk-based vs category-based, or user toggle)
- Selected clause highlight style (background fill, underline + side accent, or outline + pulse)
- TOC sidebar vs no TOC (bidirectional navigation may be sufficient)
- Keyboard arrow navigation between clauses
- Active clause persistence behavior (persist until new selection vs clear on scroll)
- Panel split ratio and resizability (ResizablePanelGroup vs fixed ratio)
- Responsive layout behavior on smaller screens
- Document dark mode treatment (respect app theme vs always light)
- Scroll position indicator (progress bar, sticky section header, or neither)
- Page break preservation (depends on extraction pipeline data)
- Line/paragraph numbering
- Annotation/note-taking support
- On-demand AI clause explanation
- Zoom controls vs browser zoom
- Existing view modification vs wrapper components for navigation
- Highlight/coloring controls placement
- Chat panel auto-open behavior on 'Ask about this'
- Analysis tab disabled vs empty state during progressive reveal
- URL state for shareable clause links
- Sidebar collapse behavior in document view
- Analysis detail page routing
- Print/export implementation (react-to-print vs server-side PDF)

</decisions>

<specifics>
## Specific Ideas

- Document should feel like a paper document (white card, shadow, constrained width) — Notion/Google Docs aesthetic
- Chat becomes part of the analysis panel as a tab — not a separate panel or overlay
- Upload should go directly to the document view with progressive reveal — no intermediate progress page
- "Ask about this" clause integration between document and chat tab
- Existing shadcn components should be modified/extended rather than creating parallel component hierarchies

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-document-rendering*
*Context gathered: 2026-02-05*
