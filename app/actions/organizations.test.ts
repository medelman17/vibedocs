/**
 * @fileoverview Tests for organization management server actions
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { testDb } from "@/test/setup"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
} from "@/test/factories"
import { organizationInvitations } from "@/db/schema"
import type { TenantId, UserId } from "@/lib/types/branded"

// Module-level mock state (pattern from passing tests)
let mockSessionContext: {
  userId: UserId
  user: { id: string; email: string; name: string | null }
  activeOrganizationId: TenantId | null
} | null = null

let mockRoleContext: {
  userId: UserId
  user: { id: string; email: string; name: string | null }
  activeOrganizationId: TenantId | null
  tenantId: TenantId
  role: string
  db: typeof testDb
} | null = null

// Mock DAL with factory pattern referencing module-level state
vi.mock("@/lib/dal", () => ({
  verifySession: vi.fn(async () => {
    if (!mockSessionContext) {
      throw new Error("REDIRECT:/login")
    }
    return mockSessionContext
  }),
  requireRole: vi.fn(async (allowedRoles: string[]) => {
    if (!mockRoleContext) {
      throw new Error("REDIRECT:/onboarding")
    }
    if (!allowedRoles.includes(mockRoleContext.role)) {
      throw new Error("REDIRECT:/dashboard?error=unauthorized")
    }
    return mockRoleContext
  }),
  withTenant: vi.fn(async () => {
    if (!mockRoleContext) {
      throw new Error("REDIRECT:/onboarding")
    }
    return mockRoleContext
  }),
  // Export type helpers that tests might need
  asUserId: (id: string) => id as UserId,
  asTenantId: (id: string) => id as TenantId,
}))

// Mock next-auth to avoid ESM resolution issues with next/server
vi.mock("@/lib/auth", () => ({
  signOut: vi.fn(async () => undefined),
  auth: vi.fn(async () => null),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}))

vi.mock("next/navigation", () => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

// Helper to set up session context
function setupSessionContext(params: {
  user: { id: string; email: string; name: string | null }
  activeOrganizationId?: string | null
}): void {
  mockSessionContext = {
    userId: params.user.id as UserId,
    user: params.user,
    activeOrganizationId: (params.activeOrganizationId ?? null) as TenantId | null,
  }
}

// Helper to set up role context (for requireRole)
function setupRoleContext(params: {
  user: { id: string; email: string; name: string | null }
  org: { id: string }
  role: string
}): void {
  mockRoleContext = {
    userId: params.user.id as UserId,
    user: params.user,
    activeOrganizationId: params.org.id as TenantId,
    tenantId: params.org.id as TenantId,
    role: params.role,
    db: testDb,
  }
  // Also set session context
  mockSessionContext = {
    userId: params.user.id as UserId,
    user: params.user,
    activeOrganizationId: params.org.id as TenantId,
  }
}

describe("Organization CRUD", () => {
  beforeEach(() => {
    mockSessionContext = null
    mockRoleContext = null
    // Note: Don't reset factory counter - tests should use incrementing unique IDs
    // This avoids issues if transaction rollback doesn't fully clean up
  })

  describe("createOrganization", () => {
    it("should create a new organization and add user as owner", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { createOrganization } = await import("./organizations")
      const result = await createOrganization({
        name: "New Org",
        slug: "new-org",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const org = await testDb.query.organizations.findFirst({
          where: (t, { eq }) => eq(t.id, result.data.id),
        })
        expect(org?.name).toBe("New Org")
        expect(org?.slug).toBe("new-org")

        const membership = await testDb.query.organizationMembers.findFirst({
          where: (t, { eq, and }) =>
            and(eq(t.organizationId, result.data.id), eq(t.userId, user.id)),
        })
        expect(membership?.role).toBe("owner")
        expect(membership?.acceptedAt).toBeTruthy()
      }
    })

    it("should reject duplicate slugs", async () => {
      const user = await createTestUser()
      const _existingOrg = await createTestOrg({ slug: "taken-slug" })
      setupSessionContext({ user })

      const { createOrganization } = await import("./organizations")
      const result = await createOrganization({
        name: "Another Org",
        slug: "taken-slug",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
      }
    })

    it("should validate slug format", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { createOrganization } = await import("./organizations")
      const result = await createOrganization({
        name: "Test Org",
        slug: "Invalid_Slug!",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })
  })

  describe("updateOrganization", () => {
    it("should update organization name", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupRoleContext({ user, org, role: "owner" })

      const { updateOrganization } = await import("./organizations")
      const result = await updateOrganization({
        name: "Updated Name",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const updated = await testDb.query.organizations.findFirst({
          where: (t, { eq }) => eq(t.id, org.id),
        })
        expect(updated?.name).toBe("Updated Name")
      }
    })

    it("should update organization slug", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupRoleContext({ user, org, role: "owner" })

      const { updateOrganization } = await import("./organizations")
      const result = await updateOrganization({
        slug: "updated-slug",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const updated = await testDb.query.organizations.findFirst({
          where: (t, { eq }) => eq(t.id, org.id),
        })
        expect(updated?.slug).toBe("updated-slug")
      }
    })

    it("should reject duplicate slugs", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const _otherOrg = await createTestOrg({ slug: "taken-slug" })
      await createTestMembership(org.id, user.id, "owner")
      setupRoleContext({ user, org, role: "owner" })

      const { updateOrganization } = await import("./organizations")
      const result = await updateOrganization({
        slug: "taken-slug",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
      }
    })
  })

  describe("getUserOrganizations", () => {
    it("should return all organizations user belongs to", async () => {
      const user = await createTestUser()
      const org1 = await createTestOrg({ name: "Org 1" })
      const org2 = await createTestOrg({ name: "Org 2" })
      await createTestMembership(org1.id, user.id, "owner")
      await createTestMembership(org2.id, user.id, "member")
      setupSessionContext({ user })

      const { getUserOrganizations } = await import("./organizations")
      const result = await getUserOrganizations()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBe(2)
        expect(result.data.map((o) => o.name).sort()).toEqual(["Org 1", "Org 2"])
      }
    })

    it("should not return orgs with pending membership", async () => {
      const user = await createTestUser()
      const org1 = await createTestOrg({ name: "Accepted Org" })
      const org2 = await createTestOrg({ name: "Pending Org" })
      await createTestMembership(org1.id, user.id, "owner")
      await createTestMembership(org2.id, user.id, "member", { acceptedAt: null })
      setupSessionContext({ user })

      const { getUserOrganizations } = await import("./organizations")
      const result = await getUserOrganizations()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBe(1)
        expect(result.data[0].name).toBe("Accepted Org")
      }
    })
  })

  describe("getOrganizationMembers", () => {
    it("should return all members", async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user1.id, "owner")
      await createTestMembership(org.id, user2.id, "member")
      setupRoleContext({ user: user1, org, role: "owner" })

      const { getOrganizationMembers } = await import("./organizations")
      const result = await getOrganizationMembers()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBe(2)
      }
    })
  })

  describe("updateMemberRole", () => {
    it("should allow owners to update any role", async () => {
      const owner = await createTestUser()
      const member = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      const membership = await createTestMembership(org.id, member.id, "member")
      setupRoleContext({ user: owner, org, role: "owner" })

      const { updateMemberRole } = await import("./organizations")
      const result = await updateMemberRole({
        memberId: membership.id,
        role: "admin",
      })

      expect(result.success).toBe(true)
      const updated = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq }) => eq(t.id, membership.id),
      })
      expect(updated?.role).toBe("admin")
    })

    it("should prevent admins from modifying owners", async () => {
      const owner = await createTestUser()
      const admin = await createTestUser()
      const org = await createTestOrg()
      const ownerMembership = await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, admin.id, "admin")
      setupRoleContext({ user: admin, org, role: "admin" })

      const { updateMemberRole } = await import("./organizations")
      const result = await updateMemberRole({
        memberId: ownerMembership.id,
        role: "member",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("FORBIDDEN")
      }
    })

    it("should prevent non-owners from assigning owner role", async () => {
      const admin = await createTestUser()
      const member = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, admin.id, "admin")
      const membership = await createTestMembership(org.id, member.id, "member")
      setupRoleContext({ user: admin, org, role: "admin" })

      const { updateMemberRole } = await import("./organizations")
      const result = await updateMemberRole({
        memberId: membership.id,
        role: "owner",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("FORBIDDEN")
      }
    })
  })

  describe("removeMember", () => {
    it("should allow owners to remove members", async () => {
      const owner = await createTestUser()
      const member = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      const membership = await createTestMembership(org.id, member.id, "member")
      setupRoleContext({ user: owner, org, role: "owner" })

      const { removeMember } = await import("./organizations")
      const result = await removeMember(membership.id)

      expect(result.success).toBe(true)
      const deleted = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq }) => eq(t.id, membership.id),
      })
      expect(deleted).toBeUndefined()
    })

    it("should prevent admins from removing owners", async () => {
      const owner = await createTestUser()
      const admin = await createTestUser()
      const org = await createTestOrg()
      const ownerMembership = await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, admin.id, "admin")
      setupRoleContext({ user: admin, org, role: "admin" })

      const { removeMember } = await import("./organizations")
      const result = await removeMember(ownerMembership.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("FORBIDDEN")
      }
    })
  })
})

describe("Invitation Flow", () => {
  beforeEach(() => {
    mockSessionContext = null
    mockRoleContext = null
    // Note: Don't reset factory counter - tests should use incrementing unique IDs
    // This avoids issues if transaction rollback doesn't fully clean up
  })

  describe("inviteMember", () => {
    it("should create an invitation", async () => {
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupRoleContext({ user: owner, org, role: "owner" })

      const { inviteMember } = await import("./organizations")
      const result = await inviteMember({
        email: "newuser@example.com",
        role: "member",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const invitation = await testDb.query.organizationInvitations.findFirst({
          where: (t, { eq }) => eq(t.id, result.data.id),
        })
        expect(invitation?.email).toBe("newuser@example.com")
        expect(invitation?.role).toBe("member")
        expect(invitation?.status).toBe("pending")
        expect(invitation?.token).toBeTruthy()
      }
    })

    it("should reject inviting existing members", async () => {
      const owner = await createTestUser()
      const existingMember = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, existingMember.id, "member")
      setupRoleContext({ user: owner, org, role: "owner" })

      const { inviteMember } = await import("./organizations")
      const result = await inviteMember({
        email: existingMember.email,
        role: "member",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
      }
    })

    it("should reject duplicate pending invitations", async () => {
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      setupRoleContext({ user: owner, org, role: "owner" })

      // Create existing pending invitation
      await testDb.insert(organizationInvitations).values({
        organizationId: org.id,
        email: "pending@example.com",
        role: "member",
        token: "existing-token",
        invitedBy: owner.id,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })

      const { inviteMember } = await import("./organizations")
      const result = await inviteMember({
        email: "pending@example.com",
        role: "member",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
      }
    })
  })

  describe("acceptInvitation", () => {
    it("should accept invitation and create membership", async () => {
      const owner = await createTestUser()
      const invitedUser = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")

      // Create invitation
      const [invitation] = await testDb
        .insert(organizationInvitations)
        .values({
          organizationId: org.id,
          email: invitedUser.email,
          role: "member",
          token: "test-token",
          invitedBy: owner.id,
          status: "pending",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .returning()

      setupSessionContext({ user: invitedUser })

      const { acceptInvitation } = await import("./organizations")
      const result = await acceptInvitation(invitation.token)

      expect(result.success).toBe(true)

      const updatedInvitation = await testDb.query.organizationInvitations.findFirst({
        where: (t, { eq }) => eq(t.id, invitation.id),
      })
      expect(updatedInvitation?.status).toBe("accepted")

      const membership = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq, and }) =>
          and(eq(t.organizationId, org.id), eq(t.userId, invitedUser.id)),
      })
      expect(membership?.role).toBe("member")
      expect(membership?.acceptedAt).toBeTruthy()
    })

    it("should reject expired invitations", async () => {
      const owner = await createTestUser()
      const invitedUser = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")

      // Create expired invitation
      const [invitation] = await testDb
        .insert(organizationInvitations)
        .values({
          organizationId: org.id,
          email: invitedUser.email,
          role: "member",
          token: "expired-token",
          invitedBy: owner.id,
          status: "pending",
          expiresAt: new Date(Date.now() - 1000), // Expired
        })
        .returning()

      setupSessionContext({ user: invitedUser })

      const { acceptInvitation } = await import("./organizations")
      const result = await acceptInvitation(invitation.token)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("should reject wrong email", async () => {
      const owner = await createTestUser()
      const invitedUser = await createTestUser()
      const wrongUser = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")

      // Create invitation for invitedUser
      const [invitation] = await testDb
        .insert(organizationInvitations)
        .values({
          organizationId: org.id,
          email: invitedUser.email,
          role: "member",
          token: "test-token-2",
          invitedBy: owner.id,
          status: "pending",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .returning()

      // But wrongUser tries to accept
      setupSessionContext({ user: wrongUser })

      const { acceptInvitation } = await import("./organizations")
      const result = await acceptInvitation(invitation.token)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })

  describe("declineInvitation", () => {
    it("should decline invitation", async () => {
      const owner = await createTestUser()
      const invitedUser = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")

      // Create invitation
      const [invitation] = await testDb
        .insert(organizationInvitations)
        .values({
          organizationId: org.id,
          email: invitedUser.email,
          role: "member",
          token: "decline-token",
          invitedBy: owner.id,
          status: "pending",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .returning()

      setupSessionContext({ user: invitedUser })

      const { declineInvitation } = await import("./organizations")
      const result = await declineInvitation(invitation.token)

      expect(result.success).toBe(true)

      const updatedInvitation = await testDb.query.organizationInvitations.findFirst({
        where: (t, { eq }) => eq(t.id, invitation.id),
      })
      expect(updatedInvitation?.status).toBe("declined")

      // Should not create membership
      const membership = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq, and }) =>
          and(eq(t.organizationId, org.id), eq(t.userId, invitedUser.id)),
      })
      expect(membership).toBeUndefined()
    })
  })
})
