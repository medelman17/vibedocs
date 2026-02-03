"use client"

import * as React from "react"
import {
  XIcon,
  MaximizeIcon,
  MinimizeIcon,
  MoreVerticalIcon,
} from "lucide-react"
import { useShellStore } from "@/lib/stores/shell-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ArtifactPaneProps {
  children: React.ReactNode
  title?: string
  icon?: React.ReactNode
  footer?: React.ReactNode
  onExport?: () => void
  onCopyLink?: () => void
}

export function ArtifactPane({
  children,
  title,
  icon,
  footer,
  onExport,
  onCopyLink,
}: ArtifactPaneProps) {
  const { artifact, closeArtifact, toggleArtifactExpanded } = useShellStore()

  return (
    <div data-slot="artifact-pane" className="flex h-full flex-col">
      {/* Header */}
      <div
        className={cn(
          "flex h-10 shrink-0 items-center justify-between gap-2 px-3",
          "border-b border-neutral-200/50"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className="shrink-0 text-neutral-400">{icon}</span>}
          <span className="truncate text-sm font-medium text-neutral-700">
            {title ?? artifact.content?.title ?? "Artifact"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={toggleArtifactExpanded}
            aria-label={artifact.expanded ? "Minimize" : "Maximize"}
          >
            {artifact.expanded ? (
              <MinimizeIcon className="size-3.5" />
            ) : (
              <MaximizeIcon className="size-3.5" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreVerticalIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onCopyLink && (
                <DropdownMenuItem onClick={onCopyLink}>
                  Copy link
                </DropdownMenuItem>
              )}
              {onExport && (
                <DropdownMenuItem onClick={onExport}>Export</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={closeArtifact}
            aria-label="Close"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">{children}</div>

      {/* Footer */}
      {footer && (
        <div
          className={cn(
            "shrink-0 border-t border-neutral-200/50 px-3 py-2",
            "bg-neutral-50/50"
          )}
        >
          {footer}
        </div>
      )}
    </div>
  )
}
