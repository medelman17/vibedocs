"use client"

import { useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  XCircle,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Priority } from "@/types/word-addin"
import { useAnalysisStore } from "../store/analysis"
import { formatCategory } from "../lib/format"

/**
 * Priority badge configuration
 */
const PRIORITY_BADGE_CLASSES = {
  high: "addin-badge-aggressive",
  medium: "addin-badge-cautious",
  low: "addin-badge-standard",
} as const

const PRIORITY_BADGE_LABELS = {
  high: "High",
  medium: "Medium",
  low: "Low",
} as const

interface AccordionItemProps {
  title: string
  icon: React.ReactNode
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}

/**
 * Custom accordion item component
 */
function AccordionItem({
  title,
  icon,
  count,
  defaultOpen = false,
  children,
}: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="addin-accordion-item">
      <button
        onClick={() => setIsOpen(!isOpen)}
        data-state={isOpen ? "open" : "closed"}
        className="addin-accordion-trigger"
      >
        <div className="addin-accordion-trigger-content">
          {icon}
          <span className="text-sm font-medium">{title}</span>
          <span className="addin-badge addin-badge-unknown">{count}</span>
        </div>
        <ChevronDown className="addin-accordion-icon h-4 w-4 text-neutral-500" />
      </button>
      {isOpen && (
        <div className="pb-3 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * GapAnalysis - Displays gap analysis results in collapsible sections.
 *
 * Shows three sections:
 * 1. Missing Clauses - Clause categories absent from the NDA
 * 2. Weak Clauses - Clauses that exist but have issues
 * 3. Recommendations - Suggested improvements with priority badges
 */
export function GapAnalysis() {
  const results = useAnalysisStore((state) => state.results)
  const gapAnalysis = results?.gapAnalysis

  if (!gapAnalysis) {
    return null
  }

  const { missingClauses, weakClauses, recommendations } = gapAnalysis

  // Check if there's any data to display
  const hasData =
    missingClauses.length > 0 || weakClauses.length > 0 || recommendations.length > 0

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center animate-scale-in">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-500/10 mb-3">
          <CheckCircle2 className="h-6 w-6 text-success-500" />
        </div>
        <p className="text-sm font-medium text-foreground">No gaps detected</p>
        <p className="text-xs text-neutral-500 mt-1">
          This NDA appears to be comprehensive.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <h3 className="addin-display-sm text-foreground">Gap Analysis</h3>

      <div className="addin-card p-0 overflow-hidden">
        {/* Missing Clauses Section */}
        <AccordionItem
          title="Missing Clauses"
          icon={<XCircle className="h-4 w-4 text-error-500" />}
          count={missingClauses.length}
          defaultOpen={missingClauses.length > 0}
        >
          {missingClauses.length === 0 ? (
            <p className="text-xs text-neutral-500 px-3">
              No missing clauses detected.
            </p>
          ) : (
            <ul className="space-y-1.5 px-3">
              {missingClauses.map((clause, index) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-error-400" />
                  <span>{formatCategory(clause)}</span>
                </li>
              ))}
            </ul>
          )}
        </AccordionItem>

        {/* Weak Clauses Section */}
        <AccordionItem
          title="Weak Clauses"
          icon={<AlertTriangle className="h-4 w-4 text-warning-500" />}
          count={weakClauses.length}
          defaultOpen={weakClauses.length > 0 && missingClauses.length === 0}
        >
          {weakClauses.length === 0 ? (
            <p className="text-xs text-neutral-500 px-3">
              No weak clauses detected.
            </p>
          ) : (
            <div className="space-y-2 px-3">
              {weakClauses.map((item, index) => (
                <div
                  key={index}
                  className="rounded-md border bg-muted/50 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-warning-500" />
                    <span className="text-xs font-medium">
                      {formatCategory(item.category)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
                    {item.reason}
                  </p>
                </div>
              ))}
            </div>
          )}
        </AccordionItem>

        {/* Recommendations Section */}
        <AccordionItem
          title="Recommendations"
          icon={<Lightbulb className="h-4 w-4 text-info-500" />}
          count={recommendations.length}
          defaultOpen={
            recommendations.length > 0 &&
            missingClauses.length === 0 &&
            weakClauses.length === 0
          }
        >
          {recommendations.length === 0 ? (
            <p className="text-xs text-neutral-500 px-3">
              No recommendations at this time.
            </p>
          ) : (
            <div className="space-y-2 px-3">
              {recommendations.map((item, index) => {
                const badgeClass =
                  PRIORITY_BADGE_CLASSES[item.priority as Priority] ||
                  "addin-badge-unknown"
                const badgeLabel =
                  PRIORITY_BADGE_LABELS[item.priority as Priority] || item.priority
                return (
                  <div
                    key={index}
                    className="rounded-md border bg-muted/50 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {formatCategory(item.category)}
                      </span>
                      <span className={cn("addin-badge", badgeClass)}>
                        {badgeLabel}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
                      {item.recommendation}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </AccordionItem>
      </div>
    </div>
  )
}
