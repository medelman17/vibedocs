"use client"

import * as React from "react"
import { MessageSquareIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { useClauseSelection } from "@/hooks/use-clause-selection"

// ============================================================================
// Risk Color Configuration
// ============================================================================

type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown"

interface RiskColorConfig {
  bg: string
  bgActive: string
  border: string
  label: string
  textColor: string
}

const riskColors: Record<RiskLevel, RiskColorConfig> = {
  standard: {
    bg: "oklch(0.90 0.08 175 / 0.15)",
    bgActive: "oklch(0.90 0.08 175 / 0.40)",
    border: "oklch(0.70 0.12 175)",
    label: "Standard",
    textColor: "oklch(0.45 0.14 175)",
  },
  cautious: {
    bg: "oklch(0.90 0.08 65 / 0.15)",
    bgActive: "oklch(0.90 0.08 65 / 0.40)",
    border: "oklch(0.70 0.12 65)",
    label: "Cautious",
    textColor: "oklch(0.50 0.14 65)",
  },
  aggressive: {
    bg: "oklch(0.90 0.08 25 / 0.15)",
    bgActive: "oklch(0.90 0.08 25 / 0.40)",
    border: "oklch(0.70 0.12 25)",
    label: "Aggressive",
    textColor: "oklch(0.50 0.14 25)",
  },
  unknown: {
    bg: "oklch(0.92 0.01 280 / 0.15)",
    bgActive: "oklch(0.92 0.01 280 / 0.40)",
    border: "oklch(0.70 0.02 280)",
    label: "Unknown",
    textColor: "oklch(0.45 0.01 280)",
  },
}

function getRiskColorConfig(riskLevel: string): RiskColorConfig {
  return riskColors[riskLevel as RiskLevel] ?? riskColors.unknown
}

// ============================================================================
// ClauseHighlight Component
// ============================================================================

interface ClauseHighlightProps {
  clauseId: string
  category: string
  riskLevel: string
  confidence: number
  clauseText?: string
  isActive: boolean
  isVisible: boolean
  children: React.ReactNode
  onClick: () => void
}

export function ClauseHighlight({
  clauseId,
  category,
  riskLevel,
  confidence,
  clauseText,
  isActive,
  isVisible,
  children,
  onClick,
}: ClauseHighlightProps) {
  const config = getRiskColorConfig(riskLevel)
  const askAboutClause = useClauseSelection((s) => s.askAboutClause)

  // When highlights are not visible, render children transparently
  if (!isVisible) {
    return (
      <span data-clause-id={clauseId} onClick={onClick} className="cursor-pointer">
        {children}
      </span>
    )
  }

  const spanStyle: React.CSSProperties = {
    backgroundColor: isActive ? config.bgActive : config.bg,
    borderLeft: isActive ? `3px solid ${config.border}` : undefined,
    paddingLeft: isActive ? "2px" : undefined,
    borderRadius: "2px",
    transition: "background-color 150ms ease",
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-clause-id={clauseId}
          onClick={onClick}
          style={spanStyle}
          className={cn(
            "cursor-pointer",
            !isActive && "hover:brightness-95"
          )}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="flex max-w-xs flex-col gap-1.5 bg-popover text-popover-foreground"
      >
        <span className="font-medium">{category}</span>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 text-xs"
            style={{
              background: config.bg,
              color: config.textColor,
              borderColor: config.border,
            }}
          >
            {config.label}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {Math.round(confidence * 100)}%
          </Badge>
        </div>
        {clauseText && (
          <button
            type="button"
            className="mt-0.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              askAboutClause(clauseId, clauseText)
            }}
          >
            <MessageSquareIcon className="size-3" />
            Ask about this
          </button>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
