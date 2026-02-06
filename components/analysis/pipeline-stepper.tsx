"use client"

import * as React from "react"
import {
  CheckIcon,
  Loader2Icon,
  CircleIcon,
  BanIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"

// ============================================================================
// Types
// ============================================================================

interface PipelineStage {
  id: string
  label: string
}

const PIPELINE_STAGES: PipelineStage[] = [
  { id: "parsing", label: "Parsing" },
  { id: "chunking", label: "Chunking" },
  { id: "classifying", label: "Classifying" },
  { id: "scoring", label: "Risk Scoring" },
  { id: "analyzing_gaps", label: "Gap Analysis" },
]

function getStageIndex(stageId: string): number {
  return PIPELINE_STAGES.findIndex((s) => s.id === stageId)
}

type StageStatus = "completed" | "active" | "pending" | "failed"

function getStageStatus(
  stageId: string,
  currentStage: string,
  isFailed: boolean
): StageStatus {
  const stageIdx = getStageIndex(stageId)
  const currentIdx = getStageIndex(currentStage)

  if (currentStage === "complete") return "completed"
  if (isFailed && stageIdx === currentIdx) return "failed"
  if (stageIdx < currentIdx) return "completed"
  if (stageIdx === currentIdx) return "active"
  return "pending"
}

// ============================================================================
// StageIcon
// ============================================================================

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "completed":
      return (
        <div
          className="flex size-5 items-center justify-center rounded-full"
          style={{ background: "oklch(0.85 0.10 175)" }}
        >
          <CheckIcon className="size-3" style={{ color: "oklch(0.40 0.14 175)" }} />
        </div>
      )
    case "active":
      return (
        <div
          className="flex size-5 items-center justify-center rounded-full"
          style={{ background: "oklch(0.90 0.12 250)" }}
        >
          <Loader2Icon
            className="size-3 animate-spin"
            style={{ color: "oklch(0.45 0.15 250)" }}
          />
        </div>
      )
    case "failed":
      return (
        <div
          className="flex size-5 items-center justify-center rounded-full"
          style={{ background: "oklch(0.90 0.08 25)" }}
        >
          <BanIcon className="size-3" style={{ color: "oklch(0.50 0.14 25)" }} />
        </div>
      )
    case "pending":
    default:
      return (
        <CircleIcon className="size-5 text-muted-foreground/40" />
      )
  }
}

// ============================================================================
// PipelineStepper
// ============================================================================

interface PipelineStepperProps {
  currentStage: string
  progress: number
  message?: string
  queuePosition?: number
  isFailed?: boolean
  analysisId?: string
  onCancel?: () => void
  isCancelling?: boolean
}

export function PipelineStepper({
  currentStage,
  progress,
  message,
  queuePosition,
  isFailed = false,
  onCancel,
  isCancelling = false,
}: PipelineStepperProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      {/* Pipeline stages */}
      <div className="mb-6 w-full max-w-xs space-y-1">
        {PIPELINE_STAGES.map((stage, i) => {
          const status = getStageStatus(stage.id, currentStage, isFailed)
          return (
            <div key={stage.id} className="flex items-center gap-3">
              {/* Connector line (except first) */}
              <div className="flex flex-col items-center">
                {i > 0 && (
                  <div
                    className="mb-0.5 h-3 w-px"
                    style={{
                      background:
                        status === "completed" || status === "active"
                          ? "oklch(0.75 0.08 175)"
                          : "oklch(0.90 0.02 0)",
                    }}
                  />
                )}
                <StageIcon status={status} />
              </div>
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    "text-sm",
                    status === "active" && "font-medium",
                    status === "pending" && "text-muted-foreground/60",
                    status === "completed" && "text-muted-foreground",
                    status === "failed" && "text-destructive"
                  )}
                >
                  {stage.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <Progress value={progress} className="w-48" />
      <p className="mt-2 text-xs text-muted-foreground">{progress}%</p>

      {/* Detailed message */}
      {message && (
        <p className="mt-2 max-w-xs text-center text-xs text-muted-foreground">
          {message}
        </p>
      )}

      {/* Queue position */}
      {queuePosition != null && queuePosition > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Position in queue: {queuePosition}
        </p>
      )}

      {/* Cancel button */}
      {onCancel && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-4 text-muted-foreground"
          onClick={onCancel}
          disabled={isCancelling}
        >
          {isCancelling ? (
            <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <BanIcon className="mr-1.5 size-3.5" />
          )}
          Cancel
        </Button>
      )}
    </div>
  )
}
