"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { getAnalysisStatus } from "@/app/(main)/(dashboard)/analyses/actions"
import type { AnalysisStatus } from "@/app/(main)/(dashboard)/analyses/actions"

const POLL_INTERVAL_MS = 2000

interface AnalysisProgressState {
  status: AnalysisStatus
  progress: number
  stage: string
  isLoading: boolean
  error: string | null
}

/**
 * Hook for polling analysis progress.
 * Polls every 2 seconds while status is "pending" or "processing".
 * Stops polling when status is "completed" or "failed".
 */
export function useAnalysisProgress(
  analysisId: string | null
): AnalysisProgressState {
  const [state, setState] = useState<AnalysisProgressState>({
    status: "pending",
    progress: 0,
    stage: "",
    isLoading: true,
    error: null,
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async () => {
    if (!analysisId) return

    try {
      const result = await getAnalysisStatus(analysisId)

      if (result.success) {
        setState({
          status: result.data.status,
          progress: result.data.progress?.percent ?? 0,
          stage: result.data.progress?.step ?? "",
          isLoading: false,
          error: null,
        })
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error.message,
        }))
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }))
    }
  }, [analysisId])

  useEffect(() => {
    if (!analysisId) {
      setState({
        status: "pending",
        progress: 0,
        stage: "",
        isLoading: false,
        error: null,
      })
      return
    }

    // Initial fetch
    poll()

    // Set up polling
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [analysisId, poll])

  // Stop polling when in terminal state
  useEffect(() => {
    if (state.status === "completed" || state.status === "failed") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [state.status])

  return state
}
