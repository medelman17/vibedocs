"use client"

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/shell"
import { CommandPalette } from "@/components/navigation"
import { useShellStore } from "@/lib/stores/shell-store"
import { Separator } from "@/components/ui/separator"

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { togglePalette } = useShellStore()

  return (
    <SidebarProvider>
      <AppSidebar
        onOpenCommandPalette={togglePalette}
        // TODO: Wire up actual data and handlers
        // items={conversations}
        // organizations={userOrgs}
        // currentOrg={activeOrg}
        // user={currentUser}
        // onSelectItem={handleSelectItem}
        // onNewChat={handleNewChat}
        // onSwitchOrg={handleSwitchOrg}
        // onOpenSettings={handleOpenSettings}
        // onSignOut={handleSignOut}
      />
      <SidebarInset>
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
