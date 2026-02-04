"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  BarChartIcon,
  GitCompareIcon,
  PlusIcon,
  HelpCircleIcon,
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
  const isSlashCommand = trimmedValue.startsWith("/")
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

// Hook to handle slash command logic
export function useSlashCommands() {
  const router = useRouter()
  const [inputValue, setInputValue] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const handleCommandSelect = React.useCallback(
    (command: SlashCommand) => {
      // Clear the input
      setInputValue("")

      // Execute the command
      switch (command.id) {
        case "analyze":
          // Trigger file upload
          const fileInput = document.querySelector<HTMLInputElement>(
            'input[type="file"][aria-label="Upload files"]'
          )
          fileInput?.click()
          break
        case "compare":
          router.push("/documents?action=compare")
          break
        case "generate":
          router.push("/generate")
          break
        case "help":
          // Return "help" to be sent as a message
          return "What can VibeDocs help me with?"
      }
      return null
    },
    [router]
  )

  const handleClose = React.useCallback(() => {
    // Just clear the slash if user presses escape
    if (inputValue.trim() === "/") {
      setInputValue("")
    }
  }, [inputValue])

  return {
    inputValue,
    setInputValue,
    textareaRef,
    handleCommandSelect,
    handleClose,
  }
}

export { defaultCommands }
