"use client"

import { useEffect, useState } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"

// Office.js types for dialog communication
declare global {
  interface Window {
    Office?: typeof Office
  }
}

export default function WordAddInAuthPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if we're in a dialog context and have a session to report back
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const sessionToken = urlParams.get("session")

    if (sessionToken && window.Office?.context?.ui) {
      // We have a session token from OAuth callback - send it back to parent
      window.Office.context.ui.messageParent(
        JSON.stringify({ type: "auth-success", token: sessionToken })
      )
    }
  }, [])

  const handleSignIn = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Redirect to Microsoft Entra ID OAuth
      await signIn("microsoft-entra-id", {
        callbackUrl: "/word-addin/auth/callback",
      })
    } catch (e) {
      console.error("[AuthPage] Failed to start sign in:", e)
      setError("Failed to start sign in. Please try again.")
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Sign in to VibeDocs
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect your account to analyze documents
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button
          onClick={handleSignIn}
          disabled={isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? "Signing in..." : "Sign in with Microsoft"}
        </Button>

        <p className="text-xs text-muted-foreground">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
