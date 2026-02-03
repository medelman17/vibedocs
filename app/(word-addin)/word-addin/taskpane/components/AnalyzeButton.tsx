"use client"

import { useEffect, useCallback } from "react"
import { FileSearch, Loader2, AlertCircle, CheckCircle2, Sparkles } from "lucide-react"
import { useDocumentContent } from "../hooks/useDocumentContent"
import { useAnalysisProgress } from "../hooks/useAnalysisProgress"
import { useAuthStore } from "../store/auth"
import { useAnalysisStore } from "../store/analysis"
import type { AnalysisResults } from "../store/analysis"

/**
 * AnalyzeButton - The primary action component for triggering NDA analysis.
 *
 * Features:
 * - Animated button with gradient and glow effects
 * - Smooth progress bar with shimmer animation
 * - Clear success and error states
 * - Real-time progress updates via SSE
 */
export function AnalyzeButton() {
  const token = useAuthStore((state) => state.token)
  const { extractContent, isExtracting } = useDocumentContent()

  const {
    analysisId,
    status,
    progress,
    error,
    startAnalysis,
    updateProgress,
    setResults,
    setError,
    reset,
  } = useAnalysisStore()

  // Subscribe to SSE progress updates
  const { progress: sseProgress, error: sseError } = useAnalysisProgress(
    analysisId,
    status === "analyzing"
  )

  // Extract primitives for effect dependencies
  const sseProgressStage = sseProgress?.stage
  const sseProgressPercent = sseProgress?.percent
  const sseProgressMessage = sseProgress?.message

  /**
   * Fetch completed results
   */
  const fetchResults = useCallback(
    async (id: string, authToken: string) => {
      try {
        const response = await fetch(`/api/word-addin/results/${id}`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        })

        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.error?.message || "Failed to fetch results")
        }

        setResults(data.data as AnalysisResults)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch results")
      }
    },
    [setResults, setError]
  )

  // Update store when SSE progress changes
  useEffect(() => {
    if (sseProgressStage !== undefined && sseProgressPercent !== undefined) {
      updateProgress({
        stage: sseProgressStage,
        percent: sseProgressPercent,
        message: sseProgressMessage ?? "",
      })

      // Fetch results when complete
      if (sseProgressStage === "completed" && analysisId && token) {
        fetchResults(analysisId, token)
      }
    }
  }, [
    sseProgressStage,
    sseProgressPercent,
    sseProgressMessage,
    analysisId,
    token,
    updateProgress,
    fetchResults,
  ])

  // Handle SSE errors
  useEffect(() => {
    if (sseError) {
      setError(`Connection error: ${sseError}`)
    }
  }, [sseError, setError])

  /**
   * Handle analyze button click
   */
  const handleAnalyze = async () => {
    if (!token) {
      setError("Please sign in first")
      return
    }

    reset()

    try {
      // Extract document content
      const content = await extractContent()

      // Submit to analysis API
      const response = await fetch("/api/word-addin/analyze", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: content.fullText,
          paragraphs: content.paragraphs,
          metadata: {
            title: content.title,
            source: "word-addin",
          },
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to start analysis")
      }

      // Start tracking the analysis
      startAnalysis(data.data.analysisId, data.data.documentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze document")
    }
  }

  const isLoading = isExtracting || status === "extracting" || status === "submitting"
  const isAnalyzing = status === "analyzing"
  const isComplete = status === "completed"
  const isFailed = status === "failed"

  return (
    <div className="flex flex-col gap-3">
      {/* Main action card */}
      <div className="addin-card animate-slide-up">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
            <FileSearch className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="addin-display-sm text-foreground">Analyze Document</h3>
            <p className="addin-caption mt-0.5">
              Extract clauses and assess risks in your NDA
            </p>
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={isLoading || isAnalyzing || !token}
          className="addin-btn addin-btn-primary w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{isExtracting ? "Extracting..." : "Submitting..."}</span>
            </>
          ) : isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>Analyze NDA</span>
            </>
          )}
        </button>

        {!token && (
          <p className="mt-2 text-center text-xs text-neutral-400">
            Sign in to analyze documents
          </p>
        )}
      </div>

      {/* Progress indicator */}
      {isAnalyzing && progress && (
        <div className="addin-card animate-slide-up">
          <div className="addin-progress-label">
            <span className="addin-progress-message flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
              {progress.message || "Processing..."}
            </span>
            <span className="addin-progress-percent">{progress.percent}%</span>
          </div>
          <div className="addin-progress">
            <div
              className="addin-progress-fill"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Success message */}
      {isComplete && (
        <div className="addin-status addin-status-success animate-slide-up">
          <CheckCircle2 className="addin-status-icon" />
          <div>
            <p className="font-medium">Analysis complete</p>
            <p className="text-xs mt-0.5 opacity-80">View the results below</p>
          </div>
        </div>
      )}

      {/* Error message */}
      {(error || isFailed) && (
        <div className="addin-status addin-status-error animate-slide-up">
          <AlertCircle className="addin-status-icon" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Analysis failed</p>
            <p className="text-xs mt-0.5 opacity-80 break-words">
              {error || "An unknown error occurred"}
            </p>
            <button
              onClick={reset}
              className="addin-btn addin-btn-secondary mt-2 text-xs py-1.5 px-3"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
