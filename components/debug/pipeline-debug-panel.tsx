"use client"

import { useState, useEffect, useRef } from "react"
import { StepTimeline } from "./step-timeline"
import { getDebugInfo } from "@/app/(main)/(dashboard)/analyses/actions"
import type { PipelineDebugInfo } from "@/app/(main)/(dashboard)/analyses/actions"
import { cn } from "@/lib/utils"

interface PipelineDebugPanelProps {
  analysisId: string
  className?: string
}

export function PipelineDebugPanel({
  analysisId,
  className,
}: PipelineDebugPanelProps) {
  const [debugInfo, setDebugInfo] = useState<PipelineDebugInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const stoppedRef = useRef(false)

  useEffect(() => {
    stoppedRef.current = false

    const intervalId = setInterval(async () => {
      const result = await getDebugInfo(analysisId)
      if (stoppedRef.current) return
      if (result.success) {
        setDebugInfo(result.data)
        setError(null)
        if (
          ["completed", "failed", "cancelled"].includes(result.data.status)
        ) {
          clearInterval(intervalId)
        }
      } else {
        setError(result.error.message)
      }
    }, 3000)

    // Initial fetch via setTimeout to avoid synchronous setState in effect body
    const initialTimeout = setTimeout(async () => {
      const result = await getDebugInfo(analysisId)
      if (stoppedRef.current) return
      if (result.success) {
        setDebugInfo(result.data)
        setError(null)
        if (
          ["completed", "failed", "cancelled"].includes(result.data.status)
        ) {
          clearInterval(intervalId)
        }
      } else {
        setError(result.error.message)
      }
    }, 0)

    return () => {
      stoppedRef.current = true
      clearTimeout(initialTimeout)
      clearInterval(intervalId)
    }
  }, [analysisId])

  if (error)
    return <div className="p-4 text-sm text-red-500">{error}</div>
  if (!debugInfo)
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading debug info...
      </div>
    )

  const toggleSection = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className={cn("space-y-4 font-mono text-xs", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Pipeline Debug</h3>
        <span
          className={cn(
            "rounded px-2 py-0.5 text-xs font-medium",
            debugInfo.status === "completed"
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : debugInfo.status === "failed"
                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                : debugInfo.status === "cancelled"
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
          )}
        >
          {debugInfo.status}
        </span>
      </div>

      {/* Progress */}
      {debugInfo.progressMessage && (
        <div className="text-muted-foreground">
          {debugInfo.progressMessage} ({debugInfo.progressPercent}%)
        </div>
      )}

      {/* Step Timeline */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Steps
        </h4>
        <StepTimeline steps={debugInfo.steps} />
      </div>

      {/* Token Usage */}
      {debugInfo.tokenUsage && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Token Usage
          </h4>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-muted-foreground">Input</div>
              <div className="font-medium">
                {debugInfo.tokenUsage.total.input.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Output</div>
              <div className="font-medium">
                {debugInfo.tokenUsage.total.output.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Cost</div>
              <div className="font-medium">
                ${debugInfo.tokenUsage.total.estimatedCost.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing Time */}
      {debugInfo.totalDurationMs != null && (
        <div>
          <span className="text-muted-foreground">Total time: </span>
          <span className="font-medium">
            {(debugInfo.totalDurationMs / 1000).toFixed(1)}s
          </span>
        </div>
      )}

      {/* Budget Info */}
      <div className="flex gap-4">
        {debugInfo.estimatedTokens != null && (
          <div>
            <span className="text-muted-foreground">Est. tokens: </span>
            <span>{debugInfo.estimatedTokens.toLocaleString()}</span>
          </div>
        )}
        {debugInfo.actualTokens != null && (
          <div>
            <span className="text-muted-foreground">Actual: </span>
            <span>{debugInfo.actualTokens.toLocaleString()}</span>
          </div>
        )}
        {debugInfo.wasTruncated && (
          <span className="text-yellow-600">Truncated</span>
        )}
      </div>

      {/* Chunk Stats (collapsible) */}
      {debugInfo.chunkStats && (
        <div>
          <button
            onClick={() => toggleSection("chunkStats")}
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {expanded.chunkStats ? "- " : "+ "}Chunk Stats
          </button>
          {expanded.chunkStats && (
            <pre className="mt-1 max-h-40 overflow-x-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(debugInfo.chunkStats, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Metadata (collapsible) */}
      {debugInfo.metadata && Object.keys(debugInfo.metadata).length > 0 && (
        <div>
          <button
            onClick={() => toggleSection("metadata")}
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {expanded.metadata ? "- " : "+ "}Raw Metadata
          </button>
          {expanded.metadata && (
            <pre className="mt-1 max-h-60 overflow-x-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(debugInfo.metadata, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
