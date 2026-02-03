// app/actions/waitlist.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("waitlist/actions", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    // Set required env vars
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "test-api-key",
      RESEND_AUDIENCE_ID: "test-audience-id",
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("joinWaitlist", () => {
    it("returns success when contact is created", async () => {
      vi.doMock("resend", () => ({
        Resend: class {
          contacts = {
            create: async () => ({ error: null }),
          }
        },
      }))

      const { joinWaitlist } = await import("./waitlist")
      const result = await joinWaitlist("test@example.com")

      expect(result.success).toBe(true)
    })

    it("returns success when contact already exists", async () => {
      vi.doMock("resend", () => ({
        Resend: class {
          contacts = {
            create: async () => ({ error: { message: "Contact already exists" } }),
          }
        },
      }))

      const { joinWaitlist } = await import("./waitlist")
      const result = await joinWaitlist("existing@example.com")

      expect(result.success).toBe(true)
    })

    it("returns error when Resend API fails", async () => {
      vi.doMock("resend", () => ({
        Resend: class {
          contacts = {
            create: async () => ({ error: { message: "Rate limit exceeded" } }),
          }
        },
      }))

      const { joinWaitlist } = await import("./waitlist")
      const result = await joinWaitlist("test@example.com")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe("Failed to join waitlist")
      }
    })

    it("returns error when RESEND_API_KEY is not configured", async () => {
      delete process.env.RESEND_API_KEY

      vi.doMock("resend", () => ({
        Resend: class {
          contacts = {
            create: async () => ({ error: null }),
          }
        },
      }))

      const { joinWaitlist } = await import("./waitlist")
      const result = await joinWaitlist("test@example.com")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe("Service unavailable")
      }
    })

    it("returns error when RESEND_AUDIENCE_ID is not configured", async () => {
      delete process.env.RESEND_AUDIENCE_ID

      vi.doMock("resend", () => ({
        Resend: class {
          contacts = {
            create: async () => ({ error: null }),
          }
        },
      }))

      const { joinWaitlist } = await import("./waitlist")
      const result = await joinWaitlist("test@example.com")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe("Service unavailable")
      }
    })
  })
})
