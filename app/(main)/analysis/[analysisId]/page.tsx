"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { AlertCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { DocumentRenderer } from "@/components/document/document-renderer"
import { DocumentSkeleton } from "@/components/document/document-skeleton"
import { AnalysisView } from "@/components/artifact/analysis-view"
import { useSidebar } from "@/components/ui/sidebar"
import { useIsMobile } from "@/hooks/use-mobile"
import { getDocumentForRendering } from "@/app/(main)/(dashboard)/analyses/actions"
import type { DocumentRenderingData } from "@/lib/document-rendering/types"
import type { PositionedSection } from "@/lib/document-extraction/types"

// ============================================================================
// Analysis Detail Page
// ============================================================================

export default function AnalysisPage() {
  const params = useParams<{ analysisId: string }>()
  const analysisId = params.analysisId
  const isMobile = useIsMobile()
  const { setOpen } = useSidebar()

  const [data, setData] = React.useState<DocumentRenderingData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  // Auto-collapse sidebar on mount to maximize horizontal space
  React.useEffect(() => {
    setOpen(false)
  }, [setOpen])

  // Fetch document rendering data
  React.useEffect(() => {
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError(null)

      const result = await getDocumentForRendering(analysisId)

      if (cancelled) return

      if (result.success) {
        setData(result.data)
      } else {
        setError(result.error.message)
      }
      setLoading(false)
    }

    fetchData()
    return () => { cancelled = true }
  }, [analysisId])

  // Error state
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircleIcon className="size-6 text-destructive" />
          </div>
          <h3 className="mb-1 text-lg font-medium">Failed to load document</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  // Extract sections from structure for DocumentRenderer
  const sections: PositionedSection[] = data?.structure?.sections ?? []

  // Mobile: stack vertically
  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Document panel */}
        <div className="min-h-0 flex-1 overflow-hidden border-b">
          {loading || !data ? (
            <DocumentSkeleton />
          ) : (
            <DocumentRenderer
              rawText={data.document.rawText}
              sections={sections}
              clauses={data.clauses}
              isLoading={false}
              title={data.document.title}
              metadata={data.document.metadata}
              status={data.status}
            />
          )}
        </div>
        {/* Analysis panel */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <AnalysisView analysisId={analysisId} />
        </div>
      </div>
    )
  }

  // Desktop: side-by-side resizable panels
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className={cn("h-full min-h-0")}
    >
      {/* Document panel (left, 55%) */}
      <ResizablePanel defaultSize={55} minSize={35} className="min-h-0">
        <div className="h-full overflow-hidden">
          {loading || !data ? (
            <DocumentSkeleton />
          ) : (
            <DocumentRenderer
              rawText={data.document.rawText}
              sections={sections}
              clauses={data.clauses}
              isLoading={false}
              title={data.document.title}
              metadata={data.document.metadata}
              status={data.status}
            />
          )}
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Analysis panel (right, 45%) */}
      <ResizablePanel defaultSize={45} minSize={30} className="min-h-0">
        <div className="h-full overflow-hidden">
          <AnalysisView analysisId={analysisId} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
