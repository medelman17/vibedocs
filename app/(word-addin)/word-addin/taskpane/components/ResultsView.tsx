"use client"

import { useMemo } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileText, AlertTriangle } from "lucide-react"
// Direct import to enable tree-shaking (bundle-barrel-imports)
import { useAnalysisStore } from "../store/analysis"
import { RiskGauge } from "./RiskGauge"
import { ClauseList } from "./ClauseList"
import { ClauseDetail } from "./ClauseDetail"
import { GapAnalysis } from "./GapAnalysis"

/**
 * ResultsView is the container component that orchestrates all results display.
 *
 * Structure:
 * - RiskGauge at the top (overall risk visualization)
 * - Tabs for switching between "Clauses" and "Gaps" sections
 * - When a clause is selected, shows ClauseDetail instead of ClauseList
 *
 * Reads from useAnalysisStore:
 * - results: The full analysis results (returns null if not available)
 * - selectedClauseId: ID of currently selected clause (shows detail view when set)
 */
export function ResultsView() {
  const results = useAnalysisStore((state) => state.results)
  const selectedClauseId = useAnalysisStore((state) => state.selectedClauseId)

  // Memoize counts to avoid recomputation on every render (rerender-memo)
  // Using gapAnalysis as dependency for React Compiler compatibility
  const clauseCount = useMemo(
    () => results?.clauses.length ?? 0,
    [results?.clauses]
  )
  const gapCount = useMemo(
    () =>
      (results?.gapAnalysis?.missingClauses.length ?? 0) +
      (results?.gapAnalysis?.weakClauses.length ?? 0),
    [results?.gapAnalysis]
  )

  // Don't render if no results available
  if (!results) {
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Overall risk gauge at the top */}
      <RiskGauge />

      {/* Tabbed sections for clauses and gaps */}
      <Tabs defaultValue="clauses" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="clauses" className="flex-1 gap-1.5">
            <FileText className="h-4 w-4" />
            Clauses
            {/* Use ternary to avoid rendering falsy values (rendering-conditional-render) */}
            {clauseCount > 0 ? (
              <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-xs font-medium">
                {clauseCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="gaps" className="flex-1 gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Gaps
            {gapCount > 0 ? (
              <span className="ml-1 rounded-full bg-yellow-500/20 px-1.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                {gapCount}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clauses" className="mt-4">
          {/* Show ClauseDetail when a clause is selected, otherwise show the list */}
          {selectedClauseId ? <ClauseDetail /> : <ClauseList />}
        </TabsContent>

        <TabsContent value="gaps" className="mt-4">
          <GapAnalysis />
        </TabsContent>
      </Tabs>

      {/* Summary section */}
      {results.summary && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <h4 className="text-sm font-medium">Summary</h4>
          <p className="mt-1 text-sm text-muted-foreground">{results.summary}</p>
        </div>
      )}
    </div>
  )
}
