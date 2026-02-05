"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useInngestSubscription } from "@inngest/realtime/hooks"
import { getAnalysisStatus } from "@/app/(main)/(dashboard)/analyses/actions"
import { fetchRealtimeToken } from "@/app/(main)/(dashboard)/analyses/actions"
import type { AnalysisStatus } from "@/app/(main)/(dashboard)/analyses/actions"

/** Degraded polling interval (ms) when Inngest Realtime is unavailable */
const POLL_INTERVAL_MS = 5000

const TERMINAL_STATUSES: AnalysisStatus[] = ["completed", "failed", "cancelled"]

interface AnalysisProgressState {
  status: AnalysisStatus
  progress: number
  stage: string
  /** Detailed progress message from the pipeline (e.g. "Classifying clause 7 of 15...") */
  message: string
  /** Queue position when analysis is pending (0 = next in line) */
  queuePosition: number | undefined
  isLoading: boolean
  error: string | null
}

/**
 * Map realtime stage names to analysis status.
 * The "complete" and "failed" stages indicate terminal states.
 */
function stageToStatus(stage: string): AnalysisStatus | null {
  if (stage === "complete") return "completed"
  if (stage === "failed") return "failed"
  if (stage === "cancelled") return "cancelled"
  return null
}

/**
 * Hook for streaming analysis progress via Inngest Realtime.
 *
 * Uses Inngest Realtime as primary transport for low-latency updates.
 * Falls back to polling at 5s intervals when realtime is unavailable.
 * Fetches initial state from DB on mount for late-join snapshot.
 *
 * Stops all subscriptions/polling when a terminal state is reached
 * (completed, failed, cancelled).
 */
export function useAnalysisProgress(
  analysisId: string | null
): AnalysisProgressState {
  const [state, setState] = useState<AnalysisProgressState>({
    status: "pending",
    progress: 0,
    stage: "",
    message: "",
    queuePosition: undefined,
    isLoading: true,
    error: null,
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const realtimeReceivedRef = useRef(false)
  const analysisIdRef = useRef(analysisId)

  // Keep analysisId ref in sync
  useEffect(() => {
    analysisIdRef.current = analysisId
  }, [analysisId])

  // Determine if we should subscribe to realtime
  const isTerminal = TERMINAL_STATUSES.includes(state.status)
  const shouldSubscribe = !!analysisId && !isTerminal

  // Stable refreshToken callback for useInngestSubscription
  const refreshToken = useCallback(() => {
    const currentId = analysisIdRef.current
    if (!currentId) {
      return Promise.reject(new Error("No analysis ID"))
    }
    return fetchRealtimeToken(currentId)
  }, [])

  // Inngest Realtime subscription (primary transport)
  const subscription = useInngestSubscription({
    refreshToken: shouldSubscribe ? refreshToken : undefined,
    enabled: shouldSubscribe,
    key: analysisId ?? undefined,
  })

  // Process realtime events
  useEffect(() => {
    if (!subscription.latestData) return

    const event = subscription.latestData
    const data = event.data

    realtimeReceivedRef.current = true

    // Clear polling if realtime is working
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // Map stage to terminal status if applicable
    const terminalStatus = stageToStatus(data.stage)

    setState((prev) => ({
      ...prev,
      status: terminalStatus ?? "processing",
      progress: data.percent,
      stage: data.stage,
      message: data.message,
      // Keep queuePosition from initial DB fetch (not in realtime events)
      queuePosition: terminalStatus ? undefined : prev.queuePosition,
      isLoading: false,
      error: null,
    }))
  }, [subscription.latestData])

  // Initial DB fetch (late-join snapshot) + polling fallback
  useEffect(() => {
    if (!analysisId) {
      setState({
        status: "pending",
        progress: 0,
        stage: "",
        message: "",
        queuePosition: undefined,
        isLoading: false,
        error: null,
      })
      return
    }

    // Reset refs for new analysis
    realtimeReceivedRef.current = false

    const poll = async () => {
      const currentId = analysisIdRef.current
      if (!currentId) return

      try {
        const result = await getAnalysisStatus(currentId)

        if (result.success) {
          const isTerminalResult = TERMINAL_STATUSES.includes(result.data.status)

          // Stop polling on terminal state
          if (isTerminalResult && intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }

          setState({
            status: result.data.status,
            progress: result.data.progress?.percent ?? 0,
            stage: result.data.progress?.step ?? "",
            message: result.data.message ?? result.data.progress?.step ?? "",
            queuePosition: result.data.queuePosition,
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
      } catch (e) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: e instanceof Error ? e.message : "Unknown error",
        }))
      }
    }

    // Initial fetch for late-join snapshot
    // Use setTimeout(0) to satisfy react-hooks/set-state-in-effect lint rule
    setTimeout(poll, 0)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [analysisId])

  // Activate polling fallback when realtime connection fails
  useEffect(() => {
    if (!analysisId || isTerminal) return

    // If realtime has an error and we haven't received any realtime events,
    // start degraded polling
    if (subscription.error && !realtimeReceivedRef.current && !intervalRef.current) {
      const poll = async () => {
        const currentId = analysisIdRef.current
        if (!currentId) return

        try {
          const result = await getAnalysisStatus(currentId)

          if (result.success) {
            const isTerminalResult = TERMINAL_STATUSES.includes(result.data.status)

            if (isTerminalResult && intervalRef.current) {
              clearInterval(intervalRef.current)
              intervalRef.current = null
            }

            setState({
              status: result.data.status,
              progress: result.data.progress?.percent ?? 0,
              stage: result.data.progress?.step ?? "",
              message: result.data.message ?? result.data.progress?.step ?? "",
              queuePosition: result.data.queuePosition,
              isLoading: false,
              error: null,
            })
          }
        } catch {
          // Silently continue polling
        }
      }

      intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [analysisId, isTerminal, subscription.error])

  return state
}
