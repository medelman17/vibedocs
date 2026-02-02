// src/lib/actions/password-reset.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock state
let mockGenerateResetTokenResult: { success: boolean; token?: string } = { success: true }
let mockResetPasswordResult: { success: boolean; error?: string } = { success: true }
let mockValidatePasswordResult: { valid: boolean; errors: string[] } = { valid: true, errors: [] }

// Mock the password-reset module
vi.mock("@/lib/password-reset", () => ({
  generateResetToken: vi.fn(async () => mockGenerateResetTokenResult),
  resetPassword: vi.fn(async () => mockResetPasswordResult),
}))

// Mock the password module
vi.mock("@/lib/password", () => ({
  validatePassword: vi.fn(() => mockValidatePasswordResult),
}))

describe("password-reset/actions", () => {
  beforeEach(() => {
    // Reset mock state to defaults
    mockGenerateResetTokenResult = { success: true }
    mockResetPasswordResult = { success: true }
    mockValidatePasswordResult = { valid: true, errors: [] }
  })

  describe("requestPasswordReset", () => {
    it("returns success for valid email", async () => {
      const { requestPasswordReset } = await import("./password-reset")
      const result = await requestPasswordReset("test@example.com")

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it("returns success even for non-existent email (prevents enumeration)", async () => {
      mockGenerateResetTokenResult = { success: true } // No token returned for non-existent user

      const { requestPasswordReset } = await import("./password-reset")
      const result = await requestPasswordReset("nonexistent@example.com")

      expect(result.success).toBe(true)
    })

    it("returns error for empty email", async () => {
      const { requestPasswordReset } = await import("./password-reset")
      const result = await requestPasswordReset("")

      expect(result.success).toBe(false)
      expect(result.error).toBe("Invalid email address")
    })

    it("returns error for invalid email format", async () => {
      const { requestPasswordReset } = await import("./password-reset")
      const result = await requestPasswordReset("not-an-email")

      expect(result.success).toBe(false)
      expect(result.error).toBe("Invalid email address")
    })

    it("calls generateResetToken with the email", async () => {
      const { generateResetToken } = await import("@/lib/password-reset")
      const { requestPasswordReset } = await import("./password-reset")

      await requestPasswordReset("user@example.com")

      expect(generateResetToken).toHaveBeenCalledWith("user@example.com")
    })
  })

  describe("completePasswordReset", () => {
    it("returns success for valid token and password", async () => {
      const { completePasswordReset } = await import("./password-reset")
      const result = await completePasswordReset("valid-token", "SecurePassword123!")

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it("validates password before resetting", async () => {
      const { validatePassword } = await import("@/lib/password")
      const { completePasswordReset } = await import("./password-reset")

      await completePasswordReset("some-token", "newpassword")

      expect(validatePassword).toHaveBeenCalledWith("newpassword")
    })

    it("returns error for weak password", async () => {
      mockValidatePasswordResult = {
        valid: false,
        errors: ["Password must be at least 8 characters", "Password must contain uppercase"],
      }

      const { completePasswordReset } = await import("./password-reset")
      const result = await completePasswordReset("valid-token", "weak")

      expect(result.success).toBe(false)
      expect(result.error).toContain("Password must be at least 8 characters")
      expect(result.error).toContain("Password must contain uppercase")
    })

    it("returns error for invalid token", async () => {
      mockResetPasswordResult = { success: false, error: "Invalid or already used token" }

      const { completePasswordReset } = await import("./password-reset")
      const result = await completePasswordReset("invalid-token", "SecurePassword123!")

      expect(result.success).toBe(false)
      expect(result.error).toBe("Invalid or already used token")
    })

    it("returns error for expired token", async () => {
      mockResetPasswordResult = { success: false, error: "Token has expired" }

      const { completePasswordReset } = await import("./password-reset")
      const result = await completePasswordReset("expired-token", "SecurePassword123!")

      expect(result.success).toBe(false)
      expect(result.error).toBe("Token has expired")
    })

    it("calls resetPassword with token and new password", async () => {
      const { resetPassword } = await import("@/lib/password-reset")
      const { completePasswordReset } = await import("./password-reset")

      await completePasswordReset("my-token", "NewSecurePass123!")

      expect(resetPassword).toHaveBeenCalledWith("my-token", "NewSecurePass123!")
    })

    it("does not call resetPassword if password validation fails", async () => {
      mockValidatePasswordResult = { valid: false, errors: ["Too weak"] }

      const { resetPassword } = await import("@/lib/password-reset")
      const resetPasswordMock = vi.mocked(resetPassword)
      resetPasswordMock.mockClear()

      const { completePasswordReset } = await import("./password-reset")
      await completePasswordReset("valid-token", "weak")

      expect(resetPassword).not.toHaveBeenCalled()
    })
  })
})
