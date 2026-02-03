// src/lib/password-reset.ts
import { randomBytes } from "crypto"
import { db } from "@/db/client"
import { users, passwordResetTokens } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { hashPassword } from "./password"
import { logSecurityEvent } from "./audit"

const TOKEN_EXPIRY_HOURS = 1

/**
 * Generate a password reset token for the given email
 * Returns success even for non-existent emails (security)
 */
export async function generateResetToken(
  email: string
): Promise<{ success: boolean; token?: string }> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  })

  // Return success even if user doesn't exist (prevents email enumeration)
  if (!user) {
    return { success: true }
  }

  // Generate secure random token
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

  // Invalidate any existing tokens for this user
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, user.id))

  // Create new token
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    token,
    expiresAt,
  })

  await logSecurityEvent({
    action: "PASSWORD_RESET_REQUESTED",
    userId: user.id,
    metadata: { email },
  })

  return { success: true, token }
}

/**
 * Validate a password reset token
 */
export async function validateResetToken(
  token: string
): Promise<{ valid: boolean; userId?: string; error?: string }> {
  const resetToken = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.token, token),
      isNull(passwordResetTokens.usedAt)
    ),
  })

  if (!resetToken) {
    return { valid: false, error: "Invalid or expired token" }
  }

  if (resetToken.expiresAt < new Date()) {
    return { valid: false, error: "Token has expired" }
  }

  return { valid: true, userId: resetToken.userId }
}

/**
 * Reset password using a valid token
 * Uses atomic token consumption to prevent race conditions
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  // Atomically mark token as used and get userId in one operation
  // This prevents TOCTOU race conditions where concurrent requests
  // could both pass validation before either marks the token as used
  const [consumedToken] = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.token, token),
        isNull(passwordResetTokens.usedAt)
      )
    )
    .returning({ userId: passwordResetTokens.userId, expiresAt: passwordResetTokens.expiresAt })

  if (!consumedToken) {
    return { success: false, error: "Invalid or already used token" }
  }

  if (consumedToken.expiresAt < new Date()) {
    return { success: false, error: "Token has expired" }
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword)

  // Update user password
  await db
    .update(users)
    .set({
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, consumedToken.userId))

  await logSecurityEvent({
    action: "PASSWORD_RESET_COMPLETED",
    userId: consumedToken.userId,
  })

  return { success: true }
}
