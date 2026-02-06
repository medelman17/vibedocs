"use client"

import * as React from "react"
import {
  FilterIcon,
  SearchIcon,
  MoreHorizontalIcon,
  RotateCcwIcon,
  DownloadIcon,
  BugIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { riskConfig, type RiskLevel } from "@/components/analysis/config"
import { RiskBadge } from "@/components/analysis/risk-tab"
import { PerspectiveToggle } from "@/components/analysis/analysis-tabs"
import type { Perspective } from "@/app/(main)/(dashboard)/analyses/actions"

// ============================================================================
// Types
// ============================================================================

export type ClauseSort = "position" | "risk" | "category"
export type RiskFilter = RiskLevel | "all"

interface AnalysisHeaderProps {
  analysisId: string
  overallRiskScore: number | null
  overallRiskLevel: RiskLevel
  currentPerspective: Perspective
  onRescoreTriggered: () => void
  // Filter state
  sortBy: ClauseSort
  onSortChange: (sort: ClauseSort) => void
  riskFilter: RiskFilter
  onRiskFilterChange: (filter: RiskFilter) => void
  searchQuery: string
  onSearchChange: (query: string) => void
}

// ============================================================================
// AnalysisHeader
// ============================================================================

export function AnalysisHeader({
  analysisId,
  overallRiskScore,
  overallRiskLevel,
  currentPerspective,
  onRescoreTriggered,
  sortBy,
  onSortChange,
  riskFilter,
  onRiskFilterChange,
  searchQuery,
  onSearchChange,
}: AnalysisHeaderProps) {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const overallConfig = riskConfig[overallRiskLevel] || riskConfig.unknown

  return (
    <div className="shrink-0 border-b bg-background">
      {/* Row 1: Risk score + actions */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-3">
          {overallRiskScore !== null && (
            <Badge
              variant="outline"
              className="gap-1 text-sm font-semibold"
              style={{
                background: overallConfig.bgColor,
                color: overallConfig.textColor,
                borderColor: overallConfig.borderColor,
              }}
            >
              {Math.round(overallRiskScore)}/100
            </Badge>
          )}
          <RiskBadge level={overallRiskLevel} />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>
              <RotateCcwIcon className="mr-2 size-4" />
              Re-analyze
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <DownloadIcon className="mr-2 size-4" />
              Export
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <BugIcon className="mr-2 size-4" />
              Debug info
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Row 2: Perspective toggle */}
      <div className="px-4 pb-2">
        <PerspectiveToggle
          analysisId={analysisId}
          currentPerspective={currentPerspective}
          onRescoreTriggered={onRescoreTriggered}
        />
      </div>

      <Separator />

      {/* Row 3: Filter controls */}
      <div className="flex items-center gap-2 px-4 py-2">
        <Select
          value={sortBy}
          onValueChange={(v) => onSortChange(v as ClauseSort)}
        >
          <SelectTrigger className="h-7 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="position">Document order</SelectItem>
            <SelectItem value="risk">By risk level</SelectItem>
            <SelectItem value="category">By category</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={riskFilter}
          onValueChange={(v) => onRiskFilterChange(v as RiskFilter)}
        >
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <FilterIcon className="mr-1 size-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risks</SelectItem>
            <SelectItem value="aggressive">Aggressive</SelectItem>
            <SelectItem value="cautious">Cautious</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {searchOpen ? (
          <Input
            type="text"
            placeholder="Search clauses..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-7 w-[160px] text-xs"
            autoFocus
            onBlur={() => {
              if (!searchQuery) setSearchOpen(false)
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onSearchChange("")
                setSearchOpen(false)
              }
            }}
          />
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon className="size-3.5" />
            <span className="sr-only">Search clauses</span>
          </Button>
        )}
      </div>
    </div>
  )
}
