"use client"

import * as React from "react"
import Markdown from "react-markdown"
import { useVirtualizer } from "@tanstack/react-virtual"
import { FileTextIcon, CalendarIcon, FileIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { convertToMarkdown, splitIntoParagraphs } from "@/lib/document-rendering/text-to-markdown"
import { mapClausePositions } from "@/lib/document-rendering/offset-mapper"
import type { PositionedSection, ClauseOverlay, DocumentSegment } from "@/lib/document-rendering/types"
import { ClauseHighlight } from "@/components/document/clause-highlight"
import { DocumentToolbar } from "@/components/document/document-toolbar"
import { DocumentSearch } from "@/components/document/document-search"
import { DocumentSkeleton } from "@/components/document/document-skeleton"
import { useClauseSelection } from "@/hooks/use-clause-selection"

// ============================================================================
// Types
// ============================================================================

interface ClauseInput {
  id: string
  category: string
  riskLevel: string
  startPosition: number | null
  endPosition: number | null
  confidence: number
  clauseText: string
  riskExplanation: string | null
}

interface TokenUsageData {
  total?: { input?: number; output?: number; estimatedCost?: number }
}

interface DocumentRendererProps {
  rawText: string
  sections: PositionedSection[]
  clauses: ClauseInput[]
  isLoading: boolean
  /** Document title / filename */
  title?: string
  /** Document metadata */
  metadata?: Record<string, unknown>
  /** Analysis status */
  status?: string
  /** Token usage data (shown only when analysis is complete) */
  tokenUsage?: TokenUsageData | null
}

// ============================================================================
// Clause Segment Splitting
// ============================================================================

interface TextSegment {
  text: string
  clause: ClauseOverlay | null
}

/**
 * Split paragraph text into segments of clause-highlighted and non-clause text.
 * This enables wrapping clause text in ClauseHighlight components.
 */
function splitParagraphIntoSegments(
  paragraphText: string,
  paragraphStart: number,
  overlappingClauses: ClauseOverlay[]
): TextSegment[] {
  if (overlappingClauses.length === 0) {
    return [{ text: paragraphText, clause: null }]
  }

  const paragraphEnd = paragraphStart + paragraphText.length
  const segments: TextSegment[] = []
  let cursor = paragraphStart

  // Sort clauses by their markdown start position within this paragraph
  const sorted = [...overlappingClauses].sort(
    (a, b) => a.markdownStart - b.markdownStart
  )

  for (const clause of sorted) {
    // Clamp clause boundaries to paragraph boundaries
    const clauseStart = Math.max(clause.markdownStart, paragraphStart)
    const clauseEnd = Math.min(clause.markdownEnd, paragraphEnd)

    if (clauseStart >= paragraphEnd || clauseEnd <= paragraphStart) {
      continue // clause doesn't actually overlap this paragraph
    }

    // Add non-clause text before this clause
    if (clauseStart > cursor) {
      segments.push({
        text: paragraphText.slice(cursor - paragraphStart, clauseStart - paragraphStart),
        clause: null,
      })
    }

    // Add clause text
    segments.push({
      text: paragraphText.slice(clauseStart - paragraphStart, clauseEnd - paragraphStart),
      clause,
    })

    cursor = clauseEnd
  }

  // Add remaining non-clause text
  if (cursor < paragraphEnd) {
    segments.push({
      text: paragraphText.slice(cursor - paragraphStart),
      clause: null,
    })
  }

  return segments
}

// ============================================================================
// Section Lookup
// ============================================================================

/**
 * Find the section that contains or precedes a given paragraph offset.
 * Returns the deepest (most specific) section's sectionPath.
 */
function findSectionForOffset(
  offset: number,
  sections: PositionedSection[]
): string[] | null {
  let best: PositionedSection | null = null

  for (const section of sections) {
    if (section.startOffset <= offset) {
      if (!best || section.startOffset >= best.startOffset) {
        best = section
      }
    }
  }

  return best?.sectionPath ?? null
}

// ============================================================================
// Markdown Components
// ============================================================================

const markdownComponents = {
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="mt-8 mb-3 text-2xl font-bold" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="mt-6 mb-2 text-xl font-semibold" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mt-4 mb-1.5 text-lg font-medium" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-4 text-base leading-relaxed" {...props}>
      {children}
    </p>
  ),
}

// ============================================================================
// ParagraphRow Component
// ============================================================================

interface ParagraphRowProps {
  segment: DocumentSegment
  overlappingClauses: ClauseOverlay[]
  activeClauseId: string | null
  highlightsEnabled: boolean
  onClauseClick: (clauseId: string) => void
}

