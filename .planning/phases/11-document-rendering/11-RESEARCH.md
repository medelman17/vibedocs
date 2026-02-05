# Phase 11: Document Rendering - Research

**Researched:** 2026-02-05
**Domain:** Document rendering with clause highlighting, bidirectional navigation, split-panel layout
**Confidence:** HIGH (codebase analysis + verified library documentation)

## Summary

Phase 11 transforms VibeDocs from a chat-centric UI into a document-centric analysis interface. The core challenge is rendering extracted NDA text with clause-level highlighting and bidirectional navigation between a document panel (left) and an analysis panel (right, with tabs for Classifications/Risk/Gaps/Chat).

The existing codebase has all the data infrastructure in place: `documents.rawText` stores the full extracted text, `clauseExtractions` and `chunkClassifications` store clause positions via `startPosition`/`endPosition` character offsets, and `documentChunks` provide ordered text segments with `sectionPath` hierarchy. The existing `DocumentViewer` is a mock placeholder, and the `AnalysisView` is a monolithic component that currently renders classifications, risk assessments, gap analysis, and clause cards in a single scrollable column. Both need significant rework.

The key architectural decision is that document text is NOT markdown -- it's raw extracted text with character-offset positions mapping to clause boundaries. Using `react-markdown` as the renderer means converting raw text to markdown first (adding heading syntax based on `DocumentStructure.sections`), then mapping character offsets through the conversion. An alternative approach is direct DOM rendering with the raw text, applying clause overlays via character offsets. The markdown approach is user-decided, so the conversion layer is the critical path.

**Primary recommendation:** Build a raw-text-to-markdown conversion layer that preserves character offset mapping, use `react-markdown` with custom component renderers that inject clause `data-*` attributes for highlighting, and use `@tanstack/react-virtual` for virtualizing the document. Use `react-resizable-panels` (already installed) for the split layout with `ResizablePanelGroup`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-markdown` | ^9.x | Render document text as structured markdown | User decision; supports custom `components` prop for clause wrapping |
| `@tanstack/react-virtual` | ^3.x | Virtualize long document rendering | User decision; headless hook, dynamic measurement, `scrollToIndex` API |
| `react-resizable-panels` | ^4.5.7 (installed) | Split-panel document/analysis layout | Already installed, shadcn `ResizablePanelGroup` wrapper exists |
| `zustand` | ^5.0.11 (installed) | Shared clause selection state | Already used for shell store; extend for clause navigation state |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `streamdown` | ^2.1.0 (installed) | Streaming markdown renderer | Already used for chat messages; NOT suitable for document rendering because it lacks the custom component injection needed for clause highlighting |
| `remark-gfm` | ^4.x | GitHub-flavored markdown (tables, etc.) | Only if NDAs contain tables; likely not needed for initial implementation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-markdown` | Direct DOM rendering with `<span>` overlays | Simpler offset mapping, but loses markdown heading/paragraph semantics; user chose markdown |
| `@tanstack/react-virtual` | Native `overflow-y: auto` | Simpler but poor performance for documents > ~50 pages; user chose virtual scrolling |
| `react-resizable-panels` | Fixed CSS grid ratio | Simpler but user expects resizability per Claude's Discretion |

**Installation:**
```bash
pnpm add react-markdown @tanstack/react-virtual
```

Note: `react-resizable-panels`, `zustand`, `lucide-react` are already installed.

## Architecture Patterns

### Recommended Project Structure
```
components/
├── document/                    # NEW: Document rendering components
│   ├── document-renderer.tsx    # Main markdown renderer with clause overlays
│   ├── document-toolbar.tsx     # Search, highlight toggle, export controls
│   ├── document-search.tsx      # Built-in text search with match navigation
│   ├── clause-highlight.tsx     # Clause highlight wrapper component
│   └── document-skeleton.tsx    # Skeleton loader during fetch
├── analysis/                    # REFACTOR: Extract from analysis-view.tsx
│   ├── analysis-tabs.tsx        # Tab container: Classifications | Risk | Gaps | Chat
│   ├── classification-tab.tsx   # Extracted from ClassificationView
│   ├── risk-tab.tsx             # Extracted from clause cards + executive summary
│   ├── gaps-tab.tsx             # Extracted from GapsView
│   └── chat-tab.tsx             # Embedded chat (extracted from chat page)
├── artifact/
│   ├── document-viewer.tsx      # REWRITE: Real document viewer (replaces mock)
│   ├── analysis-view.tsx        # REWRITE: Tabbed analysis panel
│   └── index.ts                 # Barrel (lightweight, safe)
hooks/
├── use-clause-selection.ts      # NEW: Shared clause selection + navigation state
├── use-document-search.ts       # NEW: Text search with match tracking
lib/
├── document-rendering/          # NEW: Conversion utilities
│   ├── text-to-markdown.ts      # Raw text → markdown with offset map
│   ├── offset-mapper.ts         # Character offset tracking through markdown conversion
│   └── types.ts                 # Rendering-specific types
```

