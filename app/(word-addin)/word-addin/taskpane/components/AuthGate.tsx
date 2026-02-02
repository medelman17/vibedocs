"use client"

import { ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import { LogIn, User, Loader2 } from "lucide-react"
import { useAuth } from "../hooks/useAuth"

interface AuthGateProps {
  children: ReactNode
}

/**
 * Wraps content that requires authentication.
 * Shows a sign-in prompt if the user is not authenticated.
 * Uses the Zustand auth store via useAuth hook.
 *
 * Note: This component assumes StoreHydration has already run,
 * ensuring the auth store is hydrated from localStorage.
 */
export function AuthGate({ children }: AuthGateProps) {
  const { user, isAuthenticated, login } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  const handleSignIn = async () => {
    setIsLoading(true)
    try {
      await login()
    } finally {
      setIsLoading(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <div className="rounded-full bg-muted p-4">
          <User className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <h2 className="font-semibold">Sign in to get started</h2>
          <p className="text-sm text-muted-foreground">
            Connect your account to analyze documents
          </p>
        </div>
        <Button onClick={handleSignIn} disabled={isLoading} className="gap-2">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Sign in with Microsoft
            </>
          )}
        </Button>
      </div>
    )
  }

  // Show authenticated user info
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user?.name || "User"}</p>
          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
