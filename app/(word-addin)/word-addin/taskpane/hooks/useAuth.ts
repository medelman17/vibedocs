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
 */
async function exchangeAuthCode(
  code: string
): Promise<{ token: string; user: { id: string; email: string; name?: string | null } } | null> {
  try {
    const response = await fetch("/api/word-addin/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })

    if (!response.ok) return null

    const data = await response.json()
    return { token: data.data.token, user: data.data.user }
  } catch {
    return null
  }
}

/**
 * Hook for managing authentication in the Word Add-in.
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
      const MAX_POLL_TIME = 5 * 60 * 1000
      const POLL_INTERVAL = 500

      const startTime = Date.now()

      const poll = async () => {
        if (Date.now() - startTime > MAX_POLL_TIME) {
          resolve(null)
          return
        }

        const codeData = localStorage.getItem(AUTH_CODE_KEY)
        if (codeData) {
          try {
            const data = JSON.parse(codeData)
            const age = Date.now() - (data.timestamp || 0)
            if (data.code && data.timestamp && age < 60000) {
              localStorage.removeItem(AUTH_CODE_KEY)
              const session = await exchangeAuthCode(data.code)
              if (session) {
                resolve({
                  type: "auth-success",
                  token: session.token,
                  user: session.user,
                })
                return
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        setTimeout(poll, POLL_INTERVAL)
      }

      poll()
    })
  }, [])

  // Open auth dialog using Office.js
  const openAuthDialog = useCallback(() => {
    return new Promise<AuthDialogResult>((resolve) => {
      let resolved = false

      const cleanup = (messageHandler: (e: MessageEvent) => void) => {
        window.removeEventListener("message", messageHandler)
      }

      // Handle auth code exchange - used by multiple handlers
      const handleAuthCode = async (
        code: string,
        messageHandler: (e: MessageEvent) => void,
        dialog?: Office.Dialog
      ) => {
        // Prevent duplicate exchanges by checking and setting resolved atomically
        if (resolved) return
        resolved = true

        cleanup(messageHandler)
        const session = await exchangeAuthCode(code)

        if (session) {
          setAuth(session.token, session.user)
          resolve({ type: "auth-success", token: session.token, user: session.user })
        } else {
          resolve({ type: "auth-error", error: "Code exchange failed" })
        }

        dialog?.close()
      }

      // Set up postMessage listener as fallback
      const messageHandler = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return

        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data

          if (data.type === "auth-code" && data.code) {
            await handleAuthCode(data.code, messageHandler)
          } else if (data.type === "auth-success" && data.token && data.user && !resolved) {
            resolved = true
            cleanup(messageHandler)
            setAuth(data.token, data.user)
            resolve(data)
          }
        } catch {
          // Ignore parse errors
        }
      }
      window.addEventListener("message", messageHandler)

      // Start localStorage polling as fallback
      const localStoragePromise = pollLocalStorage().then((result) => {
        if (result && !resolved) {
          resolved = true
          cleanup(messageHandler)
          return result
        }
        return null
      })

      // Non-Office environment (development)
      if (!window.Office?.context?.ui) {
        const popup = window.open("/word-addin/auth", "auth", "width=500,height=600")

        localStoragePromise.then((result) => {
          if (result && !resolved) {
            resolved = true
            cleanup(messageHandler)
            setAuth(result.token!, result.user!)
            resolve(result)
            popup?.close()
          }
        })
        return
      }

      // Office.js dialog
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
          dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (arg) => {
            if ("message" in arg && arg.message && !resolved) {
              try {
                const data = JSON.parse(arg.message) as AuthDialogResult

                if (data.type === "auth-code" && data.code) {
                  await handleAuthCode(data.code, messageHandler, dialog)
                } else if (data.type === "auth-success" && data.token && data.user) {
                  resolved = true
                  cleanup(messageHandler)
                  setAuth(data.token, data.user)
                  resolve(data)
                  dialog.close()
                } else if (data.type === "auth-error") {
                  resolved = true
                  cleanup(messageHandler)
                  resolve(data)
                  dialog.close()
                }
              } catch {
                resolve({ type: "auth-error", error: "Failed to parse auth response" })
                dialog.close()
              }
            } else if ("error" in arg && !resolved) {
              resolve({ type: "auth-error", error: `Dialog error: ${arg.error}` })
              dialog.close()
            }
          })

          // Handle dialog closed by user
          dialog.addEventHandler(Office.EventType.DialogEventReceived, (arg) => {
            if ("error" in arg && arg.error === 12006 && !resolved) {
              setTimeout(() => {
                if (!resolved) {
                  localStoragePromise.then((result) => {
                    if (result && !resolved) {
                      resolved = true
                      cleanup(messageHandler)
                      setAuth(result.token!, result.user!)
                      resolve(result)
                    } else if (!resolved) {
                      cleanup(messageHandler)
                      resolve({ type: "auth-error", error: "Dialog closed" })
                    }
                  })
                }
              }, 1000)
            }
          })
        }
      )
    })
  }, [setAuth, pollLocalStorage])

  const login = useCallback(async () => {
    const result = await openAuthDialog()
    return result.type === "auth-success"
  }, [openAuthDialog])

  const logout = useCallback(() => {
    clearAuth()
  }, [clearAuth])

  return {
    token,
    user,
    isAuthenticated: isAuthenticated && isTokenValid(),
    login,
    logout,
    isTokenValid,
  }
}
