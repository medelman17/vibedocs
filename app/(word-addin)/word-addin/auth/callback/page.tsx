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

        if (window.Office?.context?.ui) {
          window.Office.context.ui.messageParent(message)
        } else {
          // Fallback: store in localStorage for task pane to read
          localStorage.setItem(
            "word-addin-auth",
            JSON.stringify({
              token: data.token,
              user: data.user,
              timestamp: Date.now(),
            })
          )
          // Close the window after a brief delay
          setTimeout(() => window.close(), 100)
        }

        setMessageSent(true)
      } catch {
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
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">
        {messageSent ? "You can close this window." : "Completing sign in..."}
      </p>
    </div>
  )
}
