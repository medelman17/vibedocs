"use client"

import { useState } from "react"
import { Bug, ChevronDown, ChevronUp, Sparkles, AlertTriangle, Shield, Trash2 } from "lucide-react"
import { useAnalysisStore } from "../store/analysis"
import { useAuthStore } from "../store/auth"
import {
  MOCK_ANALYSIS_RESULTS,
  MOCK_ANALYSIS_LOW_RISK,
  MOCK_ANALYSIS_HIGH_RISK,
} from "../lib/mockData"

/**
 * DevTools - Development utilities for testing the Word Add-in UI
 *
 * Only renders in dev mode (?dev=true).
 * Provides buttons to:
 * - Load mock analysis data (standard, low risk, high risk)
 * - Mock authentication
 * - Reset all state
 */
export function DevTools() {
  const [isExpanded, setIsExpanded] = useState(false)
  const reset = useAnalysisStore((state) => state.reset)
  const setAuth = useAuthStore((state) => state.setAuth)
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  // Render on client only
  if (typeof window === "undefined") return null

  const handleLoadMockData = (
    variant: "standard" | "low" | "high"
  ) => {
    const data =
      variant === "low"
        ? MOCK_ANALYSIS_LOW_RISK
        : variant === "high"
          ? MOCK_ANALYSIS_HIGH_RISK
          : MOCK_ANALYSIS_RESULTS

    // Ensure we're authenticated first
    if (!isAuthenticated) {
      handleMockAuth()
    }

    // Set the analysis to completed state with results
    useAnalysisStore.setState({
      status: "completed",
      analysisId: data.analysisId,
      documentId: data.documentId,
      results: data,
      progress: { stage: "completed", percent: 100, message: "Analysis complete" },
      error: null,
      selectedClauseId: null,
    })
  }

  const handleMockAuth = () => {
    setAuth("mock-token-12345", {
      id: "user-001",
      email: "demo@vibedocs.ai",
      name: "Demo User",
    })
  }

  const handleReset = () => {
    reset()
    clearAuth()
  }

  return (
    <div className="fixed bottom-2 left-2 z-50">
      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-md shadow-lg hover:bg-violet-700 transition-colors"
      >
        <Bug className="h-3.5 w-3.5" />
        <span>Dev</span>
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        )}
      </button>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="absolute bottom-full left-0 mb-2 w-56 p-3 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 animate-scale-in">
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
            Load Mock Data
          </div>

          <div className="space-y-1.5">
            {/* Standard risk (62) */}
            <button
              onClick={() => handleLoadMockData("standard")}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-left bg-warning-50 text-warning-700 dark:bg-warning-500/20 dark:text-warning-300 rounded-md hover:bg-warning-100 dark:hover:bg-warning-500/30 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <div>
                <div>Moderate Risk (62)</div>
                <div className="text-[10px] opacity-70">10 clauses, 3 gaps</div>
              </div>
            </button>

            {/* Low risk (28) */}
            <button
              onClick={() => handleLoadMockData("low")}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-left bg-success-50 text-success-700 dark:bg-success-500/20 dark:text-success-300 rounded-md hover:bg-success-100 dark:hover:bg-success-500/30 transition-colors"
            >
              <Shield className="h-3.5 w-3.5" />
              <div>
                <div>Low Risk (28)</div>
                <div className="text-[10px] opacity-70">10 clauses, 0 gaps</div>
              </div>
            </button>

            {/* High risk (78) */}
            <button
              onClick={() => handleLoadMockData("high")}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-left bg-error-50 text-error-700 dark:bg-error-500/20 dark:text-error-300 rounded-md hover:bg-error-100 dark:hover:bg-error-500/30 transition-colors"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <div>
                <div>High Risk (78)</div>
                <div className="text-[10px] opacity-70">10 clauses, 5 gaps</div>
              </div>
            </button>
          </div>

          <div className="my-2 border-t border-neutral-200 dark:border-neutral-700" />

          {/* Reset button */}
          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            <span>Reset All State</span>
          </button>

          <div className="mt-2 text-[10px] text-neutral-400 text-center">
            Dev mode: ?dev=true
          </div>
        </div>
      )}
    </div>
  )
}
