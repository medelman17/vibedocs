"use client"

import * as React from "react"
import { SearchIcon, ChevronUpIcon, ChevronDownIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useDocumentSearch } from "@/hooks/use-document-search"

// ============================================================================
// DocumentSearch Component
// ============================================================================

interface DocumentSearchProps {
  text: string
  paragraphOffsets: number[]
  onScrollToMatch: (paragraphIndex: number) => void
  isOpen: boolean
  onClose: () => void
}

export function DocumentSearch({
  text,
  paragraphOffsets,
  onScrollToMatch,
  isOpen,
  onClose,
}: DocumentSearchProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const {
    query,
    setQuery,
    totalMatches,
    activeMatchIndex,
    activeMatch,
    nextMatch,
    prevMatch,
  } = useDocumentSearch(text, paragraphOffsets)

  // Focus input when search opens
  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Scroll to active match when it changes
  React.useEffect(() => {
    if (activeMatch) {
      onScrollToMatch(activeMatch.paragraphIndex)
    }
  }, [activeMatch, onScrollToMatch])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (e.shiftKey) {
        prevMatch()
      } else {
        nextMatch()
      }
    }
    if (e.key === "Escape") {
      e.preventDefault()
      handleClose()
    }
  }

  const handleClose = () => {
    setQuery("")
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-1.5">
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search document..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-7 flex-1 border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
      />
      {/* Match count */}
      <span
        className={cn(
          "shrink-0 text-xs text-muted-foreground",
          query.length >= 2 && totalMatches === 0 && "text-destructive"
        )}
      >
        {query.length >= 2
          ? totalMatches > 0
            ? `${activeMatchIndex + 1} of ${totalMatches}`
            : "No matches"
          : ""}
      </span>
      {/* Prev/Next buttons */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={prevMatch}
          disabled={totalMatches === 0}
          aria-label="Previous match"
        >
          <ChevronUpIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={nextMatch}
          disabled={totalMatches === 0}
          aria-label="Next match"
        >
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </div>
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleClose}
        aria-label="Close search"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  )
}
