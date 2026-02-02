"use client"

import { useEffect, useState } from "react"

interface OfficeReadyState {
  isReady: boolean
  error: Error | null
  hostInfo: {
    host: string
    platform: string
  } | null
}

/**
 * Hook to detect when Office.js is initialized and ready.
 * Returns the ready state, any errors, and host information.
 */
export function useOfficeReady(): OfficeReadyState {
  const [state, setState] = useState<OfficeReadyState>({
    isReady: false,
    error: null,
    hostInfo: null,
  })

  useEffect(() => {
    // Check if Office.js is available
    if (typeof window === "undefined" || !window.Office) {
      // Defer state update to avoid eslint warning
      const timer = setTimeout(() => {
        setState({
          isReady: false,
          error: new Error("Office.js is not loaded"),
          hostInfo: null,
        })
      }, 0)
      return () => clearTimeout(timer)
    }

    // Office.onReady is a callback from external system, so setState here is fine
    window.Office.onReady((info) => {
      if (info.host === window.Office?.HostType.Word) {
        setState({
          isReady: true,
          error: null,
          hostInfo: {
            host: info.host.toString(),
            platform: info.platform?.toString() ?? "unknown",
          },
        })
      } else {
        setState({
          isReady: false,
          error: new Error(
            `This add-in only works in Microsoft Word. Current host: ${info.host}`
          ),
          hostInfo: info.host
            ? {
                host: info.host.toString(),
                platform: info.platform?.toString() ?? "unknown",
              }
            : null,
        })
      }
    })
  }, [])

  return state
}
