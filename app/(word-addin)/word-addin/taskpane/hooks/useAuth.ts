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

  // Poll localStorage for auth data (fallback when Office.js dialog messaging fails)
  const pollLocalStorage = useCallback(() => {
    return new Promise<AuthDialogResult | null>((resolve) => {
      const AUTH_KEY = "word-addin-auth"
      const MAX_POLL_TIME = 5 * 60 * 1000 // 5 minutes max
      const POLL_INTERVAL = 500 // Check every 500ms

      const startTime = Date.now()
      let pollCount = 0

      console.log("[useAuth] Starting localStorage polling...")

      const poll = () => {
        pollCount++
        // Check if we've exceeded max time
        if (Date.now() - startTime > MAX_POLL_TIME) {
          console.log("[useAuth] Poll timeout reached")
          resolve(null)
          return
        }

        const stored = localStorage.getItem(AUTH_KEY)
        if (pollCount % 10 === 0) {
          console.log(`[useAuth] Poll #${pollCount}, found: ${stored ? "YES" : "NO"}`)
        }

        if (stored) {
          try {
            const data = JSON.parse(stored)
            const age = Date.now() - (data.timestamp || 0)
            console.log(`[useAuth] Found auth data, age: ${age}ms`)
            // Check if this is a fresh auth (within last 60 seconds - increased from 30)
            if (data.timestamp && age < 60000) {
              console.log("[useAuth] Auth data is fresh, using it!")
              localStorage.removeItem(AUTH_KEY) // Clean up
              resolve({
                type: "auth-success",
                token: data.token,
                user: data.user,
              })
              return
            } else {
              console.log("[useAuth] Auth data is stale, ignoring")
            }
          } catch (e) {
            console.error("[useAuth] Failed to parse stored auth:", e)
          }
        }

        // Continue polling
        setTimeout(poll, POLL_INTERVAL)
      }

      poll()
    })
  }, [])

  // Open auth dialog using Office.js
  const openAuthDialog = useCallback(() => {
    return new Promise<AuthDialogResult>((resolve) => {
      console.log("[useAuth] Opening auth dialog...")

      // Start localStorage polling as fallback
      let localStorageResolved = false
      const localStoragePromise = pollLocalStorage().then((result) => {
        console.log("[useAuth] localStorage poll result:", result ? "GOT AUTH" : "null")
        if (result && !localStorageResolved) {
          localStorageResolved = true
          return result
        }
        return null
      })

      if (!window.Office?.context?.ui) {
        console.log("[useAuth] Office.js NOT available, opening popup window")
        // Fallback for non-Office environment (development)
        const popup = window.open("/word-addin/auth", "auth", "width=500,height=600")

        // Poll for localStorage result since we can't use Office.js messaging
        localStoragePromise.then((result) => {
          if (result) {
            console.log("[useAuth] Got auth from localStorage polling!")
            setAuth(result.token!, result.user!)
            resolve(result)
            popup?.close()
          }
        })
        return
      }

      console.log("[useAuth] Office.js IS available, using displayDialogAsync")

      window.Office.context.ui.displayDialogAsync(
        `${window.location.origin}/word-addin/auth`,
        { height: 60, width: 30, displayInIframe: false },
        (result) => {
          console.log("[useAuth] displayDialogAsync callback, status:", result.status)

          if (result.status !== Office.AsyncResultStatus.Succeeded) {
            console.error("[useAuth] Dialog failed:", result.error)
            resolve({
              type: "auth-error",
              error: result.error?.message || "Failed to open dialog",
            })
            return
          }

          console.log("[useAuth] Dialog opened successfully")
          const dialog = result.value

          // Handle messages from dialog
          dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
            console.log("[useAuth] DialogMessageReceived:", arg)
            if ("message" in arg && arg.message) {
              try {
                const data = JSON.parse(arg.message) as AuthDialogResult
                console.log("[useAuth] Parsed message:", data.type)
                if (data.type === "auth-success" && data.token && data.user) {
                  localStorageResolved = true
                  setAuth(data.token, data.user)
                  resolve(data)
                } else {
                  resolve(data)
                }
              } catch (e) {
                console.error("[useAuth] Failed to parse auth response:", e)
                resolve({ type: "auth-error", error: "Failed to parse auth response" })
              }
            } else if ("error" in arg) {
              console.error("[useAuth] Dialog error in arg:", arg)
              resolve({ type: "auth-error", error: `Dialog error: ${arg.error}` })
            }
            dialog.close()
          })

          // Handle dialog closed by user - also check localStorage as fallback
          dialog.addEventHandler(Office.EventType.DialogEventReceived, (arg) => {
            console.log("[useAuth] DialogEventReceived:", arg)
            if ("error" in arg && arg.error === 12006) {
              console.log("[useAuth] Dialog closed by user, checking localStorage...")
              // User closed the dialog - check if auth completed via localStorage
              localStoragePromise.then((result) => {
                if (result) {
                  console.log("[useAuth] Found auth in localStorage after dialog close!")
                  setAuth(result.token!, result.user!)
                  resolve(result)
                } else {
                  console.log("[useAuth] No auth found in localStorage")
                  resolve({ type: "auth-error", error: "Dialog closed by user" })
                }
              })
            }
          })
        }
      )
    })
  }, [setAuth, pollLocalStorage])

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
