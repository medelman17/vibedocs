"use client"

import { useMemo, useState } from "react"
import { FileText, AlertTriangle, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAnalysisStore } from "../store/analysis"
import { RiskGauge } from "./RiskGauge"
import { ClauseList } from "./ClauseList"
import { ClauseDetail } from "./ClauseDetail"
import { GapAnalysis } from "./GapAnalysis"

type TabValue = "clauses" | "gaps"

/**
 * ResultsView - The orchestrating container for all analysis results.
 *
 * Structure:
 * - RiskGauge at the top (overall risk visualization)
 * - Custom tabs for switching between "Clauses" and "Gaps" sections
 * - When a clause is selected, shows ClauseDetail instead of ClauseList
 * - Summary section at the bottom
 */
export function ResultsView() {
  const results = useAnalysisStore((state) => state.results)
  const selectedClauseId = useAnalysisStore((state) => state.selectedClauseId)

  const [activeTab, setActiveTab] = useState<TabValue>("clauses")

  // Memoize counts
  const clauseCount = useMemo(() => results?.clauses.length ?? 0, [results?.clauses])
  const gapCount = useMemo(
    () =>
      (results?.gapAnalysis?.missingClauses.length ?? 0) +
      (results?.gapAnalysis?.weakClauses.length ?? 0),
    [results?.gapAnalysis]
  )

  if (!results) {
    return null
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Overall risk gauge */}
      <RiskGauge />

      {/* Custom tabs */}
      <div className="addin-tabs-list">
        <button
          onClick={() => setActiveTab("clauses")}
          data-state={activeTab === "clauses" ? "active" : "inactive"}
          className="addin-tab"
        >
          <FileText className="addin-tab-icon" />
          <span>Clauses</span>
          {clauseCount > 0 && (
            <span className="addin-tab-count addin-badge-count">{clauseCount}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("gaps")}
          data-state={activeTab === "gaps" ? "active" : "inactive"}
          className="addin-tab"
        >
          <AlertTriangle className="addin-tab-icon" />
          <span>Gaps</span>
          {gapCount > 0 && (
            <span
              className={cn(
                "addin-tab-count",
                activeTab === "gaps" ? "" : "bg-warning-500/20 text-warning-600 dark:text-warning-400"
              )}
            >
              {gapCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="min-h-[200px]">
        {activeTab === "clauses" ? (
          selectedClauseId ? (
            <ClauseDetail />
          ) : (
            <ClauseList />
          )
        ) : (
          <GapAnalysis />
        )}
      </div>

      {/* Summary section */}
      {results.summary && (
        <div className="addin-card p-3 animate-slide-up">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-violet-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Summary</p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {results.summary}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
