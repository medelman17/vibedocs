"use client"

import * as React from "react"
import { useShellStore } from "@/lib/stores/shell-store"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { cn } from "@/lib/utils"

interface AppShellProps {
  children: React.ReactNode
  sidebar: React.ReactNode
  header: React.ReactNode
  palette?: React.ReactNode
}

export function AppShell({ children, sidebar, header, palette }: AppShellProps) {
  const chatInputRef = React.useRef<HTMLTextAreaElement>(null)

  const {
    togglePalette,
    toggleSidebar,
    closeTopmost,
    closeArtifact,
    toggleArtifactExpanded,
    artifact,
  } = useShellStore()

  useKeyboardShortcuts({
    onTogglePalette: togglePalette,
    onToggleSidebar: toggleSidebar,
    onCloseTopmost: closeTopmost,
    onFocusChatInput: () => chatInputRef.current?.focus(),
    onCollapseArtifact: () => {
      if (artifact.open) closeArtifact()
    },
    onExpandArtifact: () => {
      if (artifact.open) toggleArtifactExpanded()
    },
  })

  return (
    <ChatInputRefContext.Provider value={chatInputRef}>
      <div
        data-slot="app-shell"
        className={cn(
          "flex h-dvh overflow-hidden",
          "bg-gradient-to-br from-neutral-50 to-neutral-100"
        )}
      >
        {/* Sidebar */}
        <div data-slot="app-shell-sidebar" className="shrink-0">
          {sidebar}
        </div>

        {/* Main content area */}
        <div
          data-slot="app-shell-main"
          className="flex flex-1 flex-col overflow-hidden"
        >
          {/* Header */}
          <div data-slot="app-shell-header">{header}</div>

          {/* Body */}
          <div
            data-slot="app-shell-body"
            className="relative flex flex-1 overflow-hidden"
          >
            {children}
          </div>
        </div>

        {/* Overlays */}
        {palette}
      </div>
    </ChatInputRefContext.Provider>
  )
}

// Context for chat input focus
export const ChatInputRefContext = React.createContext<React.RefObject<HTMLTextAreaElement | null> | null>(null)

export function useChatInputRef() {
  const ref = React.useContext(ChatInputRefContext)
  if (!ref) {
    throw new Error("useChatInputRef must be used within AppShell")
  }
  return ref
}
