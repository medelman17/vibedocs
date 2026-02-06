import { create } from "zustand"

export type SelectionSource = "document" | "analysis"
export type AnalysisTab = "classifications" | "risk" | "gaps" | "chat"

interface PendingClauseContext {
  clauseId: string
  clauseText: string
}

interface ClauseSelectionState {
  activeClauseId: string | null
  hoveredClauseId: string | null
  selectionSource: SelectionSource | null
  highlightsEnabled: boolean
  activeTab: AnalysisTab
  pendingClauseContext: PendingClauseContext | null
  clauseIds: string[]
}

interface ClauseSelectionActions {
  selectClause: (clauseId: string, source: SelectionSource) => void
  clearSelection: () => void
  hoverClause: (clauseId: string | null) => void
  toggleHighlights: () => void
  setHighlightsEnabled: (enabled: boolean) => void
  setActiveTab: (tab: AnalysisTab) => void
  askAboutClause: (clauseId: string, clauseText: string) => void
  setClauseIds: (ids: string[]) => void
  nextClause: () => void
  prevClause: () => void
}

export const useClauseSelection = create<
  ClauseSelectionState & ClauseSelectionActions
>()((set, get) => ({
  // Initial state
  activeClauseId: null,
  hoveredClauseId: null,
  selectionSource: null,
  highlightsEnabled: false,
  activeTab: "risk",
  pendingClauseContext: null,
  clauseIds: [],

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

  hoverClause: (clauseId) =>
    set({ hoveredClauseId: clauseId }),

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

  setClauseIds: (ids) =>
    set({ clauseIds: ids }),

  nextClause: () => {
    const { clauseIds, activeClauseId } = get()
    if (clauseIds.length === 0) return
    if (!activeClauseId) {
      // No active clause - select the first one
      set({ activeClauseId: clauseIds[0], selectionSource: "document" })
      return
    }
    const currentIndex = clauseIds.indexOf(activeClauseId)
    const nextIndex = (currentIndex + 1) % clauseIds.length
    set({ activeClauseId: clauseIds[nextIndex], selectionSource: "document" })
  },

  prevClause: () => {
    const { clauseIds, activeClauseId } = get()
    if (clauseIds.length === 0) return
    if (!activeClauseId) {
      // No active clause - select the last one
      set({
        activeClauseId: clauseIds[clauseIds.length - 1],
        selectionSource: "document",
      })
      return
    }
    const currentIndex = clauseIds.indexOf(activeClauseId)
    const prevIndex = (currentIndex - 1 + clauseIds.length) % clauseIds.length
    set({ activeClauseId: clauseIds[prevIndex], selectionSource: "document" })
  },
}))
