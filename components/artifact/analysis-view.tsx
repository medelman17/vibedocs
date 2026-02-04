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
  getAnalysisClauses,
  type Analysis,
  type ClauseExtraction,
} from "@/app/(main)/(dashboard)/analyses/actions"

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
  const riskLevel = (clause.riskLevel as RiskLevel) || "unknown"

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <CardTitle className="min-w-0 truncate text-sm font-medium">
              {clause.category}
            </CardTitle>
            <RiskBadge level={riskLevel} />
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {clause.riskExplanation || clause.clauseText.slice(0, 100)}
          </p>
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
              <div>
                <p className="mb-1 font-medium text-muted-foreground">Clause Text</p>
                <blockquote className="border-l-2 border-muted pl-3 italic text-muted-foreground">
                  {clause.clauseText}
                </blockquote>
              </div>
              {clause.riskExplanation && (
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">
                    Risk Assessment
                  </p>
                  <p>{clause.riskExplanation}</p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  )
}

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

  // Fetch full data once complete
  React.useEffect(() => {
    if (status === "completed") {
      Promise.all([getAnalysis(analysisId), getAnalysisClauses(analysisId)])
        .then(([analysisResult, clausesResult]) => {
          if (analysisResult.success) {
            setAnalysis(analysisResult.data)
          } else {
            setFetchError(analysisResult.error.message)
          }
          if (clausesResult.success) {
            setClauses(clausesResult.data)
          }
        })
        .catch((err) => {
          setFetchError(err.message)
        })
    }
  }, [status, analysisId])

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

  // Calculate risk summary
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
      {/* Summary bar */}
      <div className="border-b bg-muted/50 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="truncate font-medium">Analysis Results</h3>
          {analysis.overallRiskLevel && (
            <RiskBadge level={analysis.overallRiskLevel as RiskLevel} />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
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
        {analysis.overallRiskScore !== null && (
          <p className="mt-2 text-xs text-muted-foreground">
            Overall Risk Score: {analysis.overallRiskScore.toFixed(1)}%
          </p>
        )}
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
