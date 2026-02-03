"use client"

import { useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { FileSearch, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { useDocumentContent, useAnalysisProgress } from "../hooks"
import { useAuthStore, useAnalysisStore } from "../store"
import type { AnalysisResults } from "../store"

/**
 * Button to trigger NDA analysis on the current document.
 * Extracts document content, submits it for analysis, and tracks progress.
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
  const {
    progress: sseProgress,
    error: sseError,
  } = useAnalysisProgress(analysisId, status === "analyzing")

  /**
   * Fetch completed results
   */
  const fetchResults = useCallback(async (id: string, authToken: string) => {
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
  }, [setResults, setError])

  // Update store when SSE progress changes
  useEffect(() => {
    if (sseProgress) {
      updateProgress(sseProgress)

      // Fetch results when complete
      if (sseProgress.stage === "completed" && analysisId && token) {
        fetchResults(analysisId, token)
      }
    }
  }, [sseProgress, analysisId, token, updateProgress, fetchResults])

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
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-medium">Analyze Current Document</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Extract clauses and assess risks in your NDA
        </p>
        <Button
          onClick={handleAnalyze}
          disabled={isLoading || isAnalyzing || !token}
          className="mt-4 w-full gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isExtracting ? "Extracting..." : "Submitting..."}
            </>
          ) : isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <FileSearch className="h-4 w-4" />
              Analyze NDA
            </>
          )}
        </Button>

        {!token && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Sign in to analyze documents
          </p>
        )}
      </div>

      {/* Progress indicator */}
      {isAnalyzing && progress && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="font-medium">{progress.message}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {progress.percent}%
          </p>
        </div>
      )}

      {/* Success message */}
      {isComplete && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          Analysis complete! View results below.
        </div>
      )}

      {/* Error message */}
      {(error || isFailed) && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-medium">Analysis failed</p>
            <p className="mt-1">{error || "An unknown error occurred"}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              className="mt-2"
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