### Pattern 1: Raw Text to Markdown Conversion with Offset Mapping

**What:** Convert `documents.rawText` into markdown syntax using `DocumentStructure.sections` for headings, while maintaining a character offset map that translates original positions to rendered positions.

**When to use:** When rendering the document in the markdown viewer and needing to highlight clause spans.

**Why this is critical:** The pipeline stores clause positions as character offsets in the raw text. When we convert to markdown (adding `#`, `##` prefixes, etc.), the character positions shift. We need a mapping table to translate `clauseExtractions.startPosition` to the equivalent position in the markdown string.

**Example:**
```typescript
// Source: Project-specific pattern
interface OffsetMapping {
  /** Original character offset in rawText */
  original: number
  /** Corresponding offset in the markdown string */
  markdown: number
}

interface MarkdownConversion {
  /** The markdown string with heading syntax added */
  markdown: string
  /** Ordered array of offset mappings for translation */
  offsetMap: OffsetMapping[]
}

function convertToMarkdown(
  rawText: string,
  sections: PositionedSection[]
): MarkdownConversion {
  // Sort sections by startOffset
  const sorted = [...sections].sort((a, b) => a.startOffset - b.startOffset)

  let markdown = ''
  let originalPos = 0
  let markdownPos = 0
  const offsetMap: OffsetMapping[] = []

  for (const section of sorted) {
    // Copy text before this section
    if (section.startOffset > originalPos) {
      const textBefore = rawText.slice(originalPos, section.startOffset)
      markdown += textBefore
      markdownPos += textBefore.length
      originalPos = section.startOffset
    }

    // Add heading prefix based on level
    const prefix = '#'.repeat(section.level) + ' '
    markdown += prefix

    // Record offset shift
    offsetMap.push({ original: originalPos, markdown: markdownPos })
    markdownPos += prefix.length

    // The section content follows naturally
  }

  // Copy remaining text
  if (originalPos < rawText.length) {
    const remaining = rawText.slice(originalPos)
    markdown += remaining
  }

  return { markdown, offsetMap }
}

function translateOffset(
  originalOffset: number,
  offsetMap: OffsetMapping[]
): number {
  // Binary search for the nearest mapping point
  // and calculate the shifted position
  let shift = 0
  for (const mapping of offsetMap) {
    if (mapping.original > originalOffset) break
    shift = mapping.markdown - mapping.original
  }
  return originalOffset + shift
}
```

### Pattern 2: Clause-Aware Custom Markdown Renderers

**What:** Use `react-markdown`'s `components` prop to wrap text nodes that fall within clause boundaries with highlighting `<span>` elements.

**When to use:** For rendering the document with interactive clause highlights.

**Example:**
```typescript
// Source: react-markdown docs (Context7 verified)
import Markdown from 'react-markdown'

// Pre-process: split markdown into segments aligned with clause boundaries
// Each segment knows if it's part of a clause and which one

interface ClauseSegment {
  text: string
  clauseId?: string
  category?: string
  riskLevel?: string
}

function DocumentRenderer({
  markdown,
  clauseSegments,
  activeClauseId,
  onClauseClick,
}: {
  markdown: string
  clauseSegments: ClauseSegment[]
  activeClauseId: string | null
  onClauseClick: (clauseId: string) => void
}) {
  return (
    <Markdown
      components={{
        h1: ({ children, ...props }) => (
          <h1 className="text-2xl font-bold mt-8 mb-3" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2 className="text-xl font-semibold mt-6 mb-2" {...props}>
            {children}
          </h2>
        ),
        p: ({ children, ...props }) => (
          <p className="text-base leading-relaxed mb-4" {...props}>
            {children}
          </p>
        ),
      }}
    >
      {markdown}
    </Markdown>
  )
}
```

