"use client"

import * as React from "react"
import { FileTextIcon, AlertCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { DocumentRenderer } from "@/components/document/document-renderer"
import { DocumentSkeleton } from "@/components/document/document-skeleton"
import { getDocumentForRendering } from "@/app/(main)/(dashboard)/analyses/actions"
import type { DocumentRenderingData } from "@/lib/document-rendering/types"
import type { PositionedSection } from "@/lib/document-extraction/types"

interface DocumentViewerProps {
  /** Analysis ID to fetch document rendering data */
  documentId: string
  className?: string
}

/**
 * Document viewer component for the artifact panel.
 *
 * Fetches real document data via getDocumentForRendering and renders
 * using DocumentRenderer with clause highlights. This is the simpler
 * viewer (no split panel) used when opening documents from chat.
 *
 * NOTE: Despite the prop name `documentId`, this actually expects an
 * analysisId since getDocumentForRendering requires one. The prop name
 * is preserved for backward compatibility with the artifact panel wiring.
 */
export function DocumentViewer({ documentId: analysisId, className }: DocumentViewerProps) {
  const [data, setData] = React.useState<DocumentRenderingData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

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

  // Loading state
  if (loading) {
    return (
      <div className={cn("h-full", className)}>
        <DocumentSkeleton />
      </div>
    )
  }

  // Error state
  if (error || !data) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center p-8 text-center",
          className
        )}
      >
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
          {error ? (
            <AlertCircleIcon className="size-6 text-destructive" />
          ) : (
            <FileTextIcon className="size-6 text-muted-foreground" />
          )}
        </div>
        <h3 className="mb-2 text-lg font-medium">
          {error ? "Failed to Load Document" : "Document Not Found"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {error || "The requested document could not be loaded."}
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          ID: {analysisId}
        </p>
      </div>
    )
  }

  const sections: PositionedSection[] = data.structure?.sections ?? []

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
      <DocumentRenderer
        rawText={data.document.rawText}
        sections={sections}
        clauses={data.clauses}
        isLoading={false}
        title={data.document.title}
        metadata={data.document.metadata}
        status={data.status}
      />
    </div>
  )
}
