"use client"

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/shell"
import { CommandPalette } from "@/components/navigation"
import { useShellStore } from "@/lib/stores/shell-store"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { Separator } from "@/components/ui/separator"

export default function ChatLayout({ children }: { children: React.ReactNode }) {
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

  return (
    <SidebarProvider>
      <AppSidebar
        onOpenCommandPalette={togglePalette}
        onNewChat={() => {
          // Hard reload to clear all local state (messages, artifact, etc.)
          window.location.href = "/chat"
        }}
        // TODO: Wire up actual data and handlers
        // items={conversations}
        // organizations={userOrgs}
        // currentOrg={activeOrg}
        // user={currentUser}
        // onSelectItem={handleSelectItem}
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
