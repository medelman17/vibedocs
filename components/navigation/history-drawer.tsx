"use client"

import * as React from "react"
import { XIcon, SearchIcon, FileTextIcon, BarChartIcon, MessageSquareIcon } from "lucide-react"
import { useShellStore } from "@/lib/stores/shell-store"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

export interface HistoryItem {
  id: string
  type: "conversation" | "document" | "analysis"
  title: string
  date: Date
  pinned?: boolean
}

interface HistoryDrawerProps {
  items?: HistoryItem[]
  onSelectItem?: (item: HistoryItem) => void
}

export function HistoryDrawer({ items = [], onSelectItem }: HistoryDrawerProps) {
  const { drawer, setDrawerOpen } = useShellStore()
  const [search, setSearch] = React.useState("")

  const filteredItems = React.useMemo(() => {
    if (!search) return items
    const lower = search.toLowerCase()
    return items.filter((item) => item.title.toLowerCase().includes(lower))
  }, [items, search])

  const groupedItems = React.useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

    const groups: { label: string; items: HistoryItem[] }[] = [
      { label: "Pinned", items: [] },
      { label: "Today", items: [] },
      { label: "Yesterday", items: [] },
      { label: "This Week", items: [] },
      { label: "Older", items: [] },
    ]

    for (const item of filteredItems) {
      if (item.pinned) {
        groups[0].items.push(item)
      } else if (item.date >= today) {
        groups[1].items.push(item)
      } else if (item.date >= yesterday) {
        groups[2].items.push(item)
      } else if (item.date >= weekAgo) {
        groups[3].items.push(item)
      } else {
        groups[4].items.push(item)
      }
    }

    return groups.filter((g) => g.items.length > 0)
  }, [filteredItems])

  const getIcon = (type: HistoryItem["type"]) => {
    switch (type) {
      case "conversation":
        return <MessageSquareIcon className="size-4" />
      case "document":
        return <FileTextIcon className="size-4" />
      case "analysis":
        return <BarChartIcon className="size-4" />
    }
  }

  return (
    <Sheet open={drawer.open} onOpenChange={setDrawerOpen}>
      <SheetContent
        side="left"
        className={cn(
          "w-80 p-0",
          "bg-white/90 backdrop-blur-md",
          "border-r border-neutral-200/50"
        )}
        showCloseButton={false}
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b border-neutral-200/50 px-4 py-3">
          <SheetTitle className="text-base font-semibold">History</SheetTitle>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setDrawerOpen(false)}
          >
            <XIcon className="size-4" />
          </Button>
        </SheetHeader>

        <div className="p-3">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-3">
          {groupedItems.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="mb-1 px-2 text-xs font-medium text-neutral-500">
                {group.label}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectItem?.(item)
                    setDrawerOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5",
                    "text-sm text-neutral-700 text-left",
                    "hover:bg-neutral-100 transition-colors"
                  )}
                >
                  <span className="text-neutral-400">{getIcon(item.type)}</span>
                  <span className="truncate">{item.title}</span>
                </button>
              ))}
            </div>
          ))}

          {groupedItems.length === 0 && (
            <div className="py-8 text-center text-sm text-neutral-500">
              {search ? "No results found" : "No history yet"}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
