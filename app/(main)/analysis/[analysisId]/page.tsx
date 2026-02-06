"use client"

import * as React from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { AlertCircleIcon } from "lucide-react"
import { DocumentRenderer } from "@/components/document/document-renderer"
import { DocumentSkeleton } from "@/components/document/document-skeleton"
import { AnalysisView } from "@/components/artifact/analysis-view"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAnalysisProgress } from "@/hooks/use-analysis-progress"
import { useClauseSelection } from "@/hooks/use-clause-selection"
import { getDocumentForRendering } from "@/app/(main)/(dashboard)/analyses/actions"
import type { DocumentRenderingData } from "@/lib/document-rendering/types"
import type { PositionedSection } from "@/lib/document-extraction/types"

// ============================================================================
// Stage Order for Progressive Reveal
// ============================================================================

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
    if (!stage || stage === lastFetchedStageRef.current) return
    if (loading) return

    const currentIdx = stageIndex(stage)
    const lastIdx = stageIndex(lastFetchedStageRef.current)

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
    if (!urlSyncedRef.current && initialClauseId) return
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

  // Progressive reveal: only pass chunks when chunking is complete
  const chunkingDone = stageIndex(stage) > stageIndex("chunking")
  const chunksForRenderer = chunkingDone ? (data?.chunks ?? []) : []

  // Progressive reveal: only pass clauses when scoring is complete
  const scoringDone = isScoringComplete(stage)
  const clausesForRenderer = scoringDone ? (data?.clauses ?? []) : []

  // Token usage: only show when analysis is complete
  const tokenUsage = status === "completed" ? (data?.tokenUsage ?? null) : null

  // Document title for chat drawer
  const documentTitle = data?.document.title || "this document"

  const documentPanel = loading || !data ? (
    <DocumentSkeleton />
  ) : (
    <DocumentRenderer
      rawText={data.document.rawText}
      sections={sections}
      clauses={clausesForRenderer}
      chunks={chunksForRenderer}
      isLoading={false}
      title={data.document.title}
      metadata={data.document.metadata}
      status={data.status}
      tokenUsage={tokenUsage}
    />
  )

  const analysisPanel = (
    <AnalysisView analysisId={analysisId} documentTitle={documentTitle} />
  )

  // Mobile: stack vertically
  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden border-b">
          {documentPanel}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {analysisPanel}
        </div>
      </div>
    )
  }

  // Desktop: side-by-side with fixed split
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Document panel (left, 55%) */}
      <div className="h-full min-w-0 flex-[55] overflow-hidden">
        {documentPanel}
      </div>

      {/* Divider */}
      <div className="h-full w-px shrink-0 bg-border" />

      {/* Analysis panel (right, 45%) */}
      <div className="h-full min-w-0 flex-[45] overflow-hidden">
        {analysisPanel}
      </div>
    </div>
  )
}
