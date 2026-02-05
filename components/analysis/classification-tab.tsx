"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  AlertTriangleIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { getAnalysisClassifications } from "@/app/(main)/(dashboard)/analyses/actions"
import type {
  ChunkClassificationRow,
  ClassificationsByCategory,
} from "@/db/queries/classifications"
import { CLASSIFICATION_THRESHOLDS } from "@/agents/types"
import { useClauseSelection } from "@/hooks/use-clause-selection"

// ============================================================================
// Sub-components
// ============================================================================

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const isLow = confidence < CLASSIFICATION_THRESHOLDS.LOW_CONFIDENCE
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-xs",
        isLow &&
          "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-400"
      )}
    >
      {isLow && <AlertTriangleIcon className="size-3" />}
      {Math.round(confidence * 100)}%
      {isLow && " Review"}
    </Badge>
  )
}

function ClassificationCard({
  classification,
  isActive,
  onSelect,
}: {
  classification: ChunkClassificationRow
  isActive: boolean
  onSelect: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const cardRef = React.useRef<HTMLDivElement>(null)
  const { selectionSource } = useClauseSelection()

  // Scroll into view when activated from the document panel
  React.useEffect(() => {
    if (isActive && selectionSource === "document" && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [isActive, selectionSource])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card
        ref={cardRef}
        className={cn(
          "min-w-0 cursor-pointer transition-shadow",
          isActive && "ring-2 ring-primary ring-offset-1"
        )}
        onClick={onSelect}
      >
        <CardHeader className="pb-2">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="min-w-0 truncate text-sm font-medium">
                {classification.category}
              </CardTitle>
              {!classification.isPrimary && (
                <span className="text-xs text-muted-foreground">Secondary</span>
              )}
            </div>
            <ConfidenceBadge confidence={classification.confidence} />
          </div>
          {classification.rationale && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {classification.rationale}
            </p>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <CollapsibleTrigger
            className="flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {open ? (
              <ChevronDownIcon className="size-3" />
            ) : (
              <ChevronRightIcon className="size-3" />
            )}
            {open ? "Hide details" : "Show chunk"}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <p className="text-xs text-muted-foreground">
              Chunk {classification.chunkIndex + 1}
              {classification.startPosition != null &&
                ` (pos ${classification.startPosition}-${classification.endPosition})`}
            </p>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  )
}

function CategoryGroupView({
  groups,
  activeClauseId,
  onSelectClause,
}: {
  groups: ClassificationsByCategory[]
  activeClauseId: string | null
  onSelectClause: (id: string) => void
}) {
  if (groups.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No classifications found.
      </p>
    )
  }
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.category}>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {group.category}
            <Badge variant="secondary" className="text-xs">
              {group.classifications.length}
            </Badge>
          </h4>
          <div className="space-y-2 pl-2">
            {group.classifications.map((c) => (
              <ClassificationCard
                key={c.id}
                classification={c}
                isActive={activeClauseId === c.id}
                onSelect={() => onSelectClause(c.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DocumentOrderView({
  classifications,
  activeClauseId,
  onSelectClause,
}: {
  classifications: ChunkClassificationRow[]
  activeClauseId: string | null
  onSelectClause: (id: string) => void
}) {
  if (classifications.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No classifications found.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {classifications.map((c) => (
        <ClassificationCard
          key={c.id}
          classification={c}
          isActive={activeClauseId === c.id}
          onSelect={() => onSelectClause(c.id)}
        />
      ))}
    </div>
  )
}

// ============================================================================
// ClassificationTab (main export)
// ============================================================================

interface ClassificationTabProps {
  analysisId: string
}

export function ClassificationTab({ analysisId }: ClassificationTabProps) {
  const [view, setView] = React.useState<"category" | "position">("category")
  const [categoryData, setCategoryData] = React.useState<
    ClassificationsByCategory[]
  >([])
  const [positionData, setPositionData] = React.useState<
    ChunkClassificationRow[]
  >([])
  const [loading, setLoading] = React.useState(true)

  const { activeClauseId, selectClause } = useClauseSelection()

  React.useEffect(() => {
    setLoading(true)
    getAnalysisClassifications(analysisId, view)
      .then((result) => {
        if (result.success) {
          if (view === "category") {
            setCategoryData(result.data as ClassificationsByCategory[])
          } else {
            setPositionData(result.data as ChunkClassificationRow[])
          }
        }
      })
      .finally(() => setLoading(false))
  }, [analysisId, view])

  const handleSelectClause = React.useCallback(
    (clauseId: string) => {
      selectClause(clauseId, "analysis")
    },
    [selectClause]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex gap-1 rounded-md border p-1">
        <button
          className={cn(
            "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors",
            view === "category"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          )}
          onClick={() => setView("category")}
        >
          By Category
        </button>
        <button
          className={cn(
            "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors",
            view === "position"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          )}
          onClick={() => setView("position")}
        >
          Document Order
        </button>
      </div>

      {/* Content */}
      {view === "category" ? (
        <CategoryGroupView
          groups={categoryData}
          activeClauseId={activeClauseId}
          onSelectClause={handleSelectClause}
        />
      ) : (
        <DocumentOrderView
          classifications={positionData}
          activeClauseId={activeClauseId}
          onSelectClause={handleSelectClause}
        />
      )}
    </div>
  )
}
