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

type ProviderId = "google" | "github" | "microsoft-entra-id"

interface Provider {
  id: ProviderId
  name: string
  icon: React.ReactNode
}

const providers: Provider[] = [
  {
    id: "google",
    name: "Google",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="currentColor"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="currentColor"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="currentColor"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
  },
  {
    id: "github",
    name: "GitHub",
    icon: (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        />
      </svg>
    ),
  },
  {
    id: "microsoft-entra-id",
    name: "Microsoft",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#f25022" d="M1 1h10v10H1z" />
        <path fill="#00a4ef" d="M1 13h10v10H1z" />
        <path fill="#7fba00" d="M13 1h10v10H13z" />
        <path fill="#ffb900" d="M13 13h10v10H13z" />
      </svg>
    ),
  },
]

export default function WordAddInAuthPage() {
  const [loadingProvider, setLoadingProvider] = useState<ProviderId | null>(null)
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

  const handleSignIn = async (providerId: ProviderId) => {
    setLoadingProvider(providerId)
    setError(null)

    try {
      await signIn(providerId, {
        callbackUrl: "/word-addin/auth/complete",
      })
    } catch (e) {
      console.error("[AuthPage] Failed to start sign in:", e)
      setError("Failed to start sign in. Please try again.")
      setLoadingProvider(null)
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

        <div className="space-y-3">
          {providers.map((provider) => (
            <Button
              key={provider.id}
              onClick={() => handleSignIn(provider.id)}
              disabled={loadingProvider !== null}
              variant="outline"
              className="w-full justify-start gap-3"
              size="lg"
            >
              {provider.icon}
              {loadingProvider === provider.id
                ? "Signing in..."
                : `Continue with ${provider.name}`}
            </Button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
