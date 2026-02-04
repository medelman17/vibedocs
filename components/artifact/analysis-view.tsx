"use client"

import * as React from "react"
import {
  BarChartIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  HelpCircleIcon,
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

type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown"

interface ClauseAnalysis {
  id: string
  category: string
  riskLevel: RiskLevel
  summary: string
  evidence: string
  recommendation?: string
}

interface AnalysisViewProps {
  analysisId: string
  className?: string
}

// Mock analysis data for demo
const MOCK_ANALYSES: Record<string, { title: string; clauses: ClauseAnalysis[] }> = {
  "demo-analysis": {
    title: "Sample NDA Analysis",
    clauses: [
      {
        id: "1",
        category: "Confidentiality Term",
        riskLevel: "standard",
        summary: "3-year confidentiality term is within market norms.",
        evidence:
          '"This Agreement shall remain in effect for a period of three (3) years from the Effective Date."',
        recommendation: "No changes recommended.",
      },
      {
        id: "2",
        category: "Return of Information",
        riskLevel: "cautious",
        summary: "Broad return/destruction requirement without exceptions.",
        evidence:
          '"Upon termination or upon request, all Confidential Information shall be returned or destroyed."',
        recommendation:
          "Consider adding exception for legally required retention and archival copies.",
      },
      {
        id: "3",
        category: "Definition Scope",
        riskLevel: "aggressive",
        summary: "Definition of Confidential Information is overly broad.",
        evidence:
          '"Confidential Information" means any information, technical data, or know-how...',
        recommendation:
          "Narrow the definition to specific categories or add explicit exclusions for public information.",
      },
      {
        id: "4",
        category: "Governing Law",
        riskLevel: "standard",
        summary: "Delaware law is a standard choice for business agreements.",
        evidence:
          '"This Agreement shall be governed by the laws of the State of Delaware."',
      },
      {
        id: "5",
        category: "Non-Compete Clause",
        riskLevel: "unknown",
        summary: "No non-compete clause detected in this agreement.",
        evidence: "No relevant text found.",
      },
    ],
  },
}

const riskConfig: Record<
  RiskLevel,
  { label: string; color: string; icon: React.ElementType; description: string }
> = {
  standard: {
    label: "Standard",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: CheckCircleIcon,
    description: "Within market norms",
  },
  cautious: {
    label: "Cautious",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    icon: AlertTriangleIcon,
    description: "Review recommended",
  },
  aggressive: {
    label: "Aggressive",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: AlertCircleIcon,
    description: "Negotiation recommended",
  },
  unknown: {
    label: "Unknown",
    color: "bg-neutral-100 text-neutral-600 border-neutral-200",
    icon: HelpCircleIcon,
    description: "Could not classify",
  },
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const config = riskConfig[level]
  const Icon = config.icon
  return (
    <Badge variant="outline" className={cn("gap-1", config.color)}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  )
}

function ClauseCard({ clause }: { clause: ClauseAnalysis }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-medium">{clause.category}</CardTitle>
            <RiskBadge level={clause.riskLevel} />
          </div>
          <p className="text-sm text-muted-foreground">{clause.summary}</p>
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
                <p className="mb-1 font-medium text-muted-foreground">Evidence</p>
                <blockquote className="border-l-2 border-muted pl-3 italic text-muted-foreground">
                  {clause.evidence}
                </blockquote>
              </div>
              {clause.recommendation && (
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">
                    Recommendation
                  </p>
                  <p>{clause.recommendation}</p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  )
}

export function AnalysisView({ analysisId, className }: AnalysisViewProps) {
  const [loading, setLoading] = React.useState(true)
  const analysis = MOCK_ANALYSES[analysisId]

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800)
    return () => clearTimeout(timer)
  }, [analysisId])

  if (loading) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center",
          className
        )}
      >
        <Loader2Icon className="size-8 animate-spin text-violet-500" />
        <p className="mt-4 text-sm text-muted-foreground">Analyzing document...</p>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center p-8",
          "text-center",
          className
        )}
      >
        <div className="mb-4 rounded-full bg-neutral-100 p-4">
          <BarChartIcon className="size-8 text-neutral-400" />
        </div>
        <h3 className="mb-2 text-lg font-medium text-neutral-900">
          Analysis Not Found
        </h3>
        <p className="text-sm text-neutral-500">
          The requested analysis could not be loaded.
        </p>
        <p className="mt-2 font-mono text-xs text-neutral-400">ID: {analysisId}</p>
      </div>
    )
  }

  // Calculate risk summary
  const riskCounts = analysis.clauses.reduce(
    (acc, clause) => {
      acc[clause.riskLevel]++
      return acc
    },
    { standard: 0, cautious: 0, aggressive: 0, unknown: 0 } as Record<
      RiskLevel,
      number
    >
  )

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Summary bar */}
      <div className="border-b bg-muted/50 px-4 py-3">
        <h3 className="mb-2 font-medium">{analysis.title}</h3>
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
      </div>

      {/* Clause list */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {analysis.clauses.map((clause) => (
            <ClauseCard key={clause.id} clause={clause} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
