// src/inngest/utils/tenant-context.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { setTenantContext, withTenantContext } from "./tenant-context"
import { NonRetriableError } from "./errors"

// Mock the database
vi.mock("@/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

describe("tenant-context", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("setTenantContext", () => {
    it("should set RLS context for valid tenantId", async () => {
      const { db } = await import("@/db")
      const tenantId = "550e8400-e29b-41d4-a716-446655440000"

      const result = await setTenantContext(tenantId)

      expect(result.tenantId).toBe(tenantId)
      expect(result.db).toBe(db)
      expect(db.execute).toHaveBeenCalledTimes(1)
    })

    it("should throw NonRetriableError for missing tenantId", async () => {
      await expect(setTenantContext("")).rejects.toThrow(NonRetriableError)
      await expect(setTenantContext("")).rejects.toThrow("tenantId is required")
    })

    it("should throw NonRetriableError for invalid UUID format", async () => {
      await expect(setTenantContext("invalid-uuid")).rejects.toThrow(NonRetriableError)
      await expect(setTenantContext("invalid-uuid")).rejects.toThrow("Invalid tenantId format")
    })

    it("should accept various valid UUID formats", async () => {
      const validUuids = [
        "550e8400-e29b-41d4-a716-446655440000",
        "550E8400-E29B-41D4-A716-446655440000", // uppercase
        "00000000-0000-0000-0000-000000000000", // all zeros
      ]

      for (const uuid of validUuids) {
        const result = await setTenantContext(uuid)
        expect(result.tenantId).toBe(uuid)
      }
    })
  })

  describe("withTenantContext", () => {
    it("should execute function with tenant context", async () => {
      const tenantId = "550e8400-e29b-41d4-a716-446655440000"

      const result = await withTenantContext(tenantId, async (ctx) => {
        expect(ctx.tenantId).toBe(tenantId)
        return "success"
      })

      expect(result).toBe("success")
    })

    it("should propagate errors from inner function", async () => {
      const tenantId = "550e8400-e29b-41d4-a716-446655440000"

      await expect(
        withTenantContext(tenantId, async () => {
          throw new Error("Inner error")
        })
      ).rejects.toThrow("Inner error")
    })

    it("should validate tenantId before executing function", async () => {
      const fn = vi.fn()

      await expect(withTenantContext("invalid", fn)).rejects.toThrow(NonRetriableError)
      expect(fn).not.toHaveBeenCalled()
    })
  })
})
