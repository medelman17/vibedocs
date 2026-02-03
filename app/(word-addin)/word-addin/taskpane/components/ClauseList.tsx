"use client"

import { useMemo, useState } from "react"
import { Filter, ArrowUpDown, Inbox } from "lucide-react"
import { useAnalysisStore } from "../store/analysis"
import type { ClauseResult } from "../store/analysis"
import { ClauseCard } from "./ClauseCard"

/**
 * Risk filter options
 */
type RiskFilter = "all" | "standard" | "cautious" | "aggressive"

/**
 * Sort options
 */
type SortOption = "confidence" | "risk" | "category"

/**
 * Risk level priority for sorting (higher = more severe)
 */
const riskPriority: Record<string, number> = {
  aggressive: 3,
  cautious: 2,
  standard: 1,
  unknown: 0,
}

/**
 * Get numeric risk priority for sorting
 */
function getRiskPriority(level: string): number {
  const normalized = level.toLowerCase()
  return riskPriority[normalized] ?? 0
}

/**
 * Filter clauses by risk level
 */
function filterClauses(clauses: ClauseResult[], filter: RiskFilter): ClauseResult[] {
  if (filter === "all") return clauses
  return clauses.filter((c) => c.riskLevel.toLowerCase() === filter)
}

/**
 * Sort clauses by the selected option
 */
function sortClauses(clauses: ClauseResult[], sortBy: SortOption): ClauseResult[] {
  const sorted = [...clauses]

  switch (sortBy) {
    case "confidence":
      return sorted.sort((a, b) => b.confidence - a.confidence)
    case "risk":
      return sorted.sort(
        (a, b) => getRiskPriority(b.riskLevel) - getRiskPriority(a.riskLevel)
      )
    case "category":
      return sorted.sort((a, b) => a.category.localeCompare(b.category))
    default:
      return sorted
  }
}

const FILTER_OPTIONS: { value: RiskFilter; label: string }[] = [
  { value: "all", label: "All Risks" },
  { value: "aggressive", label: "Aggressive" },
  { value: "cautious", label: "Cautious" },
  { value: "standard", label: "Standard" },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "risk", label: "Risk Level" },
  { value: "confidence", label: "Confidence" },
  { value: "category", label: "Category" },
]

/**
 * ClauseList - A filterable, sortable list of extracted clauses.
 *
 * Features:
 * - Custom select dropdowns with refined styling
 * - Staggered animation on list items
 * - Empty state with illustration
 * - Count display with filtering
 */
export function ClauseList() {
  const results = useAnalysisStore((state) => state.results)
  const selectedClauseId = useAnalysisStore((state) => state.selectedClauseId)
  const selectClause = useAnalysisStore((state) => state.selectClause)

  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all")
  const [sortBy, setSortBy] = useState<SortOption>("risk")

  // Process clauses with filter and sort
  const displayedClauses = useMemo(() => {
    const clauses = results?.clauses
    if (!clauses || clauses.length === 0) return []
    const filtered = filterClauses(clauses, riskFilter)
    return sortClauses(filtered, sortBy)
  }, [results, riskFilter, sortBy])

  if (!results) {
    return null
  }

  const totalCount = results.clauses.length
  const displayedCount = displayedClauses.length

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="addin-display-sm text-foreground">
          Clauses
          <span className="ml-1.5 text-sm font-normal text-neutral-500">
            ({displayedCount}
            {riskFilter !== "all" && ` of ${totalCount}`})
          </span>
        </h3>
      </div>

      {/* Filters row */}
      <div className="flex gap-2">
        {/* Risk filter */}
        <div className="relative flex-1">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
            className="w-full h-8 pl-8 pr-3 text-xs bg-muted border border-border rounded-md appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400"
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort option */}
        <div className="relative flex-1">
          <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="w-full h-8 pl-8 pr-3 text-xs bg-muted border border-border rounded-md appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Clause cards */}
      <div className="flex flex-col gap-2 animate-stagger">
        {displayedClauses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
              <Inbox className="h-5 w-5 text-neutral-400" />
            </div>
            <p className="text-sm text-neutral-500">
              No clauses match the current filter.
            </p>
            {riskFilter !== "all" && (
              <button
                onClick={() => setRiskFilter("all")}
                className="mt-2 text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          displayedClauses.map((clause) => (
            <ClauseCard
              key={clause.id}
              clause={clause}
              isSelected={selectedClauseId === clause.id}
              onClick={() => selectClause(clause.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
