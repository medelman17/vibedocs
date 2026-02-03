"use client"

import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ClauseResult } from "../store/analysis"
import { formatCategory, normalizeRiskLevel } from "../lib/format"

/**
 * Truncate text to a maximum length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + "..."
}

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
  standard: "Standard",
  cautious: "Cautious",
  aggressive: "Aggressive",
  unknown: "Unknown",
} as const

interface ClauseCardProps {
  clause: ClauseResult
  isSelected?: boolean
  onClick?: () => void
}

/**
 * ClauseCard - A compact, tactile card for displaying clause summaries.
 *
 * Features:
 * - Smooth hover states with elevation changes
 * - Color-coded risk badges
 * - Confidence visualization
 * - Truncated text preview
 */
export function ClauseCard({ clause, isSelected = false, onClick }: ClauseCardProps) {
  const riskLevel = normalizeRiskLevel(clause.riskLevel)
  const confidencePercent = Math.round(clause.confidence * 100)
  const badgeClass = RISK_BADGE_CLASSES[riskLevel]
  const badgeLabel = RISK_BADGE_LABELS[riskLevel]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "addin-card addin-card-interactive addin-clause-card w-full text-left",
        isSelected && "addin-card-selected"
      )}
    >
      {/* Header: Category + Risk Badge */}
      <div className="addin-clause-header">
        <h4 className="addin-clause-category">
          {formatCategory(clause.category)}
        </h4>
        <span className={cn("addin-badge", badgeClass)}>
          {badgeLabel}
        </span>
      </div>

      {/* Confidence bar */}
      <div className="addin-clause-confidence">
        <div className="addin-clause-confidence-bar">
          <div
            className="addin-clause-confidence-fill"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
        <div className="addin-clause-confidence-label">
          {confidencePercent}% confidence
        </div>
      </div>

      {/* Truncated clause text */}
      <p className="addin-clause-text">
        {truncateText(clause.clauseText, 120)}
      </p>

      {/* Expand indicator */}
      <div className="addin-clause-footer">
        <ChevronRight className="addin-clause-expand-icon" />
      </div>
    </button>
  )
}
