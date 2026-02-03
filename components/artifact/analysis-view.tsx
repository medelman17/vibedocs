"use client"

import * as React from "react"
import { BarChartIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface AnalysisViewProps {
  analysisId: string
  className?: string
}

export function AnalysisView({ analysisId, className }: AnalysisViewProps) {
  // Placeholder - will be implemented with actual analysis rendering
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
        Analysis View
      </h3>
      <p className="text-sm text-neutral-500">
        Clause analysis will appear here
      </p>
      <p className="mt-2 font-mono text-xs text-neutral-400">ID: {analysisId}</p>
    </div>
  )
}
