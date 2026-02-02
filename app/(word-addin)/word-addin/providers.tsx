"use client"

import { ReactNode } from "react"

/**
 * Providers for the Word Add-in.
 * Note: We don't use SessionProvider here because the add-in uses
 * its own Bearer token auth stored in Zustand, not next-auth sessions.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>
}
