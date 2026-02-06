"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  AlertTriangleIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ClauseExtraction } from "@/app/(main)/(dashboard)/analyses/actions"
import { sourceConfig, type RiskLevel } from "@/components/analysis/config"
import { RiskBadge } from "@/components/analysis/risk-tab"
import { useClauseSelection } from "@/hooks/use-clause-selection"

// ============================================================================
// Evidence Types (parsed from JSONB)
// ============================================================================

interface EvidenceCitation {
  text: string
  sourceType: "clause" | "reference" | "template"
}

interface EvidenceReference {
  sourceId: string
  source: "cuad" | "contract_nli" | "bonterms" | "commonaccord"
  section?: string
  similarity: number
  summary: string
}

interface ClauseEvidence {
  citations?: EvidenceCitation[]
  references?: EvidenceReference[]
  baselineComparison?: string
}

interface ClauseMetadata {
  perspective?: string
  riskConfidence?: number
  atypicalLanguage?: boolean
  atypicalLanguageNote?: string
  negotiationSuggestion?: string
}

// ============================================================================
// Sub-components
// ============================================================================

function SourceBadge({ source }: { source: string }) {
  const config = sourceConfig[source] || {
    label: source,
    bgColor: "oklch(0.92 0.01 0)",
    textColor: "oklch(0.45 0.01 0)",
    borderColor: "oklch(0.88 0.02 0)",
  }
  return (
    <Badge
      variant="outline"
      className="text-xs"
      style={{
        background: config.bgColor,
        color: config.textColor,
        borderColor: config.borderColor,
      }}
    >
      {config.label}
    </Badge>
  )
}

// ============================================================================
// ClauseCard
// ============================================================================