### Pattern 3: Bidirectional Scroll Navigation with Shared State

**What:** A zustand store that tracks the selected clause, providing scroll-to methods for both panels.

**When to use:** When user clicks a clause in either panel.

**Example:**
```typescript
// Source: Project pattern (zustand store)
import { create } from 'zustand'

interface ClauseSelectionState {
  /** Currently selected clause ID */
  activeClauseId: string | null
  /** Source of the selection (which panel initiated it) */
  selectionSource: 'document' | 'analysis' | null
  /** Whether clause highlights are enabled */
  highlightsEnabled: boolean

  // Actions
  selectClause: (clauseId: string, source: 'document' | 'analysis') => void
  clearSelection: () => void
  toggleHighlights: () => void
}

export const useClauseSelection = create<ClauseSelectionState>((set) => ({
  activeClauseId: null,
  selectionSource: null,
  highlightsEnabled: false, // Default off per user decision

  selectClause: (clauseId, source) =>
    set({ activeClauseId: clauseId, selectionSource: source }),

  clearSelection: () =>
    set({ activeClauseId: null, selectionSource: null }),

  toggleHighlights: () =>
    set((state) => ({ highlightsEnabled: !state.highlightsEnabled })),
}))
```

### Pattern 4: Virtual Document with scrollToIndex

**What:** Use `@tanstack/react-virtual` to virtualize paragraph-level rendering, with `scrollToIndex` for clause navigation.

**When to use:** For rendering long documents efficiently.

**Key insight from TanStack docs:** `scrollToIndex` with smooth scroll does NOT work with dynamically measured elements. Must use `estimateSize` with generous estimates, or pre-measure paragraph heights.

**Example:**
```typescript
// Source: TanStack Virtual docs (Context7 verified)
import { useVirtualizer } from '@tanstack/react-virtual'

function VirtualDocument({ paragraphs, onScrollToClause }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: paragraphs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Generous estimate for paragraph height
    overscan: 10, // Render 10 items above/below viewport
  })

  // Scroll to a specific paragraph
  const scrollToParagraph = (index: number) => {
    virtualizer.scrollToIndex(index, {
      align: 'center',
      behavior: 'smooth', // Only works with estimateSize, not dynamic
    })
  }

  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {/* Render paragraph with clause highlights */}
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Pattern 5: Progressive Reveal with Inngest Realtime

**What:** Show document text immediately after extraction, then layer in clause highlights and analysis results as pipeline stages complete.

**When to use:** After upload, when navigating directly to the document view.

**Example:**
```typescript
// Source: Project pattern (existing useAnalysisProgress hook)
// The document rawText is available after parsing stage (~5% progress)
// Classifications appear after classifying stage (~50%)
// Risk assessments appear after scoring stage (~75%)
// Gap analysis appears after analyzing_gaps stage (~90%)

function useProgressiveAnalysis(analysisId: string) {
  const progress = useAnalysisProgress(analysisId)

  return {
    // Document text available early
    hasDocumentText: progress.progress >= 10,
    // Clause boundaries available after classification
    hasClassifications: progress.progress >= 55,
    // Risk levels available after scoring
    hasRiskAssessments: progress.progress >= 80,
    // Gap analysis available at completion
    hasGapAnalysis: progress.status === 'completed',
  }
}
```

### Pattern 6: ResizablePanelGroup for Split Layout

**What:** Use the existing shadcn `ResizablePanelGroup` wrapper around `react-resizable-panels` for the document/analysis split.

**When to use:** Desktop layout with document on left, analysis on right.

**Example:**
```typescript
// Source: react-resizable-panels docs (Context7 verified)
// + existing project component: components/ui/resizable.tsx
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'

