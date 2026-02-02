"use client"

import { useEffect, useState } from "react"
import { useAuthStore } from "../store/auth"

/**
 * Component that handles Zustand store hydration from localStorage.
 * MUST render before any components that depend on persisted store state.
 *
 * This solves the React state update error by:
 * 1. Using skipHydration: true in the store config
 * 2. NOT rendering children until hydration completes
 * 3. Calling rehydrate() in useEffect and waiting for it
 *
 * Without this, components would subscribe to the store during render,
 * and when rehydration completes, they'd receive state updates before mounting.
 */
export function StoreHydration({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    // Zustand persist.rehydrate() is synchronous but triggers store updates.
    // We need to call it and then mark hydration complete in the next tick
    // to ensure all store updates have propagated.
    const hydrate = async () => {
      await useAuthStore.persist.rehydrate()
      setIsHydrated(true)
    }
    hydrate()
  }, [])

  // Don't render children until store is hydrated
  // This prevents them from subscribing before hydration completes
  if (!isHydrated) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}
