/**
 * @fileoverview One-time auth code cache for Office Add-in authentication
 *
 * Office Add-ins run in cross-site iframes where cookies are blocked.
 * This cache enables a one-time code exchange flow:
 *
 * 1. After OAuth, we generate a one-time code and store session data here
 * 2. The code is passed to the callback page via URL
 * 3. Callback sends code to taskpane via messageParent
 * 4. Taskpane exchanges code for session via /api/word-addin/exchange
 *
 * Codes expire after 60 seconds and can only be used once.
 */

interface CachedAuth {
  userId: string
  email: string
  name: string | null
  sessionToken: string
  createdAt: number
}

// In-memory cache - for production, consider using Redis
const authCodeCache = new Map<string, CachedAuth>()

// Code expiration time (60 seconds)
const CODE_EXPIRY_MS = 60 * 1000

/**
 * Generate a cryptographically secure random code
 */
function generateCode(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Store auth data and return a one-time code
 */
export function storeAuthCode(data: Omit<CachedAuth, "createdAt">): string {
  // Clean up expired codes
  cleanupExpiredCodes()

  const code = generateCode()
  authCodeCache.set(code, {
    ...data,
    createdAt: Date.now(),
  })

  console.log(`[AuthCodeCache] Stored code for user: ${data.email}`)
  return code
}

/**
 * Exchange a code for auth data (one-time use)
 */
export function exchangeAuthCode(code: string): CachedAuth | null {
  const cached = authCodeCache.get(code)

  if (!cached) {
    console.log(`[AuthCodeCache] Code not found`)
    return null
  }

  // Check expiration
  if (Date.now() - cached.createdAt > CODE_EXPIRY_MS) {
    console.log(`[AuthCodeCache] Code expired`)
    authCodeCache.delete(code)
    return null
  }

  // Delete code (one-time use)
  authCodeCache.delete(code)
  console.log(`[AuthCodeCache] Code exchanged for user: ${cached.email}`)

  return cached
}

/**
 * Clean up expired codes
 */
function cleanupExpiredCodes(): void {
  const now = Date.now()
  for (const [code, data] of authCodeCache.entries()) {
    if (now - data.createdAt > CODE_EXPIRY_MS) {
      authCodeCache.delete(code)
    }
  }
}
