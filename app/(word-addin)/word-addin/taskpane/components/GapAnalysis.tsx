"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { PRIORITY_BADGE_CONFIG } from "@/types/word-addin"
import { AlertCircle, AlertTriangle, CheckCircle2, Lightbulb, XCircle } from "lucide-react"
import { useAnalysisStore } from "../store"
import { formatCategory } from "../lib/format"

/**
 * GapAnalysis displays the gap analysis results from NDA analysis.
 *
 * Shows three collapsible sections:
 * 1. Missing Clauses - List of clause categories that are absent from the NDA
 * 2. Weak Clauses - Clauses that exist but have issues, with explanation
 * 3. Recommendations - Suggested improvements with priority badges
 *
 * Priority badges are color-coded:
 * - High: Red
 * - Medium: Yellow
 * - Low: Green
 */
export function GapAnalysis() {
  const results = useAnalysisStore((state) => state.results)
  const gapAnalysis = results?.gapAnalysis

  // Don't render if no gap analysis data
  if (!gapAnalysis) {
    return null
  }

  const { missingClauses, weakClauses, recommendations } = gapAnalysis

  // Check if there's any data to display
  const hasData =
    missingClauses.length > 0 || weakClauses.length > 0 || recommendations.length > 0

  if (!hasData) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-green-500" />
        No gaps or issues detected in this NDA.
      </div>
    )
  }

  // Determine which sections to open by default (those with items)
  const defaultOpenSections: string[] = []
  if (missingClauses.length > 0) defaultOpenSections.push("missing")
  if (weakClauses.length > 0) defaultOpenSections.push("weak")
  if (recommendations.length > 0) defaultOpenSections.push("recommendations")

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium">Gap Analysis</h3>

      <Accordion
        type="multiple"
        defaultValue={defaultOpenSections}
        className="rounded-lg border"
      >
        {/* Missing Clauses Section */}
        <AccordionItem value="missing" className="px-3">
          <AccordionTrigger className="py-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span>Missing Clauses</span>
              <Badge
                variant="secondary"
                className="ml-1 text-xs px-1.5 py-0 bg-muted"
              >
                {missingClauses.length}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {missingClauses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No missing clauses detected.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {missingClauses.map((clause, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                    {formatCategory(clause)}
                  </li>
                ))}
              </ul>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Weak Clauses Section */}
        <AccordionItem value="weak" className="px-3">
          <AccordionTrigger className="py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span>Weak Clauses</span>
              <Badge
                variant="secondary"
                className="ml-1 text-xs px-1.5 py-0 bg-muted"
              >
                {weakClauses.length}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {weakClauses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No weak clauses detected.
              </p>
            ) : (
              <div className="space-y-3">
                {weakClauses.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-md border bg-muted/30 p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                      <span className="text-sm font-medium">
                        {formatCategory(item.category)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {item.reason}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Recommendations Section */}
        <AccordionItem value="recommendations" className="px-3 border-b-0">
          <AccordionTrigger className="py-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-blue-500" />
              <span>Recommendations</span>
              <Badge
                variant="secondary"
                className="ml-1 text-xs px-1.5 py-0 bg-muted"
              >
                {recommendations.length}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recommendations at this time.
              </p>
            ) : (
              <div className="space-y-3">
                {recommendations.map((item, index) => {
                  const badgeConfig = PRIORITY_BADGE_CONFIG[item.priority]
                  return (
                    <div
                      key={index}
                      className="rounded-md border bg-muted/30 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {formatCategory(item.category)}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "shrink-0 text-xs px-1.5 py-0",
                            badgeConfig.className
                          )}
                        >
                          {badgeConfig.label}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {item.recommendation}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
