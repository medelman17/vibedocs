"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
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
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="font-medium text-foreground"
        >
          {clauseCount} {clauseCount === 1 ? "clause" : "clauses"}
        </motion.span>
        <span>&middot;</span>
        {(["aggressive", "cautious", "standard", "unknown"] as RiskLevel[])
          .filter((level) => riskCounts[level] > 0)
          .map((level, i) => {
            const config = riskConfig[level]
            return (
              <motion.span
                key={level}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05, type: "spring", bounce: 0.2, duration: 0.3 }}
              >
                <Badge
                  variant="outline"
                  className="gap-1 px-1.5 py-0 text-xs"
                  style={{
                    background: config.bgColor,
                    color: config.textColor,
                    borderColor: config.borderColor,
                  }}
                >
                  {riskCounts[level]} {config.label.toLowerCase()}
                </Badge>
              </motion.span>
            )
          })}
      </div>

      {/* Row 2: Coverage + gaps */}
      {coverageSummary && (
        <div className="mt-2 flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                initial={{ width: "0%" }}
                animate={{ width: `${coverageSummary.coveragePercent}%` }}
                transition={{ type: "spring", bounce: 0, duration: 0.8, delay: 0.2 }}
              />
            </div>
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
