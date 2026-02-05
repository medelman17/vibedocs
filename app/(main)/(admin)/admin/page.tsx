/**
 * @fileoverview Admin documents page
 *
 * Server component that:
 * - Reads URL search params for pagination, search, filters, sort
 * - Fetches documents via adminGetDocuments
 * - Renders data table with toolbar
 * - Handles bulk delete operations
 *
 * @module app/(admin)/admin/page
 */

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { adminGetDocuments } from "./actions"
import { DocumentsTable } from "./documents-table"
import { Toolbar } from "./toolbar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircleIcon } from "lucide-react"
import type { AdminDocument } from "./columns"

// ============================================================================
// Types
// ============================================================================

interface AdminDocumentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// ============================================================================
// Component
// ============================================================================

export default async function AdminDocumentsPage({
  searchParams,
}: AdminDocumentsPageProps) {
  const params = await searchParams

  // Parse URL search params
  const page = parseInt(String(params.page ?? "1"), 10)
  const pageSize = parseInt(String(params.size ?? "20"), 10)
  const search = params.search ? String(params.search) : undefined
  const status = params.status ? String(params.status) : undefined
  const fileType = params.fileType ? String(params.fileType) : undefined
  const dateRange = params.dateRange ? String(params.dateRange) : undefined
  const sortBy = params.sortBy ? String(params.sortBy) : undefined
  const sortOrder =
    params.sortOrder === "asc" ? "asc" : ("desc" as "asc" | "desc")

  // Fetch documents
  const result = await adminGetDocuments({
    page,
    pageSize,
    search,
    status,
    fileType,
    dateRange,
    sortBy,
    sortOrder,
  })

  // Handle error state
  if (!result.success) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <Alert variant="destructive">
          <AlertCircleIcon className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {result.error.message ?? "Failed to load documents"}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const { documents, total } = result.data

  return (
    <div className="p-6 space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <Badge variant="secondary">{total}</Badge>
      </div>

      {/* Toolbar and table wrapped in client component boundary */}
      <AdminDocumentsView
        documents={documents}
        total={total}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
      />
    </div>
  )
}

// ============================================================================
// Client Component Boundary
// ============================================================================

/**
 * Client component that wraps the interactive parts (toolbar, table, dialog).
 * Separated to keep the main page as an RSC.
 */
function AdminDocumentsView({
  documents,
  total,
  page,
  pageSize,
  sortBy,
  sortOrder,
}: {
  documents: AdminDocument[]
  total: number
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: "asc" | "desc"
}) {
  "use client"

  const [selectedIds, setSelectedIds] = React.useState<string[]>([])

  const handleRowClick = (documentId: string) => {
    // Navigate to document detail (future implementation - plan 03)
    console.log("Navigate to document:", documentId)
  }

  const handleBulkDeleteClick = () => {
    // Bulk delete implementation (future - plan 03)
    console.log("Bulk delete:", selectedIds)
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
    </>
  )
}
