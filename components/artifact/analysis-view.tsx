"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  HelpCircleIcon,
  XCircleIcon,
  ClipboardCopyIcon,
  ClipboardCheckIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { useAnalysisProgress } from "@/hooks/use-analysis-progress"
import {
  getAnalysis,
  getAnalysisClassifications,
  getAnalysisStatus,
  triggerRescore,
  fetchRiskAssessments,
  fetchGapAnalysis,
  type Analysis,
  type ClauseExtraction,
  type ChunkClassificationRow,
  type ClassificationsByCategory,
  type Perspective,
  type EnhancedGapResult,
} from "@/app/(main)/(dashboard)/analyses/actions"
import { CLASSIFICATION_THRESHOLDS } from "@/agents/types"
import type {
  GapSeverity,
  EnhancedGapStatus,
  EnhancedGapItem,
} from "@/agents/types"

type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown"

interface AnalysisViewProps {
  analysisId: string
  className?: string
}

const riskConfig: Record<
  RiskLevel,
  {
    label: string
    bgColor: string
    textColor: string
    borderColor: string
    icon: React.ElementType
    description: string
  }
> = {
  standard: {
    label: "Standard",
    bgColor: "oklch(0.90 0.08 175)",
    textColor: "oklch(0.45 0.14 175)",
    borderColor: "oklch(0.85 0.10 175)",
    icon: CheckCircleIcon,
    description: "Within market norms",
  },
  cautious: {
    label: "Cautious",
    bgColor: "oklch(0.90 0.08 65)",
    textColor: "oklch(0.50 0.14 65)",
    borderColor: "oklch(0.85 0.10 65)",
    icon: AlertTriangleIcon,
    description: "Review recommended",
  },
  aggressive: {
    label: "Aggressive",
    bgColor: "oklch(0.90 0.08 25)",
    textColor: "oklch(0.50 0.14 25)",
    borderColor: "oklch(0.85 0.10 25)",
    icon: AlertCircleIcon,
    description: "Negotiation recommended",
  },
  unknown: {
    label: "Unknown",
    bgColor: "oklch(0.92 0.01 280)",
    textColor: "oklch(0.45 0.01 280)",
    borderColor: "oklch(0.88 0.02 280)",
    icon: HelpCircleIcon,
    description: "Could not classify",
  },
}

// ============================================================================
// Gap Analysis Configuration
// ============================================================================

const gapSeverityConfig: Record<
  GapSeverity,
  {
    label: string
    bgColor: string
    textColor: string
    borderColor: string
    icon: React.ElementType
  }
> = {
  critical: {
    label: "Critical",
    bgColor: "oklch(0.90 0.08 25)",
    textColor: "oklch(0.50 0.14 25)",
    borderColor: "oklch(0.85 0.10 25)",
    icon: AlertCircleIcon,
  },
  important: {
    label: "Important",
    bgColor: "oklch(0.90 0.08 65)",
    textColor: "oklch(0.50 0.14 65)",
    borderColor: "oklch(0.85 0.10 65)",
    icon: AlertTriangleIcon,
  },
  informational: {
    label: "Info",
    bgColor: "oklch(0.92 0.01 280)",
    textColor: "oklch(0.45 0.01 280)",
    borderColor: "oklch(0.88 0.02 280)",
    icon: HelpCircleIcon,
  },
}

const gapStatusConfig: Record<
  EnhancedGapStatus,
  {
    label: string
    bgColor: string
    textColor: string
    borderColor: string
  }
> = {
  missing: {
    label: "Missing",
    bgColor: "oklch(0.90 0.08 25)",
    textColor: "oklch(0.50 0.14 25)",
    borderColor: "oklch(0.85 0.10 25)",
  },
  incomplete: {
    label: "Incomplete",
    bgColor: "oklch(0.90 0.08 65)",
    textColor: "oklch(0.50 0.14 65)",
    borderColor: "oklch(0.85 0.10 65)",
  },
}

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

