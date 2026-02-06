"use client"

/**
 * @fileoverview Toolbar for admin documents table
 *
 * Provides search, filters, and bulk delete controls:
 * - Debounced search input
 * - Status, file type, and date range filters
 * - Bulk delete button (visible when rows selected)
 * - All state stored in URL search params
 *
 * @module app/(admin)/admin/toolbar
 */

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { SearchIcon, Trash2Icon, UploadIcon, Loader2Icon } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { uploadDocument } from "@/app/(main)/(dashboard)/documents/actions"
import { adminInitiateAnalysis } from "./actions"
import { toast } from "sonner"

// ============================================================================
// Types
// ============================================================================

interface ToolbarProps {
  selectedCount: number
  onBulkDelete: () => void
}

// ============================================================================
// Component
// ============================================================================

export function Toolbar({ selectedCount, onBulkDelete }: ToolbarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)

  // Local search input state for debouncing
  const [searchInput, setSearchInput] = React.useState(
    searchParams.get("search") ?? ""
  )

  // Read current filter values from URL
  const currentStatus = searchParams.get("status") ?? "all"
  const currentFileType = searchParams.get("fileType") ?? "all"
  const currentDateRange = searchParams.get("dateRange") ?? "all"

  // Debounced search effect
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (searchInput.trim()) {
        params.set("search", searchInput.trim())
      } else {
        params.delete("search")
      }
      params.set("page", "1") // Reset to page 1 on search change
      router.replace(`?${params.toString()}`, { scroll: false })
    }, 300)

    return () => clearTimeout(timer)
  }, [searchInput, searchParams, router])

  // Helper to update URL params
  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "all") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.set("page", "1") // Reset to page 1 on filter change
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const uploadResult = await uploadDocument(formData)
      if (!uploadResult.success) {
        toast.error(uploadResult.error.message ?? "Upload failed")
        return
      }

      const analysisResult = await adminInitiateAnalysis({
        documentId: uploadResult.data.id,
      })
      if (!analysisResult.success) {
        toast.error(analysisResult.error.message ?? "Failed to trigger analysis")
      } else {
        toast.success("Document uploaded and analysis started")
      }

      router.refresh()
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search bar */}
      <div className="relative flex-1 min-w-[200px] max-w-[400px]">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search documents..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Status filter */}
      <Select value={currentStatus} onValueChange={(v) => updateFilter("status", v)}>
        <SelectTrigger size="sm" className="w-[160px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="parsing">Processing</SelectItem>
          <SelectItem value="ready">Complete</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      {/* File type filter */}
      <Select
        value={currentFileType}
        onValueChange={(v) => updateFilter("fileType", v)}
      >
        <SelectTrigger size="sm" className="w-[120px]">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="application/pdf">PDF</SelectItem>
          <SelectItem value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
            DOCX
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Date range filter */}
      <Select
        value={currentDateRange}
        onValueChange={(v) => updateFilter("dateRange", v)}
      >
        <SelectTrigger size="sm" className="w-[140px]">
          <SelectValue placeholder="All time" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All time</SelectItem>
          <SelectItem value="7d">Last 7 days</SelectItem>
          <SelectItem value="30d">Last 30 days</SelectItem>
          <SelectItem value="90d">Last 90 days</SelectItem>
        </SelectContent>
      </Select>

      {/* Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
        onChange={handleUpload}
        className="hidden"
      />
      <Button
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={selectedCount > 0 ? "" : "ml-auto"}
      >
        {uploading ? (
          <Loader2Icon className="size-4 mr-1 animate-spin" />
        ) : (
          <UploadIcon className="size-4 mr-1" />
        )}
        {uploading ? "Uploading..." : "Upload"}
      </Button>

      {/* Bulk delete button */}
      {selectedCount > 0 && (
        <Button
          variant="destructive"
          size="sm"
          onClick={onBulkDelete}
        >
          <Trash2Icon className="size-4 mr-1" />
          Delete ({selectedCount})
        </Button>
      )}
    </div>
  )
}
