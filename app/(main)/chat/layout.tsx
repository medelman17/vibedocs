"use client"

import * as React from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar, type HistoryItem } from "@/components/shell"
import { CommandPalette } from "@/components/navigation"
import { useShellStore } from "@/lib/stores/shell-store"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { Separator } from "@/components/ui/separator"
import { getConversations } from "./actions"

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const {
    togglePalette,
    closeArtifact,
    toggleArtifactExpanded,
    palette,
    artifact,
    setPaletteOpen,
    openArtifact,
  } = useShellStore()

  const [historyItems, setHistoryItems] = React.useState<HistoryItem[]>([])

  // Fetch conversation history on mount
  React.useEffect(() => {
    async function loadHistory() {
      const result = await getConversations({ limit: 20, offset: 0 })
      if (result.success) {
        const items: HistoryItem[] = result.data.map((conv) => ({
          id: conv.id,
          type: "conversation" as const,
          title: conv.title,
          date: new Date(conv.lastMessageAt),
          pinned: false,
        }))
        setHistoryItems(items)
      }
    }
    loadHistory()
  }, [])

  // Handle selecting a history item
  const handleSelectItem = React.useCallback(
    (item: HistoryItem) => {
      if (item.type === "conversation") {
        // Navigate to the conversation
        window.location.href = `/chat?conversation=${item.id}`
      } else if (item.type === "document") {
        openArtifact({ type: "document", id: item.id, title: item.title })
      } else if (item.type === "analysis") {
        openArtifact({ type: "analysis", id: item.id, title: item.title })
      }
    },
    [openArtifact]
  )

  // Wire up keyboard shortcuts
  useKeyboardShortcuts({
    onTogglePalette: togglePalette,
    onToggleSidebar: () => {}, // Handled by shadcn sidebar internally
    onFocusChatInput: () => {
      // Focus the textarea in the prompt input
      const textarea = document.querySelector<HTMLTextAreaElement>(
        '[data-slot="input-group"] textarea'
      )
      textarea?.focus()
    },
    onCollapseArtifact: closeArtifact,
    onExpandArtifact: toggleArtifactExpanded,
    onCloseTopmost: () => {
      // Close in order: palette > artifact
      if (palette.open) {
        setPaletteOpen(false)
      } else if (artifact.open) {
        closeArtifact()
      }
    },
  })

  return (
    <SidebarProvider>
      <AppSidebar
        items={historyItems}
        onSelectItem={handleSelectItem}
        onOpenCommandPalette={togglePalette}
        onNewChat={() => {
          // Hard reload to clear all local state (messages, artifact, etc.)
          window.location.href = "/chat"
        }}
        // TODO: Wire up user and org data
        // organizations={userOrgs}
        // currentOrg={activeOrg}
        // user={currentUser}
        // onSwitchOrg={handleSwitchOrg}
        // onOpenSettings={handleOpenSettings}
        // onSignOut={handleSignOut}
      />
      <SidebarInset className="overflow-hidden">
        {/* Header with sidebar trigger */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-semibold">VibeDocs</span>
        </header>

        {/* Main content */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </SidebarInset>

      {/* Command palette overlay */}
      <CommandPalette />
    </SidebarProvider>
  )
}
