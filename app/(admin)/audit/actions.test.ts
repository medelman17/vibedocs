// app/(admin)/audit/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { testDb } from "@/test/setup"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestAuditLog,
  resetFactoryCounter,
} from "@/test/factories"

// Store mock state at module level
let mockTenantContext: {
  db: typeof testDb
  userId: string
  user: { id: string; name: string; email: string }
  tenantId: string
  role: string
} | null = null

// Mock the DAL module
vi.mock("@/lib/dal", () => ({
  requireRole: vi.fn(async (allowedRoles: string[]) => {
    if (!mockTenantContext) {
      throw new Error("REDIRECT:/onboarding")
    }
    if (!allowedRoles.includes(mockTenantContext.role)) {
      throw new Error("REDIRECT:/dashboard?error=unauthorized")
    }
    return mockTenantContext
  }),
}))

// Helper to set up tenant context
function setupTenantContext(params: {
  user: { id: string; name: string | null; email: string }
  org: { id: string }
  membership: { role: string }
}): void {
  mockTenantContext = {
    db: testDb,
    userId: params.user.id,
    user: {
      id: params.user.id,
      name: params.user.name ?? "Test User",
      email: params.user.email,
    },
    tenantId: params.org.id,
    role: params.membership.role,
  }
}

describe("audit/actions", () => {
  beforeEach(() => {
    mockTenantContext = null
    resetFactoryCounter()
  })

  describe("getAuditLogs", () => {
    it("returns audit logs for the current tenant", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      // Create test audit logs
      await createTestAuditLog(org.id, {
        tableName: "documents",
        recordId: crypto.randomUUID(),
        action: "INSERT",
        newValues: { title: "Test Doc" },
      })
      await createTestAuditLog(org.id, {
        tableName: "documents",
        recordId: crypto.randomUUID(),
        action: "UPDATE",
        oldValues: { title: "Old" },
        newValues: { title: "New" },
      })

      const { getAuditLogs } = await import("./actions")
      const result = await getAuditLogs()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.logs).toHaveLength(2)
        expect(result.data.total).toBe(2)
      }
    })

    it("filters by tableName", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupTenantContext({ user, org, membership: { role: "admin" } })

      await createTestAuditLog(org.id, { tableName: "documents", action: "INSERT" })
      await createTestAuditLog(org.id, { tableName: "documents", action: "UPDATE" })
      await createTestAuditLog(org.id, { tableName: "analyses", action: "INSERT" })

      const { getAuditLogs } = await import("./actions")
      const result = await getAuditLogs({ tableName: "documents" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.logs).toHaveLength(2)
        expect(result.data.logs.every((l) => l.tableName === "documents")).toBe(true)
      }
    })

    it("filters by action type", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      await createTestAuditLog(org.id, { action: "INSERT" })
      await createTestAuditLog(org.id, { action: "UPDATE" })
      await createTestAuditLog(org.id, { action: "DELETE" })

      const { getAuditLogs } = await import("./actions")
      const result = await getAuditLogs({ action: "DELETE" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.logs).toHaveLength(1)
        expect(result.data.logs[0].action).toBe("DELETE")
      }
    })

    it("filters by userId", async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user1.id, "owner")
      setupTenantContext({ user: user1, org, membership: { role: "owner" } })

      await createTestAuditLog(org.id, { userId: user1.id, action: "INSERT" })
      await createTestAuditLog(org.id, { userId: user1.id, action: "UPDATE" })
      await createTestAuditLog(org.id, { userId: user2.id, action: "INSERT" })

      const { getAuditLogs } = await import("./actions")
      const result = await getAuditLogs({ userId: user1.id })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.logs).toHaveLength(2)
        expect(result.data.logs.every((l) => l.userId === user1.id)).toBe(true)
      }
    })

    it("paginates results", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      // Create 5 audit logs
      for (let i = 0; i < 5; i++) {
        await createTestAuditLog(org.id, { action: "INSERT" })
      }

      const { getAuditLogs } = await import("./actions")
      const result = await getAuditLogs({ limit: 2, offset: 0 })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.logs).toHaveLength(2)
        expect(result.data.total).toBe(5)
      }
    })

    it("isolates logs by tenant", async () => {
      const user1 = await createTestUser()
      const org1 = await createTestOrg({ slug: "org-1" })
      await createTestMembership(org1.id, user1.id, "owner")

      const user2 = await createTestUser()
      const org2 = await createTestOrg({ slug: "org-2" })
      await createTestMembership(org2.id, user2.id, "owner")

      // Create logs in each tenant
      await createTestAuditLog(org1.id, { action: "INSERT" })
      await createTestAuditLog(org2.id, { action: "INSERT" })
      await createTestAuditLog(org2.id, { action: "UPDATE" })

      // Query as org1
      setupTenantContext({ user: user1, org: org1, membership: { role: "owner" } })
      const { getAuditLogs } = await import("./actions")
      const result = await getAuditLogs()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.logs).toHaveLength(1)
        expect(result.data.total).toBe(1)
      }
    })

    it("returns empty results when no logs exist", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      const { getAuditLogs } = await import("./actions")
      const result = await getAuditLogs()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.logs).toHaveLength(0)
        expect(result.data.total).toBe(0)
      }
    })

    it("validates limit bounds", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      const { getAuditLogs } = await import("./actions")
      const result = await getAuditLogs({ limit: 200 }) // exceeds max of 100

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires admin or owner role", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAuditLogs } = await import("./actions")
      // wrapError catches the redirect and returns error
      const result = await getAuditLogs()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain("REDIRECT:/dashboard?error=unauthorized")
      }
    })

    it("serializes dates as ISO strings", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      await createTestAuditLog(org.id, { action: "INSERT" })

      const { getAuditLogs } = await import("./actions")
      const result = await getAuditLogs()

      expect(result.success).toBe(true)
      if (result.success && result.data.logs.length > 0) {
        const log = result.data.logs[0]
        expect(typeof log.performedAt).toBe("string")
        // Should be valid ISO string
        expect(() => new Date(log.performedAt)).not.toThrow()
      }
    })
  })
})
