"use client"

/**
 * @fileoverview Admin page client wrapper
 *
 * Client component that manages all interactive state:
 * - Selected document for detail panel
 * - Delete dialog state
 * - Row selection for bulk operations
 *
 * Receives server-fetched data from page.tsx and passes to child components.
 *
 * @module app/(admin)/admin/admin-page-client
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { DocumentsTable } from "./documents-table"
import { Toolbar } from "./toolbar"
import { DocumentDetail } from "./document-detail"
import { SingleDeleteDialog, BulkDeleteDialog } from "./delete-dialog"
import type { AdminDocument } from "./columns"

// ============================================================================
// Types
// ============================================================================

interface AdminPageClientProps {
  documents: AdminDocument[]
  total: number
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: "asc" | "desc"
}

// ============================================================================
// Component
// ============================================================================

export function AdminPageClient({
  documents,
  total,
  page,
  pageSize,
  sortBy,
  sortOrder,
}: AdminPageClientProps) {
  const router = useRouter()

  // State: Selected document for detail panel
  const [selectedDocumentId, setSelectedDocumentId] = React.useState<
    string | null
  >(null)

  // State: Delete dialogs
  const [singleDeleteDialogOpen, setSingleDeleteDialogOpen] =
    React.useState(false)
  const [singleDeleteDocumentId, setSingleDeleteDocumentId] = React.useState<
    string | null
  >(null)
  const [singleDeleteDocumentTitle, setSingleDeleteDocumentTitle] =
    React.useState("")

  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = React.useState(false)
  const [bulkDeleteDocumentIds, setBulkDeleteDocumentIds] = React.useState<
    string[]
  >([])

  // State: Row selection
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])

  // Handlers
  const handleRowClick = (documentId: string) => {
    // Defer to next frame so the originating click event finishes
    // before the Sheet mounts and starts listening for outside clicks
    requestAnimationFrame(() => {
      setSelectedDocumentId(documentId)
    })
  }

  const handleCloseDetailPanel = React.useCallback(() => {
    setSelectedDocumentId(null)
  }, [])

  const handleOpenSingleDeleteDialog = (documentId: string, title: string) => {
    setSingleDeleteDocumentId(documentId)
    setSingleDeleteDocumentTitle(title)
    setSingleDeleteDialogOpen(true)
  }

  const handleSingleDeleteConfirm = () => {
    // Close detail panel if it was open for this document
    if (selectedDocumentId === singleDeleteDocumentId) {
      setSelectedDocumentId(null)
    }
    // Refresh server data
    router.refresh()
  }

  const handleBulkDeleteClick = () => {
    if (selectedIds.length === 0) return
    setBulkDeleteDocumentIds(selectedIds)
    setBulkDeleteDialogOpen(true)
  }

  const handleBulkDeleteConfirm = () => {
    // Clear selection
    setSelectedIds([])
    // Close detail panel if deleted document was open
    if (selectedDocumentId && bulkDeleteDocumentIds.includes(selectedDocumentId)) {
      setSelectedDocumentId(null)
    }
    // Refresh server data
    router.refresh()
  }

  const handleSelectionChange = React.useCallback((ids: string[]) => {
    setSelectedIds(ids)
  }, [])

  return (
    <>
      <Toolbar
        selectedCount={selectedIds.length}
        onBulkDelete={handleBulkDeleteClick}
      />

      <DocumentsTable
        data={documents}
        total={total}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onRowClick={handleRowClick}
        onSelectionChange={handleSelectionChange}
      />

      <DocumentDetail
        documentId={selectedDocumentId}
        onClose={handleCloseDetailPanel}
        onOpenDeleteDialog={handleOpenSingleDeleteDialog}
      />

      {singleDeleteDocumentId && (
        <SingleDeleteDialog
          open={singleDeleteDialogOpen}
          onOpenChange={setSingleDeleteDialogOpen}
          documentId={singleDeleteDocumentId}
          documentTitle={singleDeleteDocumentTitle}
          onConfirm={handleSingleDeleteConfirm}
        />
      )}

      <BulkDeleteDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        documentIds={bulkDeleteDocumentIds}
        onConfirm={handleBulkDeleteConfirm}
      />
    </>
  )
}
