/**
 * @fileoverview Analysis State Store
 *
 * Zustand store for managing analysis state in the Word Add-in task pane.
 */

import { create } from "zustand"
import type {
  ClauseResult,
  GapAnalysisResult,
  AnalysisResults,
  ProgressState,
  AnalysisStatus,
  AnalysisStage,
} from "@/types/word-addin"

// Re-export types for consumers who import from the store
export type {
  ClauseResult,
  GapAnalysisResult,
  AnalysisResults,
  ProgressState,
  AnalysisStatus,
  AnalysisStage,
}

/**
 * Analysis store state
 */
interface AnalysisState {
  // Current analysis
  analysisId: string | null
  documentId: string | null
  status: AnalysisStatus
  progress: ProgressState | null
  results: AnalysisResults | null
  error: string | null

  // UI state
  selectedClauseId: string | null

  // Actions
  startAnalysis: (analysisId: string, documentId: string) => void
  updateProgress: (progress: ProgressState) => void
  setResults: (results: AnalysisResults) => void
  setError: (error: string) => void
  selectClause: (clauseId: string | null) => void
  reset: () => void
}

/**
 * Initial state
 */
const initialState = {
  analysisId: null,
  documentId: null,
  status: "idle" as AnalysisStatus,
  progress: null,
  results: null,
  error: null,
  selectedClauseId: null,
}

/**
 * Analysis store for managing analysis workflow state.
 *
 * @example
 * ```tsx
 * const { status, progress, results, startAnalysis, setResults } = useAnalysisStore()
 *
 * // Start analysis
 * startAnalysis(analysisId, documentId)
 *
 * // When results are ready
 * setResults(results)
 * ```
 */
export const useAnalysisStore = create<AnalysisState>((set) => ({
  ...initialState,

  startAnalysis: (analysisId, documentId) =>
    set({
      analysisId,
      documentId,
      status: "analyzing",
      progress: { stage: "pending", percent: 0, message: "Starting analysis..." },
      results: null,
      error: null,
      selectedClauseId: null,
    }),

  updateProgress: (progress) =>
    set((state) => {
      // Determine status from stage
      let status: AnalysisStatus = state.status
      if (progress.stage === "completed") {
        status = "completed"
      } else if (progress.stage === "failed") {
        status = "failed"
      } else if (state.status !== "failed") {
        status = "analyzing"
      }

      return { progress, status }
    }),

  setResults: (results) =>
    set({
      results,
      status: "completed",
      progress: { stage: "completed", percent: 100, message: "Analysis complete" },
    }),

  setError: (error) =>
    set({
      error,
      status: "failed",
      progress: { stage: "failed", percent: 0, message: error },
    }),

  selectClause: (clauseId) =>
    set({ selectedClauseId: clauseId }),

  reset: () => set(initialState),
}))
