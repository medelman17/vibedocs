"use client"

import * as React from "react"
import { AlertTriangleIcon } from "lucide-react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { riskConfig, type RiskLevel } from "@/components/analysis/config"

// ============================================================================
// Types
// ============================================================================

export interface GutterDot {
  clauseId: string
  category: string
  riskLevel: RiskLevel
  atypicalLanguage?: boolean
  /** Y position in pixels (virtualRow.start) */
  top: number
}

interface MarginGutterProps {
  dots: GutterDot[]
  activeClauseId: string | null
  onDotClick: (clauseId: string) => void
  totalHeight: number
}

// ============================================================================
// GutterDotItem
// ============================================================================

function GutterDotItem({
  dot,
  isActive,
  onClick,
}: {
  dot: GutterDot
  isActive: boolean
  onClick: () => void
}) {
  const config = riskConfig[dot.riskLevel] || riskConfig.unknown

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          className="absolute left-0 flex size-5 items-center justify-center motion-safe:transition-transform motion-safe:hover:scale-125"
          style={{
            top: `${dot.top + 4}px`,
          }}
          aria-label={`${dot.category} - ${config.label}`}
        >
          {dot.atypicalLanguage ? (
            <AlertTriangleIcon
              className="size-3.5"
              style={{ color: "oklch(0.60 0.14 65)" }}
            />
          ) : (
            <span
              className="block size-2.5 rounded-full transition-all"
              style={{
                backgroundColor: config.textColor,
                boxShadow: isActive ? `0 0 0 3px ${config.bgColor}` : undefined,
                transform: isActive ? "scale(1.4)" : undefined,
              }}
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex flex-col gap-1">
        <span className="text-xs font-medium">{dot.category}</span>
        <Badge
          variant="outline"
          className="w-fit gap-1 text-xs"
          style={{
            background: config.bgColor,
            color: config.textColor,
            borderColor: config.borderColor,
          }}
        >
          {config.label}
        </Badge>
      </TooltipContent>
    </Tooltip>
  )
}

// ============================================================================
// MarginGutter
// ============================================================================

export function MarginGutter({
  dots,
  activeClauseId,
  onDotClick,
  totalHeight,
}: MarginGutterProps) {
  if (dots.length === 0) return null

  return (
    <div
      className="absolute left-0 top-0 w-6"
      style={{ height: `${totalHeight}px` }}
    >
      {dots.map((dot) => (
        <GutterDotItem
          key={dot.clauseId}
          dot={dot}
          isActive={activeClauseId === dot.clauseId}
          onClick={() => onDotClick(dot.clauseId)}
        />
      ))}
    </div>
  )
}
