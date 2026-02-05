"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  ClipboardCopyIcon,
  ClipboardCheckIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import {
  fetchGapAnalysis,
  type EnhancedGapResult,
} from "@/app/(main)/(dashboard)/analyses/actions"
import type {
  GapSeverity,
  EnhancedGapStatus,
  EnhancedGapItem,
} from "@/agents/types"
import { gapSeverityConfig, gapStatusConfig } from "@/components/analysis/config"

// ============================================================================
// Sub-components
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

// ============================================================================
// GapsTab (main export)
// ============================================================================

interface GapsTabProps {
  analysisId: string
}

export function GapsTab({ analysisId }: GapsTabProps) {
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
