"use client"

import * as React from "react"
import { FileTextIcon, FileIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input"
import type { FileUIPart } from "ai"

/**
 * Displays a preview of attached files with remove buttons.
 * Integrates with PromptInput's attachment context.
 */
export function AttachmentPreview({
  className,
}: {
  className?: string
}) {
  const { files, remove } = usePromptInputAttachments()

  if (files.length === 0) {
    return null
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {files.map((file) => (
        <AttachmentChip
          key={file.id}
          file={file}
          onRemove={() => remove(file.id)}
        />
      ))}
    </div>
  )
}

/**
 * Individual attachment chip with file info and remove button.
 */
function AttachmentChip({
  file,
  onRemove,
}: {
  file: FileUIPart & { id: string }
  onRemove: () => void
}) {
  const icon = getFileIcon(file.mediaType, file.filename)
  const displayName = truncateFilename(file.filename || "Attachment")
  const fileSize = file.url?.startsWith("blob:") ? null : null // Size not available from blob URL

  return (
    <div className="group relative flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 transition-colors hover:bg-muted">
      <div className="shrink-0">{icon}</div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{displayName}</span>
        {fileSize && (
          <span className="text-muted-foreground text-xs">{fileSize}</span>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="ml-2 shrink-0 opacity-60 transition-opacity hover:opacity-100"
        onClick={onRemove}
        aria-label={`Remove ${displayName}`}
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  )
}

/**
 * Returns appropriate icon for file type.
 */
function getFileIcon(mediaType?: string, filename?: string) {
  // Check media type first
  if (mediaType?.startsWith("application/pdf") || filename?.endsWith(".pdf")) {
    return <FileTextIcon className="size-4 text-red-500" />
  }

  if (
    mediaType?.includes("wordprocessingml") ||
    mediaType?.includes("msword") ||
    filename?.endsWith(".docx") ||
    filename?.endsWith(".doc")
  ) {
    return <FileTextIcon className="size-4 text-blue-500" />
  }

  if (mediaType?.startsWith("text/") || filename?.endsWith(".txt")) {
    return <FileTextIcon className="size-4 text-gray-500" />
  }

  // Default file icon
  return <FileIcon className="size-4 text-muted-foreground" />
}

/**
 * Truncates long filenames while preserving extension.
 */
function truncateFilename(filename: string, maxLength: number = 30): string {
  if (filename.length <= maxLength) {
    return filename
  }

  const lastDotIndex = filename.lastIndexOf(".")
  if (lastDotIndex === -1) {
    return filename.slice(0, maxLength - 3) + "..."
  }

  const extension = filename.slice(lastDotIndex)
  const name = filename.slice(0, lastDotIndex)
  const availableLength = maxLength - extension.length - 3 // 3 for "..."

  if (availableLength <= 0) {
    return "..." + extension
  }

  return name.slice(0, availableLength) + "..." + extension
}
