import { create } from "zustand"

export type SelectionSource = "document" | "analysis"
export type AnalysisTab = "classifications" | "risk" | "gaps" | "chat"

interface PendingClauseContext {
  clauseId: string
  clauseText: string
}

interface ClauseSelectionState {
  activeClauseId: string | null
  selectionSource: SelectionSource | null
  highlightsEnabled: boolean
  activeTab: AnalysisTab
  pendingClauseContext: PendingClauseContext | null
}

interface ClauseSelectionActions {
  selectClause: (clauseId: string, source: SelectionSource) => void
  clearSelection: () => void
  toggleHighlights: () => void
  setHighlightsEnabled: (enabled: boolean) => void
  setActiveTab: (tab: AnalysisTab) => void
  askAboutClause: (clauseId: string, clauseText: string) => void
}

export const useClauseSelection = create<
  ClauseSelectionState & ClauseSelectionActions
>()((set) => ({
  // Initial state
  activeClauseId: null,
  selectionSource: null,
  highlightsEnabled: false,
  activeTab: "risk",
  pendingClauseContext: null,

  // Actions
  selectClause: (clauseId, source) =>
    set({
      activeClauseId: clauseId,
      selectionSource: source,
    }),

  clearSelection: () =>
    set({
      activeClauseId: null,
      selectionSource: null,
    }),

  toggleHighlights: () =>
    set((state) => ({
      highlightsEnabled: !state.highlightsEnabled,
    })),

  setHighlightsEnabled: (enabled) =>
    set({
      highlightsEnabled: enabled,
    }),

  setActiveTab: (tab) =>
    set({
      activeTab: tab,
    }),

  askAboutClause: (clauseId, clauseText) =>
    set({
      activeClauseId: clauseId,
      activeTab: "chat",
      pendingClauseContext: { clauseId, clauseText },
    }),
}))
