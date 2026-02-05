"use client"

/**
 * @fileoverview Document detail panel component
 *
 * Slide-out sheet showing full document information:
 * - Editable title
 * - Document metadata (file name, type, size, date, hash)
 * - Actions (download, re-run analysis, delete)
 * - Associated analyses list with links
 * - Error info for failed documents
 *
 * @module app/(admin)/admin/document-detail
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  DownloadIcon,
  RefreshCwIcon,
  Trash2Icon,
  ExternalLinkIcon,
  Loader2Icon,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import {
  adminGetDocumentDetail,
  adminUpdateDocumentTitle,
  adminTriggerAnalysis,
  adminDeleteAnalysis,
  type Document,
  type Analysis,
} from "./actions"
import { toast } from "sonner"

// ============================================================================
// Types
// ============================================================================

interface DocumentDetailProps {
  documentId: string | null
  onClose: () => void
  onOpenDeleteDialog: (documentId: string, title: string) => void
}

// ============================================================================
// Component
// ============================================================================

export function DocumentDetail({
  documentId,
  onClose,
  onOpenDeleteDialog,
}: DocumentDetailProps) {
  const router = useRouter()
  const [document, setDocument] = React.useState<Document | null>(null)
  const [analyses, setAnalyses] = React.useState<Analysis[]>([])
  const [loading, setLoading] = React.useState(false)
  const [editingTitle, setEditingTitle] = React.useState(false)
  const [titleValue, setTitleValue] = React.useState("")
  const [savingTitle, setSavingTitle] = React.useState(false)
  const [triggeringAnalysis, setTriggeringAnalysis] = React.useState(false)

  // Fetch document detail when documentId changes
  React.useEffect(() => {
    if (!documentId) {
      setDocument(null)
      setAnalyses([])
      return
    }

    let cancelled = false

    async function fetchDetail() {
      setLoading(true)
      const result = await adminGetDocumentDetail({ documentId: documentId! })
      if (cancelled) return
      setLoading(false)

      if (!result.success) {
        toast.error(result.error.message ?? "Failed to load document")
        onClose()
        return
      }

      setDocument(result.data.document)
      setAnalyses(result.data.analyses)
      setTitleValue(result.data.document.title)
    }

    fetchDetail()

    return () => {
      cancelled = true
    }
  }, [documentId, onClose])

  const handleStartEditTitle = () => {
    setEditingTitle(true)
  }

  const handleSaveTitle = async () => {
    if (!document || titleValue.trim() === document.title) {
      setEditingTitle(false)
      return
    }

    setSavingTitle(true)
    const result = await adminUpdateDocumentTitle({
      documentId: document.id,
      title: titleValue.trim(),
    })
    setSavingTitle(false)

    if (!result.success) {
      toast.error(result.error.message ?? "Failed to update title")
      setTitleValue(document.title)
      setEditingTitle(false)
      return
    }

    setDocument(result.data)
    setEditingTitle(false)
    toast.success("Title updated")
    router.refresh()
  }

  const handleCancelEdit = () => {
    setTitleValue(document?.title ?? "")
    setEditingTitle(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSaveTitle()
    } else if (e.key === "Escape") {
      handleCancelEdit()
    }
  }

  const handleDownload = () => {
    if (!document?.fileUrl) return
    window.open(document.fileUrl, "_blank")
  }

  const handleReRunAnalysis = async () => {
    if (!document) return

    setTriggeringAnalysis(true)
    const result = await adminTriggerAnalysis({ documentId: document.id })
    setTriggeringAnalysis(false)

    if (!result.success) {
      toast.error(result.error.message ?? "Failed to trigger analysis")
      return
    }

    toast.success("Analysis started")
    router.refresh()

    // Refresh detail panel
    const detailResult = await adminGetDocumentDetail({ documentId: document.id })
    if (detailResult.success) {
      setAnalyses(detailResult.data.analyses)
    }
  }

  const handleDeleteDocument = () => {
    if (!document) return
    onOpenDeleteDialog(document.id, document.title)
  }

  const handleDeleteAnalysis = async (analysisId: string) => {
    if (!confirm("Delete this analysis? This action cannot be undone.")) return

    const result = await adminDeleteAnalysis({ analysisId })

    if (!result.success) {
      toast.error(result.error.message ?? "Failed to delete analysis")
      return
    }

    toast.success("Analysis deleted")
    setAnalyses((prev) => prev.filter((a) => a.id !== analysisId))
    router.refresh()
  }

  const formatFileType = (mimeType: string) => {
    if (mimeType === "application/pdf") return "PDF"
    if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
      return "DOCX"
    return mimeType
  }

  const formatFileSize = (bytes: number | null) => {
    if (bytes === null) return "N/A"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date))
  }

  const getStatusBadgeVariant = (status: string) => {
    if (status === "complete" || status === "ready") return "outline"
    if (status === "failed") return "destructive"
    if (status === "cancelled") return "secondary"
    return "default"
  }

  const getStatusLabel = (status: string) => {
    if (
      status === "parsing" ||
      status === "embedding" ||
      status === "analyzing"
    )
      return "Processing"
    if (status === "complete" || status === "ready") return "Complete"
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  return (
    <Sheet open={documentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {loading ? (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Loading document</SheetTitle>
              <SheetDescription>Loading document details</SheetDescription>
            </SheetHeader>
            <LoadingSkeleton />
          </>
        ) : document ? (
          <>
            {/* Header: Title + Status */}
            <SheetHeader>
              <div className="flex items-start gap-2">
                {editingTitle ? (
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      value={titleValue}
                      onChange={(e) => setTitleValue(e.target.value)}
                      onBlur={handleSaveTitle}
                      onKeyDown={handleKeyDown}
                      autoFocus
                      disabled={savingTitle}
                      className="flex-1"
                    />
                    {savingTitle && <Loader2Icon className="size-4 animate-spin" />}
                  </div>
                ) : (
                  <SheetTitle
                    className="flex-1 cursor-pointer hover:text-muted-foreground transition-colors"
                    onClick={handleStartEditTitle}
                  >
                    {document.title}
                  </SheetTitle>
                )}
                <Badge
                  variant={getStatusBadgeVariant(document.status)}
                  className={
                    document.status === "complete" || document.status === "ready"
                      ? "text-green-600"
                      : ""
                  }
                >
                  {getStatusLabel(document.status)}
                </Badge>
              </div>
            </SheetHeader>

            {/* Document Info */}
            <div className="space-y-4 mt-6">
              <div>
                <h3 className="text-sm font-medium mb-3">Document Info</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">File name:</dt>
                  <dd className="font-mono text-xs truncate">{document.fileName}</dd>

                  <dt className="text-muted-foreground">File type:</dt>
                  <dd>{formatFileType(document.fileType)}</dd>

                  <dt className="text-muted-foreground">File size:</dt>
                  <dd>{formatFileSize(document.fileSize)}</dd>

                  <dt className="text-muted-foreground">Upload date:</dt>
                  <dd>{formatDate(document.createdAt)}</dd>

                  <dt className="text-muted-foreground">Content hash:</dt>
                  <dd className="font-mono text-xs truncate">
                    {document.contentHash ? document.contentHash.slice(0, 12) + "..." : "N/A"}
                  </dd>
                </dl>
              </div>

              {/* Actions */}
              <div>
                <h3 className="text-sm font-medium mb-3">Actions</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!document.fileUrl}
                  >
                    <DownloadIcon className="size-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReRunAnalysis}
                    disabled={
                      triggeringAnalysis ||
                      (document.status !== "ready" && document.status !== "complete")
                    }
                  >
                    {triggeringAnalysis ? (
                      <Loader2Icon className="size-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCwIcon className="size-4 mr-2" />
                    )}
                    Re-run Analysis
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteDocument}
                  >
                    <Trash2Icon className="size-4 mr-2" />
                    Delete Document
                  </Button>
                </div>
              </div>

              {/* Analyses */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-medium">Analyses</h3>
                  <Badge variant="secondary">{analyses.length}</Badge>
                </div>
                {analyses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No analyses yet</p>
                ) : (
                  <div className="space-y-2">
                    {analyses.map((analysis) => (
                      <div
                        key={analysis.id}
                        className="flex items-center gap-2 p-2 rounded-md border bg-card text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">v{analysis.version}</span>
                            <Badge
                              variant={getStatusBadgeVariant(analysis.status)}
                              className={
                                analysis.status === "complete"
                                  ? "text-green-600"
                                  : ""
                              }
                            >
                              {getStatusLabel(analysis.status)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(analysis.createdAt)}
                            </span>
                          </div>
                          {analysis.status === "complete" &&
                            typeof analysis.overallRiskScore === "number" && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Risk: {analysis.overallRiskScore.toFixed(1)}
                              </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-8 w-8 p-0"
                          >
                            <a
                              href={`/analysis/${analysis.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLinkIcon className="size-3.5" />
                              <span className="sr-only">Open analysis</span>
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAnalysis(analysis.id)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          >
                            <Trash2Icon className="size-3.5" />
                            <span className="sr-only">Delete analysis</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Error Info */}
              {document.status === "failed" && (() => {
                const meta = document.metadata as Record<string, unknown> | null
                const errMsg = meta && typeof meta === "object" && "errorMessage" in meta
                  ? String(meta.errorMessage)
                  : null
                if (!errMsg) return null
                return (
                  <div>
                    <h3 className="text-sm font-medium mb-3">Error Info</h3>
                    <Alert variant="destructive">
                      <AlertDescription className="text-sm">
                        {errMsg}
                      </AlertDescription>
                    </Alert>
                  </div>
                )
              })()}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 flex-1" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  )
}
