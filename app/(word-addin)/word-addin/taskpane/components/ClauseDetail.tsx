"use client"

import { useState } from "react"
import { ArrowLeft, MapPin, FileText, Loader2, AlertTriangle, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAnalysisStore } from "../store/analysis"
import { useDocumentNavigation } from "../hooks/useDocumentNavigation"
import { formatCategory, normalizeRiskLevel } from "../lib/format"

/**
 * Risk badge configuration
 */
const RISK_BADGE_CLASSES = {
  standard: "addin-badge-standard",
  cautious: "addin-badge-cautious",
  aggressive: "addin-badge-aggressive",
  unknown: "addin-badge-unknown",
} as const

const RISK_BADGE_LABELS = {
  standard: "Standard Risk",
  cautious: "Cautious Risk",
  aggressive: "Aggressive Risk",
  unknown: "Unknown Risk",
} as const

/**
 * ClauseDetail - Expanded view for a selected clause with full context.
 *
 * Features:
 * - Back navigation with smooth transitions
 * - Risk explanation panel
 * - Full clause text display
 * - Navigate to clause in document functionality
 * - Position metadata
 */
export function ClauseDetail() {
  const results = useAnalysisStore((state) => state.results)
  const selectedClauseId = useAnalysisStore((state) => state.selectedClauseId)
  const selectClause = useAnalysisStore((state) => state.selectClause)

  const { navigateToClause, isNavigating } = useDocumentNavigation()
  const [navigationError, setNavigationError] = useState<string | null>(null)

  if (!selectedClauseId || !results) {
    return null
  }

  const clause = results.clauses.find((c) => c.id === selectedClauseId)
  if (!clause) {
    return null
  }

  const riskLevel = normalizeRiskLevel(clause.riskLevel)
  const badgeClass = RISK_BADGE_CLASSES[riskLevel]
  const badgeLabel = RISK_BADGE_LABELS[riskLevel]
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
    <div className="flex flex-col gap-4 animate-slide-up">
      {/* Back button */}
      <button
        onClick={handleBackToList}
        className="addin-btn addin-btn-ghost w-fit -ml-2 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to list</span>
      </button>

      {/* Header: Category + Risk Badge */}
      <div className="addin-detail-header">
        <h3 className="addin-detail-title">{formatCategory(clause.category)}</h3>
        <span className={cn("addin-badge", badgeClass)}>{badgeLabel}</span>
      </div>

      {/* Risk explanation */}
      {clause.riskExplanation && (
        <div className="addin-card p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground mb-1">
                Risk Analysis
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {clause.riskExplanation}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Confidence score */}
      <div className="addin-detail-section">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-neutral-500">Confidence</span>
          <span className="font-medium tabular-nums">{confidencePercent}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-300"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      {/* Full clause text */}
      <div className="addin-detail-section">
        <div className="addin-detail-label">
          <FileText />
          <span>Clause Text</span>
        </div>
        <div className="addin-detail-content whitespace-pre-wrap">
          {clause.clauseText}
        </div>
      </div>

      {/* Position info */}
      {(clause.startPosition !== null || clause.endPosition !== null) && (
        <div className="addin-detail-meta">
          <Info className="h-3 w-3" />
          <span>
            Characters {clause.startPosition ?? "?"} – {clause.endPosition ?? "?"}
            {clause.startPosition !== null && clause.endPosition !== null && (
              <span className="opacity-60 ml-1">
                ({clause.endPosition - clause.startPosition} chars)
              </span>
            )}
          </span>
        </div>
      )}

      {/* Navigate to clause button */}
      <div className="space-y-2 pt-2">
        <button
          onClick={handleNavigateToClause}
          disabled={isNavigating || !clause.clauseText}
          className="addin-btn addin-btn-secondary w-full"
        >
          {isNavigating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Navigating...</span>
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4" />
              <span>Navigate to Clause</span>
            </>
          )}
        </button>
        {navigationError && (
          <p className="text-xs text-center text-error-500">{navigationError}</p>
        )}
      </div>
    </div>
  )
}
