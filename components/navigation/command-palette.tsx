"use client"

import * as React from "react"
import {
  FileTextIcon,
  BarChartIcon,
  GitCompareIcon,
  PlusIcon,
  HelpCircleIcon,
} from "lucide-react"
import { useShellStore } from "@/lib/stores/shell-store"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

interface PaletteItem {
  id: string
  type: "command" | "document" | "analysis" | "conversation"
  title: string
  description?: string
  icon?: React.ReactNode
  action?: () => void
}

interface CommandPaletteProps {
  recentItems?: PaletteItem[]
  onSelectItem?: (item: PaletteItem) => void
  onCommand?: (command: string) => void
}

const defaultCommands: PaletteItem[] = [
  {
    id: "analyze",
    type: "command",
    title: "/analyze",
    description: "Start new analysis",
    icon: <BarChartIcon className="size-4" />,
  },
  {
    id: "compare",
    type: "command",
    title: "/compare",
    description: "Compare documents",
    icon: <GitCompareIcon className="size-4" />,
  },
  {
    id: "generate",
    type: "command",
    title: "/generate",
    description: "Create new NDA",
    icon: <PlusIcon className="size-4" />,
  },
  {
    id: "help",
    type: "command",
    title: "/help",
    description: "Show help",
    icon: <HelpCircleIcon className="size-4" />,
  },
]

export function CommandPalette({
  recentItems = [],
  onSelectItem,
  onCommand,
}: CommandPaletteProps) {
  const { palette, setPaletteOpen } = useShellStore()

  const handleSelect = (item: PaletteItem) => {
    setPaletteOpen(false)
    if (item.type === "command") {
      onCommand?.(item.id)
    } else {
      onSelectItem?.(item)
    }
    item.action?.()
  }

  const getIcon = (item: PaletteItem) => {
    if (item.icon) return item.icon
    switch (item.type) {
      case "document":
        return <FileTextIcon className="size-4" />
      case "analysis":
        return <BarChartIcon className="size-4" />
      default:
        return null
    }
  }

  return (
    <CommandDialog open={palette.open} onOpenChange={setPaletteOpen}>
      <CommandInput placeholder="Search commands and documents..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {recentItems.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentItems.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => handleSelect(item)}
                  className="gap-2"
                >
                  <span className="text-neutral-400">{getIcon(item)}</span>
                  <span>{item.title}</span>
                  {item.description && (
                    <span className="ml-auto text-xs text-neutral-400">
                      {item.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Commands">
          {defaultCommands.map((item) => (
            <CommandItem
              key={item.id}
              onSelect={() => handleSelect(item)}
              className="gap-2"
            >
              <span className="text-neutral-400">{item.icon}</span>
              <span className="font-mono text-sm">{item.title}</span>
              <span className="ml-2 text-neutral-500">{item.description}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

export type { PaletteItem }
