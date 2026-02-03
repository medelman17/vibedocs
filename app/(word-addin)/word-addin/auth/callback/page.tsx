"use client"

import { useEffect, useState, useRef } from "react"
import { useSession } from "next-auth/react"

export default function WordAddInAuthCallbackPage() {
  const { status } = useSession()
  const [messageSent, setMessageSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const hasRun = useRef(false)

  // Separate effect for debug logging that doesn't trigger re-renders
  useEffect(() => {
    console.log("[AuthCallback] Session status:", status)
  }, [status])

  useEffect(() => {
    if (status !== "authenticated" || messageSent || hasRun.current) {
      return
    }
    hasRun.current = true

    const logs: string[] = []
    const addLog = (msg: string) => {
      console.log("[AuthCallback]", msg)
      logs.push(`${new Date().toISOString().slice(11, 19)}: ${msg}`)
    }

    // Fetch the session token from our API
    async function fetchAndSendToken() {
      try {
        addLog("Fetching session token...")
        const response = await fetch("/api/word-addin/session")
        addLog(`Session API response: ${response.status}`)

        if (!response.ok) {
          const text = await response.text()
          addLog(`Session API error: ${text}`)
          setDebugInfo([...logs])
          setError("Failed to get session token")
          return
        }

        const data = await response.json()
        addLog(`Got token for user: ${data.user?.email}`)

        // Send token and user info back to the parent task pane
        const message = JSON.stringify({
          type: "auth-success",
          token: data.token,
          user: data.user,
        })

        // Always store in localStorage as fallback (taskpane polls for this)
        const authData = {
          token: data.token,
          user: data.user,
          timestamp: Date.now(),
        }
        localStorage.setItem("word-addin-auth", JSON.stringify(authData))
        addLog("Stored to localStorage: word-addin-auth")

        // Verify it was stored
        const verify = localStorage.getItem("word-addin-auth")
        addLog(`Verified localStorage: ${verify ? "YES" : "NO"}`)

        if (window.Office?.context?.ui) {
          addLog("Office.js context available, trying messageParent...")
          try {
            window.Office.context.ui.messageParent(message)
            addLog("messageParent sent")
          } catch (e) {
            addLog(`messageParent failed: ${e}`)
          }
        } else {
          addLog("Office.js context NOT available")
        }

        addLog("Auth callback complete!")
        setDebugInfo([...logs])
        setMessageSent(true)

        // Try to close the window/dialog after a longer delay
        setTimeout(() => {
          console.log("[AuthCallback] Attempting to close window...")
          try {
            window.close()
          } catch {
            console.log("[AuthCallback] window.close() failed")
          }
        }, 2000)
      } catch (e) {
        console.error("[AuthCallback] Failed to complete authentication:", e)
        addLog(`Error: ${e}`)
        setDebugInfo([...logs])
        setError("Failed to complete authentication")
      }
    }

    fetchAndSendToken()
  }, [status, messageSent])

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    )
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-destructive">
          Sign in failed. Please close this window and try again.
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        {messageSent ? (
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
            <p className="text-muted-foreground">Completing sign in...</p>
          </>
        )}

        {/* Debug output */}
        <div className="mt-6 p-3 bg-muted rounded text-left text-xs font-mono overflow-auto max-h-48">
          <div className="font-bold mb-1">Debug Log:</div>
          {debugInfo.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
