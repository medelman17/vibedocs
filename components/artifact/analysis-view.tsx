"use client"

import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  Loader2Icon,
  XCircleIcon,
  PlayIcon,
  RotateCcwIcon,
  BanIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useAnalysisProgress } from "@/hooks/use-analysis-progress"
import {
  getAnalysis,
  getAnalysisStatus,
  fetchRiskAssessments,
  fetchGapAnalysis,
  resumeAnalysis,
  triggerAnalysis,
  cancelAnalysis,
  type Analysis,
  type ClauseExtraction,
  type Perspective,
} from "@/app/(main)/(dashboard)/analyses/actions"
import { type RiskLevel } from "@/components/analysis/config"
import { OcrWarning, hasOcrIssues } from "@/components/analysis/ocr-warning"
import { PipelineStepper } from "@/components/analysis/pipeline-stepper"
import {
  AnalysisHeader,
  type ClauseSort,
  type RiskFilter,
} from "@/components/analysis/analysis-header"
import { SummaryStrip } from "@/components/analysis/summary-strip"
import { GapSection } from "@/components/analysis/gap-section"
import { ChatDrawer } from "@/components/analysis/chat-drawer"
import { ClauseCardList } from "@/components/analysis/clause-card-list"
import type { EnhancedGapResult } from "@/agents/types"

// ============================================================================
// Types
// ============================================================================

interface AnalysisViewProps {
  analysisId: string
  documentTitle?: string
  className?: string
}

// ============================================================================
// Progress & Error Views
// ============================================================================

function ProgressView({
  stage,
  progress,
  message,
  queuePosition,
  analysisId,
}: {
  stage: string
  progress: number
  message?: string
  queuePosition?: number
  analysisId?: string
}) {
  const [isCancelling, setIsCancelling] = React.useState(false)

  const handleCancel = async () => {
    if (!analysisId) return
    setIsCancelling(true)
    await cancelAnalysis(analysisId)
  }

  return (
    <PipelineStepper
      currentStage={stage}
      progress={progress}
      message={message}
      queuePosition={queuePosition}
      onCancel={analysisId ? handleCancel : undefined}
      isCancelling={isCancelling}
    />
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div
        className="mb-4 rounded-full p-4"
        style={{ background: "oklch(0.92 0.08 25)" }}
      >
        <XCircleIcon className="size-8" style={{ color: "oklch(0.50 0.14 25)" }} />
      </div>
      <h3 className="mb-2 text-lg font-medium">Analysis Failed</h3>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function CancelledView({
  analysisId,
  message,
  onResumed,
}: {
  analysisId: string
  message?: string
  onResumed: () => void
}) {
  const [isResuming, setIsResuming] = React.useState(false)
  const [isStartingFresh, setIsStartingFresh] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const handleResume = async () => {
    setIsResuming(true)
    setActionError(null)
    const result = await resumeAnalysis(analysisId)
    if (result.success) {
      onResumed()
    } else {
      setActionError(result.error.message)
    }
    setIsResuming(false)
  }

  const handleStartFresh = async () => {
    setIsStartingFresh(true)
    setActionError(null)
    const analysisResult = await getAnalysis(analysisId)
    if (!analysisResult.success) {
      setActionError(analysisResult.error.message)
      setIsStartingFresh(false)
      return
    }
    const result = await triggerAnalysis(analysisResult.data.documentId)
    if (result.success) {
      window.location.reload()
    } else {
      setActionError(result.error.message)
    }
    setIsStartingFresh(false)
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div
        className="mb-4 rounded-full p-4"
        style={{ background: "oklch(0.92 0.04 65)" }}
      >
        <BanIcon className="size-8" style={{ color: "oklch(0.50 0.12 65)" }} />
      </div>
      <h3 className="mb-2 text-lg font-medium">Analysis Cancelled</h3>
      {message && (
        <p className="mb-4 text-sm text-muted-foreground">{message}</p>
      )}
      <div className="mt-2 flex gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleResume}
          disabled={isResuming || isStartingFresh}
        >
          {isResuming ? (
            <Loader2Icon className="mr-1.5 size-4 animate-spin" />
          ) : (
            <PlayIcon className="mr-1.5 size-4" />
          )}
          Resume
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleStartFresh}
          disabled={isResuming || isStartingFresh}
        >
          {isStartingFresh ? (
            <Loader2Icon className="mr-1.5 size-4 animate-spin" />
          ) : (
            <RotateCcwIcon className="mr-1.5 size-4" />
          )}
          Start Fresh
        </Button>
      </div>
      {actionError && (
        <p className="mt-3 text-sm text-destructive">{actionError}</p>
      )}
    </div>
  )
}

// ============================================================================
// Clause Filtering & Sorting
// ============================================================================

const RISK_ORDER: Record<RiskLevel, number> = {
  aggressive: 0,
  cautious: 1,
  standard: 2,
  unknown: 3,
}

function filterAndSortClauses(
  clauses: ClauseExtraction[],
  sortBy: ClauseSort,
  riskFilter: RiskFilter,
  searchQuery: string
): ClauseExtraction[] {
  let filtered = clauses

  // Risk filter
  if (riskFilter !== "all") {
    filtered = filtered.filter(
      (c) => (c.riskLevel as RiskLevel) === riskFilter
    )
  }

  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(
      (c) =>
        c.category.toLowerCase().includes(q) ||
        c.clauseText.toLowerCase().includes(q) ||
        c.riskExplanation?.toLowerCase().includes(q)
    )
  }

  // Sort
  const sorted = [...filtered]
  switch (sortBy) {
    case "risk":
      sorted.sort(
        (a, b) =>
          (RISK_ORDER[(a.riskLevel as RiskLevel) || "unknown"] ?? 3) -
          (RISK_ORDER[(b.riskLevel as RiskLevel) || "unknown"] ?? 3)
      )
      break
    case "category":
      sorted.sort((a, b) => a.category.localeCompare(b.category))
      break
    case "position":
    default:
      // Already in document order from the DB
      break
  }

  return sorted
}

