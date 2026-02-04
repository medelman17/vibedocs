"use client"

import { useEffect } from "react"

/**
 * History API polyfill for Office.js sandboxed iframe.
 *
 * Office Add-ins run in a sandboxed iframe where the history API is broken.
 * This component detects broken history methods and replaces them with noops
 * so Next.js App Router doesn't crash.
 *
 * In dev mode (?dev=true), Office.js is not loaded, so the history API
 * works normally and no polyfill is needed.
 */
export function HistoryPolyfill() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.history) return

    // In dev mode, Office.js won't be loaded, so history API is fine
    const isDevMode = window.location.search.includes("dev=true")
    if (isDevMode) {
      console.log("[Word Add-in] Dev mode: native history API preserved")
      return
    }

    // Test if history methods work (for Office sandbox detection)
    let needsPolyfill = false
    try {
      if (typeof window.history.replaceState !== "function") {
        needsPolyfill = true
      } else {
        window.history.replaceState(null, "", window.location.href)
      }
    } catch {
      needsPolyfill = true
    }

    if (!needsPolyfill) {
      console.log("[Word Add-in] History API works normally")
      return
    }

    console.log("[Word Add-in] Applying history polyfill for Office sandbox")
    const noop = () => undefined
    try {
      Object.defineProperty(window.history, "pushState", {
        value: noop,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window.history, "replaceState", {
        value: noop,
        writable: true,
        configurable: true,
      })
    } catch {
      window.history.pushState = noop
      window.history.replaceState = noop
    }
  }, [])

  return null
}
