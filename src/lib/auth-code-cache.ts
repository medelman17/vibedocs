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
 * Uses Upstash Redis for serverless-compatible storage.
 * Codes expire after 60 seconds and can only be used once.
 */

import { Redis } from "@upstash/redis"

interface CachedAuth {
  userId: string
  email: string
  name: string | null
  sessionToken: string
  createdAt: number
}

// Initialize Redis client (Vercel KV uses these env var names)
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// Key prefix for auth codes
const KEY_PREFIX = "word-addin-auth:"

// Code expiration time (60 seconds)
const CODE_EXPIRY_SECONDS = 60

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
export async function storeAuthCode(
  data: Omit<CachedAuth, "createdAt">
): Promise<string> {
  const code = generateCode()
  const cacheData: CachedAuth = {
    ...data,
    createdAt: Date.now(),
  }

  // Store in Redis with TTL
  await redis.set(`${KEY_PREFIX}${code}`, JSON.stringify(cacheData), {
    ex: CODE_EXPIRY_SECONDS,
  })

  console.log(`[AuthCodeCache] Stored code for user: ${data.email}`)
  return code
}

/**
 * Exchange a code for auth data (one-time use)
 */
export async function exchangeAuthCode(
  code: string
): Promise<CachedAuth | null> {
  const key = `${KEY_PREFIX}${code}`

  // Get and delete atomically using GETDEL
  const cached = await redis.getdel<string>(key)

  if (!cached) {
    console.log(`[AuthCodeCache] Code not found or expired`)
    return null
  }

  const data: CachedAuth =
    typeof cached === "string" ? JSON.parse(cached) : cached
  console.log(`[AuthCodeCache] Code exchanged for user: ${data.email}`)

  return data
}