/** Source label display config: CUAD=blue, ContractNLI=purple, Bonterms=green */
const sourceConfig: Record<string, { label: string; bgColor: string; textColor: string; borderColor: string }> = {
  cuad: {
    label: "CUAD",
    bgColor: "oklch(0.90 0.10 250)",
    textColor: "oklch(0.45 0.15 250)",
    borderColor: "oklch(0.85 0.12 250)",
  },
  contract_nli: {
    label: "ContractNLI",
    bgColor: "oklch(0.90 0.10 300)",
    textColor: "oklch(0.45 0.15 300)",
    borderColor: "oklch(0.85 0.12 300)",
  },
  bonterms: {
    label: "Bonterms",
    bgColor: "oklch(0.90 0.10 150)",
    textColor: "oklch(0.45 0.15 150)",
    borderColor: "oklch(0.85 0.12 150)",
  },
  commonaccord: {
    label: "CommonAccord",
    bgColor: "oklch(0.90 0.10 150)",
    textColor: "oklch(0.45 0.15 150)",
    borderColor: "oklch(0.85 0.12 150)",
  },
}

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

function RiskBadge({ level }: { level: RiskLevel }) {
  const config = riskConfig[level] || riskConfig.unknown
  const Icon = config.icon
  return (
    <Badge
      variant="outline"
      className="gap-1"
      style={{
        background: config.bgColor,
        color: config.textColor,
        borderColor: config.borderColor,
      }}
    >
      <Icon className="size-3" />
      {config.label}
    </Badge>
  )
}

function ClauseCard({ clause }: { clause: ClauseExtraction }) {
  const [open, setOpen] = React.useState(false)
  const [evidenceOpen, setEvidenceOpen] = React.useState(false)
  const riskLevel = (clause.riskLevel as RiskLevel) || "unknown"

  // Parse evidence and metadata from JSONB
  const evidence = (clause.evidence as ClauseEvidence) || null
  const meta = (clause.metadata as ClauseMetadata) || null
  const hasEvidence =
    evidence &&
    ((evidence.citations && evidence.citations.length > 0) ||
      (evidence.references && evidence.references.length > 0) ||
      evidence.baselineComparison)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="min-w-0">
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
          <CollapsibleTrigger className="flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
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
                  <CollapsibleTrigger className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
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
// Classification Components
// ============================================================================

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const isLow = confidence < CLASSIFICATION_THRESHOLDS.LOW_CONFIDENCE
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-xs",
        isLow &&
          "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-400"
      )}
    >
      {isLow && <AlertTriangleIcon className="size-3" />}
      {Math.round(confidence * 100)}%
      {isLow && " Review"}
    </Badge>
  )
}

function ClassificationCard({
  classification,
}: {
  classification: ChunkClassificationRow
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="min-w-0 truncate text-sm font-medium">
                {classification.category}
              </CardTitle>
              {!classification.isPrimary && (
                <span className="text-xs text-muted-foreground">Secondary</span>
              )}
            </div>
            <ConfidenceBadge confidence={classification.confidence} />
          </div>
          {classification.rationale && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {classification.rationale}
            </p>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <CollapsibleTrigger className="flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {open ? (
              <ChevronDownIcon className="size-3" />
            ) : (
              <ChevronRightIcon className="size-3" />
            )}
            {open ? "Hide details" : "Show chunk"}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <p className="text-xs text-muted-foreground">
              Chunk {classification.chunkIndex + 1}
              {classification.startPosition != null &&
                ` (pos ${classification.startPosition}-${classification.endPosition})`}
            </p>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  )
}

