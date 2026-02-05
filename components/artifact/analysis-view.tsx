"use client"

import * as React from "react"
import {
  Loader2Icon,
  XCircleIcon,
  PlayIcon,
  RotateCcwIcon,
  BanIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { useAnalysisProgress } from "@/hooks/use-analysis-progress"
import {
  getAnalysis,
  getAnalysisStatus,
  fetchRiskAssessments,
  resumeAnalysis,
  triggerAnalysis,
  cancelAnalysis,
  type Analysis,
  type ClauseExtraction,
  type Perspective,
} from "@/app/(main)/(dashboard)/analyses/actions"
import { type RiskLevel } from "@/components/analysis/config"
import { RiskBadge } from "@/components/analysis/risk-tab"
import { AnalysisTabs, PerspectiveToggle } from "@/components/analysis/analysis-tabs"
import { OcrWarning, hasOcrIssues } from "@/components/analysis/ocr-warning"

// ============================================================================
// Types
// ============================================================================

interface AnalysisViewProps {
  analysisId: string
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
    <div className="flex h-full flex-col items-center justify-center p-8">
      <Loader2Icon
        className="size-8 animate-spin"
        style={{ color: "oklch(0.55 0.24 293)" }}
      />
      {/* Show detailed message when available, fall back to stage */}
      <p className="mt-4 text-sm text-muted-foreground">
        {message || stage || "Processing..."}
      </p>
      {queuePosition != null && queuePosition > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Position in queue: {queuePosition}
        </p>
      )}
      <Progress value={progress} className="mt-4 w-48" />
      <p className="mt-2 text-xs text-muted-foreground">{progress}%</p>
      {analysisId && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-4 text-muted-foreground"
          onClick={handleCancel}
          disabled={isCancelling}
        >
          {isCancelling ? (
            <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <BanIcon className="mr-1.5 size-3.5" />
          )}
          Cancel
        </Button>
      )}
    </div>
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
    // We need the documentId. Fetch the analysis to get it.
    const analysisResult = await getAnalysis(analysisId)
    if (!analysisResult.success) {
      setActionError(analysisResult.error.message)
      setIsStartingFresh(false)
      return
    }
    const result = await triggerAnalysis(analysisResult.data.documentId)
    if (result.success) {
      // Trigger a page reload to redirect to the new analysis
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
// AnalysisView (main export)
// ============================================================================

export function AnalysisView({ analysisId, className }: AnalysisViewProps) {
  const { status, progress, stage, message, queuePosition, error } = useAnalysisProgress(analysisId)
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null)
  const [clauses, setClauses] = React.useState<ClauseExtraction[]>([])
  const [fetchError, setFetchError] = React.useState<string | null>(null)
  const [rescoreVersion, setRescoreVersion] = React.useState(0)
  const rescorePollRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch full data once complete (or after re-score)
  React.useEffect(() => {
    if (status === "completed") {
      Promise.all([
        getAnalysis(analysisId),
        fetchRiskAssessments(analysisId),
      ])
        .then(([analysisResult, assessmentsResult]) => {
          if (analysisResult.success) {
            setAnalysis(analysisResult.data)
          } else {
            setFetchError(analysisResult.error.message)
          }
          if (assessmentsResult.success) {
            setClauses(assessmentsResult.data as unknown as ClauseExtraction[])
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
    // Clear any existing poll
    if (rescorePollRef.current) {
      clearInterval(rescorePollRef.current)
    }

    rescorePollRef.current = setInterval(async () => {
      const result = await getAnalysisStatus(analysisId)
      if (result.success) {
        const statusData = result.data
        // When re-scoring is complete, refresh data
        if (statusData.status === "completed" && statusData.progress?.percent === 100) {
          if (rescorePollRef.current) {
            clearInterval(rescorePollRef.current)
            rescorePollRef.current = null
          }
          // Bump version to trigger re-fetch
          setRescoreVersion((v) => v + 1)
        }
      }
    }, 3000)
  }, [analysisId])

  // Progress state
  if (status === "pending" || status === "pending_ocr" || status === "processing") {
    return (
      <div className={cn("h-full", className)}>
        <ProgressView
          stage={stage}
          progress={progress}
          message={message}
          queuePosition={queuePosition}
          analysisId={analysisId}
        />
      </div>
    )
  }

  // Cancelled state
  if (status === "cancelled") {
    return (
      <div className={cn("h-full", className)}>
        <CancelledView
          analysisId={analysisId}
          message={message}
          onResumed={() => {
            // Force a re-mount to restart polling
            window.location.reload()
          }}
        />
      </div>
    )
  }

  // Error state
  if (status === "failed" || error || fetchError) {
    return (
      <div className={cn("h-full", className)}>
        <ErrorView message={error || fetchError || "Analysis failed. Please try again."} />
      </div>
    )
  }

  // Loading results
  if (!analysis) {
    return (
      <div className={cn("h-full", className)}>
        <ProgressView stage="Loading results..." progress={100} />
      </div>
    )
  }

  // Parse metadata for perspective and risk distribution
  const metadata = analysis.metadata as Record<string, unknown> | null
  const currentPerspective = (metadata?.perspective as Perspective) || "balanced"
  const riskDistribution = (metadata?.riskDistribution as Record<RiskLevel, number>) || null

  // Calculate risk summary from clauses
  const riskCounts = clauses.reduce(
    (acc, clause) => {
      const level = (clause.riskLevel as RiskLevel) || "unknown"
      acc[level]++
      return acc
    },
    { standard: 0, cautious: 0, aggressive: 0, unknown: 0 } as Record<RiskLevel, number>
  )

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col", className)}>
      {/* OCR quality warning */}
      {hasOcrIssues(analysis) && (
        <div className="shrink-0 px-4 pt-3">
          <OcrWarning
            confidence={analysis.ocrConfidence!}
            warningMessage={analysis.ocrWarning}
          />
        </div>
      )}

      {/* Summary bar with perspective toggle */}
      <div className="shrink-0 border-b bg-muted/50 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="truncate font-medium">Analysis Results</h3>
          {analysis.overallRiskLevel && (
            <RiskBadge level={analysis.overallRiskLevel as RiskLevel} />
          )}
        </div>

        {/* Perspective toggle */}
        <PerspectiveToggle
          analysisId={analysisId}
          currentPerspective={currentPerspective}
          onRescoreTriggered={handleRescoreTriggered}
        />

        {/* Risk distribution counts */}
        <div className="mt-2 flex flex-wrap gap-2">
          {(["standard", "cautious", "aggressive", "unknown"] as RiskLevel[]).map(
            (level) =>
              riskCounts[level] > 0 && (
                <div
                  key={level}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <RiskBadge level={level} />
                  <span>{riskCounts[level]}</span>
                </div>
              )
          )}
        </div>
      </div>

      {/* Tabbed content */}
      <AnalysisTabs
        analysisId={analysisId}
        analysis={analysis}
        clauses={clauses}
        riskDistribution={riskDistribution}
        currentPerspective={currentPerspective}
        onRescoreTriggered={handleRescoreTriggered}
      />
    </div>
  )
}
