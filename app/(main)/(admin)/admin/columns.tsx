"use client"

/**
 * @fileoverview Column definitions for admin documents data table
 *
 * Defines TanStack Table columns for the admin documents view:
 * - Checkbox column for bulk selection
 * - Title, upload date, status, file type, file size
 * - All columns except checkbox are sortable
 *
 * @module app/(admin)/admin/columns
 */

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ============================================================================
// Types
// ============================================================================

export type AdminDocument = {
  id: string
  title: string
  status: string
  fileType: string
  fileSize: number | null
  createdAt: Date
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatFileType(mimeType: string): string {
  if (mimeType.includes("pdf")) return "PDF"
  if (mimeType.includes("wordprocessingml") || mimeType.includes("msword"))
    return "DOCX"
  return mimeType.split("/")[1]?.toUpperCase() ?? "Unknown"
}

function getStatusBadgeVariant(
  status: string
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "pending":
      return "default"
    case "parsing":
    case "embedding":
    case "analyzing":
      return "secondary"
    case "ready":
    case "complete":
      return "outline"
    case "failed":
      return "destructive"
    default:
      return "secondary"
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending"
    case "parsing":
    case "embedding":
    case "analyzing":
      return "Processing"
    case "ready":
    case "complete":
      return "Complete"
    case "failed":
      return "Failed"
    case "cancelled":
      return "Cancelled"
    default:
      return status
  }
}

// ============================================================================
// Column Definitions
// ============================================================================

export const columns: ColumnDef<AdminDocument>[] = [
  // Select checkbox column
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },

  // Title column
  {
    accessorKey: "title",
    header: "Name",
    cell: ({ row }) => {
      const title = row.getValue<string>("title")
      const shouldTruncate = title.length > 60
      return (
        <span
          className={cn("font-medium", shouldTruncate && "truncate max-w-[400px] block")}
          title={shouldTruncate ? title : undefined}
        >
          {title}
        </span>
      )
    },
  },

  // Upload date column
  {
    accessorKey: "createdAt",
    header: "Upload Date",
    cell: ({ row }) => {
      const date = row.getValue<Date>("createdAt")
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(date))
    },
  },

  // Status column
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue<string>("status")
      const variant = getStatusBadgeVariant(status)
      const label = getStatusLabel(status)
      return (
        <Badge
          variant={variant}
          className={cn(
            status === "ready" || status === "complete"
              ? "text-green-700 dark:text-green-400"
              : ""
          )}
        >
          {label}
        </Badge>
      )
    },
  },

  // File type column
  {
    accessorKey: "fileType",
    header: "Type",
    cell: ({ row }) => {
      const fileType = row.getValue<string>("fileType")
      return formatFileType(fileType)
    },
  },

  // File size column
  {
    accessorKey: "fileSize",
    header: "Size",
    cell: ({ row }) => {
      const fileSize = row.getValue<number | null>("fileSize")
      return formatFileSize(fileSize)
    },
  },
]