function ClauseCard({
  clause,
  isActive,
  isHovered,
  onSelect,
  onHover,
}: {
  clause: ClauseExtraction
  isActive: boolean
  isHovered: boolean
  onSelect: () => void
  onHover: (clauseId: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [evidenceOpen, setEvidenceOpen] = React.useState(false)
  const riskLevel = (clause.riskLevel as RiskLevel) || "unknown"
  const cardRef = React.useRef<HTMLDivElement>(null)
  const { selectionSource } = useClauseSelection()

  const evidence = (clause.evidence as ClauseEvidence) || null
  const meta = (clause.metadata as ClauseMetadata) || null
  const hasEvidence =
    evidence &&
    ((evidence.citations && evidence.citations.length > 0) ||
      (evidence.references && evidence.references.length > 0) ||
      evidence.baselineComparison)

  // Auto-expand and scroll into view when activated from document panel
  React.useEffect(() => {
    if (isActive && selectionSource === "document") {
      setOpen(true)
      if (cardRef.current) {
        cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
      }
    }
  }, [isActive, selectionSource])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card
        ref={cardRef}
        className={cn(
          "min-w-0 cursor-pointer transition-shadow",
          isActive && "ring-2 ring-primary ring-offset-1",
          isHovered && !isActive && "bg-muted/50"
        )}
        onClick={onSelect}
        onMouseEnter={() => onHover(clause.id)}
        onMouseLeave={() => onHover(null)}
      >
        <CardHeader className="pb-2">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="min-w-0 truncate text-sm font-medium">
                  {clause.category}
                </CardTitle>
                {meta?.riskConfidence != null && (
                  <Badge variant="outline" className="text-xs">
                    {Math.round(meta.riskConfidence * 100)}%
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {meta?.atypicalLanguage && (
                <Badge
                  variant="outline"
                  className="gap-1 text-xs"
                  style={{
                    background: "oklch(0.90 0.08 65)",
                    color: "oklch(0.50 0.14 65)",
                    borderColor: "oklch(0.85 0.10 65)",
                  }}
                >
                  <AlertTriangleIcon className="size-3" />
                  Atypical
                </Badge>
              )}
              <RiskBadge level={riskLevel} />
            </div>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {clause.riskExplanation || clause.clauseText.slice(0, 100)}
          </p>
          {meta?.negotiationSuggestion && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-semibold">Tip:</span> {meta.negotiationSuggestion}
            </p>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <CollapsibleTrigger
            className="flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {open ? (
              <ChevronDownIcon className="size-3" />
            ) : (
              <ChevronRightIcon className="size-3" />
            )}
            {open ? "Hide details" : "Show details"}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="space-y-3 text-sm">
              {/* Clause Text */}
              <div>
                <p className="mb-1 font-medium text-muted-foreground">Clause Text</p>
                <blockquote className="border-l-2 border-muted pl-3 italic text-muted-foreground">
                  {clause.clauseText}
                </blockquote>
              </div>

              {/* Risk Assessment */}
              {clause.riskExplanation && (
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">
                    Risk Assessment
                  </p>
                  <p>{clause.riskExplanation}</p>
                </div>
              )}

              {/* Atypical Language Note */}
              {meta?.atypicalLanguage && meta.atypicalLanguageNote && (
                <div
                  className="rounded-md p-2 text-xs"
                  style={{
                    background: "oklch(0.95 0.04 65)",
                    borderLeft: "3px solid oklch(0.70 0.12 65)",
                  }}
                >
                  <span className="font-semibold">Atypical Language: </span>
                  {meta.atypicalLanguageNote}
                </div>
              )}

              {/* Evidence Expandable */}
              {hasEvidence && (
                <Collapsible open={evidenceOpen} onOpenChange={setEvidenceOpen}>
                  <CollapsibleTrigger
                    className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {evidenceOpen ? (
                      <ChevronDownIcon className="size-3" />
                    ) : (
                      <ChevronRightIcon className="size-3" />
                    )}
                    {evidenceOpen ? "Hide evidence" : "See evidence"}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-3">
                    {/* Citations */}
                    {evidence?.citations && evidence.citations.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Citations
                        </p>
                        <div className="space-y-1.5">
                          {evidence.citations.map((citation, i) => (
                            <blockquote
                              key={i}
                              className="border-l-2 pl-2 text-xs italic text-muted-foreground"
                              style={{ borderColor: "oklch(0.70 0.12 250)" }}
                            >
                              &ldquo;{citation.text}&rdquo;
                            </blockquote>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* References with source labels */}
                    {evidence?.references && evidence.references.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          References
                        </p>
                        <div className="space-y-2">
                          {evidence.references.map((ref, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 rounded-md border p-2"
                            >
                              <SourceBadge source={ref.source} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-muted-foreground">
                                    {Math.round(ref.similarity * 100)}% match
                                  </span>
                                  {ref.section && (
                                    <span className="text-xs text-muted-foreground">
                                      - {ref.section}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-xs">{ref.summary}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Baseline Comparison */}
                    {evidence?.baselineComparison && (
                      <div
                        className="rounded-md p-2 text-xs"
                        style={{
                          background: "oklch(0.95 0.04 250)",
                          borderLeft: "3px solid oklch(0.70 0.12 250)",
                        }}
                      >
                        <span className="font-semibold">Baseline Comparison: </span>
                        {evidence.baselineComparison}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  )
}

// ============================================================================
// ClauseCardList (main export)
// ============================================================================

interface ClauseCardListProps {
  clauses: ClauseExtraction[]
}

export function ClauseCardList({ clauses }: ClauseCardListProps) {
  const activeClauseId = useClauseSelection((s) => s.activeClauseId)
  const hoveredClauseId = useClauseSelection((s) => s.hoveredClauseId)
  const selectClause = useClauseSelection((s) => s.selectClause)
  const hoverClause = useClauseSelection((s) => s.hoverClause)

  const handleSelectClause = React.useCallback(
    (clauseId: string) => {
      selectClause(clauseId, "analysis")
    },
    [selectClause]
  )

  const handleHover = React.useCallback(
    (clauseId: string | null) => {
      hoverClause(clauseId)
    },
    [hoverClause]
  )

  if (clauses.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No clauses match the current filters.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {clauses.map((clause) => (
        <ClauseCard
          key={clause.id}
          clause={clause}
          isActive={activeClauseId === clause.id}
          isHovered={hoveredClauseId === clause.id}
          onSelect={() => handleSelectClause(clause.id)}
          onHover={handleHover}
        />
      ))}
    </div>
  )
}
