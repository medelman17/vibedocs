"use client"

import { ReactNode, useSyncExternalStore } from "react"
import Script from "next/script"
import { SessionProvider } from "next-auth/react"

// Check dev mode - safe to call during render since URL is stable
function getIsDevMode() {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("dev") === "true"
}

function subscribeToDevMode(_callback: () => void) {
  // URL doesn't change, so no subscription needed
  return () => {}
}

function getDevModeSnapshot() {
  return getIsDevMode()
}

function getServerDevModeSnapshot() {
  // Server always returns false to match initial client render
  return false
}

/**
 * Providers for the Word Add-in.
 *
 * Handles:
 * - Conditional Office.js loading (skipped in dev mode)
 * - SessionProvider for auth callback dialog (uses next-auth OAuth flow)
 *
 * Note: The task pane uses Bearer token auth stored in Zustand, but the
 * auth callback dialog needs SessionProvider to read the session after OAuth.
 */
export function Providers({ children }: { children: ReactNode }) {
  // Use useSyncExternalStore to safely read URL on client after hydration
  const isDevMode = useSyncExternalStore(
    subscribeToDevMode,
    getDevModeSnapshot,
    getServerDevModeSnapshot
  )

  if (isDevMode) {
    console.log("[Word Add-in] Dev mode: Office.js will not be loaded")
  }

  return (
    <SessionProvider>
      {!isDevMode && (
        <Script
          src="https://appsforoffice.microsoft.com/lib/1.1/hosted/office.js"
          strategy="afterInteractive"
          onLoad={() => console.log("[Word Add-in] Office.js loaded")}
        />
      )}
      {children}
    </SessionProvider>
  )
}
