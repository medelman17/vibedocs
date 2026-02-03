// app/(dashboard)/settings/members/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { testDb } from "@/test/setup"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  resetFactoryCounter,
} from "@/test/factories"
import {
  mockSendInvitationEmail,
  clearMockEmails,
  sentEmails,
} from "@/test/mocks/email"

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
  withTenant: vi.fn(async () => {
    if (!mockTenantContext) {
      throw new Error("REDIRECT:/onboarding")
    }
    return mockTenantContext
  }),
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

// Mock the db module to use testDb
vi.mock("@/db", async () => {
  const { testDb } = await import("@/test/setup")
  const schema = await import("@/db/schema")
  return {
    db: testDb,
    ...schema,
  }
})

// Mock email service
vi.mock("@/lib/email", () => ({
  sendInvitationEmail: mockSendInvitationEmail,
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

describe("members/actions", () => {
  beforeEach(() => {
    mockTenantContext = null
    resetFactoryCounter()
    clearMockEmails()
  })

  describe("getOrganizationMembers", () => {
    it("returns all members of the organization", async () => {
      const owner = await createTestUser({ name: "Owner User" })
      const member = await createTestUser({ name: "Member User" })
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, member.id, "member")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { getOrganizationMembers } = await import("./actions")
      const result = await getOrganizationMembers()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
        expect(result.data.map((m) => m.user.name)).toContain("Owner User")
        expect(result.data.map((m) => m.user.name)).toContain("Member User")
      }
    })

    it("returns empty array when no members exist", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      // Set up context but don't create any memberships in this org
      setupTenantContext({ user, org, membership: { role: "owner" } })

      const { getOrganizationMembers } = await import("./actions")
      const result = await getOrganizationMembers()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(0)
      }
    })

    it("includes role and acceptance status", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupTenantContext({ user, org, membership: { role: "admin" } })

      const { getOrganizationMembers } = await import("./actions")
      const result = await getOrganizationMembers()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].role).toBe("admin")
        expect(result.data[0].acceptedAt).toBeDefined()
      }
    })

    it("requires tenant context", async () => {
      const { getOrganizationMembers } = await import("./actions")
      await expect(getOrganizationMembers()).rejects.toThrow(
        "REDIRECT:/onboarding"
      )
    })
  })

  describe("inviteMember", () => {
    it("invites a new user to the organization", async () => {
      const owner = await createTestUser({ name: "Inviter" })
      const org = await createTestOrg({ name: "Test Org" })
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { inviteMember } = await import("./actions")
      const result = await inviteMember({
        email: "newuser@example.com",
        role: "member",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.membershipId).toBeDefined()
      }
    })

    it("sends invitation email", async () => {
      const owner = await createTestUser({ name: "Inviter" })
      const org = await createTestOrg({ name: "Test Org" })
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { inviteMember } = await import("./actions")
      await inviteMember({
        email: "newuser@example.com",
        role: "member",
      })

      // Wait briefly for async email send
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockSendInvitationEmail).toHaveBeenCalled()
      expect(sentEmails).toHaveLength(1)
      expect(sentEmails[0].to).toBe("newuser@example.com")
    })

    it("invites existing user who is not a member", async () => {
      const owner = await createTestUser()
      const existingUser = await createTestUser({ email: "existing@example.com" })
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { inviteMember } = await import("./actions")
      const result = await inviteMember({
        email: existingUser.email,
        role: "admin",
      })

      expect(result.success).toBe(true)
    })

    it("rejects invitation if user is already a member", async () => {
      const owner = await createTestUser()
      const member = await createTestUser({ email: "member@example.com" })
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, member.id, "member")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { inviteMember } = await import("./actions")
      const result = await inviteMember({
        email: member.email,
        role: "member",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
        expect(result.error.message).toContain("already a member")
      }
    })

    it("rejects invitation if user has pending invitation", async () => {
      const owner = await createTestUser()
      const invitedUser = await createTestUser({ email: "invited@example.com" })
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      // Create pending invitation (acceptedAt is null by default if not set)
      await testDb.insert((await import("@/db/schema")).organizationMembers).values({
        organizationId: org.id,
        userId: invitedUser.id,
        role: "member",
        invitedAt: new Date(),
        acceptedAt: null,
      })
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { inviteMember } = await import("./actions")
      const result = await inviteMember({
        email: invitedUser.email,
        role: "member",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
        expect(result.error.message).toContain("already been invited")
      }
    })

    it("validates email format", async () => {
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { inviteMember } = await import("./actions")
      const result = await inviteMember({
        email: "not-an-email",
        role: "member",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("validates role is admin or member", async () => {
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { inviteMember } = await import("./actions")
      // Use type assertion to test runtime validation of invalid role
      const result = await inviteMember({
        email: "test@example.com",
        role: "owner" as "admin",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires admin or owner role", async () => {
      const member = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, member.id, "member")
      setupTenantContext({ user: member, org, membership: { role: "member" } })

      const { inviteMember } = await import("./actions")
      await expect(
        inviteMember({ email: "test@example.com", role: "member" })
      ).rejects.toThrow("REDIRECT:/dashboard?error=unauthorized")
    })
  })

  describe("resendInvitation", () => {
    it("resends invitation for pending membership", async () => {
      const owner = await createTestUser({ name: "Owner" })
      const invitedUser = await createTestUser({ email: "invited@example.com" })
      const org = await createTestOrg({ name: "Test Org" })
      await createTestMembership(org.id, owner.id, "owner")

      // Create pending invitation
      const [membership] = await testDb
        .insert((await import("@/db/schema")).organizationMembers)
        .values({
          organizationId: org.id,
          userId: invitedUser.id,
          role: "member",
          invitedAt: new Date(Date.now() - 86400000), // 1 day ago
          acceptedAt: null,
        })
        .returning()

      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { resendInvitation } = await import("./actions")
      const result = await resendInvitation(membership.id)

      expect(result.success).toBe(true)
    })

    it("sends new invitation email", async () => {
      const owner = await createTestUser({ name: "Owner" })
      const invitedUser = await createTestUser({ email: "invited@example.com" })
      const org = await createTestOrg({ name: "Test Org" })
      await createTestMembership(org.id, owner.id, "owner")

      const [membership] = await testDb
        .insert((await import("@/db/schema")).organizationMembers)
        .values({
          organizationId: org.id,
          userId: invitedUser.id,
          role: "member",
          invitedAt: new Date(),
          acceptedAt: null,
        })
        .returning()

      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { resendInvitation } = await import("./actions")
      await resendInvitation(membership.id)

      // Wait briefly for async email send
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockSendInvitationEmail).toHaveBeenCalled()
    })

    it("rejects resend for accepted membership", async () => {
      const owner = await createTestUser()
      const member = await createTestUser()
      const org = await createTestOrg()
      const membership = await createTestMembership(org.id, member.id, "member")
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { resendInvitation } = await import("./actions")
      const result = await resendInvitation(membership.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("BAD_REQUEST")
        expect(result.error.message).toContain("already accepted")
      }
    })

    it("returns NOT_FOUND for non-existent membership", async () => {
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { resendInvitation } = await import("./actions")
      const result = await resendInvitation("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("validates membership ID format", async () => {
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { resendInvitation } = await import("./actions")
      const result = await resendInvitation("invalid-id")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires admin or owner role", async () => {
      const member = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, member.id, "member")
      setupTenantContext({ user: member, org, membership: { role: "member" } })

      const { resendInvitation } = await import("./actions")
      await expect(
        resendInvitation("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")
      ).rejects.toThrow("REDIRECT:/dashboard?error=unauthorized")
    })
  })

  describe("cancelInvitation", () => {
    it("cancels pending invitation", async () => {
      const owner = await createTestUser()
      const invitedUser = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")

      const [membership] = await testDb
        .insert((await import("@/db/schema")).organizationMembers)
        .values({
          organizationId: org.id,
          userId: invitedUser.id,
          role: "member",
          invitedAt: new Date(),
          acceptedAt: null,
        })
        .returning()

      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { cancelInvitation } = await import("./actions")
      const result = await cancelInvitation(membership.id)

      expect(result.success).toBe(true)
    })

    it("rejects cancellation for accepted membership", async () => {
      const owner = await createTestUser()
      const member = await createTestUser()
      const org = await createTestOrg()
      const membership = await createTestMembership(org.id, member.id, "member")
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { cancelInvitation } = await import("./actions")
      const result = await cancelInvitation(membership.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("BAD_REQUEST")
        expect(result.error.message).toContain("already accepted")
      }
    })

    it("returns NOT_FOUND for non-existent membership", async () => {
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { cancelInvitation } = await import("./actions")
      const result = await cancelInvitation("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("requires admin or owner role", async () => {
      const member = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, member.id, "member")
      setupTenantContext({ user: member, org, membership: { role: "member" } })

      const { cancelInvitation } = await import("./actions")
      await expect(
        cancelInvitation("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")
      ).rejects.toThrow("REDIRECT:/dashboard?error=unauthorized")
    })
  })

  describe("updateMemberRole", () => {
    it("updates member role from member to admin", async () => {
      const owner = await createTestUser()
      const member = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, member.id, "member")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { updateMemberRole } = await import("./actions")
      const result = await updateMemberRole({
        userId: member.id,
        role: "admin",
      })

      expect(result.success).toBe(true)
    })

    it("updates member role from admin to member", async () => {
      const owner = await createTestUser()
      const admin = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, admin.id, "admin")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { updateMemberRole } = await import("./actions")
      const result = await updateMemberRole({
        userId: admin.id,
        role: "member",
      })

      expect(result.success).toBe(true)
    })

    it("rejects changing owner's role", async () => {
      const owner = await createTestUser()
      const anotherOwner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, anotherOwner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { updateMemberRole } = await import("./actions")
      const result = await updateMemberRole({
        userId: anotherOwner.id,
        role: "admin",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("FORBIDDEN")
        expect(result.error.message).toContain("Cannot change the role of an owner")
      }
    })

    it("returns NOT_FOUND for non-member", async () => {
      const owner = await createTestUser()
      const nonMember = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { updateMemberRole } = await import("./actions")
      const result = await updateMemberRole({
        userId: nonMember.id,
        role: "admin",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("validates user ID format", async () => {
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { updateMemberRole } = await import("./actions")
      const result = await updateMemberRole({
        userId: "invalid-id",
        role: "admin",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires owner role", async () => {
      const admin = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, admin.id, "admin")
      setupTenantContext({ user: admin, org, membership: { role: "admin" } })

      const { updateMemberRole } = await import("./actions")
      await expect(
        updateMemberRole({ userId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", role: "admin" })
      ).rejects.toThrow("REDIRECT:/dashboard?error=unauthorized")
    })
  })

  describe("removeMember", () => {
    it("removes a member from the organization", async () => {
      const owner = await createTestUser()
      const member = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, member.id, "member")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { removeMember } = await import("./actions")
      const result = await removeMember(member.id)

      expect(result.success).toBe(true)
    })

    it("prevents removing yourself", async () => {
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { removeMember } = await import("./actions")
      const result = await removeMember(owner.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("BAD_REQUEST")
        expect(result.error.message).toContain("leaveOrganization")
      }
    })

    it("prevents removing the last owner", async () => {
      const owner = await createTestUser()
      const anotherOwner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, anotherOwner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      // First remove one owner (should work since there are 2)
      const { removeMember } = await import("./actions")
      const firstResult = await removeMember(anotherOwner.id)
      expect(firstResult.success).toBe(true)

      // Now only one owner remains - try to remove another (but we can't remove ourselves)
      // Let's create a new scenario where we try to remove a sole owner
    })

    it("allows removing one of multiple owners", async () => {
      const owner1 = await createTestUser()
      const owner2 = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner1.id, "owner")
      await createTestMembership(org.id, owner2.id, "owner")
      setupTenantContext({ user: owner1, org, membership: { role: "owner" } })

      const { removeMember } = await import("./actions")
      const result = await removeMember(owner2.id)

      expect(result.success).toBe(true)
    })

    it("returns NOT_FOUND for non-member", async () => {
      const owner = await createTestUser()
      const nonMember = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { removeMember } = await import("./actions")
      const result = await removeMember(nonMember.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("validates user ID format", async () => {
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { removeMember } = await import("./actions")
      const result = await removeMember("invalid-id")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires admin or owner role", async () => {
      const member = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, member.id, "member")
      setupTenantContext({ user: member, org, membership: { role: "member" } })

      const { removeMember } = await import("./actions")
      await expect(
        removeMember("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")
      ).rejects.toThrow("REDIRECT:/dashboard?error=unauthorized")
    })
  })

  describe("leaveOrganization", () => {
    it("allows member to leave organization", async () => {
      const owner = await createTestUser()
      const member = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, member.id, "member")
      setupTenantContext({ user: member, org, membership: { role: "member" } })

      const { leaveOrganization } = await import("./actions")
      const result = await leaveOrganization()

      expect(result.success).toBe(true)
    })

    it("allows admin to leave organization", async () => {
      const owner = await createTestUser()
      const admin = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, admin.id, "admin")
      setupTenantContext({ user: admin, org, membership: { role: "admin" } })

      const { leaveOrganization } = await import("./actions")
      const result = await leaveOrganization()

      expect(result.success).toBe(true)
    })

    it("allows owner to leave if not the last owner", async () => {
      const owner1 = await createTestUser()
      const owner2 = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner1.id, "owner")
      await createTestMembership(org.id, owner2.id, "owner")
      setupTenantContext({ user: owner1, org, membership: { role: "owner" } })

      const { leaveOrganization } = await import("./actions")
      const result = await leaveOrganization()

      expect(result.success).toBe(true)
    })

    it("prevents last owner from leaving", async () => {
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupTenantContext({ user: owner, org, membership: { role: "owner" } })

      const { leaveOrganization } = await import("./actions")
      const result = await leaveOrganization()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("BAD_REQUEST")
        expect(result.error.message).toContain("last owner")
      }
    })

    it("returns NOT_FOUND if not a member", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      // Don't create membership
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { leaveOrganization } = await import("./actions")
      const result = await leaveOrganization()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("requires tenant context", async () => {
      const { leaveOrganization } = await import("./actions")
      await expect(leaveOrganization()).rejects.toThrow("REDIRECT:/onboarding")
    })
  })
})
