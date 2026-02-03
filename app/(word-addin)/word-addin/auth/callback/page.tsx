"use client"

import { useEffect, useState, useRef } from "react"

/**
 * OAuth Callback Page for Word Add-in
 *
 * Receives a one-time auth code from the server and sends it to the taskpane.
 */
export default function WordAddInAuthCallbackPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const init = async () => {
      // Wait for Office.js if available
      if (window.Office) {
        await new Promise<void>((resolve) => {
          window.Office!.onReady(() => resolve())
        })
      }

      const urlParams = new URLSearchParams(window.location.search)

      // Check for errors
      const errorParam = urlParams.get("error")
      if (errorParam) {
        setError(`OAuth error: ${errorParam}`)
        setStatus("error")
        sendMessage({ type: "auth-error", error: errorParam })
        return
      }

      // Check for auth code
      const authCode = urlParams.get("code")
      if (!authCode) {
        setError("No auth code received")
        setStatus("error")
        sendMessage({ type: "auth-error", error: "No auth code received" })
        return
      }

      // Send auth code to taskpane
      sendMessage({ type: "auth-code", code: authCode })
      setStatus("success")

      // Auto-close after delay
      setTimeout(() => {
        try {
          window.close()
        } catch {
          // Ignore close errors
        }
      }, 1500)
    }

    init()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        {status === "error" ? (
          <>
            <div className="text-red-600 dark:text-red-400">
              <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-lg font-medium text-destructive">{error}</p>
            <p className="text-sm text-muted-foreground">Close this window and try again.</p>
          </>
        ) : status === "success" ? (
          <>
            <div className="text-green-600 dark:text-green-400">
              <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-medium">Sign in successful!</p>
            <p className="text-sm text-muted-foreground">This window will close automatically.</p>
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

function sendMessage(data: { type: string; code?: string; error?: string }) {
  const msg = JSON.stringify(data)

  // Office.js messageParent
  if (window.Office?.context?.ui?.messageParent) {
    try {
      window.Office.context.ui.messageParent(msg)
    } catch {
      // Ignore errors
    }
  }

  // postMessage fallback
  if (window.opener) {
    try {
      window.opener.postMessage(msg, window.location.origin)
    } catch {
      // Ignore errors
    }
  }

  // localStorage fallback
  if (data.type === "auth-code" && data.code) {
    try {
      localStorage.setItem("word-addin-auth-code", JSON.stringify({
        code: data.code,
        timestamp: Date.now(),
      }))
    } catch {
      // Ignore errors
    }
  }
}