function AnalysisLayout({ documentPanel, analysisPanel }) {
  return (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel defaultSize={55} minSize={35}>
        {documentPanel}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={45} minSize={30}>
        {analysisPanel}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
```

### Anti-Patterns to Avoid

- **Rendering full rawText in a single DOM node:** For documents > 50 pages, this will cause jank. Always virtualize.
- **Smooth scrollToIndex with measureElement:** TanStack Virtual explicitly warns this combination doesn't work. Use `estimateSize` for smooth scrolling, or accept instant jumps with dynamic measurement.
- **Storing rendered markdown in the database:** The markdown is a view concern. Store `rawText` and `DocumentStructure`, derive markdown at render time.
- **Separate zustand stores for document and analysis selection:** One shared store prevents synchronization bugs.
- **Re-rendering the full document when a clause is selected:** Only update the highlight styles, not the document content. Use CSS class toggling via `data-clause-id` attributes.
- **Using barrel exports for document/analysis components:** Per project convention, keep imports explicit to avoid production crashes from heavy dependency chains.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown rendering | Custom HTML parser | `react-markdown` with `components` prop | Handles edge cases (nested formatting, escaping, XSS) |
| Virtual scrolling | Manual DOM recycling | `@tanstack/react-virtual` | Handles dynamic measurement, scroll position, keyboard nav |
| Panel resizing | CSS resize handles | `react-resizable-panels` (already installed) | Handles drag, keyboard, persistence, constraints |
| Text search in document | Custom RegExp + scroll | Built-in browser `window.find()` is insufficient; use custom search with `mark` wrapping | Need match count, prev/next navigation, highlight control |
| Smooth scroll | `element.scrollIntoView()` | `virtualizer.scrollToIndex()` with align options | Must work with virtualized list, not raw DOM |

**Key insight:** The offset mapping between rawText and markdown is the one genuinely custom piece. Everything else has library solutions.

## Common Pitfalls

### Pitfall 1: Character Offset Drift After Markdown Conversion
**What goes wrong:** Clause `startPosition`/`endPosition` from the DB reference the rawText. After adding markdown heading prefixes (`# `, `## `, etc.), all positions downstream of each insertion shift by the prefix length.
**Why it happens:** The extraction pipeline stores positions relative to `documents.rawText`, not any rendered format.
**How to avoid:** Build an explicit offset mapping table during markdown conversion. Every character insertion (heading prefix, blank lines for paragraph breaks) must be tracked and accumulated.
**Warning signs:** Highlights appearing offset from their actual clause text; highlights wrapping around the wrong text.

### Pitfall 2: Virtual Scrolling + Smooth Scroll Incompatibility
**What goes wrong:** `scrollToIndex({ behavior: 'smooth' })` produces erratic scrolling or jumps to wrong positions when using `measureElement` for dynamic sizing.
**Why it happens:** TanStack Virtual's smooth scroll calculates the target position using `estimateSize`, but with dynamic measurement, the actual positions change as items render. The animation targets a stale offset.
**How to avoid:** Two options: (1) Use generous `estimateSize` values and don't use `measureElement` (accept slightly inaccurate scroll container height), or (2) Use instant scroll (`behavior: 'auto'`) with `measureElement` for pixel-perfect layout.
**Warning signs:** Scroll "bouncing" when navigating to clauses; scroll settling on wrong paragraph.

### Pitfall 3: Stale Clause Data During Progressive Reveal
**What goes wrong:** User clicks a clause in the analysis panel, but the document panel doesn't have that clause's highlight data yet (still processing).
**Why it happens:** Pipeline stages complete asynchronously. Classifications may be done, but risk assessments haven't arrived yet.
**How to avoid:** The clause selection store should be tolerant of missing data. If a clause ID exists in the analysis panel but not in the document's highlight map, show a "loading" state rather than an error. Use the same `useAnalysisProgress` hook to gate feature availability.
**Warning signs:** Click on clause card causes an error or no-op; highlights flash and disappear.

### Pitfall 4: Layout Height Constraints (Known Project Issue)
**What goes wrong:** Document or analysis panel grows beyond viewport, pushing content off-screen.
**Why it happens:** Flex containers without `min-h-0` allow children to grow beyond their parent (documented in project memory: MEMORY.md).
**How to avoid:** Use `h-svh` (NOT `min-h-svh`) on root viewport container. Add `min-h-0` on all flex ancestors. Add `overflow-hidden` on containers that constrain children.
**Warning signs:** Content disappears below fold; scrollbar appears on body instead of panel.

### Pitfall 5: Monolithic AnalysisView Re-renders
**What goes wrong:** Selecting a clause causes the entire analysis panel to re-render (classifications, gaps, risk, all tabs).
**Why it happens:** Current `AnalysisView` is a single ~1400-line component with all tabs inline.
**How to avoid:** Split into tab components. Each tab should be a separate component that subscribes only to its own data. The tab container manages which tab is active but doesn't re-render tab contents.
**Warning signs:** UI lag when clicking between clauses; React DevTools showing unnecessary re-renders.

### Pitfall 6: react-markdown Key Stability with Virtualization
**What goes wrong:** When paragraphs enter/exit the virtual viewport, react-markdown re-parses the markdown for each newly visible item.
**Why it happens:** Virtual items unmount/remount as the user scrolls. Each mount triggers a full markdown parse.
**How to avoid:** Pre-split the markdown into paragraph segments and pass each segment to its own `<Markdown>` instance. This is cheap because individual paragraphs are small. Alternatively, pre-render all paragraphs to React elements once and virtualize the elements.
**Warning signs:** Scroll jank when scrolling fast through long documents.

## Code Examples

### Fetching Document with Clause Data for Rendering

```typescript
// Source: Existing project patterns (db/queries/documents.ts, analyses/actions.ts)
// New server action needed for document rendering

export async function getDocumentForRendering(
  analysisId: string
): Promise<ApiResponse<{
  document: { rawText: string; title: string; metadata: Record<string, unknown> }
  structure: DocumentStructure
  clauses: Array<{
    id: string
    category: string
    riskLevel: string
    startPosition: number
    endPosition: number
    confidence: number
  }>
}>> {
  const { db, tenantId } = await withTenant()

  // Get analysis with document join
  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
  })

  if (!analysis) return err('NOT_FOUND', 'Analysis not found')

  // Get document rawText
  const doc = await getDocumentById(analysis.documentId, tenantId)
  if (!doc) return err('NOT_FOUND', 'Document not found')

  // Get clause positions for highlighting
  const clauseData = await db
    .select({
      id: clauseExtractions.id,
      category: clauseExtractions.category,
      riskLevel: clauseExtractions.riskLevel,
      startPosition: clauseExtractions.startPosition,
      endPosition: clauseExtractions.endPosition,
      confidence: clauseExtractions.confidence,
    })
    .from(clauseExtractions)
    .where(and(
      eq(clauseExtractions.analysisId, analysisId),
      eq(clauseExtractions.tenantId, tenantId)
    ))
    .orderBy(clauseExtractions.startPosition)

  // Parse structure from document metadata or chunks
  const structure = (doc.metadata as { structure?: DocumentStructure })?.structure
    ?? { sections: [], parties: {}, hasExhibits: false, hasSignatureBlock: false, hasRedactedText: false }

  return ok({
    document: { rawText: doc.rawText ?? '', title: doc.title, metadata: doc.metadata as Record<string, unknown> },
    structure,
    clauses: clauseData.map(c => ({
      ...c,
      startPosition: c.startPosition ?? 0,
      endPosition: c.endPosition ?? 0,
    })),
  })
}
```

### Document Text Search Implementation

```typescript
// Source: Custom pattern for document search
interface SearchMatch {
  index: number       // Match index in the text
  start: number       // Character offset
  end: number         // Character offset
  paragraphIndex: number  // Which paragraph this match is in
}

function useDocumentSearch(text: string, paragraphOffsets: number[]) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [activeMatch, setActiveMatch] = useState(0)

  useEffect(() => {
    if (!query || query.length < 2) {
      setMatches([])
      setActiveMatch(0)
      return
    }

    const found: SearchMatch[] = []
    const lowerText = text.toLowerCase()
    const lowerQuery = query.toLowerCase()
    let pos = 0
    let matchIndex = 0

    while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
      // Find which paragraph this offset belongs to
      const paragraphIndex = paragraphOffsets.findIndex(
        (offset, i) => pos >= offset && (i === paragraphOffsets.length - 1 || pos < paragraphOffsets[i + 1])
      )

      found.push({
        index: matchIndex++,
        start: pos,
        end: pos + query.length,
        paragraphIndex,
      })
      pos += 1
    }

    setMatches(found)
    setActiveMatch(0)
  }, [query, text, paragraphOffsets])

  return {
    query, setQuery,
    matches,
    activeMatch,
    nextMatch: () => setActiveMatch(i => (i + 1) % matches.length),
    prevMatch: () => setActiveMatch(i => (i - 1 + matches.length) % matches.length),
    totalMatches: matches.length,
  }
}
```

### Clause Tooltip Component

```typescript
// Source: Extend existing shadcn tooltip
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

function ClauseTooltip({
  children,
  category,
  riskLevel,
  confidence,
}: {
  children: React.ReactNode
  category: string
  riskLevel: string
  confidence: number
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent className="flex items-center gap-2">
          <span className="text-xs font-medium">{category}</span>
          <RiskBadge level={riskLevel} />
          <Badge variant="outline" className="text-xs">
            {Math.round(confidence * 100)}%
          </Badge>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

## Claude's Discretion Recommendations

Based on research, here are recommendations for areas left to Claude's discretion:

### Color-coding scheme for clause highlights
**Recommendation: Risk-based color coding** (not category-based). The existing `riskConfig` already defines oklch colors for standard/cautious/aggressive/unknown. Reuse these colors at lower opacity (e.g., `oklch(0.90 0.08 175 / 0.3)` for standard) as background highlights. This is immediately meaningful to users without learning 41 CUAD category colors.

### Selected clause highlight style
**Recommendation: Background fill + left border accent.** Background fill at ~20% opacity for hover, ~40% for active. Add a 3px left border in the risk color for the actively selected clause. This provides clear visual hierarchy without being intrusive.

### TOC sidebar
**Recommendation: No TOC sidebar initially.** The bidirectional navigation between document sections and analysis tabs serves the same purpose. Add TOC as a future enhancement if users request it.

### Keyboard arrow navigation between clauses
**Recommendation: Yes, implement.** Arrow up/down to move between clauses when highlights are enabled. This is low cost and high value for keyboard-centric users reviewing legal documents.

### Active clause persistence behavior
**Recommendation: Persist until new selection.** Clearing on scroll is jarring and loses context. Clearing only happens when the user explicitly clicks another clause or presses Escape.

### Panel split ratio and resizability
**Recommendation: ResizablePanelGroup with 55/45 default ratio.** Document gets slightly more space as it's the primary reading surface. Min 35% for document, min 30% for analysis. Use the existing shadcn `ResizableHandle` with `withHandle` for visual affordance.

### Responsive layout behavior on smaller screens
**Recommendation: Stack vertically on mobile/tablet (<1024px).** Document on top, analysis tabs below. On mobile, use the existing Sheet pattern (bottom sheet for analysis) from `AppBody`.

### Document dark mode treatment
**Recommendation: Respect app theme.** The "paper" styling (white card with shadow) should use `bg-card` which adapts to dark mode. This avoids a jarring bright-white region in dark mode.

### Scroll position indicator
**Recommendation: Sticky section header.** Show the current section title (from `sectionPath`) in a subtle sticky bar below the document toolbar. This provides wayfinding without taking up significant space.

### Page break preservation
**Recommendation: Skip for MVP.** The extraction pipeline doesn't reliably preserve page breaks. Section headings from `DocumentStructure.sections` provide sufficient navigation landmarks.

### Line/paragraph numbering
**Recommendation: No.** Legal documents don't have standardized line numbering. Paragraph numbering would conflict with the document's own numbering (Article 1, Section 2, etc.).

### Annotation/note-taking support
**Recommendation: Defer.** This is a significant feature set (persistence, collaboration, etc.). Not in scope for Phase 11.

### On-demand AI clause explanation
**Recommendation: Implement via "Ask about this" in chat tab.** Selecting a clause and clicking "Ask about this" switches to the Chat tab with the clause text pre-filled as context. No separate explanation UI needed.

### Zoom controls
**Recommendation: No custom zoom.** Browser zoom (Cmd/Ctrl +/-) works fine. Adding custom zoom adds complexity without clear value.

### Highlight/coloring controls placement
**Recommendation: Document toolbar.** A toggle switch for highlights on/off, placed in the document toolbar strip alongside search and export. Keep it simple -- one toggle, not a full color picker.

### Chat panel auto-open behavior on "Ask about this"
**Recommendation: Switch to Chat tab in the analysis panel.** Do NOT auto-open a separate panel. The Chat tab is already part of the analysis tabs.

### Analysis tab disabled vs empty state during progressive reveal
**Recommendation: Show tabs always, with empty states.** Disabled tabs are confusing. Show "Classifications will appear as analysis progresses..." with a subtle spinner. This is consistent with the progressive reveal pattern.

### URL state for shareable clause links
**Recommendation: Yes, implement.** Use URL search params: `?analysis=<id>&clause=<id>`. On load, auto-scroll to and highlight the specified clause. Low cost, high value for sharing findings.

### Sidebar collapse behavior in document view
**Recommendation: Auto-collapse sidebar when entering document view.** This maximizes horizontal space for the split layout. User can re-open via the existing sidebar trigger.

### Analysis detail page routing
**Recommendation: Use `/analysis/[analysisId]` route.** Navigating to an analysis directly opens the document view with analysis panel. The `/chat` route remains for general chat.

### Print/export implementation
**Recommendation: `react-to-print` for MVP.** Server-side PDF is more complex and can be added later. `react-to-print` captures the current document view, optionally including analysis annotations based on the user toggle.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `react-window` for virtualization | `@tanstack/react-virtual` (headless) | 2023+ | More flexible, works with any DOM structure |
| `framer-motion` for animations | `motion/react` (project convention) | Late 2024 | Same library, new import path |
| Custom markdown parser | `react-markdown` v9 with rehype/remark plugins | Stable | Standard approach, well-maintained |
| Fixed panel layouts | `react-resizable-panels` v4 | 2024 | Keyboard accessible, CSS unit sizing support |

**Deprecated/outdated:**
- `react-virtualized`: Superseded by `react-window` and then `@tanstack/react-virtual`
- `react-markdown` v8 `renderers` prop: Renamed to `components` in v9

## Open Questions

1. **Document structure storage location**
   - What we know: The `DocumentStructure` is produced by the parser agent. `documents.metadata` JSONB field could store it, or it could be reconstructed from `documentChunks.sectionPath`.
   - What's unclear: Whether the parser agent currently persists the full `DocumentStructure` object to the database (vs just using it transiently during chunking).
   - Recommendation: Check the `analyze-nda` Inngest function to see if structure is persisted. If not, add a `structure` field to `documents.metadata` during the parsing step.

2. **Clause position accuracy**
   - What we know: `clauseExtractions.startPosition`/`endPosition` are set from `documentChunks.startPosition`/`endPosition`, which are set during the chunking phase.
   - What's unclear: How accurate these positions are in practice. The chunking phase uses `chunkType` discriminators and may have overlap regions. Clause positions may not perfectly align with visually meaningful text spans.
   - Recommendation: During implementation, validate positions against actual rawText with sample documents. Build a tolerance mechanism (snap to nearest paragraph boundary if off by < N chars).

3. **Chat embedding as a tab**
   - What we know: The existing chat uses `useChat` with `DefaultChatTransport`, and the current UI is a full-page layout with sidebar. Moving chat into a tab requires extracting the chat logic from `chat/page.tsx`.
   - What's unclear: Whether the existing `useChat` hook can be used within a non-page component (tab panel) without issues with transport lifecycle.
   - Recommendation: Extract chat into a reusable component that accepts `conversationId` as a prop. The tab mounts/unmounts cleanly if the hook handles cleanup.

## Sources

### Primary (HIGH confidence)
- TanStack Virtual docs (`/websites/tanstack_virtual`) - Virtualizer API, scrollToIndex, smooth scroll, dynamic measurement
- react-markdown docs (`/remarkjs/react-markdown`) - Custom components prop, plugin pipeline, configuration options
- react-resizable-panels docs (`/bvaughn/react-resizable-panels`) - Panel API, imperative control, CSS unit sizing
- Project codebase analysis - All existing component/schema/hook inspection

### Secondary (MEDIUM confidence)
- TanStack Virtual smooth scroll warning about dynamic measurement ([GitHub Issue #659](https://github.com/TanStack/virtual/issues/659))
- [TanStack Virtual smooth scroll example](https://tanstack.com/virtual/v3/docs/framework/react/examples/smooth-scroll)

### Tertiary (LOW confidence)
- None. All findings verified against primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via Context7 and existing project dependencies
- Architecture: HIGH - Based on thorough analysis of existing codebase patterns, data model, and component structure
- Pitfalls: HIGH - Identified from library documentation warnings, project memory (MEMORY.md), and data model analysis

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (stable libraries, 30-day window)
