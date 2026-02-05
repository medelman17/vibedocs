"use client"

import * as React from "react"
import { Loader2Icon, MessageSquareIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  Analysis,
  ClauseExtraction,
  Perspective,
} from "@/app/(main)/(dashboard)/analyses/actions"
import type { RiskLevel } from "@/components/analysis/config"
import { ClassificationTab } from "@/components/analysis/classification-tab"
import { RiskTab } from "@/components/analysis/risk-tab"
import { GapsTab } from "@/components/analysis/gaps-tab"
import {
  useClauseSelection,
  type AnalysisTab,
} from "@/hooks/use-clause-selection"

// ============================================================================
// Perspective Toggle (kept here as shared above-tabs control)
// ============================================================================

const PERSPECTIVES: { value: Perspective; label: string }[] = [
  { value: "receiving", label: "Receiving" },
  { value: "balanced", label: "Balanced" },
  { value: "disclosing", label: "Disclosing" },
]

export function PerspectiveToggle({
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

    // Dynamic import to avoid pulling triggerRescore into the initial bundle
    const { triggerRescore } = await import(
      "@/app/(main)/(dashboard)/analyses/actions"
    )
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
// AnalysisTabs (main export)
// ============================================================================

interface AnalysisTabsProps {
  analysisId: string
  analysis: Analysis
  clauses: ClauseExtraction[]
  riskDistribution: Record<RiskLevel, number> | null
  currentPerspective: Perspective
  onRescoreTriggered: () => void
}

export function AnalysisTabs({
  analysisId,
  analysis,
  clauses,
  riskDistribution,
}: AnalysisTabsProps) {
  const { activeTab, setActiveTab } = useClauseSelection()

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as AnalysisTab)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList className="w-full shrink-0">
        <TabsTrigger value="risk">Risk</TabsTrigger>
        <TabsTrigger value="classifications">Classifications</TabsTrigger>
        <TabsTrigger value="gaps">Gaps</TabsTrigger>
        <TabsTrigger value="chat">
          <MessageSquareIcon className="size-3.5" />
          Chat
        </TabsTrigger>
      </TabsList>

      <TabsContent value="risk" className="mt-0 min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="p-4">
            <RiskTab
              analysisId={analysisId}
              analysis={analysis}
              clauses={clauses}
              riskDistribution={riskDistribution}
            />
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="classifications" className="mt-0 min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="p-4">
            <ClassificationTab analysisId={analysisId} />
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="gaps" className="mt-0 min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="p-4">
            <GapsTab analysisId={analysisId} />
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="chat" className="mt-0 min-h-0 flex-1">
        <div className="flex h-full items-center justify-center p-8 text-center">
          <div className="space-y-2">
            <MessageSquareIcon className="mx-auto size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Chat tab coming soon
            </p>
            <p className="text-xs text-muted-foreground/70">
              Ask questions about specific clauses and get AI-powered analysis
            </p>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}
