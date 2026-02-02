"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ArrowLeft, MapPin, FileText, Loader2 } from "lucide-react"
import { useAnalysisStore } from "../store"
import { useDocumentNavigation } from "../hooks"

/**
 * Risk level type from PRD
 */
type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown"

/**
 * Configuration for each risk level's badge styling
 */
const riskBadgeConfig: Record<RiskLevel, { label: string; className: string }> = {
  standard: {
    label: "Standard",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  cautious: {
    label: "Cautious",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  aggressive: {
    label: "Aggressive",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  unknown: {
    label: "Unknown",
    className: "bg-muted text-muted-foreground",
  },
}

/**
 * Normalize risk level string to typed RiskLevel
 */
function normalizeRiskLevel(level: string): RiskLevel {
  const normalized = level.toLowerCase()
  if (normalized === "standard" || normalized === "cautious" || normalized === "aggressive") {
    return normalized
  }
  return "unknown"
}

/**
 * Format category name for display (e.g., "non_compete" -> "Non Compete")
 */
function formatCategory(category: string): string {
  return category
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

/**
 * ClauseDetail displays expanded information for a selected clause.
 *
 * Shows:
 * - Category header
 * - Risk level badge with explanation
 * - Confidence percentage with visual bar
 * - Full clause text
 * - Start/end character positions
 * - Navigate to clause button (placeholder for Office.js integration)
 * - Back to list button
 */
export function ClauseDetail() {
  const results = useAnalysisStore((state) => state.results)
  const selectedClauseId = useAnalysisStore((state) => state.selectedClauseId)
  const selectClause = useAnalysisStore((state) => state.selectClause)

  const { navigateToClause, isNavigating } = useDocumentNavigation()
  const [navigationError, setNavigationError] = useState<string | null>(null)

  // Don't render if no clause selected
  if (!selectedClauseId || !results) {
    return null
  }

  // Find the selected clause
  const clause = results.clauses.find((c) => c.id === selectedClauseId)
  if (!clause) {
    return null
  }

  const riskLevel = normalizeRiskLevel(clause.riskLevel)
  const badgeConfig = riskBadgeConfig[riskLevel]
  const confidencePercent = Math.round(clause.confidence * 100)

  const handleBackToList = () => {
    selectClause(null)
  }

  const handleNavigateToClause = async () => {
    setNavigationError(null)
    const result = await navigateToClause(
      clause.clauseText,
      clause.startPosition,
      clause.endPosition
    )

    if (!result.success) {
      setNavigationError(result.error ?? "Failed to navigate to clause")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-fit -ml-2"
        onClick={handleBackToList}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to list
      </Button>

      {/* Header: Category + Risk Badge */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold leading-tight">
          {formatCategory(clause.category)}
        </h3>
        <Badge
          variant="secondary"
          className={cn("shrink-0 text-xs px-2 py-0.5", badgeConfig.className)}
        >
          {badgeConfig.label} Risk
        </Badge>
      </div>

      {/* Risk explanation */}
      {clause.riskExplanation && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Risk Analysis: </span>
            {clause.riskExplanation}
          </p>
        </div>
      )}

      {/* Confidence score */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Confidence</span>
          <span className="font-medium tabular-nums">{confidencePercent}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      {/* Full clause text */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>Clause Text</span>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {clause.clauseText}
          </p>
        </div>
      </div>

      {/* Position info */}
      {(clause.startPosition !== null || clause.endPosition !== null) && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span>
            Position: {clause.startPosition ?? "?"} - {clause.endPosition ?? "?"}
            {clause.startPosition !== null && clause.endPosition !== null && (
              <span className="ml-1">
                ({clause.endPosition - clause.startPosition} characters)
              </span>
            )}
          </span>
        </div>
      )}

      {/* Navigate to clause button */}
      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={handleNavigateToClause}
          disabled={isNavigating || !clause.clauseText}
        >
          {isNavigating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
          {isNavigating ? "Navigating..." : "Navigate to Clause in Document"}
        </Button>
        {navigationError && (
          <p className="text-xs text-destructive text-center">
            {navigationError}
          </p>
        )}
      </div>
    </div>
  )
}
