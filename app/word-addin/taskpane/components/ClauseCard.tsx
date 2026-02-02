"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"
import type { ClauseResult } from "../store"

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
  const badgeConfig = riskBadgeConfig[riskLevel]
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
          className={cn("shrink-0 text-[10px] px-1.5 py-0", badgeConfig.className)}
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
        <span className="text-[10px] text-muted-foreground tabular-nums">
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
