"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

// Office.js types for dialog communication
declare global {
  interface Window {
    Office?: typeof Office
  }
}

export default function WordAddInAuthCallbackPage() {
  const { data: session, status } = useSession()
  const [messageSent, setMessageSent] = useState(false)

  useEffect(() => {
    if (status !== "authenticated" || !session || messageSent) {
      return
    }

    // Send session info back to the parent task pane
    if (window.Office?.context?.ui) {
      window.Office.context.ui.messageParent(
        JSON.stringify({
          type: "auth-success",
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
          },
        })
      )
    } else {
      // Fallback: store in localStorage for task pane to read
      localStorage.setItem(
        "word-addin-auth",
        JSON.stringify({
          user: session.user,
          timestamp: Date.now(),
        })
      )
      // Close the window after a brief delay
      setTimeout(() => window.close(), 100)
    }

    // Use a ref or callback to avoid eslint warning
    const timer = setTimeout(() => setMessageSent(true), 0)
    return () => clearTimeout(timer)
  }, [session, status, messageSent])

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
        <p className="text-destructive">Sign in failed. Please close this window and try again.</p>
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
