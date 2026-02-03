import { describe, it, expect, vi, beforeEach } from "vitest"

// Define mock type for chainable db methods
type MockDb = {
  update: ReturnType<typeof vi.fn> & { mockReturnValue: (val: MockDb) => void }
  set: ReturnType<typeof vi.fn> & { mockReturnValue: (val: MockDb) => void }
  where: ReturnType<typeof vi.fn>
  query: {
    users: {
      findFirst: ReturnType<typeof vi.fn>
    }
  }
}

// Mock the db with a factory that returns fresh mocks
vi.mock("@/db/client", () => {
  const createChainableMock = (): MockDb => {
    const mock: MockDb = {
      update: vi.fn(),
      set: vi.fn(),
      where: vi.fn(),
      query: {
        users: {
          findFirst: vi.fn(),
        },
      },
    }
    mock.update.mockReturnValue(mock)
    mock.set.mockReturnValue(mock)
    mock.where.mockResolvedValue([])
    return mock
  }
  return { db: createChainableMock() }
})

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((field, value) => ({ field, value, type: "eq" })),
}))

// Mock schema
vi.mock("@/db/schema", () => ({
  users: {
    email: "email",
    failedLoginAttempts: "failedLoginAttempts",
    lockedUntil: "lockedUntil",
    lastLoginAt: "lastLoginAt",
    lastLoginIp: "lastLoginIp",
    updatedAt: "updatedAt",
  },
}))

describe("rate limiting", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe("checkLoginRateLimit", () => {
    it("allows login when under limit", async () => {
      const { db } = (await import("@/db/client")) as unknown as { db: MockDb }
      const { checkLoginRateLimit } = await import("./rate-limit")
      db.query.users.findFirst.mockResolvedValue({
        id: "user-1",
        failedLoginAttempts: 2,
        lockedUntil: null,
      })

      const result = await checkLoginRateLimit("test@example.com")
      expect(result.allowed).toBe(true)
      expect(result.remainingAttempts).toBe(3)
    })

    it("blocks login when limit exceeded", async () => {
      const { db } = (await import("@/db/client")) as unknown as { db: MockDb }
      const { checkLoginRateLimit } = await import("./rate-limit")
      db.query.users.findFirst.mockResolvedValue({
        id: "user-1",
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      })

      const result = await checkLoginRateLimit("test@example.com")
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it("allows login after lockout expires", async () => {
      const { db } = (await import("@/db/client")) as unknown as { db: MockDb }
      const { checkLoginRateLimit } = await import("./rate-limit")
      db.query.users.findFirst.mockResolvedValue({
        id: "user-1",
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() - 1000), // Expired
      })

      const result = await checkLoginRateLimit("test@example.com")
      expect(result.allowed).toBe(true)
    })

    it("allows login for non-existent user", async () => {
      const { db } = (await import("@/db/client")) as unknown as { db: MockDb }
      const { checkLoginRateLimit } = await import("./rate-limit")
      db.query.users.findFirst.mockResolvedValue(null)

      const result = await checkLoginRateLimit("nonexistent@example.com")
      expect(result.allowed).toBe(true)
      expect(result.remainingAttempts).toBe(5)
    })
  })

  describe("recordLoginAttempt", () => {
    it("resets attempts on successful login", async () => {
      const { db } = (await import("@/db/client")) as unknown as { db: MockDb }
      const { recordLoginAttempt } = await import("./rate-limit")

      await recordLoginAttempt("test@example.com", true, "192.168.1.1")

      expect(db.update).toHaveBeenCalled()
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
      )
    })

    it("increments failed attempts on failed login", async () => {
      const { db } = (await import("@/db/client")) as unknown as { db: MockDb }
      const { recordLoginAttempt } = await import("./rate-limit")
      db.query.users.findFirst.mockResolvedValue({
        failedLoginAttempts: 2,
      })

      await recordLoginAttempt("test@example.com", false)

      expect(db.update).toHaveBeenCalled()
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 3,
          lockedUntil: null, // Not at limit yet
        })
      )
    })

    it("locks account when max attempts reached", async () => {
      const { db } = (await import("@/db/client")) as unknown as { db: MockDb }
      const { recordLoginAttempt } = await import("./rate-limit")
      db.query.users.findFirst.mockResolvedValue({
        failedLoginAttempts: 4, // Next attempt will be 5th (max)
      })

      await recordLoginAttempt("test@example.com", false)

      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        })
      )
    })

    it("does nothing for non-existent user on failed login", async () => {
      const { db } = (await import("@/db/client")) as unknown as { db: MockDb }
      const { recordLoginAttempt } = await import("./rate-limit")
      db.query.users.findFirst.mockResolvedValue(null)

      // Reset mock call counts before this test
      db.update.mockClear()

      await recordLoginAttempt("nonexistent@example.com", false)

      // update should only be called once for the initial failed lookup
      // Actually, looking at the code, for failed login with non-existent user
      // we first call update (for success path), then findFirst (for failed path)
      // but since we pass success=false, it goes to the failed path first
      // and returns early when user is null
      expect(db.update).not.toHaveBeenCalled()
    })

    it("handles missing IP address on successful login", async () => {
      const { db } = (await import("@/db/client")) as unknown as { db: MockDb }
      const { recordLoginAttempt } = await import("./rate-limit")

      await recordLoginAttempt("test@example.com", true)

      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lastLoginIp: null,
        })
      )
    })
  })

  describe("resetLoginAttempts", () => {
    it("resets failed attempts and lockout", async () => {
      const { db } = (await import("@/db/client")) as unknown as { db: MockDb }
      const { resetLoginAttempts } = await import("./rate-limit")

      await resetLoginAttempts("test@example.com")

      expect(db.update).toHaveBeenCalled()
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
      )
    })
  })
})
