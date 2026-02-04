"use client"

import * as React from "react"
import {
  BarChartIcon,
  GitCompareIcon,
  PlusIcon,
  HelpCircleIcon,
  FileTextIcon,
  FileSearchIcon,
} from "lucide-react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// ============================================================================
// Slash Commands (/)
// ============================================================================

export interface SlashCommand {
  id: string
  name: string
  description: string
  icon: React.ReactNode
}

const defaultCommands: SlashCommand[] = [
  {
    id: "analyze",
    name: "/analyze",
    description: "Upload and analyze an NDA",
    icon: <BarChartIcon className="size-4" />,
  },
  {
    id: "compare",
    name: "/compare",
    description: "Compare two documents",
    icon: <GitCompareIcon className="size-4" />,
  },
  {
    id: "generate",
    name: "/generate",
    description: "Generate a new NDA",
    icon: <PlusIcon className="size-4" />,
  },
  {
    id: "help",
    name: "/help",
    description: "Get help with VibeDocs",
    icon: <HelpCircleIcon className="size-4" />,
  },
]

interface SlashCommandsProps {
  inputValue: string
  onSelect: (command: SlashCommand) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  commands?: SlashCommand[]
}

export function SlashCommands({
  inputValue,
  onSelect,
  onClose,
  anchorRef,
  commands = defaultCommands,
}: SlashCommandsProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  // Check if we should show the popover
  const trimmedValue = inputValue.trim()
  const isSlashCommand = trimmedValue.startsWith("/") && !trimmedValue.includes(" ")
  const query = isSlashCommand ? trimmedValue.slice(1).toLowerCase() : ""

  // Filter commands based on query
  const filteredCommands = React.useMemo(() => {
    if (!query) return commands
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query)
    )
  }, [commands, query])

  const isOpen = isSlashCommand && filteredCommands.length > 0

  // Reset selected index when filtered commands change
  React.useEffect(() => {
    setSelectedIndex(0)
  }, [filteredCommands.length])

  // Handle keyboard navigation
  React.useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((i) => (i + 1) % filteredCommands.length)
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((i) =>
            i === 0 ? filteredCommands.length - 1 : i - 1
          )
          break
        case "Enter":
          e.preventDefault()
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex])
          }
          break
        case "Escape":
          e.preventDefault()
          onClose()
          break
        case "Tab":
          e.preventDefault()
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex])
          }
          break
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, filteredCommands, selectedIndex, onSelect, onClose])

  if (!isOpen) return null

  return (
    <Popover open={isOpen}>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        className="w-[300px] p-0"
        align="start"
        side="top"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandList>
            <CommandEmpty>No commands found.</CommandEmpty>
            <CommandGroup heading="Commands">
              {filteredCommands.map((cmd, index) => (
                <CommandItem
                  key={cmd.id}
                  onSelect={() => onSelect(cmd)}
                  className={cn(
                    "gap-2 cursor-pointer",
                    index === selectedIndex && "bg-accent"
                  )}
                >
                  <span className="text-muted-foreground">{cmd.icon}</span>
                  <span className="font-mono text-sm">{cmd.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {cmd.description}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// @ Mentions
// ============================================================================

export interface Mention {
  id: string
  type: "document" | "analysis"
  name: string
  description?: string
}

interface MentionsProps {
  inputValue: string
  onSelect: (mention: Mention) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  documents?: Mention[]
  analyses?: Mention[]
}

// Default placeholder items - in production these would come from database
const defaultDocuments: Mention[] = [
  { id: "doc-1", type: "document", name: "Acme NDA", description: "Uploaded 2 days ago" },
  { id: "doc-2", type: "document", name: "TechCorp Agreement", description: "Uploaded 1 week ago" },
]

const defaultAnalyses: Mention[] = [
  { id: "analysis-1", type: "analysis", name: "Acme NDA Analysis", description: "Completed" },
  { id: "analysis-2", type: "analysis", name: "TechCorp Analysis", description: "In progress" },
]

export function Mentions({
  inputValue,
  onSelect,
  onClose,
  anchorRef,
  documents = defaultDocuments,
  analyses = defaultAnalyses,
}: MentionsProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  // Check if we should show the popover - look for @ not at start of word
  const trimmedValue = inputValue.trim()

  // Find the last @ that starts a mention (not preceded by non-whitespace)
  const lastAtIndex = trimmedValue.lastIndexOf("@")
  const isMention = lastAtIndex !== -1 &&
    (lastAtIndex === 0 || /\s/.test(trimmedValue[lastAtIndex - 1]))

  const query = isMention
    ? trimmedValue.slice(lastAtIndex + 1).toLowerCase().split(/\s/)[0]
    : ""

  // Combine and filter items
  const allItems = React.useMemo(() => [...documents, ...analyses], [documents, analyses])

  const filteredItems = React.useMemo(() => {
    if (!query) return allItems
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
    )
  }, [allItems, query])

  const isOpen = isMention && filteredItems.length > 0

  // Reset selected index when filtered items change
  React.useEffect(() => {
    setSelectedIndex(0)
  }, [filteredItems.length])

  // Handle keyboard navigation
  React.useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((i) => (i + 1) % filteredItems.length)
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((i) =>
            i === 0 ? filteredItems.length - 1 : i - 1
          )
          break
        case "Enter":
          e.preventDefault()
          if (filteredItems[selectedIndex]) {
            onSelect(filteredItems[selectedIndex])
          }
          break
        case "Escape":
          e.preventDefault()
          onClose()
          break
        case "Tab":
          e.preventDefault()
          if (filteredItems[selectedIndex]) {
            onSelect(filteredItems[selectedIndex])
          }
          break
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, filteredItems, selectedIndex, onSelect, onClose])

  if (!isOpen) return null

  const documentItems = filteredItems.filter((i) => i.type === "document")
  const analysisItems = filteredItems.filter((i) => i.type === "analysis")

  return (
    <Popover open={isOpen}>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        className="w-[300px] p-0"
        align="start"
        side="top"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandList>
            <CommandEmpty>No documents or analyses found.</CommandEmpty>
            {documentItems.length > 0 && (
              <CommandGroup heading="Documents">
                {documentItems.map((item) => {
                  const globalIdx = filteredItems.indexOf(item)
                  return (
                    <CommandItem
                      key={item.id}
                      onSelect={() => onSelect(item)}
                      className={cn(
                        "gap-2 cursor-pointer",
                        globalIdx === selectedIndex && "bg-accent"
                      )}
                    >
                      <FileTextIcon className="size-4 text-muted-foreground" />
                      <span className="text-sm">{item.name}</span>
                      {item.description && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
            {analysisItems.length > 0 && (
              <CommandGroup heading="Analyses">
                {analysisItems.map((item) => {
                  const globalIdx = filteredItems.indexOf(item)
                  return (
                    <CommandItem
                      key={item.id}
                      onSelect={() => onSelect(item)}
                      className={cn(
                        "gap-2 cursor-pointer",
                        globalIdx === selectedIndex && "bg-accent"
                      )}
                    >
                      <FileSearchIcon className="size-4 text-muted-foreground" />
                      <span className="text-sm">{item.name}</span>
                      {item.description && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// Combined Input Autocomplete
// ============================================================================

interface InputAutocompleteProps {
  inputValue: string
  onSlashCommand: (command: SlashCommand) => void
  onMention: (mention: Mention) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  documents?: Mention[]
  analyses?: Mention[]
}

export function InputAutocomplete({
  inputValue,
  onSlashCommand,
  onMention,
  onClose,
  anchorRef,
  documents,
  analyses,
}: InputAutocompleteProps) {
  // Determine which autocomplete to show based on input
  const trimmedValue = inputValue.trim()
  const isSlash = trimmedValue.startsWith("/") && !trimmedValue.includes(" ")
  const hasAt = trimmedValue.includes("@")

  if (isSlash) {
    return (
      <SlashCommands
        inputValue={inputValue}
        onSelect={onSlashCommand}
        onClose={onClose}
        anchorRef={anchorRef}
      />
    )
  }

  if (hasAt) {
    return (
      <Mentions
        inputValue={inputValue}
        onSelect={onMention}
        onClose={onClose}
        anchorRef={anchorRef}
        documents={documents}
        analyses={analyses}
      />
    )
  }

  return null
}

export { defaultCommands, defaultDocuments, defaultAnalyses }