const ParagraphRow = React.memo(function ParagraphRow({
  segment,
  overlappingClauses,
  activeClauseId,
  highlightsEnabled,
  onClauseClick,
}: ParagraphRowProps) {
  // If no clauses, render plain markdown
  if (overlappingClauses.length === 0) {
    return (
      <Markdown components={markdownComponents}>
        {segment.text}
      </Markdown>
    )
  }

  // Split into clause and non-clause segments
  const textSegments = splitParagraphIntoSegments(
    segment.text,
    segment.startOffset,
    overlappingClauses
  )

  // Render segments with clause highlights
  return (
    <div className="mb-4 text-base leading-relaxed">
      {textSegments.map((seg, i) => {
        if (seg.clause) {
          return (
            <ClauseHighlight
              key={`${seg.clause.clauseId}-${i}`}
              clauseId={seg.clause.clauseId}
              category={seg.clause.category}
              riskLevel={seg.clause.riskLevel}
              confidence={seg.clause.confidence}
              clauseText={seg.text}
              isActive={activeClauseId === seg.clause.clauseId}
              isVisible={highlightsEnabled}
              onClick={() => onClauseClick(seg.clause!.clauseId)}
            >
              {seg.text}
            </ClauseHighlight>
          )
        }
        return <span key={i}>{seg.text}</span>
      })}
    </div>
  )
})

// ============================================================================
// DocumentRenderer Component
// ============================================================================

