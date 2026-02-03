"use client"

import { useEffect, useState, useRef } from "react"

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

  // Check for Office.js on mount (don't load it - it's already in the layout)
  useEffect(() => {
    addLog("Checking for Office.js...")

    if (window.Office) {
      addLog("Office.js already available, waiting for onReady...")
      window.Office.onReady(() => {
        addLog("Office.onReady fired!")
        const hasContext = !!window.Office?.context
        const hasMessageParent = typeof window.Office?.context?.ui?.messageParent === "function"
        addLog(`Office context: ${hasContext ? "YES" : "NO"}`)
        addLog(`messageParent: ${hasMessageParent ? "YES" : "NO"}`)
        setReady(true)
      })
    } else {
      addLog("Office.js not available, proceeding without it")
      setReady(true)
    }
  }, [])

  // Main auth effect - runs when ready
  useEffect(() => {
    if (!ready || messageSent || hasRun.current) {
      return
    }
    hasRun.current = true

    async function completeAuth() {
      try {
        // Step 1: Fetch session token from our API (uses httpOnly cookie)
        addLog("Fetching session token...")
        const response = await fetch("/api/word-addin/session", {
          credentials: "include", // Important for cookies
        })
        addLog(`Session API response: ${response.status}`)

        if (!response.ok) {
          // If session fails, try getting from URL params (OAuth state)
          const urlParams = new URLSearchParams(window.location.search)
          const errorParam = urlParams.get("error")
          if (errorParam) {
            addLog(`OAuth error: ${errorParam}`)
            setError(`OAuth error: ${errorParam}`)
            return
          }

          const text = await response.text()
          addLog(`Session API error: ${text}`)
          setError("Not authenticated. Session may have expired.")
          return
        }

        const data = await response.json()
        addLog(`Got token for user: ${data.user?.email}`)

        // Step 2: Send token back via messageParent
        const message = JSON.stringify({
          type: "auth-success",
          token: data.token,
          user: data.user,
        })

        // Also store in localStorage (cross-context fallback)
        try {
          localStorage.setItem("word-addin-auth", JSON.stringify({
            token: data.token,
            user: data.user,
            timestamp: Date.now(),
          }))
          addLog("Stored in localStorage")
        } catch (e) {
          addLog(`localStorage failed: ${e}`)
        }

        // Try Office.js messageParent
        if (window.Office?.context?.ui?.messageParent) {
          addLog("Calling messageParent...")
          try {
            window.Office.context.ui.messageParent(message)
            addLog("messageParent succeeded!")
          } catch (e) {
            addLog(`messageParent error: ${e}`)
          }
        } else {
          addLog("Office.js messageParent not available")
          // Fallback: try window.opener.postMessage
          if (window.opener) {
            addLog("Trying window.opener.postMessage...")
            try {
              window.opener.postMessage(message, window.location.origin)
              addLog("postMessage sent to opener")
            } catch (e) {
              addLog(`postMessage error: ${e}`)
            }
          }
        }

        addLog("Auth complete! Close this window.")
        setMessageSent(true)

        // Auto-close after delay
        setTimeout(() => {
          addLog("Attempting to close...")
          try {
            window.close()
          } catch {
            addLog("window.close failed")
          }
        }, 2000)

      } catch (e) {
        addLog(`Error: ${e}`)
        setError(`Authentication failed: ${e}`)
      }
    }

    completeAuth()
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
