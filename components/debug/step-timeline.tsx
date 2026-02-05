"use client"

import { cn } from "@/lib/utils"
import type { PipelineStepInfo } from "@/app/(main)/(dashboard)/analyses/actions"

const statusColors: Record<PipelineStepInfo["status"], string> = {
  completed: "bg-green-500",
  running: "bg-blue-500 animate-pulse",
  pending: "bg-muted",
  failed: "bg-red-500",
  skipped: "bg-muted/50",
  cancelled: "bg-yellow-500",
}

const statusLabels: Record<PipelineStepInfo["status"], string> = {
  completed: "Done",
  running: "Running",
  pending: "Pending",
  failed: "Failed",
  skipped: "Skipped",
  cancelled: "Cancelled",
}

interface StepTimelineProps {
  steps: PipelineStepInfo[]
}

export function StepTimeline({ steps }: StepTimelineProps) {
  return (
    <div className="space-y-2">
      {steps.map((step) => (
        <div key={step.name} className="flex items-center gap-3">
          {/* Status dot */}
          <div
            className={cn(
              "h-3 w-3 shrink-0 rounded-full",
              statusColors[step.status]
            )}
          />

          {/* Step info */}
          <div className="flex min-w-0 flex-1 items-center justify-between">
            <span
              className={cn(
                "text-sm font-medium",
                step.status === "skipped" && "text-muted-foreground"
              )}
            >
              {step.name}
            </span>
            <span
              className={cn(
                "text-xs",
                step.status === "failed"
                  ? "text-red-500"
                  : step.status === "running"
                    ? "text-blue-500"
                    : "text-muted-foreground"
              )}
            >
              {statusLabels[step.status]}
              {step.durationMs != null &&
                ` (${(step.durationMs / 1000).toFixed(1)}s)`}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
