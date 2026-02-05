"use client"

import * as React from "react"
import { SearchIcon, HighlighterIcon, DownloadIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useClauseSelection } from "@/hooks/use-clause-selection"

// ============================================================================
// DocumentToolbar Component
// ============================================================================

interface DocumentToolbarProps {
  clauseCount: number
  currentSection: string | null
  searchOpen: boolean
  onToggleSearch: () => void
}

export function DocumentToolbar({
  clauseCount,
  currentSection,
  searchOpen,
  onToggleSearch,
}: DocumentToolbarProps) {
  const { highlightsEnabled, toggleHighlights } = useClauseSelection()

  return (
    <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2">
      {/* Highlight toggle */}
      <div className="flex items-center gap-2">
        <HighlighterIcon className="size-3.5 text-muted-foreground" />
        <label
          htmlFor="highlight-toggle"
          className="cursor-pointer text-xs font-medium text-muted-foreground"
        >
          Highlights
        </label>
        <Switch
          id="highlight-toggle"
          size="sm"
          checked={highlightsEnabled}
          onCheckedChange={toggleHighlights}
        />
        {highlightsEnabled && clauseCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {clauseCount}
          </Badge>
        )}
      </div>

      {/* Current section indicator */}
      {currentSection && (
        <span className="ml-2 flex-1 truncate text-xs text-muted-foreground">
          {currentSection}
        </span>
      )}
      {!currentSection && <span className="flex-1" />}

      {/* Search button */}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onToggleSearch}
        aria-label={searchOpen ? "Close search" : "Search document"}
        className={cn(searchOpen && "bg-accent")}
      >
        <SearchIcon className="size-3.5" />
      </Button>

      {/* Export placeholder */}
      <Button
        variant="ghost"
        size="icon-xs"
        disabled
        aria-label="Export document"
      >
        <DownloadIcon className="size-3.5" />
      </Button>
    </div>
  )
}
