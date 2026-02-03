import { useEffect, useCallback, useMemo } from "react"

interface KeyboardShortcutHandlers {
  onTogglePalette: () => void
  onToggleDrawer: () => void
  onCloseTopmost: () => void
  onFocusChatInput: () => void
  onCollapseArtifact: () => void
  onExpandArtifact: () => void
}

/**
 * Navigator with experimental userAgentData API.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData
 */
interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    platform?: string
  }
}

/**
 * Detect if the user is on a Mac platform.
 * Uses modern navigator.userAgentData API with fallback to deprecated navigator.platform.
 * SSR-safe: returns false during server-side rendering.
 */
function detectMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  const nav = navigator as NavigatorWithUserAgentData
  // Modern API with fallback to deprecated navigator.platform
  return (
    nav.userAgentData?.platform?.toLowerCase().includes("mac") ??
    nav.platform?.toUpperCase().includes("MAC") ??
    false
  )
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const isMac = useMemo(() => detectMacPlatform(), [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const modifier = isMac ? event.metaKey : event.ctrlKey

      // Cmd/Ctrl + K: Toggle command palette
      if (modifier && event.key === "k") {
        event.preventDefault()
        handlers.onTogglePalette()
        return
      }

      // Cmd/Ctrl + B: Toggle history drawer
      if (modifier && event.key === "b") {
        event.preventDefault()
        handlers.onToggleDrawer()
        return
      }

      // Cmd/Ctrl + /: Focus chat input
      if (modifier && event.key === "/") {
        event.preventDefault()
        handlers.onFocusChatInput()
        return
      }

      // Cmd/Ctrl + [: Collapse artifact
      if (modifier && event.key === "[") {
        event.preventDefault()
        handlers.onCollapseArtifact()
        return
      }

      // Cmd/Ctrl + ]: Expand artifact
      if (modifier && event.key === "]") {
        event.preventDefault()
        handlers.onExpandArtifact()
        return
      }

      // Escape: Close topmost overlay
      if (event.key === "Escape") {
        event.preventDefault()
        handlers.onCloseTopmost()
        return
      }
    },
    [handlers, isMac]
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])
}