function CategoryGroupView({
  groups,
}: {
  groups: ClassificationsByCategory[]
}) {
  if (groups.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No classifications found.
      </p>
    )
  }
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.category}>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {group.category}
            <Badge variant="secondary" className="text-xs">
              {group.classifications.length}
            </Badge>
          </h4>
          <div className="space-y-2 pl-2">
            {group.classifications.map((c) => (
              <ClassificationCard key={c.id} classification={c} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DocumentOrderView({
  classifications,
}: {
  classifications: ChunkClassificationRow[]
}) {
  if (classifications.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No classifications found.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {classifications.map((c) => (
        <ClassificationCard key={c.id} classification={c} />
      ))}
    </div>
  )
}

function ClassificationView({ analysisId }: { analysisId: string }) {
  const [view, setView] = React.useState<"category" | "position">("category")
  const [categoryData, setCategoryData] = React.useState<
    ClassificationsByCategory[]
  >([])
  const [positionData, setPositionData] = React.useState<
    ChunkClassificationRow[]
  >([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    setLoading(true)
    getAnalysisClassifications(analysisId, view)
      .then((result) => {
        if (result.success) {
          if (view === "category") {
            setCategoryData(result.data as ClassificationsByCategory[])
          } else {
            setPositionData(result.data as ChunkClassificationRow[])
          }
        }
      })
      .finally(() => setLoading(false))
  }, [analysisId, view])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex gap-1 rounded-md border p-1">
        <button
          className={cn(
            "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors",
            view === "category"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          )}
          onClick={() => setView("category")}
        >
          By Category
        </button>
        <button
          className={cn(
            "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors",
            view === "position"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          )}
          onClick={() => setView("position")}
        >
          Document Order
        </button>
      </div>

      {/* Content */}
      {view === "category" ? (
        <CategoryGroupView groups={categoryData} />
      ) : (
        <DocumentOrderView classifications={positionData} />
      )}
    </div>
  )
}

// ============================================================================
// Gap Analysis Components
// ============================================================================

function GapSeverityBadge({ severity }: { severity: GapSeverity }) {
  const config = gapSeverityConfig[severity]
  const Icon = config.icon
  return (
    <Badge
      variant="outline"
      className="gap-1 text-xs"
      style={{
        background: config.bgColor,
        color: config.textColor,
        borderColor: config.borderColor,
      }}
    >
      <Icon className="size-3" />
      {config.label}
    </Badge>
  )
}

function GapStatusBadge({ status }: { status: EnhancedGapStatus }) {
  const config = gapStatusConfig[status]
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

function CopyButton({
  text,
  label = "Copy",
}: {
  text: string
  label?: string
}) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
    >
      {copied ? (
        <>
          <ClipboardCheckIcon className="size-3" />
          Copied
        </>
      ) : (
        <>
          <ClipboardCopyIcon className="size-3" />
          {label}
        </>
      )}
    </button>
  )
}

function GapCard({ gap }: { gap: EnhancedGapItem }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1.5 text-left">
                  {open ? (
                    <ChevronDownIcon className="size-4 shrink-0" />
                  ) : (
                    <ChevronRightIcon className="size-4 shrink-0" />
                  )}
                  <CardTitle className="min-w-0 truncate text-sm font-medium">
                    {gap.category}
                  </CardTitle>
                </button>
              </CollapsibleTrigger>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <GapStatusBadge status={gap.status} />
              <GapSeverityBadge severity={gap.severity} />
            </div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{gap.explanation}</p>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            <div className="space-y-2">
              <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recommended Language
              </h5>
              <blockquote className="whitespace-pre-wrap border-l-2 pl-3 text-sm">
                {gap.suggestedLanguage}
              </blockquote>
              <div className="flex items-center justify-between">
                {gap.templateSource && (
                  <p className="text-xs italic text-muted-foreground">
                    Source: {gap.templateSource}
                  </p>
                )}
                <CopyButton text={gap.suggestedLanguage} label="Copy clause" />
              </div>
              {gap.styleMatch && (
                <p className="text-xs text-muted-foreground">{gap.styleMatch}</p>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

function GapsView({ analysisId }: { analysisId: string }) {
  const [gapData, setGapData] = React.useState<EnhancedGapResult | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    setLoading(true)
    fetchGapAnalysis(analysisId)
      .then((result) => {
        if (result.success) {
          setGapData(result.data)
        }
      })
      .finally(() => setLoading(false))
  }, [analysisId])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    )
  }

  if (!gapData || gapData.gaps.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No gaps identified.
      </p>
    )
  }

  const severityOrder: Record<string, number> = {
    critical: 0,
    important: 1,
    informational: 2,
  }
  const sortedGaps = [...gapData.gaps].sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  )

  const allGapsText = sortedGaps
    .map(
      (g) =>
        `## ${g.category} (${g.status} - ${g.severity})\n\n${g.explanation}\n\n### Recommended Language\n\n${g.suggestedLanguage}${g.templateSource ? `\n\nSource: ${g.templateSource}` : ""}`
    )
    .join("\n\n---\n\n")

  const { coverageSummary } = gapData

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Coverage: {coverageSummary.presentCount}/
              {coverageSummary.totalCategories} categories
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {coverageSummary.coveragePercent}%
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={coverageSummary.coveragePercent} className="h-2" />
          <div className="flex flex-wrap gap-2">
            {coverageSummary.missingCount > 0 && (
              <Badge
                variant="outline"
                className="gap-1 text-xs"
                style={{
                  background: "oklch(0.90 0.08 25)",
                  color: "oklch(0.50 0.14 25)",
                  borderColor: "oklch(0.85 0.10 25)",
                }}
              >
                {coverageSummary.missingCount} missing
              </Badge>
            )}
            {coverageSummary.incompleteCount > 0 && (
              <Badge
                variant="outline"
                className="gap-1 text-xs"
                style={{
                  background: "oklch(0.90 0.08 65)",
                  color: "oklch(0.50 0.14 65)",
                  borderColor: "oklch(0.85 0.10 65)",
                }}
              >
                {coverageSummary.incompleteCount} incomplete
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <CopyButton text={allGapsText} label="Copy all gaps" />
      </div>

      {sortedGaps.map((gap, i) => (
        <GapCard key={`${gap.category}-${i}`} gap={gap} />
      ))}
    </div>
  )
}

