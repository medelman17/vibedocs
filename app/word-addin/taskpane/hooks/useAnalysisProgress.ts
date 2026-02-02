/**
 * @fileoverview Analysis Progress SSE Hook
 *
 * Subscribes to Server-Sent Events for real-time analysis progress updates.
 */

import { useState, useEffect, useCallback } from "react"
import { useAuthStore } from "../store/auth"

/**
 * Progress event from the SSE stream (matches ProgressState in store)
 */
export interface ProgressEvent {
  stage: string
  percent: number
  message: string
}

/**
 * Raw SSE event format (from the API)
 */
interface RawSSEEvent {
  stage: string
  progress: number
  message: string
}

/**
 * Hook state
 */
interface UseAnalysisProgressState {
  progress: ProgressEvent | null
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
 * Subscribe to analysis progress updates via SSE.
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
 *   console.log(`${progress.stage}: ${progress.progress}% - ${progress.message}`)
 * }
 * ```
 */
export function useAnalysisProgress(
  analysisId: string | null,
  enabled: boolean = true
): UseAnalysisProgressReturn {
  const token = useAuthStore((state) => state.token)
  const [state, setState] = useState<UseAnalysisProgressState>({
    progress: null,
    isConnected: false,
    error: null,
  })

  const [eventSource, setEventSource] = useState<EventSource | null>(null)

  /**
   * Disconnect from the SSE stream
   */
  const disconnect = useCallback(() => {
    if (eventSource) {
      eventSource.close()
      setEventSource(null)
      setState((prev) => ({ ...prev, isConnected: false }))
    }
  }, [eventSource])

  useEffect(() => {
    // Skip if disabled or missing dependencies
    if (!analysisId || !enabled || !token) {
      return
    }

    // Note: EventSource doesn't support custom headers natively.
    // We need to use a polyfill or pass token as query param.
    // For security, we'll use the fetch-event-source approach.
    let controller: AbortController | null = new AbortController()

    async function connectSSE() {
      try {
        setState((prev) => ({ ...prev, error: null, isConnected: true }))

        const response = await fetch(`/api/word-addin/status/${analysisId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          signal: controller!.signal,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error?.message || `HTTP ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error("Response body is not readable")
        }

        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            setState((prev) => ({ ...prev, isConnected: false }))
            break
          }

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events from buffer
          const lines = buffer.split("\n")
          buffer = lines.pop() || "" // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const rawData = JSON.parse(line.slice(6)) as RawSSEEvent
                // Transform SSE 'progress' field to 'percent' for consistency with store
                const data: ProgressEvent = {
                  stage: rawData.stage,
                  percent: rawData.progress,
                  message: rawData.message,
                }
                setState((prev) => ({
                  ...prev,
                  progress: data,
                }))

                // Auto-disconnect on terminal states
                if (data.stage === "completed" || data.stage === "failed") {
                  setState((prev) => ({ ...prev, isConnected: false }))
                }
              } catch {
                // Ignore malformed JSON
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          // Expected when disconnecting
          return
        }

        console.error("[useAnalysisProgress] SSE error:", error)
        setState((prev) => ({
          ...prev,
          isConnected: false,
          error: (error as Error).message,
        }))
      }
    }

    connectSSE()

    // Cleanup on unmount or dependency change
    return () => {
      controller?.abort()
      controller = null
    }
  }, [analysisId, enabled, token])

  return {
    ...state,
    disconnect,
  }
}
