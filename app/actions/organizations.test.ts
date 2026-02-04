/**
 * @fileoverview Tests for organization management server actions
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { testDb } from "@/test/setup"
import {
  users,
  organizations,
  organizationMembers,
  organizationInvitations,
  sessions,
} from "@/db/schema"
import {
  createOrganization,
  updateOrganization,
  getUserOrganizations,
  switchOrganization,
  getOrganizationMembers,
  updateMemberRole,
  removeMember,
  inviteMember,
  acceptInvitation,
  declineInvitation,
} from "./organizations"
import * as dal from "@/lib/dal"
import * as auth from "@/lib/auth"

// Mock dependencies
vi.mock("@/lib/dal")
vi.mock("@/lib/auth")
vi.mock("next/navigation", () => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

describe("Organization CRUD", () => {
  let testUser: typeof users.$inferSelect
  let testOrg: typeof organizations.$inferSelect

  beforeEach(async () => {
    // Create test user
    ;[testUser] = await testDb
      .insert(users)
      .values({
        email: "test@example.com",
        name: "Test User",
      })
      .returning()

    // Create test organization
    ;[testOrg] = await testDb
      .insert(organizations)
      .values({
        name: "Test Org",
        slug: "test-org",
      })
      .returning()

    // Add user as owner
    await testDb.insert(organizationMembers).values({
      organizationId: testOrg.id,
      userId: testUser.id,
      role: "owner",
      acceptedAt: new Date(),
    })

    // Mock verifySession to return test user
    vi.mocked(dal.verifySession).mockResolvedValue({
      userId: testUser.id as any,
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
      },
      activeOrganizationId: testOrg.id as any,
    })
  })

  describe("createOrganization", () => {
    it("should create a new organization and add user as owner", async () => {
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
            and(eq(t.organizationId, result.data.id), eq(t.userId, testUser.id)),
        })
        expect(membership?.role).toBe("owner")
        expect(membership?.acceptedAt).toBeTruthy()
      }
    })

    it("should reject duplicate slugs", async () => {
      const result = await createOrganization({
        name: "Another Org",
        slug: "test-org", // Already exists
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
      }
    })

    it("should validate slug format", async () => {
      const result = await createOrganization({
        name: "Invalid Org",
        slug: "Invalid Slug!", // Contains invalid characters
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })
  })

  describe("updateOrganization", () => {
    beforeEach(() => {
      // Mock requireRole to return tenant context
      vi.mocked(dal.requireRole).mockResolvedValue({
        userId: testUser.id as any,
        user: {
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
        },
        activeOrganizationId: testOrg.id as any,
        tenantId: testOrg.id as any,
        role: "owner",
        db: testDb,
      } as any)
    })

    it("should update organization name", async () => {
      const result = await updateOrganization({
        name: "Updated Name",
      })

      expect(result.success).toBe(true)

      const org = await testDb.query.organizations.findFirst({
        where: (t, { eq }) => eq(t.id, testOrg.id),
      })
      expect(org?.name).toBe("Updated Name")
    })

    it("should update organization slug", async () => {
      const result = await updateOrganization({
        slug: "updated-slug",
      })

      expect(result.success).toBe(true)

      const org = await testDb.query.organizations.findFirst({
        where: (t, { eq }) => eq(t.id, testOrg.id),
      })
      expect(org?.slug).toBe("updated-slug")
    })

    it("should reject duplicate slugs", async () => {
      // Create another org
      const [otherOrg] = await testDb
        .insert(organizations)
        .values({
          name: "Other Org",
          slug: "other-org",
        })
        .returning()

      const result = await updateOrganization({
        slug: "other-org",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
      }
    })
  })

  describe("getUserOrganizations", () => {
    it("should return all organizations user belongs to", async () => {
      // Create second org
      const [secondOrg] = await testDb
        .insert(organizations)
        .values({
          name: "Second Org",
          slug: "second-org",
        })
        .returning()

      await testDb.insert(organizationMembers).values({
        organizationId: secondOrg.id,
        userId: testUser.id,
        role: "member",
        acceptedAt: new Date(),
      })

      const result = await getUserOrganizations()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
        expect(result.data.map((o) => o.name)).toContain("Test Org")
        expect(result.data.map((o) => o.name)).toContain("Second Org")
      }
    })

    it("should not return orgs with pending membership", async () => {
      const [pendingOrg] = await testDb
        .insert(organizations)
        .values({
          name: "Pending Org",
          slug: "pending-org",
        })
        .returning()

      await testDb.insert(organizationMembers).values({
        organizationId: pendingOrg.id,
        userId: testUser.id,
        role: "member",
        acceptedAt: null, // Not accepted
      })

      const result = await getUserOrganizations()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.map((o) => o.name)).not.toContain("Pending Org")
      }
    })
  })
})

describe("Member Management", () => {
  let owner: typeof users.$inferSelect
  let admin: typeof users.$inferSelect
  let member: typeof users.$inferSelect
  let testOrg: typeof organizations.$inferSelect

  beforeEach(async () => {
    // Create users
    ;[owner] = await testDb
      .insert(users)
      .values({ email: "owner@example.com", name: "Owner" })
      .returning()
    ;[admin] = await testDb
      .insert(users)
      .values({ email: "admin@example.com", name: "Admin" })
      .returning()
    ;[member] = await testDb
      .insert(users)
      .values({ email: "member@example.com", name: "Member" })
      .returning()

    // Create organization
    ;[testOrg] = await testDb
      .insert(organizations)
      .values({ name: "Test Org", slug: "test-org" })
      .returning()

    // Add members
    await testDb.insert(organizationMembers).values([
      {
        organizationId: testOrg.id,
        userId: owner.id,
        role: "owner",
        acceptedAt: new Date(),
      },
      {
        organizationId: testOrg.id,
        userId: admin.id,
        role: "admin",
        acceptedAt: new Date(),
      },
      {
        organizationId: testOrg.id,
        userId: member.id,
        role: "member",
        acceptedAt: new Date(),
      },
    ])
  })

  describe("getOrganizationMembers", () => {
    beforeEach(() => {
      vi.mocked(dal.requireRole).mockResolvedValue({
        userId: owner.id as any,
        user: { id: owner.id, email: owner.email, name: owner.name },
        activeOrganizationId: testOrg.id as any,
        tenantId: testOrg.id as any,
        role: "owner",
        db: testDb,
      } as any)
    })

    it("should return all members", async () => {
      const result = await getOrganizationMembers()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(3)
        expect(result.data.map((m) => m.email)).toContain("owner@example.com")
        expect(result.data.map((m) => m.email)).toContain("admin@example.com")
        expect(result.data.map((m) => m.email)).toContain("member@example.com")
      }
    })
  })

  describe("updateMemberRole", () => {
    it("should allow owners to update any role", async () => {
      vi.mocked(dal.requireRole).mockResolvedValue({
        userId: owner.id as any,
        user: { id: owner.id, email: owner.email, name: owner.name },
        activeOrganizationId: testOrg.id as any,
        tenantId: testOrg.id as any,
        role: "owner",
        db: testDb,
      } as any)

      const memberRecord = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq }) => eq(t.userId, member.id),
      })

      const result = await updateMemberRole({
        memberId: memberRecord!.id,
        role: "admin",
      })

      expect(result.success).toBe(true)

      const updated = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq }) => eq(t.id, memberRecord!.id),
      })
      expect(updated?.role).toBe("admin")
    })

    it("should prevent admins from modifying owners", async () => {
      vi.mocked(dal.requireRole).mockResolvedValue({
        userId: admin.id as any,
        user: { id: admin.id, email: admin.email, name: admin.name },
        activeOrganizationId: testOrg.id as any,
        tenantId: testOrg.id as any,
        role: "admin",
        db: testDb,
      } as any)

      const ownerRecord = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq }) => eq(t.userId, owner.id),
      })

      const result = await updateMemberRole({
        memberId: ownerRecord!.id,
        role: "member",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("FORBIDDEN")
      }
    })

    it("should prevent non-owners from assigning owner role", async () => {
      vi.mocked(dal.requireRole).mockResolvedValue({
        userId: admin.id as any,
        user: { id: admin.id, email: admin.email, name: admin.name },
        activeOrganizationId: testOrg.id as any,
        tenantId: testOrg.id as any,
        role: "admin",
        db: testDb,
      } as any)

      const memberRecord = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq }) => eq(t.userId, member.id),
      })

      const result = await updateMemberRole({
        memberId: memberRecord!.id,
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
      vi.mocked(dal.requireRole).mockResolvedValue({
        userId: owner.id as any,
        user: { id: owner.id, email: owner.email, name: owner.name },
        activeOrganizationId: testOrg.id as any,
        tenantId: testOrg.id as any,
        role: "owner",
        db: testDb,
      } as any)

      const memberRecord = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq }) => eq(t.userId, member.id),
      })

      const result = await removeMember(memberRecord!.id)

      expect(result.success).toBe(true)

      const removed = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq }) => eq(t.id, memberRecord!.id),
      })
      expect(removed).toBeUndefined()
    })

    it("should prevent admins from removing owners", async () => {
      vi.mocked(dal.requireRole).mockResolvedValue({
        userId: admin.id as any,
        user: { id: admin.id, email: admin.email, name: admin.name },
        activeOrganizationId: testOrg.id as any,
        tenantId: testOrg.id as any,
        role: "admin",
        db: testDb,
      } as any)

      const ownerRecord = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq }) => eq(t.userId, owner.id),
      })

      const result = await removeMember(ownerRecord!.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("FORBIDDEN")
      }
    })
  })
})

describe("Invitation Flow", () => {
  let testUser: typeof users.$inferSelect
  let testOrg: typeof organizations.$inferSelect

  beforeEach(async () => {
    ;[testUser] = await testDb
      .insert(users)
      .values({ email: "owner@example.com", name: "Owner" })
      .returning()

    ;[testOrg] = await testDb
      .insert(organizations)
      .values({ name: "Test Org", slug: "test-org" })
      .returning()

    await testDb.insert(organizationMembers).values({
      organizationId: testOrg.id,
      userId: testUser.id,
      role: "owner",
      acceptedAt: new Date(),
    })
  })

  describe("inviteMember", () => {
    beforeEach(() => {
      vi.mocked(dal.requireRole).mockResolvedValue({
        userId: testUser.id as any,
        user: { id: testUser.id, email: testUser.email, name: testUser.name },
        activeOrganizationId: testOrg.id as any,
        tenantId: testOrg.id as any,
        role: "owner",
        db: testDb,
      } as any)
    })

    it("should create an invitation", async () => {
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
      const [existingUser] = await testDb
        .insert(users)
        .values({ email: "existing@example.com" })
        .returning()

      await testDb.insert(organizationMembers).values({
        organizationId: testOrg.id,
        userId: existingUser.id,
        role: "member",
        acceptedAt: new Date(),
      })

      const result = await inviteMember({
        email: "existing@example.com",
        role: "member",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
      }
    })

    it("should reject duplicate pending invitations", async () => {
      await testDb.insert(organizationInvitations).values({
        organizationId: testOrg.id,
        email: "pending@example.com",
        role: "member",
        token: "test-token",
        invitedBy: testUser.id,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })

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
    let invitedUser: typeof users.$inferSelect
    let invitation: typeof organizationInvitations.$inferSelect

    beforeEach(async () => {
      ;[invitedUser] = await testDb
        .insert(users)
        .values({ email: "invited@example.com" })
        .returning()

      ;[invitation] = await testDb
        .insert(organizationInvitations)
        .values({
          organizationId: testOrg.id,
          email: invitedUser.email,
          role: "member",
          token: "test-token",
          invitedBy: testUser.id,
          status: "pending",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .returning()

      vi.mocked(dal.verifySession).mockResolvedValue({
        userId: invitedUser.id as any,
        user: {
          id: invitedUser.id,
          email: invitedUser.email,
          name: invitedUser.name,
        },
        activeOrganizationId: null,
      })
    })

    it("should accept invitation and create membership", async () => {
      const result = await acceptInvitation(invitation.token)

      expect(result.success).toBe(true)

      const updatedInvitation =
        await testDb.query.organizationInvitations.findFirst({
          where: (t, { eq }) => eq(t.id, invitation.id),
        })
      expect(updatedInvitation?.status).toBe("accepted")

      const membership = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq, and }) =>
          and(
            eq(t.organizationId, testOrg.id),
            eq(t.userId, invitedUser.id)
          ),
      })
      expect(membership?.role).toBe("member")
      expect(membership?.acceptedAt).toBeTruthy()
    })

    it("should reject expired invitations", async () => {
      await testDb
        .update(organizationInvitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where((t, { eq }) => eq(t.id, invitation.id))

      const result = await acceptInvitation(invitation.token)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("should reject wrong email", async () => {
      const [otherUser] = await testDb
        .insert(users)
        .values({ email: "other@example.com" })
        .returning()

      vi.mocked(dal.verifySession).mockResolvedValue({
        userId: otherUser.id as any,
        user: { id: otherUser.id, email: otherUser.email, name: null },
        activeOrganizationId: null,
      })

      const result = await acceptInvitation(invitation.token)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })

  describe("declineInvitation", () => {
    let invitedUser: typeof users.$inferSelect
    let invitation: typeof organizationInvitations.$inferSelect

    beforeEach(async () => {
      ;[invitedUser] = await testDb
        .insert(users)
        .values({ email: "invited@example.com" })
        .returning()

      ;[invitation] = await testDb
        .insert(organizationInvitations)
        .values({
          organizationId: testOrg.id,
          email: invitedUser.email,
          role: "member",
          token: "test-token",
          invitedBy: testUser.id,
          status: "pending",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .returning()

      vi.mocked(dal.verifySession).mockResolvedValue({
        userId: invitedUser.id as any,
        user: {
          id: invitedUser.id,
          email: invitedUser.email,
          name: invitedUser.name,
        },
        activeOrganizationId: null,
      })
    })

    it("should decline invitation", async () => {
      const result = await declineInvitation(invitation.token)

      expect(result.success).toBe(true)

      const updatedInvitation =
        await testDb.query.organizationInvitations.findFirst({
          where: (t, { eq }) => eq(t.id, invitation.id),
        })
      expect(updatedInvitation?.status).toBe("declined")

      const membership = await testDb.query.organizationMembers.findFirst({
        where: (t, { eq, and }) =>
          and(
            eq(t.organizationId, testOrg.id),
            eq(t.userId, invitedUser.id)
          ),
      })
      expect(membership).toBeUndefined()
    })
  })
})
