// app/(dashboard)/settings/organization/actions.test.ts
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

let mockTenantContext: {
  db: typeof testDb
  userId: string
  user: { id: string; name: string; email: string }
  tenantId: string
  role: string
} | null = null

// Mock the DAL module
vi.mock("@/lib/dal", () => ({
  verifySession: vi.fn(async () => {
    if (!mockSessionContext) {
      throw new Error("REDIRECT:/login")
    }
    return mockSessionContext
  }),
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

// Mock the db module for createOrganization which uses sharedDb
vi.mock("@/db", async () => {
  const { testDb } = await import("@/test/setup")
  const schema = await import("@/db/schema")
  return {
    db: testDb,
    ...schema,
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
  // Also set session context
  mockSessionContext = {
    userId: params.user.id,
    user: {
      id: params.user.id,
      name: params.user.name ?? "Test User",
      email: params.user.email,
    },
    activeOrganizationId: params.org.id,
  }
}

describe("organization/actions", () => {
  beforeEach(() => {
    mockSessionContext = null
    mockTenantContext = null
    resetFactoryCounter()
  })

  describe("createOrganization", () => {
    it("creates a new organization with the user as owner", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { createOrganization } = await import("./actions")
      const result = await createOrganization({
        name: "Acme Corporation",
        slug: "acme-corp",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe("Acme Corporation")
        expect(result.data.slug).toBe("acme-corp")
        expect(result.data.plan).toBe("free")
      }
    })

    it("rejects duplicate slug", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      // Create existing org with the slug
      await createTestOrg({ slug: "taken-slug" })

      const { createOrganization } = await import("./actions")
      const result = await createOrganization({
        name: "New Org",
        slug: "taken-slug",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("DUPLICATE")
      }
    })

    it("validates slug format (lowercase, alphanumeric, hyphens only)", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { createOrganization } = await import("./actions")

      // Test invalid characters
      const result = await createOrganization({
        name: "Test Org",
        slug: "Invalid_Slug!",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("validates name is required", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { createOrganization } = await import("./actions")
      const result = await createOrganization({
        name: "",
        slug: "valid-slug",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires authentication", async () => {
      // Note: wrapError() catches redirects and returns them as INTERNAL_ERROR
      const { createOrganization } = await import("./actions")
      const result = await createOrganization({ name: "Test", slug: "test" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain("REDIRECT:/login")
      }
    })
  })

  describe("getOrganization", () => {
    it("returns the current organization with role", async () => {
      const user = await createTestUser()
      const org = await createTestOrg({ name: "My Org", slug: "my-org" })
      await createTestMembership(org.id, user.id, "admin")
      setupTenantContext({ user, org, membership: { role: "admin" } })

      const { getOrganization } = await import("./actions")
      const result = await getOrganization()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe("My Org")
        expect(result.data.slug).toBe("my-org")
        expect(result.data.role).toBe("admin")
      }
    })

    it("returns NOT_FOUND for soft-deleted organization", async () => {
      const user = await createTestUser()
      const org = await createTestOrg({ deletedAt: new Date() })
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      const { getOrganization } = await import("./actions")
      const result = await getOrganization()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("requires tenant context", async () => {
      // Note: wrapError() catches redirects and returns them as INTERNAL_ERROR
      const { getOrganization } = await import("./actions")
      const result = await getOrganization()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain("REDIRECT:/onboarding")
      }
    })
  })

  describe("updateOrganization", () => {
    it("updates organization name", async () => {
      const user = await createTestUser()
      const org = await createTestOrg({ name: "Old Name" })
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      const { updateOrganization } = await import("./actions")
      const result = await updateOrganization({ name: "New Name" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe("New Name")
      }
    })

    it("updates organization slug", async () => {
      const user = await createTestUser()
      const org = await createTestOrg({ slug: "old-slug" })
      await createTestMembership(org.id, user.id, "admin")
      setupTenantContext({ user, org, membership: { role: "admin" } })

      const { updateOrganization } = await import("./actions")
      const result = await updateOrganization({ slug: "new-slug" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.slug).toBe("new-slug")
      }
    })

    it("updates both name and slug", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      const { updateOrganization } = await import("./actions")
      const result = await updateOrganization({
        name: "Updated Name",
        slug: "updated-slug",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe("Updated Name")
        expect(result.data.slug).toBe("updated-slug")
      }
    })

    it("rejects slug that is already taken by another org", async () => {
      const user = await createTestUser()
      const org = await createTestOrg({ slug: "my-org" })
      await createTestMembership(org.id, user.id, "owner")

      // Create another org with the target slug
      await createTestOrg({ slug: "taken-slug" })

      setupTenantContext({ user, org, membership: { role: "owner" } })

      const { updateOrganization } = await import("./actions")
      const result = await updateOrganization({ slug: "taken-slug" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("DUPLICATE")
      }
    })

    it("allows keeping the same slug", async () => {
      const user = await createTestUser()
      const org = await createTestOrg({ slug: "my-slug" })
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      const { updateOrganization } = await import("./actions")
      const result = await updateOrganization({ slug: "my-slug" })

      expect(result.success).toBe(true)
    })

    it("requires at least one field to update", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      const { updateOrganization } = await import("./actions")
      const result = await updateOrganization({})

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

      // Note: wrapError() catches redirects and returns them as INTERNAL_ERROR
      const { updateOrganization } = await import("./actions")
      const result = await updateOrganization({ name: "New Name" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain("REDIRECT:/dashboard?error=unauthorized")
      }
    })
  })

  describe("deleteOrganization", () => {
    it("soft-deletes the organization", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      const { deleteOrganization } = await import("./actions")
      const result = await deleteOrganization()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.deletedAt).not.toBeNull()
      }
    })

    it("requires owner role", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupTenantContext({ user, org, membership: { role: "admin" } })

      // Note: wrapError() catches redirects and returns them as INTERNAL_ERROR
      const { deleteOrganization } = await import("./actions")
      const result = await deleteOrganization()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain("REDIRECT:/dashboard?error=unauthorized")
      }
    })

    it("returns NOT_FOUND for already deleted organization", async () => {
      const user = await createTestUser()
      const org = await createTestOrg({ deletedAt: new Date() })
      await createTestMembership(org.id, user.id, "owner")
      setupTenantContext({ user, org, membership: { role: "owner" } })

      const { deleteOrganization } = await import("./actions")
      const result = await deleteOrganization()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })
})
