"use client"

import * as React from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { AlertCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { DocumentRenderer } from "@/components/document/document-renderer"
import { DocumentSkeleton } from "@/components/document/document-skeleton"
import { AnalysisView } from "@/components/artifact/analysis-view"
import { useSidebar } from "@/components/ui/sidebar"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAnalysisProgress } from "@/hooks/use-analysis-progress"
import { useClauseSelection } from "@/hooks/use-clause-selection"
import { getDocumentForRendering } from "@/app/(main)/(dashboard)/analyses/actions"
import type { DocumentRenderingData } from "@/lib/document-rendering/types"
import type { PositionedSection } from "@/lib/document-extraction/types"

// ============================================================================
// Stage Order for Progressive Reveal
// ============================================================================

/**
 * Pipeline stages in execution order.
 * Used to determine when to re-fetch data based on stage transitions.
 */
const STAGE_ORDER = [
  "parsing",
  "chunking",
  "classifying",
  "scoring",
  "analyzing_gaps",
  "complete",
] as const

function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number])
  return idx === -1 ? -1 : idx
}

/** Check if scoring stage has completed (clauses have risk data) */
function isScoringComplete(stage: string): boolean {
  return stageIndex(stage) > stageIndex("scoring")
}

// ============================================================================
// Analysis Detail Page
// ============================================================================

export default function AnalysisPage() {
  const params = useParams<{ analysisId: string }>()
  const analysisId = params.analysisId
  const searchParams = useSearchParams()
  const router = useRouter()
  const isMobile = useIsMobile()
  const { setOpen } = useSidebar()

  const [data, setData] = React.useState<DocumentRenderingData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  // Progressive reveal: track pipeline progress
  const { status, stage } = useAnalysisProgress(analysisId)
  const lastFetchedStageRef = React.useRef<string>("")

  // URL state: read initial clause from URL
  const initialClauseId = searchParams.get("clause")
  const urlSyncedRef = React.useRef(false)

  // Clause selection store
  const selectClause = useClauseSelection((s) => s.selectClause)
  const setHighlightsEnabled = useClauseSelection((s) => s.setHighlightsEnabled)
  const activeClauseId = useClauseSelection((s) => s.activeClauseId)

  // Auto-collapse sidebar on mount to maximize horizontal space
  React.useEffect(() => {
    setOpen(false)
  }, [setOpen])

  // Initial data fetch
  React.useEffect(() => {
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError(null)

      const result = await getDocumentForRendering(analysisId)

      if (cancelled) return

      if (result.success) {
        setData(result.data)
        lastFetchedStageRef.current = stage || ""
      } else {
        setError(result.error.message)
      }
      setLoading(false)
    }

    fetchData()
    return () => { cancelled = true }
  }, [analysisId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Progressive reveal: re-fetch when pipeline stage transitions
  React.useEffect(() => {
    // Only re-fetch on stage transitions, not every progress update
    if (!stage || stage === lastFetchedStageRef.current) return
    // Don't re-fetch if we haven't done the initial fetch yet
    if (loading) return

    const currentIdx = stageIndex(stage)
    const lastIdx = stageIndex(lastFetchedStageRef.current)

    // Only re-fetch when moving to a new stage (forward progress)
    if (currentIdx <= lastIdx) return

    lastFetchedStageRef.current = stage

    async function refetch() {
      const result = await getDocumentForRendering(analysisId)
      if (result.success) {
        setData(result.data)
      }
    }

    refetch()
  }, [stage, analysisId, loading])

  // URL state: apply initial clause from URL on first data load
  React.useEffect(() => {
    if (urlSyncedRef.current || !initialClauseId || !data) return
    if (data.clauses.length === 0) return

    // Check if the clause exists in the data
    const clauseExists = data.clauses.some((c) => c.id === initialClauseId)
    if (clauseExists) {
      selectClause(initialClauseId, "analysis")
      setHighlightsEnabled(true)
      urlSyncedRef.current = true
    }
  }, [initialClauseId, data, selectClause, setHighlightsEnabled])

  // URL state: sync clause selection to URL
  const prevClauseIdRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    // Skip initial sync (handled above)
    if (!urlSyncedRef.current && initialClauseId) return
    // Skip if nothing changed
    if (activeClauseId === prevClauseIdRef.current) return
    prevClauseIdRef.current = activeClauseId

    if (activeClauseId) {
      router.replace(`/analysis/${analysisId}?clause=${activeClauseId}`, {
        scroll: false,
      })
    } else {
      router.replace(`/analysis/${analysisId}`, { scroll: false })
    }
  }, [activeClauseId, analysisId, router, initialClauseId])

  // Error state
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircleIcon className="size-6 text-destructive" />
          </div>
          <h3 className="mb-1 text-lg font-medium">Failed to load document</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  // Extract sections from structure for DocumentRenderer
  const sections: PositionedSection[] = data?.structure?.sections ?? []

  // Progressive reveal: only pass clauses when scoring is complete
  // This prevents showing incomplete/unscored clause highlights
  const scoringDone = isScoringComplete(stage)
  const clausesForRenderer = scoringDone ? (data?.clauses ?? []) : []

  // Token usage: only show when analysis is complete
  const tokenUsage = status === "completed" ? (data?.tokenUsage ?? null) : null

  // Mobile: stack vertically
  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Document panel */}
        <div className="min-h-0 flex-1 overflow-hidden border-b">
          {loading || !data ? (
            <DocumentSkeleton />
          ) : (
            <DocumentRenderer
              rawText={data.document.rawText}
              sections={sections}
              clauses={clausesForRenderer}
              isLoading={false}
              title={data.document.title}
              metadata={data.document.metadata}
              status={data.status}
              tokenUsage={tokenUsage}
            />
          )}
        </div>
        {/* Analysis panel */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <AnalysisView analysisId={analysisId} />
        </div>
      </div>
    )
  }

  // Desktop: side-by-side resizable panels
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className={cn("h-full min-h-0")}
    >
      {/* Document panel (left, 55%) */}
      <ResizablePanel defaultSize={55} minSize={35} className="min-h-0">
        <div className="h-full overflow-hidden">
          {loading || !data ? (
            <DocumentSkeleton />
          ) : (
            <DocumentRenderer
              rawText={data.document.rawText}
              sections={sections}
              clauses={clausesForRenderer}
              isLoading={false}
              title={data.document.title}
              metadata={data.document.metadata}
              status={data.status}
              tokenUsage={tokenUsage}
            />
          )}
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Analysis panel (right, 45%) */}
      <ResizablePanel defaultSize={45} minSize={30} className="min-h-0">
        <div className="h-full overflow-hidden">
          <AnalysisView analysisId={analysisId} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
