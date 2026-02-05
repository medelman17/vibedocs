"use client"

import { useState, useEffect, useRef } from "react"
import { getAnalysisStatus } from "@/app/(main)/(dashboard)/analyses/actions"
import type { AnalysisStatus } from "@/app/(main)/(dashboard)/analyses/actions"

const POLL_INTERVAL_MS = 2000

interface AnalysisProgressState {
  status: AnalysisStatus
  progress: number
  stage: string
  /** Human-readable progress message from the pipeline */
  message: string
  isLoading: boolean
  error: string | null
}

/**
 * Hook for polling analysis progress.
 * Polls every 2 seconds while status is "pending", "pending_ocr", or "processing".
 * Stops polling when status is "completed", "failed", or "cancelled" (terminal states).
 */
export function useAnalysisProgress(
  analysisId: string | null
): AnalysisProgressState {
  const [state, setState] = useState<AnalysisProgressState>({
    status: "pending",
    progress: 0,
    stage: "",
    message: "",
    isLoading: true,
    error: null,
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisIdRef = useRef(analysisId)

  // Keep analysisId ref in sync
  useEffect(() => {
    analysisIdRef.current = analysisId
  }, [analysisId])

  useEffect(() => {
    if (!analysisId) {
      setState({
        status: "pending",
        progress: 0,
        stage: "",
        message: "",
        isLoading: false,
        error: null,
      })
      return
    }

    const poll = async () => {
      // Use ref to get current analysisId in case it changed
      const currentId = analysisIdRef.current
      if (!currentId) return

      try {
        const result = await getAnalysisStatus(currentId)

        if (result.success) {
          // Stop polling if we've reached a terminal state
          if (
            result.data.status === "completed" ||
            result.data.status === "failed" ||
            result.data.status === "cancelled"
          ) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current)
              intervalRef.current = null
            }
          }

          setState({
            status: result.data.status,
            progress: result.data.progress?.percent ?? 0,
            stage: result.data.progress?.step ?? "",
            message: result.data.progress?.step ?? "",
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
    }

    // Initial fetch
    poll()

    // Set up polling - poll function is stable (no deps that change)
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [analysisId]) // Only re-run when analysisId changes

  return state
}
