"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar, type User, type HistoryItem } from "@/components/shell"
import { CommandPalette } from "@/components/navigation"
import { useShellStore } from "@/lib/stores/shell-store"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { signOutAction } from "@/app/(main)/(auth)/actions"
import { getConversations, deleteConversation } from "./actions"

interface ChatLayoutClientProps {
  children: React.ReactNode
  user: User
}

export function ChatLayoutClient({ children, user }: ChatLayoutClientProps) {
  const router = useRouter()
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
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [itemToDelete, setItemToDelete] = React.useState<HistoryItem | null>(null)

  // Load conversation history
  const loadHistory = React.useCallback(async () => {
    const result = await getConversations({ limit: 20, offset: 0 })
    if (result.success) {
      const items: HistoryItem[] = result.data.map((conv) => ({
        id: conv.id,
        type: "conversation" as const,
        title: conv.title,
        date: conv.lastMessageAt,
      }))
      setHistoryItems(items)
    }
  }, [])

  // Load on mount and listen for refresh events
  React.useEffect(() => {
    loadHistory()

    // Listen for refresh events from child components
    const handleRefresh = () => loadHistory()
    window.addEventListener("refresh-chat-history", handleRefresh)
    return () => window.removeEventListener("refresh-chat-history", handleRefresh)
  }, [loadHistory])

  // Handle history item selection
  const handleSelectItem = (item: HistoryItem) => {
    if (item.type === "conversation") {
      router.push(`/chat?conversation=${item.id}`)
    } else if (item.type === "document") {
      openArtifact({ type: "document", id: item.id, title: item.title })
    } else if (item.type === "analysis") {
      openArtifact({ type: "analysis", id: item.id, title: item.title })
    }
  }

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

  const handleSignOut = async () => {
    const result = await signOutAction()
    if (!result.success) {
      // Log error but don't block - user can retry
      console.error("Sign out failed:", result.error.message)
    }
  }

  const handleDeleteItem = (item: HistoryItem) => {
    setItemToDelete(item)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!itemToDelete) return

    if (itemToDelete.type === "conversation") {
      const result = await deleteConversation(itemToDelete.id)
      if (result.success) {
        // Refresh history to remove deleted item
        await loadHistory()

        // If we're viewing the deleted conversation, redirect to chat home
        const searchParams = new URLSearchParams(window.location.search)
        const currentConversationId = searchParams.get("conversation")
        if (currentConversationId === itemToDelete.id) {
          router.push("/chat")
        }
      } else {
        console.error("Delete failed:", result.error.message)
      }
    }

    setDeleteDialogOpen(false)
    setItemToDelete(null)
  }

  return (
    <SidebarProvider>
      <AppSidebar
        items={historyItems}
        onSelectItem={handleSelectItem}
        onDeleteItem={handleDeleteItem}
        onOpenCommandPalette={togglePalette}
        onNewChat={() => {
          // Hard reload to clear all local state (messages, artifact, etc.)
          window.location.href = "/chat"
        }}
        user={user}
        onSignOut={handleSignOut}
        // TODO: Wire up remaining data and handlers
        // organizations={userOrgs}
        // currentOrg={activeOrg}
        // onSwitchOrg={handleSwitchOrg}
        // onOpenSettings={handleOpenSettings}
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        {/* Header with sidebar trigger */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-semibold">VibeDocs</span>
        </header>

        {/* Main content - min-h-0 allows flex child to shrink below content size */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </SidebarInset>

      {/* Command palette overlay */}
      <CommandPalette />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{itemToDelete?.title}&quot; and all its messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  )
}
