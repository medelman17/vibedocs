"use client"

import { ReactNode } from "react"
import { FileText, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TaskPaneShellProps {
  children: ReactNode
}

/**
 * The main layout shell for the Word Add-in task pane.
 * Provides header, content area, and footer.
 */
export function TaskPaneShell({ children }: TaskPaneShellProps) {
  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <FileText className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">NDA Analyst</span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4">{children}</main>

      {/* Footer */}
      <footer className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
        Powered by AI &middot; v1.0.0
      </footer>
    </div>
  )
}
