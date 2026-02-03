"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface Suggestion {
  id: string
  label: string
  action: string
}

interface SuggestionChipsProps {
  suggestions?: Suggestion[]
  onSelect?: (suggestion: Suggestion) => void
  visible?: boolean
  className?: string
}

const defaultSuggestions: Suggestion[] = [
  { id: "analyze", label: "Analyze NDA", action: "/analyze" },
  { id: "compare", label: "Compare", action: "/compare" },
  { id: "generate", label: "Generate", action: "/generate" },
]

export function SuggestionChips({
  suggestions = defaultSuggestions,
  onSelect,
  visible = true,
  className,
}: SuggestionChipsProps) {
  if (!visible || suggestions.length === 0) return null

  return (
    <div
      data-slot="suggestion-chips"
      className={cn(
        "flex flex-wrap items-center justify-center gap-2 pb-3",
        className
      )}
    >
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion.id}
          variant="outline"
          size="sm"
          onClick={() => onSelect?.(suggestion)}
          className={cn(
            "h-8 rounded-full px-4",
            "border-neutral-200/50 bg-white/50",
            "hover:bg-violet-50 hover:border-violet-200",
            "text-sm text-neutral-600 hover:text-violet-700",
            "transition-colors"
          )}
        >
          {suggestion.label}
        </Button>
      ))}
    </div>
  )
}

export type { Suggestion }
