"use client"

import { ReactNode, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { LogIn, User } from "lucide-react"

interface AuthGateProps {
  children: ReactNode
}

interface AuthState {
  isAuthenticated: boolean
  user: {
    id: string
    email: string
    name?: string
  } | null
}

/**
 * Wraps content that requires authentication.
 * Shows a sign-in prompt if the user is not authenticated.
 */
export function AuthGate({ children }: AuthGateProps) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check for existing auth from localStorage (set by dialog)
    const stored = localStorage.getItem("word-addin-auth")
    let initialAuth: AuthState = { isAuthenticated: false, user: null }

    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // Check if auth is still fresh (within 24 hours)
        if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          initialAuth = {
            isAuthenticated: true,
            user: parsed.user,
          }
        } else {
          localStorage.removeItem("word-addin-auth")
        }
      } catch {
        localStorage.removeItem("word-addin-auth")
      }
    }

    // Defer state updates to avoid eslint warning
    const timer = setTimeout(() => {
      setAuthState(initialAuth)
      setIsLoading(false)
    }, 0)

    return () => clearTimeout(timer)

    // Listen for messages from auth dialog
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === "auth-success" && data.user) {
          setAuthState({
            isAuthenticated: true,
            user: data.user,
          })
          localStorage.setItem(
            "word-addin-auth",
            JSON.stringify({
              user: data.user,
              timestamp: Date.now(),
            })
          )
        }
      } catch {
        // Ignore non-JSON messages
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  const handleSignIn = () => {
    // Open auth dialog using Office.js
    if (window.Office?.context?.ui) {
      window.Office.context.ui.displayDialogAsync(
        `${window.location.origin}/word-addin/auth`,
        { height: 60, width: 30, displayInIframe: false },
        (result) => {
          if (result.status === Office.AsyncResultStatus.Succeeded) {
            const dialog = result.value
            dialog.addEventHandler(
              Office.EventType.DialogMessageReceived,
              (arg) => {
                // Handle both message and error cases
                if ("message" in arg) {
                  try {
                    const data = JSON.parse(arg.message || "{}")
                    if (data.type === "auth-success" && data.user) {
                      setAuthState({
                        isAuthenticated: true,
                        user: data.user,
                      })
                      localStorage.setItem(
                        "word-addin-auth",
                        JSON.stringify({
                          user: data.user,
                          timestamp: Date.now(),
                        })
                      )
                    }
                  } catch {
                    // Ignore parse errors
                  }
                }
                dialog.close()
              }
            )
          }
        }
      )
    } else {
      // Fallback: open in new window
      window.open("/word-addin/auth", "auth", "width=500,height=600")
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!authState.isAuthenticated) {
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
        <Button onClick={handleSignIn} className="gap-2">
          <LogIn className="h-4 w-4" />
          Sign in with Microsoft
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
