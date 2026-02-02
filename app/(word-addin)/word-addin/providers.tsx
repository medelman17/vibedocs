"use client"

import { ReactNode, useMemo } from "react"
import Script from "next/script"

/**
 * Providers for the Word Add-in.
 *
 * Handles:
 * - Conditional Office.js loading (skipped in dev mode)
 * - Future: Other providers as needed
 *
 * Note: We don't use SessionProvider here because the add-in uses
 * its own Bearer token auth stored in Zustand, not next-auth sessions.
 */
export function Providers({ children }: { children: ReactNode }) {
  // Check dev mode once during render (safe since URL doesn't change)
  const loadOfficeJs = useMemo(() => {
    if (typeof window === "undefined") return false
    const params = new URLSearchParams(window.location.search)
    const isDevMode = params.get("dev") === "true"
    if (isDevMode) {
      console.log("[Word Add-in] Dev mode: Office.js will not be loaded")
      return false
    }
    return true
  }, [])

  return (
    <>
      {loadOfficeJs && (
        <Script
          src="https://appsforoffice.microsoft.com/lib/1.1/hosted/office.js"
          strategy="afterInteractive"
          onLoad={() => console.log("[Word Add-in] Office.js loaded")}
        />
      )}
      {children}
    </>
  )
}