// ============================================================================
// AnalysisView (main export)
// ============================================================================

export function AnalysisView({ analysisId, documentTitle, className }: AnalysisViewProps) {
  const { status, progress, stage, message, queuePosition, error } = useAnalysisProgress(analysisId)
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null)
  const [clauses, setClauses] = React.useState<ClauseExtraction[]>([])
  const [gapData, setGapData] = React.useState<EnhancedGapResult | null>(null)
  const [fetchError, setFetchError] = React.useState<string | null>(null)
  const [rescoreVersion, setRescoreVersion] = React.useState(0)
  const rescorePollRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Filter/sort state
  const [sortBy, setSortBy] = React.useState<ClauseSort>("position")
  const [riskFilter, setRiskFilter] = React.useState<RiskFilter>("all")
  const [searchQuery, setSearchQuery] = React.useState("")

  // Fetch all data once complete (or after re-score)
  React.useEffect(() => {
    if (status === "completed") {
      Promise.all([
        getAnalysis(analysisId),
        fetchRiskAssessments(analysisId),
        fetchGapAnalysis(analysisId),
      ])
        .then(([analysisResult, assessmentsResult, gapResult]) => {
          if (analysisResult.success) {
            setAnalysis(analysisResult.data)
          } else {
            setFetchError(analysisResult.error.message)
          }
          if (assessmentsResult.success) {
            setClauses(assessmentsResult.data as unknown as ClauseExtraction[])
          }
          if (gapResult.success) {
            setGapData(gapResult.data)
          }
        })
        .catch((e) => {
          setFetchError(e instanceof Error ? e.message : "Failed to load results")
        })
    }
  }, [status, analysisId, rescoreVersion])

  // Cleanup re-score poll on unmount
  React.useEffect(() => {
    return () => {
      if (rescorePollRef.current) {
        clearInterval(rescorePollRef.current)
      }
    }
  }, [])

  // Handle re-score triggered: poll until progressStage returns to 'complete'
  const handleRescoreTriggered = React.useCallback(() => {
    if (rescorePollRef.current) {
      clearInterval(rescorePollRef.current)
    }

    rescorePollRef.current = setInterval(async () => {
      const result = await getAnalysisStatus(analysisId)
      if (result.success) {
        const statusData = result.data
        if (statusData.status === "completed" && statusData.progress?.percent === 100) {
          if (rescorePollRef.current) {
            clearInterval(rescorePollRef.current)
            rescorePollRef.current = null
          }
          setRescoreVersion((v) => v + 1)
        }
      }
    }, 3000)
  }, [analysisId])

  // Determine which state to render
  let content: React.ReactNode
  let contentKey: string

  if (status === "pending" || status === "pending_ocr" || status === "processing") {
    contentKey = "progress"
    content = (
      <ProgressView
        stage={stage}
        progress={progress}
        message={message}
        queuePosition={queuePosition}
        analysisId={analysisId}
      />
    )
  } else if (status === "cancelled") {
    contentKey = "cancelled"
    content = (
      <CancelledView
        analysisId={analysisId}
        message={message}
        onResumed={() => {
          window.location.reload()
        }}
      />
    )
  } else if (status === "failed" || error || fetchError) {
    contentKey = "error"
    content = (
      <ErrorView message={error || fetchError || "Analysis failed. Please try again."} />
    )
  } else if (!analysis) {
    contentKey = "loading"
    content = <ProgressView stage="Loading results..." progress={100} />
  } else {
    contentKey = "results"

    // Parse metadata
    const metadata = analysis.metadata as Record<string, unknown> | null
    const currentPerspective = (metadata?.perspective as Perspective) || "balanced"
    const overallRiskLevel = (analysis.overallRiskLevel as RiskLevel) || "unknown"

    // Calculate risk counts
    const riskCounts = clauses.reduce(
      (acc, clause) => {
        const level = (clause.riskLevel as RiskLevel) || "unknown"
        acc[level]++
        return acc
      },
      { standard: 0, cautious: 0, aggressive: 0, unknown: 0 } as Record<RiskLevel, number>
    )

    // Filter and sort clauses
    const displayClauses = filterAndSortClauses(clauses, sortBy, riskFilter, searchQuery)

    // Token usage for summary strip
    const tokenUsage = metadata?.tokenUsage as { estimatedCost?: number } | undefined

    content = (
      <>
        {/* OCR quality warning */}
        {hasOcrIssues(analysis) && (
          <div className="shrink-0 px-4 pt-3">
            <OcrWarning
              confidence={analysis.ocrConfidence!}
              warningMessage={analysis.ocrWarning}
            />
          </div>
        )}

        {/* Sticky header */}
        <AnalysisHeader
          analysisId={analysisId}
          overallRiskScore={analysis.overallRiskScore}
          overallRiskLevel={overallRiskLevel}
          currentPerspective={currentPerspective}
          onRescoreTriggered={handleRescoreTriggered}
          sortBy={sortBy}
          onSortChange={setSortBy}
          riskFilter={riskFilter}
          onRiskFilterChange={setRiskFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Summary strip */}
        <SummaryStrip
          clauseCount={clauses.length}
          riskCounts={riskCounts}
          gapData={gapData}
          estimatedCost={tokenUsage?.estimatedCost}
        />

        {/* Scrollable content: clause cards + gap section */}
        <ScrollArea className="min-h-0 flex-1">
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="space-y-3 p-4"
          >
            <ClauseCardList clauses={displayClauses} />

            {gapData && gapData.gaps.length > 0 && (
              <>
                <Separator className="my-4" />
                <GapSection gapData={gapData} />
              </>
            )}
          </motion.div>
        </ScrollArea>

        {/* Chat drawer trigger - fixed at bottom */}
        <ChatDrawer
          analysisId={analysisId}
          documentTitle={documentTitle || "this document"}
        />
      </>
    )
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={contentKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={cn("flex h-full min-h-0 min-w-0 flex-col", className)}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  )
}
