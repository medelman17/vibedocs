"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { riskConfig, type RiskLevel } from "@/components/analysis/config"
import type { EnhancedGapResult } from "@/agents/types"

// ============================================================================
// Types
// ============================================================================

interface SummaryStripProps {
  clauseCount: number
  riskCounts: Record<RiskLevel, number>
  gapData: EnhancedGapResult | null
  processingTime?: number | null
  estimatedCost?: number | null
  className?: string
}

// ============================================================================
// SummaryStrip
// ============================================================================

export function SummaryStrip({
  clauseCount,
  riskCounts,
  gapData,
  processingTime,
  estimatedCost,
  className,
}: SummaryStripProps) {
  const coverageSummary = gapData?.coverageSummary
  const gapCount = gapData?.gaps.length ?? 0

  return (
    <div className={cn("shrink-0 border-b bg-muted/30 px-4 py-2.5", className)}>
      {/* Row 1: Clause count + risk distribution */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {clauseCount} {clauseCount === 1 ? "clause" : "clauses"}
        </span>
        <span>&middot;</span>
        {(["aggressive", "cautious", "standard", "unknown"] as RiskLevel[]).map(
          (level) => {
            const count = riskCounts[level]
            if (count === 0) return null
            const config = riskConfig[level]
            return (
              <Badge
                key={level}
                variant="outline"
                className="gap-1 px-1.5 py-0 text-xs"
                style={{
                  background: config.bgColor,
                  color: config.textColor,
                  borderColor: config.borderColor,
                }}
              >
                {count} {config.label.toLowerCase()}
              </Badge>
            )
          }
        )}
      </div>

      {/* Row 2: Coverage + gaps */}
      {coverageSummary && (
        <div className="mt-2 flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Progress
              value={coverageSummary.coveragePercent}
              className="h-1.5 flex-1"
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              {coverageSummary.coveragePercent}%
            </span>
          </div>
          {gapCount > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {gapCount} {gapCount === 1 ? "gap" : "gaps"}
            </span>
          )}
        </div>
      )}

      {/* Row 3: Processing stats (subtle) */}
      {(processingTime != null || estimatedCost != null) && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
          {processingTime != null && (
            <span>{(processingTime / 1000).toFixed(1)}s</span>
          )}
          {estimatedCost != null && (
            <span>${estimatedCost.toFixed(2)}</span>
          )}
        </div>
      )}
    </div>
  )
}
