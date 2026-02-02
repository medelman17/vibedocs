"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { RISK_BADGE_CONFIG } from "@/types/word-addin"
import { ChevronRight } from "lucide-react"
import type { ClauseResult } from "../store"
import { formatCategory, normalizeRiskLevel } from "../lib/format"

/**
 * Truncate text to a maximum length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + "..."
}

interface ClauseCardProps {
  clause: ClauseResult
  isSelected?: boolean
  onClick?: () => void
}

/**
 * ClauseCard displays a compact summary of a single extracted clause.
 *
 * Shows:
 * - Category name
 * - Risk level badge (color-coded)
 * - Confidence percentage
 * - Truncated clause text (2-3 lines)
 *
 * Clicking the card triggers the onClick handler (typically to select the clause).
 */
export function ClauseCard({ clause, isSelected = false, onClick }: ClauseCardProps) {
  const riskLevel = normalizeRiskLevel(clause.riskLevel)
  const badgeConfig = RISK_BADGE_CONFIG[riskLevel]
  const confidencePercent = Math.round(clause.confidence * 100)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border bg-card p-3 text-left transition-all",
        "hover:border-primary/50 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected && "border-primary bg-primary/5 shadow-sm"
      )}
    >
      {/* Header row: Category + Risk Badge */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium leading-tight">
          {formatCategory(clause.category)}
        </h4>
        <Badge
          variant="secondary"
          className={cn("shrink-0 text-xs px-1.5 py-0", badgeConfig.className)}
        >
          {badgeConfig.label}
        </Badge>
      </div>

      {/* Confidence score */}
      <div className="mt-1 flex items-center gap-1.5">
        <div className="h-1 flex-1 rounded-full bg-muted">
          <div
            className="h-1 rounded-full bg-primary/60 transition-all"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {confidencePercent}%
        </span>
      </div>

      {/* Truncated clause text */}
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
        {truncateText(clause.clauseText, 120)}
      </p>

      {/* Expand indicator */}
      <div className="mt-2 flex items-center justify-end">
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      </div>
    </button>
  )
}
