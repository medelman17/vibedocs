import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock dependencies
const mockFindFirst = vi.fn()
const mockInsert = vi.fn()
const mockValues = vi.fn()
const mockReturning = vi.fn()

vi.mock("@/db/client", () => ({
  db: {
    query: {
      users: {
        findFirst: mockFindFirst,
      },
    },
    insert: mockInsert,
  },
}))

vi.mock("@/db/schema", () => ({
  users: { id: "id", email: "email" },
  organizations: {},
  organizationMembers: {},
}))

const mockValidatePassword = vi.fn()
const mockHashPassword = vi.fn()

vi.mock("@/lib/password", () => ({
  hashPassword: mockHashPassword,
  validatePassword: mockValidatePassword,
}))

vi.mock("@/lib/audit", () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}))

describe("auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockFindFirst.mockResolvedValue(null)
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ returning: mockReturning })
    mockReturning.mockResolvedValue([{ id: "user-123", email: "test@example.com" }])
    mockValidatePassword.mockReturnValue({ valid: true, errors: [] })
    mockHashPassword.mockResolvedValue("hashed_password")
  })

  describe("register", () => {
    it("creates user with valid input", async () => {
      const { register } = await import("./auth")

      const result = await register({
        email: "test@example.com",
        password: "SecurePass123!",
        name: "Test User",
      })

      expect(result.success).toBe(true)
      expect(result.user).toBeDefined()
      expect(result.user?.email).toBe("test@example.com")
    })

    it("rejects invalid email", async () => {
      const { register } = await import("./auth")

      const result = await register({
        email: "not-an-email",
        password: "SecurePass123!",
        name: "Test User",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid email")
    })

    it("rejects invalid password", async () => {
      mockValidatePassword.mockReturnValue({
        valid: false,
        errors: ["Password too weak"],
      })

      const { register } = await import("./auth")

      const result = await register({
        email: "test@example.com",
        password: "weak",
        name: "Test User",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Password too weak")
    })

    it("rejects duplicate email", async () => {
      mockFindFirst.mockResolvedValue({ id: "existing-user", email: "dupe@example.com" })

      const { register } = await import("./auth")

      const result = await register({
        email: "dupe@example.com",
        password: "SecurePass123!",
        name: "User 2",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("already registered")
    })
  })
})
