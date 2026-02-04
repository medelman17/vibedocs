"use client"

import * as React from "react"
import { SearchIcon } from "lucide-react"
import { useShellStore } from "@/lib/stores/shell-store"
import { cn } from "@/lib/utils"

interface AppHeaderProps {
  logo?: React.ReactNode
}

export function AppHeader({ logo }: AppHeaderProps) {
  const { togglePalette } = useShellStore()

  return (
    <header
      data-slot="app-header"
      className={cn(
        "flex h-12 shrink-0 items-center justify-between gap-4 px-4",
        "border-b border-neutral-200/50",
        "bg-white/70 backdrop-blur-xl",
        "supports-[backdrop-filter]:bg-white/70"
      )}
    >
      {/* Left - Logo */}
      <div className="flex items-center">
        {logo ?? (
          <span className="text-sm font-semibold tracking-wide text-neutral-900">
            VibeDocs
          </span>
        )}
      </div>

      {/* Center - Command palette trigger */}
      <button
        onClick={togglePalette}
        aria-label="Open command palette"
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg",
          "text-sm text-neutral-500",
          "bg-neutral-100/50 hover:bg-neutral-100",
          "border border-neutral-200/50",
          "transition-colors"
        )}
      >
        <SearchIcon className="size-3.5" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="ml-2 text-xs text-neutral-400 font-mono">⌘K</kbd>
      </button>

      {/* Right - Spacer for symmetry */}
      <div className="w-16" />
    </header>
  )
}
