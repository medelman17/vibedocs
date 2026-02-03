"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

export default function WordAddInAuthCallbackPage() {
  const { status } = useSession()
  const [messageSent, setMessageSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status !== "authenticated" || messageSent) {
      return
    }

    // Fetch the session token from our API
    async function fetchAndSendToken() {
      try {
        const response = await fetch("/api/word-addin/session")
        if (!response.ok) {
          setError("Failed to get session token")
          return
        }

        const data = await response.json()

        // Send token and user info back to the parent task pane
        const message = JSON.stringify({
          type: "auth-success",
          token: data.token,
          user: data.user,
        })

        // Always store in localStorage as fallback (taskpane polls for this)
        localStorage.setItem(
          "word-addin-auth",
          JSON.stringify({
            token: data.token,
            user: data.user,
            timestamp: Date.now(),
          })
        )

        if (window.Office?.context?.ui) {
          // Try Office.js messaging if available
          try {
            window.Office.context.ui.messageParent(message)
          } catch {
            console.log("[AuthCallback] Office.js messageParent failed, using localStorage fallback")
          }
        }

        // Try to close the window/dialog
        setTimeout(() => {
          try {
            window.close()
          } catch {
            // Window may not be closeable, that's okay
          }
        }, 500)

        setMessageSent(true)
      } catch (e) {
        console.error("[AuthCallback] Failed to complete authentication:", e)
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
      <div className="text-center space-y-4">
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
              You can close this window and return to the add-in.
            </p>
          </>
        ) : (
          <>
            <div className="animate-spin mx-auto h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            <p className="text-muted-foreground">Completing sign in...</p>
          </>
        )}
      </div>
    </div>
  )
}
