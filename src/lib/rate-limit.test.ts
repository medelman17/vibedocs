import { describe, it, expect, vi } from "vitest"
import { checkLoginRateLimit } from "./rate-limit"

// Mock the db
vi.mock("@/db/client", () => ({
  db: {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
  },
}))

describe("rate limiting", () => {
  describe("checkLoginRateLimit", () => {
    it("allows login when under limit", async () => {
      const { db } = await import("@/db/client")
      vi.mocked(db.query.users.findFirst).mockResolvedValue({
        id: "user-1",
        failedLoginAttempts: 2,
        lockedUntil: null,
      })

      const result = await checkLoginRateLimit("test@example.com")
      expect(result.allowed).toBe(true)
      expect(result.remainingAttempts).toBe(3)
    })

    it("blocks login when limit exceeded", async () => {
      const { db } = await import("@/db/client")
      vi.mocked(db.query.users.findFirst).mockResolvedValue({
        id: "user-1",
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      })

      const result = await checkLoginRateLimit("test@example.com")
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it("allows login after lockout expires", async () => {
      const { db } = await import("@/db/client")
      vi.mocked(db.query.users.findFirst).mockResolvedValue({
        id: "user-1",
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() - 1000), // Expired
      })

      const result = await checkLoginRateLimit("test@example.com")
      expect(result.allowed).toBe(true)
    })

    it("allows login for non-existent user", async () => {
      const { db } = await import("@/db/client")
      vi.mocked(db.query.users.findFirst).mockResolvedValue(null)

      const result = await checkLoginRateLimit("nonexistent@example.com")
      expect(result.allowed).toBe(true)
      expect(result.remainingAttempts).toBe(5)
    })
  })
})
