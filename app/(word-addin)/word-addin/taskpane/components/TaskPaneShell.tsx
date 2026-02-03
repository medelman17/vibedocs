"use client"

import { ReactNode } from "react"
import { FileText, Settings, LogOut } from "lucide-react"
import { useAuth } from "../hooks/useAuth"

interface TaskPaneShellProps {
  children: ReactNode
}

/**
 * TaskPaneShell - The refined container for the Word Add-in task pane.
 *
 * Design: "Liquid Precision" - confident, warm, intellectually sophisticated.
 * - Glassmorphic header with subtle backdrop blur
 * - Custom typography (Instrument Serif + DM Sans)
 * - Smooth transitions and micro-interactions
 */
export function TaskPaneShell({ children }: TaskPaneShellProps) {
  const { isAuthenticated, logout } = useAuth()

  return (
    <div className="addin-shell">
      {/* Header with glassmorphism effect */}
      <header className="addin-header">
        <div className="addin-header-brand">
          <div className="addin-logo">
            <FileText strokeWidth={2} />
          </div>
          <span className="addin-title">VibeDocs</span>
        </div>

        <div className="flex items-center gap-1">
          {isAuthenticated && (
            <button
              onClick={logout}
              className="addin-btn addin-btn-ghost addin-btn-icon"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Sign out</span>
            </button>
          )}
          <button
            className="addin-btn addin-btn-ghost addin-btn-icon"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </button>
        </div>
      </header>

      {/* Main content with smooth scrolling */}
      <main className="addin-content">{children}</main>

      {/* Subtle footer */}
      <footer className="addin-footer">
        <span>AI-Powered NDA Analysis</span>
        <span className="mx-1.5 opacity-40">·</span>
        <span>v1.0</span>
      </footer>
    </div>
  )
}
