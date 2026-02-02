import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock db before importing password-reset module
const mockFindFirst = vi.fn()
const mockDelete = vi.fn().mockReturnThis()
const mockInsert = vi.fn().mockReturnThis()
const mockUpdate = vi.fn().mockReturnThis()
const mockValues = vi.fn().mockResolvedValue([])
const mockSet = vi.fn().mockReturnThis()
const mockWhere = vi.fn().mockResolvedValue([])

vi.mock("@/db/client", () => ({
  db: {
    query: {
      users: { findFirst: mockFindFirst },
      passwordResetTokens: { findFirst: mockFindFirst },
    },
    delete: mockDelete,
    insert: mockInsert,
    update: mockUpdate,
  },
}))

vi.mock("@/db/schema", () => ({
  users: { id: "id", email: "email" },
  passwordResetTokens: { userId: "userId", token: "token", usedAt: "usedAt" },
}))

vi.mock("./password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed_password"),
}))

vi.mock("./audit", () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}))

describe("password reset", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    // Reset mock chains
    mockDelete.mockReturnValue({ where: mockWhere })
    mockInsert.mockReturnValue({ values: mockValues })
    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })
  })

  describe("generateResetToken", () => {
    it("creates a token for valid email", async () => {
      mockFindFirst.mockResolvedValueOnce({ id: "user-123" })

      const { generateResetToken } = await import("./password-reset")
      const result = await generateResetToken("test@example.com")

      expect(result.success).toBe(true)
      expect(result.token).toBeDefined()
      expect(result.token).toHaveLength(64) // 32 bytes = 64 hex chars
    })

    it("fails silently for non-existent email", async () => {
      mockFindFirst.mockResolvedValueOnce(null)

      const { generateResetToken } = await import("./password-reset")
      const result = await generateResetToken("nonexistent@example.com")

      // Returns success but no actual token created (security)
      expect(result.success).toBe(true)
      expect(result.token).toBeUndefined()
    })
  })

  describe("validateResetToken", () => {
    it("validates a valid token", async () => {
      mockFindFirst.mockResolvedValueOnce({
        userId: "user-123",
        token: "valid-token",
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        usedAt: null,
      })

      const { validateResetToken } = await import("./password-reset")
      const result = await validateResetToken("valid-token")

      expect(result.valid).toBe(true)
      expect(result.userId).toBe("user-123")
    })

    it("rejects expired token", async () => {
      mockFindFirst.mockResolvedValueOnce({
        userId: "user-123",
        token: "expired-token",
        expiresAt: new Date(Date.now() - 1000), // Expired
        usedAt: null,
      })

      const { validateResetToken } = await import("./password-reset")
      const result = await validateResetToken("expired-token")

      expect(result.valid).toBe(false)
      expect(result.error).toContain("expired")
    })

    it("rejects invalid token", async () => {
      mockFindFirst.mockResolvedValueOnce(null)

      const { validateResetToken } = await import("./password-reset")
      const result = await validateResetToken("invalid-token")

      expect(result.valid).toBe(false)
      expect(result.error).toContain("Invalid")
    })
  })

  describe("resetPassword", () => {
    it("resets password with valid token", async () => {
      // First call for validateResetToken
      mockFindFirst.mockResolvedValueOnce({
        userId: "user-123",
        token: "valid-token",
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
      })

      const { resetPassword } = await import("./password-reset")
      const result = await resetPassword("valid-token", "NewSecurePass123!")

      expect(result.success).toBe(true)
    })

    it("fails with invalid token", async () => {
      mockFindFirst.mockResolvedValueOnce(null)

      const { resetPassword } = await import("./password-reset")
      const result = await resetPassword("invalid-token", "NewSecurePass123!")

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})