// ============================================================================
// Perspective Toggle
// ============================================================================

const PERSPECTIVES: { value: Perspective; label: string }[] = [
  { value: "receiving", label: "Receiving" },
  { value: "balanced", label: "Balanced" },
  { value: "disclosing", label: "Disclosing" },
]

function PerspectiveToggle({
  analysisId,
  currentPerspective,
  onRescoreTriggered,
}: {
  analysisId: string
  currentPerspective: Perspective
  onRescoreTriggered: () => void
}) {
  const [selected, setSelected] = React.useState<Perspective>(currentPerspective)
  const [isRescoring, setIsRescoring] = React.useState(false)
  const [disabled, setDisabled] = React.useState(false)

  // Sync local state when analysis refreshes with new perspective
  React.useEffect(() => {
    setSelected(currentPerspective)
  }, [currentPerspective])

  const handleToggle = async (perspective: Perspective) => {
    if (perspective === selected || disabled || isRescoring) return

    // Optimistic UI: move toggle immediately
    setSelected(perspective)
    setDisabled(true)
    setIsRescoring(true)

    const result = await triggerRescore(analysisId, perspective)

    if (!result.success) {
      // Revert on error (e.g. same perspective)
      setSelected(currentPerspective)
      setIsRescoring(false)
      setDisabled(false)
      return
    }

    // Notify parent to start polling for completion
    onRescoreTriggered()

    // Debounce: re-enable after 2 seconds
    setTimeout(() => setDisabled(false), 2000)
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground">Perspective:</span>
      <div className="flex gap-1 rounded-md border p-0.5">
        {PERSPECTIVES.map((p) => (
          <button
            key={p.value}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              selected === p.value
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted",
              (disabled || isRescoring) && "cursor-not-allowed opacity-50"
            )}
            onClick={() => handleToggle(p.value)}
            disabled={disabled || isRescoring}
          >
            {p.label}
          </button>
        ))}
      </div>
      {isRescoring && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin" />
          Re-scoring from {selected} perspective...
        </span>
      )}
    </div>
  )
}

