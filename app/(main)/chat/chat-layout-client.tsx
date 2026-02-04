"use client"

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar, type User } from "@/components/shell"
import { CommandPalette } from "@/components/navigation"
import { useShellStore } from "@/lib/stores/shell-store"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { Separator } from "@/components/ui/separator"
import { signOutAction } from "@/app/(main)/(auth)/actions"

interface ChatLayoutClientProps {
  children: React.ReactNode
  user: User
}

export function ChatLayoutClient({ children, user }: ChatLayoutClientProps) {
  const {
    togglePalette,
    closeArtifact,
    toggleArtifactExpanded,
    palette,
    artifact,
    setPaletteOpen,
  } = useShellStore()

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

  return (
    <SidebarProvider>
      <AppSidebar
        onOpenCommandPalette={togglePalette}
        onNewChat={() => {
          // Hard reload to clear all local state (messages, artifact, etc.)
          window.location.href = "/chat"
        }}
        user={user}
        onSignOut={handleSignOut}
        // TODO: Wire up remaining data and handlers
        // items={conversations}
        // organizations={userOrgs}
        // currentOrg={activeOrg}
        // onSelectItem={handleSelectItem}
        // onSwitchOrg={handleSwitchOrg}
        // onOpenSettings={handleOpenSettings}
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
