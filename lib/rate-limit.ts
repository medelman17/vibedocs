// src/lib/rate-limit.ts
import { db } from "@/db/client"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"

const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export type RateLimitResult = {
  allowed: boolean
  remainingAttempts?: number
  retryAfter?: number // seconds until retry allowed
}

/**
 * Check if a login attempt is allowed for the given email
 */
export async function checkLoginRateLimit(email: string): Promise<RateLimitResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: {
      id: true,
      failedLoginAttempts: true,
      lockedUntil: true,
    },
  })

  // User doesn't exist - allow attempt (will fail auth anyway)
  if (!user) {
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS }
  }

  // Check if currently locked out
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000)
    return { allowed: false, retryAfter }
  }

  // Check attempt count
  if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
    // Should be locked but lockout expired - reset and allow
    await resetLoginAttempts(email)
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS }
  }

  return {
    allowed: true,
    remainingAttempts: MAX_LOGIN_ATTEMPTS - user.failedLoginAttempts,
  }
}

/**
 * Record a failed login attempt
 */
export async function recordLoginAttempt(
  email: string,
  success: boolean,
  ip?: string
): Promise<void> {
  if (success) {
    // Reset on successful login
    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.email, email))
    return
  }

  // Increment failed attempts
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { failedLoginAttempts: true },
  })

  if (!user) return

  const newAttempts = user.failedLoginAttempts + 1
  const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS

  await db
    .update(users)
    .set({
      failedLoginAttempts: newAttempts,
      lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
      updatedAt: new Date(),
    })
    .where(eq(users.email, email))
}

/**
 * Reset login attempts for a user
 */
export async function resetLoginAttempts(email: string): Promise<void> {
  await db
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.email, email))
}
