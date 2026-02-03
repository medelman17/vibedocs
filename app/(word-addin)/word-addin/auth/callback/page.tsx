"use client"

import { useEffect, useState, useRef } from "react"

/**
 * OAuth Callback Page for Word Add-in
 *
 * IMPORTANT: This page runs in an Office dialog which has ISOLATED cookies.
 * We CANNOT fetch session data here - cookies are blocked by third-party restrictions.
 *
 * Instead, we just signal "auth-complete" and let the TASKPANE fetch the session
 * (the taskpane CAN access cookies since it's the main frame).
 *
 * See: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/auth-with-office-dialog-api
 */
export default function WordAddInAuthCallbackPage() {
  const [messageSent, setMessageSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const hasRun = useRef(false)
  const logsRef = useRef<string[]>([])

  const addLog = (msg: string) => {
    console.log("[AuthCallback]", msg)
    logsRef.current = [...logsRef.current, `${new Date().toISOString().slice(11, 19)}: ${msg}`]
    setDebugInfo([...logsRef.current])
  }

  // Check for Office.js on mount
  useEffect(() => {
    addLog("Checking for Office.js...")

    if (window.Office) {
      addLog("Office.js available, waiting for onReady...")
      window.Office.onReady(() => {
        addLog("Office.onReady fired!")
        const hasMessageParent = typeof window.Office?.context?.ui?.messageParent === "function"
        addLog(`messageParent available: ${hasMessageParent ? "YES" : "NO"}`)
        setReady(true)
      })
    } else {
      addLog("Office.js not available, proceeding anyway")
      setReady(true)
    }
  }, [])

  // Main effect - signal auth complete to taskpane
  useEffect(() => {
    if (!ready || messageSent || hasRun.current) {
      return
    }
    hasRun.current = true

    // Check for OAuth errors in URL
    const urlParams = new URLSearchParams(window.location.search)
    const errorParam = urlParams.get("error")
    if (errorParam) {
      addLog(`OAuth error in URL: ${errorParam}`)
      setError(`OAuth error: ${errorParam}`)

      // Send error to taskpane
      const errorMessage = JSON.stringify({
        type: "auth-error",
        error: errorParam,
      })
      sendMessage(errorMessage)
      return
    }

    // OAuth completed - signal taskpane to fetch session
    // NOTE: We don't fetch the session here because cookies are blocked in Office dialogs
    // The taskpane will fetch the session after receiving this message
    addLog("OAuth flow completed, signaling taskpane...")

    const message = JSON.stringify({
      type: "auth-complete", // Changed from auth-success - taskpane will fetch token
    })

    sendMessage(message)

    function sendMessage(msg: string) {
      // Try Office.js messageParent first
      if (window.Office?.context?.ui?.messageParent) {
        addLog("Sending via messageParent...")
        try {
          window.Office.context.ui.messageParent(msg)
          addLog("messageParent sent!")
          setMessageSent(true)
        } catch (e) {
          addLog(`messageParent error: ${e}`)
        }
      } else {
        addLog("messageParent not available")
      }

      // Also try postMessage as fallback
      if (window.opener) {
        addLog("Sending via window.opener.postMessage...")
        try {
          window.opener.postMessage(msg, window.location.origin)
          addLog("postMessage sent!")
          setMessageSent(true)
        } catch (e) {
          addLog(`postMessage error: ${e}`)
        }
      }

      // Store flag in localStorage (for non-Office environments)
      try {
        localStorage.setItem("word-addin-auth-complete", JSON.stringify({
          complete: true,
          timestamp: Date.now(),
        }))
        addLog("Stored completion flag in localStorage")
      } catch (e) {
        addLog(`localStorage failed: ${e}`)
      }
    }

    // Auto-close after delay
    setTimeout(() => {
      addLog("Attempting to close dialog...")
      try {
        window.close()
      } catch {
        addLog("window.close failed - please close manually")
      }
    }, 1500)

  }, [ready, messageSent])

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          {error ? (
            <>
              <div className="text-red-600 dark:text-red-400">
                <svg
                  className="mx-auto h-12 w-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium text-destructive">{error}</p>
              <p className="text-sm text-muted-foreground">
                Close this window and try again.
              </p>
            </>
          ) : messageSent ? (
            <>
              <div className="text-green-600 dark:text-green-400">
                <svg
                  className="mx-auto h-12 w-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium">Sign in successful!</p>
              <p className="text-sm text-muted-foreground">
                Close this window and return to the add-in.
              </p>
            </>
          ) : (
            <>
              <div className="animate-spin mx-auto h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              <p className="text-muted-foreground">
                {ready ? "Completing sign in..." : "Loading..."}
              </p>
            </>
          )}

          {/* Debug output - always visible */}
          <div className="mt-6 p-3 bg-muted rounded text-left text-xs font-mono overflow-auto max-h-48">
            <div className="font-bold mb-1">Debug Log:</div>
            {debugInfo.length === 0 ? (
              <div className="text-muted-foreground">Initializing...</div>
            ) : (
              debugInfo.map((line, i) => (
                <div key={i}>{line}</div>
              ))
            )}
          </div>
        </div>
    </div>
  )
}
