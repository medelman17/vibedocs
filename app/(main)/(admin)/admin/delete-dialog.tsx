"use client"

/**
 * @fileoverview Delete confirmation dialogs
 *
 * Provides two dialog variants:
 * - SingleDeleteDialog: Confirm deletion of one document
 * - BulkDeleteDialog: Confirm deletion of multiple documents
 *
 * @module app/(admin)/admin/delete-dialog
 */

import * as React from "react"
import { Loader2Icon } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { adminDeleteDocument, adminBulkDeleteDocuments } from "./actions"
import { toast } from "sonner"

// ============================================================================
// Single Delete Dialog
// ============================================================================

interface SingleDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentTitle: string
  documentId: string
  onConfirm: () => void
}

export function SingleDeleteDialog({
  open,
  onOpenChange,
  documentTitle,
  documentId,
  onConfirm,
}: SingleDeleteDialogProps) {
  const [deleting, setDeleting] = React.useState(false)

  const handleConfirm = async () => {
    setDeleting(true)
    const result = await adminDeleteDocument({ documentId })
    setDeleting(false)

    if (!result.success) {
      toast.error(result.error.message ?? "Failed to delete document")
      return
    }

    toast.success(result.data.message)
    onOpenChange(false)
    onConfirm()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Document</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{documentTitle}&quot;? This will
            permanently remove the document and all associated analyses, chunks,
            and classifications. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={deleting}
          >
            {deleting && <Loader2Icon className="size-4 mr-2 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ============================================================================
// Bulk Delete Dialog
// ============================================================================

interface BulkDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentIds: string[]
  onConfirm: () => void
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  documentIds,
  onConfirm,
}: BulkDeleteDialogProps) {
  const [deleting, setDeleting] = React.useState(false)

  const handleConfirm = async () => {
    setDeleting(true)
    const result = await adminBulkDeleteDocuments({ documentIds })
    setDeleting(false)

    if (!result.success) {
      toast.error(result.error.message ?? "Failed to delete documents")
      return
    }

    const { deleted, errors } = result.data

    if (errors.length > 0) {
      toast.error(
        `Deleted ${deleted} of ${documentIds.length} documents. ${errors.length} errors occurred.`
      )
    } else {
      toast.success(`Successfully deleted ${deleted} document${deleted === 1 ? "" : "s"}`)
    }

    onOpenChange(false)
    onConfirm()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {documentIds.length} Documents</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete {documentIds.length} documents? This
            will permanently remove all selected documents and their associated
            data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={deleting}
          >
            {deleting && <Loader2Icon className="size-4 mr-2 animate-spin" />}
            Delete {documentIds.length} Document{documentIds.length === 1 ? "" : "s"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
