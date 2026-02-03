"use client"

import { ReactNode, useState } from "react"
import { LogIn, User, Loader2, Sparkles } from "lucide-react"
import { useAuth } from "../hooks/useAuth"

interface AuthGateProps {
  children: ReactNode
}

/**
 * AuthGate - Elegant authentication gate with warm welcome experience.
 *
 * Shows an inviting sign-in screen for unauthenticated users,
 * and a personalized user card once authenticated.
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
      <div className="addin-signin animate-fade-in">
        {/* Decorative icon */}
        <div className="addin-signin-icon">
          <User />
        </div>

        {/* Welcome text */}
        <h2 className="addin-signin-title">Welcome to VibeDocs</h2>
        <p className="addin-signin-subtitle">
          Sign in to analyze NDAs with AI-powered clause extraction and risk assessment.
        </p>

        {/* Sign in button with loading state */}
        <button
          onClick={handleSignIn}
          disabled={isLoading}
          className="addin-btn addin-btn-primary w-full max-w-[200px]"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              <span>Sign In</span>
            </>
          )}
        </button>

        {/* Feature hint */}
        <div className="mt-6 flex items-center gap-1.5 text-xs text-neutral-400">
          <Sparkles className="h-3 w-3" />
          <span>Powered by Claude AI</span>
        </div>
      </div>
    )
  }

  // Authenticated state - show user card and children
  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* User profile card */}
      <div className="addin-card addin-user-card">
        <div className="addin-avatar">
          {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
        </div>
        <div className="addin-user-info">
          <p className="addin-user-name">{user?.name || "User"}</p>
          <p className="addin-user-email">{user?.email}</p>
        </div>
      </div>

      {/* Children (main content) */}
      {children}
    </div>
  )
}
