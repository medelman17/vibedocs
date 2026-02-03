// app/(auth)/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { testDb } from "@/test/setup"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  resetFactoryCounter,
} from "@/test/factories"

// Store mock state at module level
let mockSessionContext: {
  userId: string
  user: { id: string; name: string; email: string }
  activeOrganizationId: string | null
} | null = null

// Mock the DAL module
vi.mock("@/lib/dal", () => ({
  verifySession: vi.fn(async () => {
    if (!mockSessionContext) {
      throw new Error("REDIRECT:/login")
    }
    return mockSessionContext
  }),
}))

// Mock the db client to use testDb
vi.mock("@/db/client", async () => {
  const { testDb } = await import("@/test/setup")
  return {
    db: testDb,
  }
})

// Helper to set up session context
function setupSessionContext(params: {
  user: { id: string; name: string | null; email: string }
  activeOrganizationId?: string | null
}): void {
  mockSessionContext = {
    userId: params.user.id,
    user: {
      id: params.user.id,
      name: params.user.name ?? "Test User",
      email: params.user.email,
    },
    activeOrganizationId: params.activeOrganizationId ?? null,
  }
}

describe("(auth)/actions", () => {
  beforeEach(() => {
    mockSessionContext = null
    resetFactoryCounter()
  })

  describe("switchOrganization", () => {
    it("allows switching to an organization the user is a member of", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupSessionContext({ user })

      const { switchOrganization } = await import("./actions")
      const result = await switchOrganization({ orgId: org.id })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.organizationId).toBe(org.id)
      }
    })

    it("rejects switching to an organization the user is not a member of", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      // No membership created
      setupSessionContext({ user })

      const { switchOrganization } = await import("./actions")
      const result = await switchOrganization({ orgId: org.id })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("FORBIDDEN")
        expect(result.error.message).toContain("Not a member")
      }
    })

    it("rejects switching to a pending invitation (not accepted)", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      // Create pending invitation (acceptedAt is null)
      await createTestMembership(org.id, user.id, "member", { acceptedAt: null })
      setupSessionContext({ user })

      const { switchOrganization } = await import("./actions")
      const result = await switchOrganization({ orgId: org.id })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("FORBIDDEN")
      }
    })

    it("rejects switching to a deleted organization", async () => {
      const user = await createTestUser()
      const org = await createTestOrg({ deletedAt: new Date() })
      await createTestMembership(org.id, user.id, "member")
      setupSessionContext({ user })

      const { switchOrganization } = await import("./actions")
      const result = await switchOrganization({ orgId: org.id })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
        expect(result.error.message).toContain("deleted")
      }
    })

    it("validates organization ID format", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { switchOrganization } = await import("./actions")
      const result = await switchOrganization({ orgId: "invalid-uuid" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires authentication", async () => {
      const { switchOrganization } = await import("./actions")
      await expect(
        switchOrganization({ orgId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" })
      ).rejects.toThrow("REDIRECT:/login")
    })
  })

  describe("getUserOrganizations", () => {
    it("returns all organizations the user is a member of", async () => {
      const user = await createTestUser()
      const org1 = await createTestOrg({ name: "Org 1" })
      const org2 = await createTestOrg({ name: "Org 2" })
      await createTestMembership(org1.id, user.id, "owner")
      await createTestMembership(org2.id, user.id, "member")
      setupSessionContext({ user })

      const { getUserOrganizations } = await import("./actions")
      const result = await getUserOrganizations()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
        expect(result.data.map((o) => o.organization.name)).toContain("Org 1")
        expect(result.data.map((o) => o.organization.name)).toContain("Org 2")
      }
    })

    it("includes role for each organization", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupSessionContext({ user })

      const { getUserOrganizations } = await import("./actions")
      const result = await getUserOrganizations()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].role).toBe("admin")
      }
    })

    it("excludes pending invitations", async () => {
      const user = await createTestUser()
      const acceptedOrg = await createTestOrg({ name: "Accepted" })
      const pendingOrg = await createTestOrg({ name: "Pending" })
      await createTestMembership(acceptedOrg.id, user.id, "member")
      await createTestMembership(pendingOrg.id, user.id, "member", { acceptedAt: null })
      setupSessionContext({ user })

      const { getUserOrganizations } = await import("./actions")
      const result = await getUserOrganizations()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].organization.name).toBe("Accepted")
      }
    })

    it("excludes deleted organizations", async () => {
      const user = await createTestUser()
      const activeOrg = await createTestOrg({ name: "Active" })
      const deletedOrg = await createTestOrg({ name: "Deleted", deletedAt: new Date() })
      await createTestMembership(activeOrg.id, user.id, "member")
      await createTestMembership(deletedOrg.id, user.id, "member")
      setupSessionContext({ user })

      const { getUserOrganizations } = await import("./actions")
      const result = await getUserOrganizations()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].organization.name).toBe("Active")
      }
    })

    it("returns empty array when user has no organizations", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { getUserOrganizations } = await import("./actions")
      const result = await getUserOrganizations()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(0)
      }
    })

    it("requires authentication", async () => {
      const { getUserOrganizations } = await import("./actions")
      await expect(getUserOrganizations()).rejects.toThrow("REDIRECT:/login")
    })
  })

  describe("acceptInvitation", () => {
    it("accepts a pending invitation", async () => {
      const user = await createTestUser()
      const org = await createTestOrg({ name: "New Org" })
      // Create pending invitation
      const membership = await createTestMembership(org.id, user.id, "member", {
        acceptedAt: null,
        invitedAt: new Date(),
      })
      setupSessionContext({ user })

      const { acceptInvitation } = await import("./actions")
      const result = await acceptInvitation({ membershipId: membership.id })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.organizationId).toBe(org.id)
        expect(result.data.organizationName).toBe("New Org")
      }
    })

    it("updates the membership with acceptedAt timestamp", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const membership = await createTestMembership(org.id, user.id, "member", {
        acceptedAt: null,
      })
      setupSessionContext({ user })

      const { acceptInvitation } = await import("./actions")
      await acceptInvitation({ membershipId: membership.id })

      // Verify the membership was updated
      const updated = await testDb.query.organizationMembers.findFirst({
        where: (m, { eq }) => eq(m.id, membership.id),
      })
      expect(updated?.acceptedAt).not.toBeNull()
    })

    it("rejects accepting an already accepted invitation", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const membership = await createTestMembership(org.id, user.id, "member") // acceptedAt is set by default
      setupSessionContext({ user })

      const { acceptInvitation } = await import("./actions")
      const result = await acceptInvitation({ membershipId: membership.id })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
        expect(result.error.message).toContain("already accepted")
      }
    })

    it("rejects accepting another user's invitation", async () => {
      const user = await createTestUser()
      const otherUser = await createTestUser()
      const org = await createTestOrg()
      const membership = await createTestMembership(org.id, otherUser.id, "member", {
        acceptedAt: null,
      })
      setupSessionContext({ user }) // Different user

      const { acceptInvitation } = await import("./actions")
      const result = await acceptInvitation({ membershipId: membership.id })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
        expect(result.error.message).toContain("does not belong to you")
      }
    })

    it("rejects accepting invitation to a deleted organization", async () => {
      const user = await createTestUser()
      const org = await createTestOrg({ deletedAt: new Date() })
      const membership = await createTestMembership(org.id, user.id, "member", {
        acceptedAt: null,
      })
      setupSessionContext({ user })

      const { acceptInvitation } = await import("./actions")
      const result = await acceptInvitation({ membershipId: membership.id })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
        expect(result.error.message).toContain("deleted")
      }
    })

    it("validates membership ID format", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { acceptInvitation } = await import("./actions")
      const result = await acceptInvitation({ membershipId: "invalid-uuid" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires authentication", async () => {
      const { acceptInvitation } = await import("./actions")
      await expect(
        acceptInvitation({ membershipId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" })
      ).rejects.toThrow("REDIRECT:/login")
    })
  })

  describe("declineInvitation", () => {
    it("declines a pending invitation", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const membership = await createTestMembership(org.id, user.id, "member", {
        acceptedAt: null,
      })
      setupSessionContext({ user })

      const { declineInvitation } = await import("./actions")
      const result = await declineInvitation({ membershipId: membership.id })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.declined).toBe(true)
      }
    })

    it("deletes the membership record", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const membership = await createTestMembership(org.id, user.id, "member", {
        acceptedAt: null,
      })
      setupSessionContext({ user })

      const { declineInvitation } = await import("./actions")
      await declineInvitation({ membershipId: membership.id })

      // Verify the membership was deleted
      const deleted = await testDb.query.organizationMembers.findFirst({
        where: (m, { eq }) => eq(m.id, membership.id),
      })
      expect(deleted).toBeUndefined()
    })

    it("rejects declining an already accepted membership", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const membership = await createTestMembership(org.id, user.id, "member") // acceptedAt is set
      setupSessionContext({ user })

      const { declineInvitation } = await import("./actions")
      const result = await declineInvitation({ membershipId: membership.id })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
        expect(result.error.message).toContain("already accepted")
      }
    })

    it("rejects declining another user's invitation", async () => {
      const user = await createTestUser()
      const otherUser = await createTestUser()
      const org = await createTestOrg()
      const membership = await createTestMembership(org.id, otherUser.id, "member", {
        acceptedAt: null,
      })
      setupSessionContext({ user }) // Different user

      const { declineInvitation } = await import("./actions")
      const result = await declineInvitation({ membershipId: membership.id })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
        expect(result.error.message).toContain("does not belong to you")
      }
    })

    it("returns NOT_FOUND for non-existent invitation", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { declineInvitation } = await import("./actions")
      const result = await declineInvitation({
        membershipId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("validates membership ID format", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { declineInvitation } = await import("./actions")
      const result = await declineInvitation({ membershipId: "invalid-uuid" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires authentication", async () => {
      const { declineInvitation } = await import("./actions")
      await expect(
        declineInvitation({ membershipId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" })
      ).rejects.toThrow("REDIRECT:/login")
    })
  })
})