// ============================================================================
// Executive Summary
// ============================================================================

function ExecutiveSummaryCard({
  analysis,
  riskDistribution,
}: {
  analysis: Analysis
  riskDistribution: Record<RiskLevel, number> | null
}) {
  const overallLevel = (analysis.overallRiskLevel as RiskLevel) || "unknown"
  const overallConfig = riskConfig[overallLevel] || riskConfig.unknown

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Executive Summary</CardTitle>
          {analysis.overallRiskScore !== null && (
            <Badge
              variant="outline"
              className="gap-1 text-xs font-semibold"
              style={{
                background: overallConfig.bgColor,
                color: overallConfig.textColor,
                borderColor: overallConfig.borderColor,
              }}
            >
              {Math.round(analysis.overallRiskScore)}/100 - {overallConfig.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Risk distribution badges */}
        {riskDistribution && (
          <div className="mb-3 flex flex-wrap gap-2">
            {(["standard", "cautious", "aggressive", "unknown"] as RiskLevel[]).map(
              (level) => {
                const count = riskDistribution[level] ?? 0
                if (count === 0) return null
                const config = riskConfig[level]
                return (
                  <Badge
                    key={level}
                    variant="outline"
                    className="gap-1 text-xs"
                    style={{
                      background: config.bgColor,
                      color: config.textColor,
                      borderColor: config.borderColor,
                    }}
                  >
                    {config.label}: {count}
                  </Badge>
                )
              }
            )}
          </div>
        )}
        {/* Summary text */}
        {analysis.summary ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {analysis.summary}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No executive summary available yet.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Progress & Error Views
// ============================================================================

function ProgressView({ stage, progress }: { stage: string; progress: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <Loader2Icon
        className="size-8 animate-spin"
        style={{ color: "oklch(0.55 0.24 293)" }}
      />
      <p className="mt-4 text-sm text-muted-foreground">{stage || "Processing..."}</p>
      <Progress value={progress} className="mt-4 w-48" />
      <p className="mt-2 text-xs text-muted-foreground">{progress}%</p>
    </div>
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div
        className="mb-4 rounded-full p-4"
        style={{ background: "oklch(0.92 0.08 25)" }}
      >
        <XCircleIcon className="size-8" style={{ color: "oklch(0.50 0.14 25)" }} />
      </div>
      <h3 className="mb-2 text-lg font-medium">Analysis Failed</h3>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

export function AnalysisView({ analysisId, className }: AnalysisViewProps) {
  const { status, progress, stage, error } = useAnalysisProgress(analysisId)
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null)
  const [clauses, setClauses] = React.useState<ClauseExtraction[]>([])
  const [fetchError, setFetchError] = React.useState<string | null>(null)
  const [rescoreVersion, setRescoreVersion] = React.useState(0)
  const rescorePollRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch full data once complete (or after re-score)
  React.useEffect(() => {
    if (status === "completed") {
      Promise.all([
        getAnalysis(analysisId),
        fetchRiskAssessments(analysisId),
      ])
        .then(([analysisResult, assessmentsResult]) => {
          if (analysisResult.success) {
            setAnalysis(analysisResult.data)
          } else {
            setFetchError(analysisResult.error.message)
          }
          if (assessmentsResult.success) {
            setClauses(assessmentsResult.data as unknown as ClauseExtraction[])
          }
        })
        .catch((e) => {
          setFetchError(e instanceof Error ? e.message : "Failed to load results")
        })
    }
  }, [status, analysisId, rescoreVersion])

  // Cleanup re-score poll on unmount
  React.useEffect(() => {
    return () => {
      if (rescorePollRef.current) {
        clearInterval(rescorePollRef.current)
      }
    }
  }, [])

  // Handle re-score triggered: poll until progressStage returns to 'complete'
  const handleRescoreTriggered = React.useCallback(() => {
    // Clear any existing poll
    if (rescorePollRef.current) {
      clearInterval(rescorePollRef.current)
    }

    rescorePollRef.current = setInterval(async () => {
      const result = await getAnalysisStatus(analysisId)
      if (result.success) {
        const statusData = result.data
        // When re-scoring is complete, refresh data
        if (statusData.status === "completed" && statusData.progress?.percent === 100) {
          if (rescorePollRef.current) {
            clearInterval(rescorePollRef.current)
            rescorePollRef.current = null
          }
          // Bump version to trigger re-fetch
          setRescoreVersion((v) => v + 1)
        }
      }
    }, 3000)
  }, [analysisId])

  // Progress state
  if (status === "pending" || status === "processing") {
    return (
      <div className={cn("h-full", className)}>
        <ProgressView stage={stage} progress={progress} />
      </div>
    )
  }

  // Error state
  if (status === "failed" || error || fetchError) {
    return (
      <div className={cn("h-full", className)}>
        <ErrorView message={error || fetchError || "Analysis failed. Please try again."} />
      </div>
    )
  }

  // Loading results
  if (!analysis) {
    return (
      <div className={cn("h-full", className)}>
        <ProgressView stage="Loading results..." progress={100} />
      </div>
    )
  }

  // Parse metadata for perspective and risk distribution
  const metadata = analysis.metadata as Record<string, unknown> | null
  const currentPerspective = (metadata?.perspective as Perspective) || "balanced"
  const riskDistribution = (metadata?.riskDistribution as Record<RiskLevel, number>) || null

  // Calculate risk summary from clauses
  const riskCounts = clauses.reduce(
    (acc, clause) => {
      const level = (clause.riskLevel as RiskLevel) || "unknown"
      acc[level]++
      return acc
    },
    { standard: 0, cautious: 0, aggressive: 0, unknown: 0 } as Record<RiskLevel, number>
  )

  return (
    <div className={cn("flex h-full min-w-0 flex-col", className)}>
      {/* Summary bar with perspective toggle */}
      <div className="border-b bg-muted/50 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="truncate font-medium">Analysis Results</h3>
          {analysis.overallRiskLevel && (
            <RiskBadge level={analysis.overallRiskLevel as RiskLevel} />
          )}
        </div>

        {/* Perspective toggle */}
        <PerspectiveToggle
          analysisId={analysisId}
          currentPerspective={currentPerspective}
          onRescoreTriggered={handleRescoreTriggered}
        />

        {/* Risk distribution counts */}
        <div className="mt-2 flex flex-wrap gap-2">
          {(["standard", "cautious", "aggressive", "unknown"] as RiskLevel[]).map(
            (level) =>
              riskCounts[level] > 0 && (
                <div
                  key={level}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <RiskBadge level={level} />
                  <span>{riskCounts[level]}</span>
                </div>
              )
          )}
        </div>
      </div>

      {/* Executive Summary */}
      <div className="border-b px-4 py-3">
        <ExecutiveSummaryCard
          analysis={analysis}
          riskDistribution={riskDistribution}
        />
      </div>

      {/* Classification results */}
      <div className="border-b px-4 py-3">
        <h4 className="mb-3 text-sm font-medium text-muted-foreground">
          CUAD Classifications
        </h4>
        <ClassificationView analysisId={analysisId} />
      </div>

      {/* Gap Analysis */}
      <div className="border-b px-4 py-3">
        <h4 className="mb-3 text-sm font-medium text-muted-foreground">
          Gap Analysis
        </h4>
        <GapsView analysisId={analysisId} />
      </div>

      {/* Clause list */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {clauses.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No clauses extracted.
            </p>
          ) : (
            clauses.map((clause) => <ClauseCard key={clause.id} clause={clause} />)
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
