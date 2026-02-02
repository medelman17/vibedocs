"use client"

import { useCallback, useEffect } from "react"
import { useAuthStore } from "../store/auth"

interface AuthDialogResult {
  type: "auth-success" | "auth-error"
  token?: string
  user?: {
    id: string
    email: string
    name?: string | null
  }
  error?: string
}

/**
 * Hook for managing authentication in the Word Add-in.
 * Provides login/logout functionality and auth state.
 */
export function useAuth() {
  const { token, user, isAuthenticated, setAuth, clearAuth, isTokenValid } =
    useAuthStore()

  // Check token validity on mount and clear if expired
  useEffect(() => {
    if (isAuthenticated && !isTokenValid()) {
      clearAuth()
    }
  }, [isAuthenticated, isTokenValid, clearAuth])

  // Open auth dialog using Office.js
  const openAuthDialog = useCallback(() => {
    return new Promise<AuthDialogResult>((resolve) => {
      if (!window.Office?.context?.ui) {
        // Fallback for non-Office environment (development)
        window.open("/word-addin/auth", "auth", "width=500,height=600")
        resolve({ type: "auth-error", error: "Office.js not available" })
        return
      }

      window.Office.context.ui.displayDialogAsync(
        `${window.location.origin}/word-addin/auth`,
        { height: 60, width: 30, displayInIframe: false },
        (result) => {
          if (result.status !== Office.AsyncResultStatus.Succeeded) {
            resolve({
              type: "auth-error",
              error: result.error?.message || "Failed to open dialog",
            })
            return
          }

          const dialog = result.value

          // Handle messages from dialog
          dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
            if ("message" in arg && arg.message) {
              try {
                const data = JSON.parse(arg.message) as AuthDialogResult
                if (data.type === "auth-success" && data.token && data.user) {
                  setAuth(data.token, data.user)
                  resolve(data)
                } else {
                  resolve(data)
                }
              } catch {
                resolve({ type: "auth-error", error: "Failed to parse auth response" })
              }
            } else if ("error" in arg) {
              resolve({ type: "auth-error", error: `Dialog error: ${arg.error}` })
            }
            dialog.close()
          })

          // Handle dialog closed by user
          dialog.addEventHandler(Office.EventType.DialogEventReceived, (arg) => {
            if ("error" in arg && arg.error === 12006) {
              // User closed the dialog
              resolve({ type: "auth-error", error: "Dialog closed by user" })
            }
          })
        }
      )
    })
  }, [setAuth])

  // Login function
  const login = useCallback(async () => {
    const result = await openAuthDialog()
    return result.type === "auth-success"
  }, [openAuthDialog])

  // Logout function
  const logout = useCallback(() => {
    clearAuth()
  }, [clearAuth])

  return {
    // State
    token,
    user,
    isAuthenticated: isAuthenticated && isTokenValid(),

    // Actions
    login,
    logout,

    // Utilities
    isTokenValid,
  }
}
