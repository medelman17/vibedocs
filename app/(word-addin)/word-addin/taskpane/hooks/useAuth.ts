"use client"

import { useCallback, useEffect } from "react"
import { useAuthStore } from "../store/auth"

interface AuthDialogResult {
  type: "auth-success" | "auth-code" | "auth-error"
  token?: string
  code?: string
  user?: {
    id: string
    email: string
    name?: string | null
  }
  error?: string
}

/**
 * Exchange a one-time auth code for session data.
 * This bypasses cookie restrictions since no cookies are needed.
 */
async function exchangeAuthCode(code: string): Promise<{ token: string; user: { id: string; email: string; name?: string | null } } | null> {
  console.log("[useAuth] Exchanging auth code...")
  try {
    const response = await fetch("/api/word-addin/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
    console.log("[useAuth] Exchange API response:", response.status)

    if (!response.ok) {
      console.log("[useAuth] Exchange API failed:", response.status)
      return null
    }

    const data = await response.json()
    console.log("[useAuth] Exchange successful for:", data.data?.user?.email)
    return { token: data.data.token, user: data.data.user }
  } catch (e) {
    console.error("[useAuth] Exchange error:", e)
    return null
  }
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

  // Poll localStorage for auth code (fallback when Office.js messaging fails)
  const pollLocalStorage = useCallback(() => {
    return new Promise<AuthDialogResult | null>((resolve) => {
      const AUTH_CODE_KEY = "word-addin-auth-code"
      const AUTH_KEY = "word-addin-auth" // Legacy key for backward compatibility
      const MAX_POLL_TIME = 5 * 60 * 1000 // 5 minutes max
      const POLL_INTERVAL = 500 // Check every 500ms

      const startTime = Date.now()
      let pollCount = 0

      console.log("[useAuth] Starting localStorage polling...")

      const poll = async () => {
        pollCount++
        // Check if we've exceeded max time
        if (Date.now() - startTime > MAX_POLL_TIME) {
          console.log("[useAuth] Poll timeout reached")
          resolve(null)
          return
        }

        if (pollCount % 10 === 0) {
          console.log(`[useAuth] Poll #${pollCount}, found: NO`)
        }

        // Check for auth code (new approach)
        const codeData = localStorage.getItem(AUTH_CODE_KEY)
        if (codeData) {
          try {
            const data = JSON.parse(codeData)
            const age = Date.now() - (data.timestamp || 0)
            if (data.code && data.timestamp && age < 60000) {
              console.log("[useAuth] Found auth code in localStorage, exchanging...")
              localStorage.removeItem(AUTH_CODE_KEY)

              // Exchange code for session (no cookies needed)
              const session = await exchangeAuthCode(data.code)
              if (session) {
                console.log("[useAuth] Code exchange successful!")
                resolve({
                  type: "auth-success",
                  token: session.token,
                  user: session.user,
                })
                return
              }
            }
          } catch (e) {
            console.error("[useAuth] Failed to parse auth code:", e)
          }
        }

        // Also check legacy auth key (backward compatibility)
        const stored = localStorage.getItem(AUTH_KEY)
        if (stored) {
          try {
            const data = JSON.parse(stored)
            const age = Date.now() - (data.timestamp || 0)
            if (data.token && data.user && data.timestamp && age < 60000) {
              console.log("[useAuth] Found legacy auth data!")
              localStorage.removeItem(AUTH_KEY)
              resolve({
                type: "auth-success",
                token: data.token,
                user: data.user,
              })
              return
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
      let resolved = false

      // Set up postMessage listener as fallback
      const messageHandler = async (event: MessageEvent) => {
        console.log("[useAuth] postMessage received from:", event.origin)
        if (event.origin !== window.location.origin) {
          console.log("[useAuth] Ignoring message from different origin")
          return
        }
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data

          // Handle auth-code: dialog sent one-time code, exchange it for session
          if (data.type === "auth-code" && data.code && !resolved) {
            console.log("[useAuth] Got auth-code, exchanging...")
            const session = await exchangeAuthCode(data.code)
            if (session) {
              resolved = true
              window.removeEventListener("message", messageHandler)
              setAuth(session.token, session.user)
              resolve({ type: "auth-success", token: session.token, user: session.user })
            } else {
              console.log("[useAuth] Code exchange failed")
              resolve({ type: "auth-error", error: "Code exchange failed" })
            }
            return
          }

          // Handle legacy auth-success with token (backward compatibility)
          if (data.type === "auth-success" && data.token && data.user && !resolved) {
            console.log("[useAuth] Got auth-success with token!")
            resolved = true
            window.removeEventListener("message", messageHandler)
            setAuth(data.token, data.user)
            resolve(data)
          }
        } catch (e) {
          console.log("[useAuth] Failed to parse postMessage:", e)
        }
      }
      window.addEventListener("message", messageHandler)

      // Start localStorage polling as fallback
      const localStoragePromise = pollLocalStorage().then((result) => {
        console.log("[useAuth] localStorage poll result:", result ? "GOT AUTH" : "null")
        if (result && !resolved) {
          resolved = true
          window.removeEventListener("message", messageHandler)
          return result
        }
        return null
      })

      if (!window.Office?.context?.ui) {
        console.log("[useAuth] Office.js NOT available, opening popup window")
        // Fallback for non-Office environment (development)
        const popup = window.open("/word-addin/auth", "auth", "width=500,height=600")

        // Wait for auth via postMessage or localStorage
        localStoragePromise.then((result) => {
          if (result && !resolved) {
            console.log("[useAuth] Got auth from localStorage polling!")
            resolved = true
            window.removeEventListener("message", messageHandler)
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
          dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (arg) => {
            console.log("[useAuth] DialogMessageReceived:", arg)
            if ("message" in arg && arg.message && !resolved) {
              try {
                const data = JSON.parse(arg.message) as AuthDialogResult
                console.log("[useAuth] Parsed message:", data.type)

                // Handle auth-code: dialog sent one-time code, exchange for session
                if (data.type === "auth-code" && data.code) {
                  console.log("[useAuth] Got auth-code, exchanging...")
                  const session = await exchangeAuthCode(data.code)
                  if (session) {
                    resolved = true
                    window.removeEventListener("message", messageHandler)
                    setAuth(session.token, session.user)
                    resolve({ type: "auth-success", token: session.token, user: session.user })
                  } else {
                    console.log("[useAuth] Code exchange failed")
                    resolve({ type: "auth-error", error: "Code exchange failed" })
                  }
                  dialog.close()
                  return
                }

                // Handle legacy auth-success with token
                if (data.type === "auth-success" && data.token && data.user) {
                  resolved = true
                  window.removeEventListener("message", messageHandler)
                  setAuth(data.token, data.user)
                  resolve(data)
                } else if (data.type === "auth-error") {
                  resolve(data)
                }
              } catch (e) {
                console.error("[useAuth] Failed to parse auth response:", e)
                resolve({ type: "auth-error", error: "Failed to parse auth response" })
              }
            } else if ("error" in arg && !resolved) {
              console.error("[useAuth] Dialog error in arg:", arg)
              resolve({ type: "auth-error", error: `Dialog error: ${arg.error}` })
            }
            dialog.close()
          })

          // Handle dialog closed by user - also check localStorage as fallback
          dialog.addEventHandler(Office.EventType.DialogEventReceived, (arg) => {
            console.log("[useAuth] DialogEventReceived:", arg)
            if ("error" in arg && arg.error === 12006 && !resolved) {
              console.log("[useAuth] Dialog closed, waiting for auth data...")
              // Give some time for localStorage/postMessage to come through
              setTimeout(() => {
                if (!resolved) {
                  localStoragePromise.then((result) => {
                    if (result && !resolved) {
                      console.log("[useAuth] Found auth in localStorage after dialog close!")
                      resolved = true
                      window.removeEventListener("message", messageHandler)
                      setAuth(result.token!, result.user!)
                      resolve(result)
                    } else if (!resolved) {
                      console.log("[useAuth] No auth found after dialog close")
                      window.removeEventListener("message", messageHandler)
                      resolve({ type: "auth-error", error: "Dialog closed - auth not completed" })
                    }
                  })
                }
              }, 1000) // Wait 1 second for async operations
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
