"use client"

/**
 * @fileoverview Admin documents data table component
 *
 * Client component rendering TanStack Table with:
 * - Server-side pagination (manual mode)
 * - Server-side sorting (manual mode)
 * - Row selection for bulk operations
 * - Numbered pagination with page size selector
 * - URL-based state (all state in search params)
 *
 * @module app/(admin)/admin/documents-table
 */

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table"
import { ChevronUp, ChevronDown, FileIcon } from "lucide-react"
import { columns, type AdminDocument } from "./columns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// ============================================================================
// Types
// ============================================================================

interface DocumentsTableProps {
  data: AdminDocument[]
  total: number
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: "asc" | "desc"
  onRowClick: (documentId: string) => void
}

// ============================================================================
// Component
// ============================================================================

export function DocumentsTable({
  data,
  total,
  page,
  pageSize,
  sortBy,
  sortOrder = "desc",
  onRowClick,
}: DocumentsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Determine if filters are active
  const hasActiveFilters = React.useMemo(() => {
    const search = searchParams.get("search")
    const status = searchParams.get("status")
    const fileType = searchParams.get("fileType")
    const dateRange = searchParams.get("dateRange")
    return !!(
      (search && search.length > 0) ||
      (status && status.length > 0) ||
      (fileType && fileType.length > 0) ||
      (dateRange && dateRange.length > 0 && dateRange !== "all")
    )
  }, [searchParams])

  // Initialize sorting state from URL
  const [sorting, setSorting] = React.useState<SortingState>(() => {
    if (!sortBy) return []
    return [{ id: sortBy, desc: sortOrder === "desc" }]
  })

  // Initialize row selection state
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  // Calculate page count
  const pageCount = Math.ceil(total / pageSize)

  // TanStack Table instance
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount,
    state: {
      sorting,
      rowSelection,
      pagination: {
        pageIndex: page - 1,
        pageSize,
      },
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
  })

  // Update URL when sorting changes
  React.useEffect(() => {
    if (sorting.length === 0) return

    const sort = sorting[0]
    if (!sort) return

    const params = new URLSearchParams(searchParams.toString())
    params.set("sortBy", sort.id)
    params.set("sortOrder", sort.desc ? "desc" : "asc")
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [sorting, searchParams, router])

  // Helper to update URL params
  const updateParams = (updates: Record<string, string | number>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      params.set(key, String(value))
    })
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  // Handler for page change
  const handlePageChange = (newPage: number) => {
    updateParams({ page: newPage })
  }

  // Handler for page size change
  const handlePageSizeChange = (newSize: string) => {
    updateParams({ size: newSize, page: 1 })
  }

  // Handler to clear all filters
  const handleClearFilters = () => {
    router.replace("/admin", { scroll: false })
  }

  // Get selected row IDs
  const selectedRowIds = React.useMemo(() => {
    return Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => data[Number(key)]?.id)
      .filter(Boolean) as string[]
  }, [rowSelection, data])

  // Generate page numbers for pagination
  const pageNumbers = React.useMemo(() => {
    const pages: (number | "ellipsis")[] = []
    const maxVisible = 7

    if (pageCount <= maxVisible) {
      // Show all pages
      for (let i = 1; i <= pageCount; i++) {
        pages.push(i)
      }
    } else {
      // Always show first page
      pages.push(1)

      // Calculate range around current page
      const start = Math.max(2, page - 1)
      const end = Math.min(pageCount - 1, page + 1)

      // Add ellipsis after first if needed
      if (start > 2) {
        pages.push("ellipsis")
      }

      // Add pages around current
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      // Add ellipsis before last if needed
      if (end < pageCount - 1) {
        pages.push("ellipsis")
      }

      // Always show last page
      pages.push(pageCount)
    }

    return pages
  }, [page, pageCount])

  // Empty state
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileIcon className="size-12 text-muted-foreground/50 mb-4" />
        {hasActiveFilters ? (
          <>
            <p className="text-muted-foreground mb-2">
              No documents match your filters.
            </p>
            <button
              onClick={handleClearFilters}
              className="text-primary text-sm underline hover:no-underline"
            >
              Clear filters
            </button>
          </>
        ) : (
          <p className="text-muted-foreground">
            No documents yet. Upload your first NDA to get started.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const isSorted = header.column.getIsSorted()

                  return (
                    <TableHead
                      key={header.id}
                      className={cn(canSort && "cursor-pointer select-none")}
                      onClick={() => {
                        if (canSort) {
                          header.column.toggleSorting()
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {canSort && (
                          <span className="ml-auto">
                            {isSorted === "asc" ? (
                              <ChevronUp className="size-4" />
                            ) : isSorted === "desc" ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronDown className="size-4 opacity-0 group-hover:opacity-50" />
                            )}
                          </span>
                        )}
                      </div>
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className="cursor-pointer"
                onClick={() => onRowClick(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-4 px-2">
        {/* Left: Info + selected count */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, total)} of {total} documents
          </span>
          {selectedRowIds.length > 0 && (
            <span className="text-foreground font-medium">
              {selectedRowIds.length} selected
            </span>
          )}
        </div>

        {/* Center: Page numbers */}
        {pageCount > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  className={cn(
                    page === 1 && "pointer-events-none opacity-50"
                  )}
                />
              </PaginationItem>

              {pageNumbers.map((pageNum, idx) =>
                pageNum === "ellipsis" ? (
                  <PaginationItem key={`ellipsis-${idx}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => handlePageChange(pageNum)}
                      isActive={pageNum === page}
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}

              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    handlePageChange(Math.min(pageCount, page + 1))
                  }
                  className={cn(
                    page === pageCount && "pointer-events-none opacity-50"
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}

        {/* Right: Page size selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Rows per page
          </span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger size="sm" className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

// Export selected row IDs for use by parent (toolbar)
export function useSelectedRows(table: ReturnType<typeof useReactTable>) {
  return React.useMemo(() => {
    const selection = table.getState().rowSelection
    return Object.keys(selection)
      .filter((key) => selection[key])
      .map((key) => table.getRow(key).original.id)
  }, [table])
}
