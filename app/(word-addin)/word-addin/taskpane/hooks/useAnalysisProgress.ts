/**
 * @fileoverview Analysis Progress Realtime Hook
 *
 * Subscribes to Inngest Realtime for real-time analysis progress updates.
 * Replaces the previous SSE-based fetch + ReadableStream approach with
 * useInngestSubscription for automatic reconnection and typed channels.
 */

import { useState, useMemo, useCallback } from "react"
import {
  useInngestSubscription,
  InngestSubscriptionState,
} from "@inngest/realtime/hooks"
import type { AnalysisToken } from "@/lib/realtime/tokens"
import { useAuthStore } from "../store/auth"
import type { ProgressState, AnalysisStage } from "@/types/word-addin"

/**
 * Hook state
 */
interface UseAnalysisProgressState {
  progress: ProgressState | null
  isConnected: boolean
  error: string | null
}

/**
 * Hook return type
 */
interface UseAnalysisProgressReturn extends UseAnalysisProgressState {
  disconnect: () => void
}

/**
 * Terminal stages that should trigger auto-disconnect.
 */
const TERMINAL_STAGES = new Set<string>(["completed", "failed", "cancelled"])

/**
 * Subscribe to analysis progress updates via Inngest Realtime.
 *
 * @param analysisId - The analysis ID to track (null to disable)
 * @param enabled - Whether to enable the subscription
 * @returns Progress state and control functions
 *
 * @example
 * ```tsx
 * const { progress, isConnected, error } = useAnalysisProgress(analysisId, true)
 *
 * if (progress) {
 *   console.log(`${progress.stage}: ${progress.percent}% - ${progress.message}`)
 * }
 * ```
 */
export function useAnalysisProgress(
  analysisId: string | null,
  enabled: boolean = true
): UseAnalysisProgressReturn {
  const token = useAuthStore((state) => state.token)

  // Track which analysisId triggered manual disconnect so switching
  // analysisId automatically re-enables the subscription.
  const [disconnectedFor, setDisconnectedFor] = useState<string | null>(null)
  const disconnected = disconnectedFor === analysisId

  /**
   * Fetch a fresh Inngest Realtime subscription token from the API.
   * Called on initial subscribe and on automatic reconnection.
   */
  const refreshToken = useCallback(async (): Promise<AnalysisToken> => {
    if (!analysisId || !token) {
      throw new Error("Missing analysisId or auth token")
    }

    const response = await fetch(
      `/api/word-addin/realtime-token/${analysisId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        (errorData as { error?: { message?: string } }).error?.message ||
          `HTTP ${response.status}`
      )
    }

    const data = (await response.json()) as { token: AnalysisToken }
    return data.token
  }, [analysisId, token])

  /**
   * Subscribe to the analysis progress channel via Inngest Realtime.
   * The `key` ensures subscription resets when analysisId changes.
   * useInngestSubscription handles reconnection internally by re-calling
   * refreshToken on connection loss.
   */
  const subscription = useInngestSubscription({
    refreshToken,
    key: analysisId ?? undefined,
    enabled: enabled && !!analysisId && !!token && !disconnected,
  })

  /**
   * Derive progress from latest subscription data.
   * Also checks for terminal states to trigger auto-disconnect.
   */
  const progress = useMemo<ProgressState | null>(() => {
    if (!subscription.latestData) return null

    const { data } = subscription.latestData
    const mapped: ProgressState = {
      stage: data.stage as AnalysisStage,
      percent: data.percent,
      message: data.message,
    }

    // Schedule auto-disconnect on terminal states (via setTimeout to avoid
    // setState during render)
    if (TERMINAL_STAGES.has(data.stage) && !disconnected) {
      setTimeout(() => setDisconnectedFor(analysisId), 0)
    }

    return mapped
  }, [subscription.latestData, disconnected, analysisId])

  /**
   * Disconnect from the realtime subscription.
   * Stores which analysisId was disconnected so switching to a new
   * analysis automatically re-enables subscription.
   */
  const disconnect = useCallback(() => {
    setDisconnectedFor(analysisId)
  }, [analysisId])

  /**
   * Derive connection state from subscription state.
   */
  const isConnected =
    !disconnected &&
    subscription.state === InngestSubscriptionState.Active

  /**
   * Extract error message from subscription error.
   */
  const errorMessage =
    subscription.error && !disconnected ? subscription.error.message : null

  return {
    progress,
    isConnected,
    error: errorMessage,
    disconnect,
  }
}
