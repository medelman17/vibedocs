import { AppShell, AppHeader } from "@/components/shell"
import { HistoryDrawer, CommandPalette } from "@/components/navigation"

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      header={<AppHeader />}
      drawer={<HistoryDrawer />}
      palette={<CommandPalette />}
    >
      {children}
    </AppShell>
  )
}
