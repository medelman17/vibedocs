import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface User {
  id: string
  email: string
  name?: string | null
  image?: string | null
}

interface AuthState {
  // State
  token: string | null
  user: User | null
  isAuthenticated: boolean
  expiresAt: number | null
  _hasHydrated: boolean

  // Actions
  setAuth: (token: string, user: User, expiresIn?: number) => void
  clearAuth: () => void
  isTokenValid: () => boolean
}

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      token: null,
      user: null,
      isAuthenticated: false,
      expiresAt: null,
      _hasHydrated: false,

      // Set auth after successful login
      setAuth: (token, user, expiresIn = TOKEN_EXPIRY_MS) => {
        const expiresAt = Date.now() + expiresIn
        set({
          token,
          user,
          isAuthenticated: true,
          expiresAt,
        })
      },

      // Clear auth (logout)
      clearAuth: () => {
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          expiresAt: null,
        })
      },

      // Check if token is still valid
      isTokenValid: () => {
        const { token, expiresAt } = get()
        if (!token || !expiresAt) return false
        return Date.now() < expiresAt
      },
    }),
    {
      name: "word-addin-auth",
      storage: createJSONStorage(() => localStorage),
      // Only persist these fields
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        expiresAt: state.expiresAt,
      }),
      // Skip automatic hydration - we'll trigger it manually after mount
      skipHydration: true,
    }
  )
)

// Hook to get auth headers for API requests
export function useAuthHeaders() {
  const token = useAuthStore((state) => state.token)
  const isTokenValid = useAuthStore((state) => state.isTokenValid)

  if (!token || !isTokenValid()) {
    return null
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}

// Utility to get token outside of React components
export function getAuthToken(): string | null {
  const state = useAuthStore.getState()
  if (!state.isTokenValid()) {
    return null
  }
  return state.token
}