export function DocumentRenderer({
  rawText,
  sections,
  clauses,
  isLoading,
  title,
  metadata,
  status,
  tokenUsage,
}: DocumentRendererProps) {
  const parentRef = React.useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const activeClauseId = useClauseSelection((s) => s.activeClauseId)
  const selectionSource = useClauseSelection((s) => s.selectionSource)
  const highlightsEnabled = useClauseSelection((s) => s.highlightsEnabled)
  const selectClause = useClauseSelection((s) => s.selectClause)
  const clearSelection = useClauseSelection((s) => s.clearSelection)
  const nextClause = useClauseSelection((s) => s.nextClause)
  const prevClause = useClauseSelection((s) => s.prevClause)
  const setClauseIds = useClauseSelection((s) => s.setClauseIds)

  // 1. Convert raw text to markdown with offset tracking
  const { markdown, offsetMap } = React.useMemo(
    () => convertToMarkdown(rawText, sections),
    [rawText, sections]
  )

  // 2. Split into paragraphs
  const paragraphs = React.useMemo(
    () => splitIntoParagraphs(markdown),
    [markdown]
  )

  // 3. Map clause positions to markdown coordinates
  const clauseOverlays = React.useMemo(
    () =>
      mapClausePositions(
        clauses.map((c) => ({
          id: c.id,
          category: c.category,
          riskLevel: c.riskLevel,
          startPosition: c.startPosition,
          endPosition: c.endPosition,
          confidence: c.confidence,
          clauseText: c.clauseText,
          riskExplanation: c.riskExplanation,
        })),
        offsetMap,
        paragraphs
      ),
    [clauses, offsetMap, paragraphs]
  )

  // 4. Pre-compute paragraph -> clause mapping
  const paragraphClauses = React.useMemo(() => {
    const map = new Map<number, ClauseOverlay[]>()
    for (const overlay of clauseOverlays) {
      // A clause might span multiple paragraphs. Check each paragraph.
      for (const para of paragraphs) {
        const overlaps =
          overlay.markdownStart < para.endOffset &&
          overlay.markdownEnd > para.startOffset
        if (overlaps) {
          const existing = map.get(para.index) ?? []
          existing.push(overlay)
          map.set(para.index, existing)
        }
      }
    }
    return map
  }, [clauseOverlays, paragraphs])

  // 5. Paragraph offsets for search
  const paragraphOffsets = React.useMemo(
    () => paragraphs.map((p) => p.startOffset),
    [paragraphs]
  )

  // 6. Virtual scrolling
  const virtualizer = useVirtualizer({
    count: paragraphs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 10,
  })

  // 7. Track visible section for toolbar (derived via useMemo to avoid setState-in-effect)
  const virtualItems = virtualizer.getVirtualItems()
  const currentSection = React.useMemo(() => {
    if (paragraphs.length === 0 || sections.length === 0) return null
    if (virtualItems.length === 0) return null

    const firstVisible = virtualItems[0]
    const paragraph = paragraphs[firstVisible.index]
    if (!paragraph) return null

    const sectionPath = findSectionForOffset(paragraph.startOffset, sections)
    if (sectionPath && sectionPath.length > 0) {
      return sectionPath.join(" > ")
    }
    return null
  }, [paragraphs, sections, virtualItems])

  // 8. Scroll to paragraph callback (for search)
  const scrollToMatch = React.useCallback(
    (paragraphIndex: number) => {
      virtualizer.scrollToIndex(paragraphIndex, {
        align: "center",
        behavior: "smooth",
      })
    },
    [virtualizer]
  )

  // 9. Clause click handler
  const handleClauseClick = React.useCallback(
    (clauseId: string) => {
      selectClause(clauseId, "document")
    },
    [selectClause]
  )

  // 10. Set clause IDs in the selection store when overlays change
  React.useEffect(() => {
    const ids = clauseOverlays.map((o) => o.clauseId)
    setClauseIds(ids)
  }, [clauseOverlays, setClauseIds])

  // 11. Scroll to clause when selected from analysis panel
  const virtualizerRef = React.useRef(virtualizer)
  virtualizerRef.current = virtualizer

  React.useEffect(() => {
    if (!activeClauseId || selectionSource !== "analysis") return

    // Find the paragraph containing this clause
    const overlay = clauseOverlays.find((o) => o.clauseId === activeClauseId)
    if (!overlay) return

    // Find paragraph index via binary search on paragraphOffsets
    let paragraphIndex = 0
    for (let i = 0; i < paragraphs.length; i++) {
      if (
        overlay.markdownStart >= paragraphs[i].startOffset &&
        overlay.markdownStart < paragraphs[i].endOffset
      ) {
        paragraphIndex = i
        break
      }
    }

    virtualizerRef.current.scrollToIndex(paragraphIndex, {
      align: "center",
      behavior: "smooth",
    })
  }, [activeClauseId, selectionSource, clauseOverlays, paragraphs])

  // 12. Keyboard navigation
  React.useEffect(() => {
    if (!highlightsEnabled) return

    const container = parentRef.current
    if (!container) return

    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown":
        case "j":
          e.preventDefault()
          nextClause()
          break
        case "ArrowUp":
        case "k":
          e.preventDefault()
          prevClause()
          break
        case "Escape":
          clearSelection()
          break
      }
    }

    container.addEventListener("keydown", handleKeyDown)
    return () => container.removeEventListener("keydown", handleKeyDown)
  }, [highlightsEnabled, nextClause, prevClause, clearSelection])

  // Loading state
  if (isLoading) {
    return <DocumentSkeleton />
  }

  // Extract metadata
  const uploadDate = metadata?.uploadDate
    ? new Date(metadata.uploadDate as string).toLocaleDateString()
    : null
  const pageCount = metadata?.pageCount as number | undefined

  return (
    <div className="flex h-full flex-col">
      {/* Metadata header */}
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {title ?? "Untitled Document"}
        </span>
        {uploadDate && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarIcon className="size-3" />
            {uploadDate}
          </span>
        )}
        {pageCount != null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileIcon className="size-3" />
            {pageCount} {pageCount === 1 ? "page" : "pages"}
          </span>
        )}
        {status && (
          <Badge
            variant={status === "completed" ? "default" : "secondary"}
            className="text-xs"
          >
            {status}
          </Badge>
        )}
        {tokenUsage?.total?.estimatedCost != null && (
          <span className="text-xs text-muted-foreground">
            ${tokenUsage.total.estimatedCost.toFixed(2)}
          </span>
        )}
      </div>

      {/* Toolbar */}
      <DocumentToolbar
        clauseCount={clauseOverlays.length}
        currentSection={currentSection}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((prev) => !prev)}
      />

      {/* Search bar */}
      <DocumentSearch
        text={markdown}
        paragraphOffsets={paragraphOffsets}
        onScrollToMatch={scrollToMatch}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      {/* Paper-style document container */}
      <div
        ref={parentRef}
        tabIndex={0}
        className="flex-1 overflow-auto p-6 outline-none"
      >
        <div
          className={cn(
            "mx-auto max-w-3xl rounded-lg border bg-card px-8 py-10 shadow-sm",
            "font-sans"
          )}
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const segment = paragraphs[virtualRow.index]
            const overlapClauses = paragraphClauses.get(virtualRow.index) ?? []

            return (
              <div
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingLeft: "2rem",
                  paddingRight: "2rem",
                }}
              >
                <ParagraphRow
                  segment={segment}
                  overlappingClauses={overlapClauses}
                  activeClauseId={activeClauseId}
                  highlightsEnabled={highlightsEnabled}
                  onClauseClick={handleClauseClick}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
