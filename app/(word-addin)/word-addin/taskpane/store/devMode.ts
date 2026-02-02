"use client"

/**
 * @fileoverview Dev Mode Store
 *
 * Manages development mode state for testing the Word Add-in
 * outside of the Office environment. Activated via ?dev=true query param.
 */

import { create } from "zustand"

interface DevModeState {
  isDevMode: boolean
  setDevMode: (enabled: boolean) => void
}

/**
 * Store for dev mode state.
 * Allows testing the add-in in a browser without Office.js.
 */
export const useDevModeStore = create<DevModeState>((set) => ({
  isDevMode: false,
  setDevMode: (enabled) => set({ isDevMode: enabled }),
}))

/**
 * Initialize dev mode from URL query parameter.
 * Call this once on app mount.
 */
export function initDevMode(): boolean {
  if (typeof window === "undefined") return false

  const params = new URLSearchParams(window.location.search)
  const isDevMode = params.get("dev") === "true"

  useDevModeStore.getState().setDevMode(isDevMode)

  if (isDevMode) {
    console.log("[Word Add-in] Dev mode enabled via ?dev=true")
  }

  return isDevMode
}

/**
 * Check if dev mode is active (non-reactive).
 */
export function isDevMode(): boolean {
  return useDevModeStore.getState().isDevMode
}
