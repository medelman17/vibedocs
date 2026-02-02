// src/lib/actions/password-reset.ts
"use server"

import { generateResetToken, resetPassword } from "@/lib/password-reset"
import { validatePassword } from "@/lib/password"

export async function requestPasswordReset(email: string): Promise<{
  success: boolean
  error?: string
}> {
  if (!email || !email.includes("@")) {
    return { success: false, error: "Invalid email address" }
  }

  const result = await generateResetToken(email)

  // In production, send email here with the token
  // For now, just log it (remove in production!)
  if (result.token) {
    console.log(`[DEV] Password reset token for ${email}: ${result.token}`)
  }

  // Always return success to prevent email enumeration
  return { success: true }
}

export async function completePasswordReset(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  // Validate password strength
  const validation = validatePassword(newPassword)
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(". ") }
  }

  return resetPassword(token, newPassword)
}
