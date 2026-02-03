"use client"

import { useMemo, useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
// Direct imports for tree-shaking (bundle-barrel-imports)
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
      // High confidence first
      return sorted.sort((a, b) => b.confidence - a.confidence)
    case "risk":
      // High risk first
      return sorted.sort((a, b) => getRiskPriority(b.riskLevel) - getRiskPriority(a.riskLevel))
    case "category":
      // Alphabetical by category
      return sorted.sort((a, b) => a.category.localeCompare(b.category))
    default:
      return sorted
  }
}

/**
 * ClauseList displays a filterable, sortable list of extracted clauses.
 *
 * Features:
 * - Filter by risk level (All, Standard, Cautious, Aggressive)
 * - Sort by confidence, risk level, or category
 * - Shows count of displayed clauses
 * - Each card is clickable to select the clause
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

  // Don't render if no results
  if (!results) {
    return null
  }

  const totalCount = results.clauses.length
  const displayedCount = displayedClauses.length

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium">
          Clauses
          <span className="ml-1.5 text-sm text-muted-foreground">
            ({displayedCount}
            {riskFilter !== "all" && ` of ${totalCount}`})
          </span>
        </h3>
      </div>

      {/* Filters row */}
      <div className="flex gap-2">
        {/* Risk filter */}
        <Select
          value={riskFilter}
          onValueChange={(value) => setRiskFilter(value as RiskFilter)}
        >
          <SelectTrigger size="sm" className="h-7 flex-1 text-xs">
            <SelectValue placeholder="Filter by risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risks</SelectItem>
            <SelectItem value="aggressive">Aggressive</SelectItem>
            <SelectItem value="cautious">Cautious</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort option */}
        <Select
          value={sortBy}
          onValueChange={(value) => setSortBy(value as SortOption)}
        >
          <SelectTrigger size="sm" className="h-7 flex-1 text-xs">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="risk">Sort: Risk Level</SelectItem>
            <SelectItem value="confidence">Sort: Confidence</SelectItem>
            <SelectItem value="category">Sort: Category</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clause cards */}
      <div className="flex flex-col gap-2">
        {displayedClauses.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No clauses match the current filter.
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
