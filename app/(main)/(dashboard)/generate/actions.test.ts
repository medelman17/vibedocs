// app/(dashboard)/generate/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { testDb } from "@/test/setup"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestGeneratedNda,
  createTestReferenceDocument,
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
}))

// Mock the db module to use testDb (for both shared and tenant queries)
vi.mock("@/db", async () => {
  const { testDb } = await import("@/test/setup")
  const schema = await import("@/db/schema")
  return {
    db: testDb,
    ...schema,
  }
})

// Helper to set up session context (for template actions)
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

// Helper to set up tenant context (for generated NDA actions)
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

describe("generate/actions", () => {
  beforeEach(() => {
    mockSessionContext = null
    mockTenantContext = null
    resetFactoryCounter()
  })

  describe("getTemplates", () => {
    it("returns all templates when no filter", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })
      await createTestReferenceDocument({ source: "bonterms", title: "Bonterms NDA" })
      await createTestReferenceDocument({ source: "commonaccord", title: "CommonAccord NDA" })

      const { getTemplates } = await import("./actions")
      const result = await getTemplates()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
      }
    })

    it("filters by source", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })
      await createTestReferenceDocument({ source: "bonterms", title: "Bonterms NDA" })
      await createTestReferenceDocument({ source: "commonaccord", title: "CommonAccord NDA" })

      const { getTemplates } = await import("./actions")
      const result = await getTemplates("bonterms")

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].source).toBe("bonterms")
      }
    })

    it("requires authentication", async () => {
      const { getTemplates } = await import("./actions")
      const result = await getTemplates()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain("REDIRECT:/login")
      }
    })
  })

  describe("getTemplate", () => {
    it("returns template with preview", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })
      const template = await createTestReferenceDocument({
        title: "Test Template",
        rawText: "Template content here",
      })

      const { getTemplate } = await import("./actions")
      const result = await getTemplate(template.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(template.id)
        expect(result.data.title).toBe("Test Template")
        expect(result.data.rawText).toBe("Template content here")
      }
    })

    it("returns NOT_FOUND for non-existent template", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { getTemplate } = await import("./actions")
      const result = await getTemplate("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("validates template ID format", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { getTemplate } = await import("./actions")
      const result = await getTemplate("invalid-uuid")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })
  })

  describe("generateNda", () => {
    it("creates a new NDA from template", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { generateNda } = await import("./actions")
      const result = await generateNda({
        templateSource: "bonterms",
        title: "My New NDA",
        parameters: {
          disclosingParty: { name: "Acme Corp" },
          receivingParty: { name: "Test Inc" },
          effectiveDate: "2024-01-01",
          termYears: 2,
          mutual: true,
          governingLaw: "California",
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.title).toBe("My New NDA")
        expect(result.data.templateSource).toBe("bonterms")
        expect(result.data.status).toBe("draft")
      }
    })

    it("validates required parameters", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { generateNda } = await import("./actions")
      const result = await generateNda({
        templateSource: "bonterms",
        title: "",
        parameters: {
          disclosingParty: { name: "Acme" },
          receivingParty: { name: "Test" },
          effectiveDate: "2024-01-01",
          termYears: 2,
          mutual: true,
          governingLaw: "California",
        },
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires tenant context", async () => {
      const { generateNda } = await import("./actions")
      const result = await generateNda({
        templateSource: "bonterms",
        title: "Test",
        parameters: {
          disclosingParty: { name: "Acme" },
          receivingParty: { name: "Test" },
          effectiveDate: "2024-01-01",
          termYears: 2,
          mutual: true,
          governingLaw: "California",
        },
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain("REDIRECT:/onboarding")
      }
    })
  })

  describe("getGeneratedNda", () => {
    it("returns NDA by ID", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(org.id, user.id, { title: "My NDA" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getGeneratedNda } = await import("./actions")
      const result = await getGeneratedNda(nda.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(nda.id)
        expect(result.data.title).toBe("My NDA")
      }
    })

    it("returns NOT_FOUND for non-existent NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getGeneratedNda } = await import("./actions")
      const result = await getGeneratedNda("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("enforces tenant isolation", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const otherOrg = await createTestOrg()
      const otherUser = await createTestUser()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(otherOrg.id, otherUser.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getGeneratedNda } = await import("./actions")
      const result = await getGeneratedNda(nda.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })

  describe("getGeneratedNdas", () => {
    it("returns paginated list of NDAs", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      await createTestGeneratedNda(org.id, user.id, { title: "NDA 1" })
      await createTestGeneratedNda(org.id, user.id, { title: "NDA 2" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getGeneratedNdas } = await import("./actions")
      const result = await getGeneratedNdas({ limit: 10 })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
      }
    })

    it("filters by status", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      await createTestGeneratedNda(org.id, user.id, { status: "draft" })
      await createTestGeneratedNda(org.id, user.id, { status: "finalized" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getGeneratedNdas } = await import("./actions")
      const result = await getGeneratedNdas({ status: "draft" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].status).toBe("draft")
      }
    })
  })

  describe("updateGeneratedNda", () => {
    it("updates a draft NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(org.id, user.id, { status: "draft" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { updateGeneratedNda } = await import("./actions")
      const result = await updateGeneratedNda({
        id: nda.id,
        title: "Updated Title",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.title).toBe("Updated Title")
      }
    })

    it("rejects update of finalized NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(org.id, user.id, { status: "finalized" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { updateGeneratedNda } = await import("./actions")
      const result = await updateGeneratedNda({
        id: nda.id,
        title: "New Title",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("BAD_REQUEST")
        expect(result.error.message).toContain("draft")
      }
    })
  })

  describe("duplicateGeneratedNda", () => {
    it("creates a copy of an NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(org.id, user.id, { title: "Original NDA" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { duplicateGeneratedNda } = await import("./actions")
      const result = await duplicateGeneratedNda(nda.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.title).toBe("Original NDA (Copy)")
        expect(result.data.status).toBe("draft")
        expect(result.data.id).not.toBe(nda.id)
      }
    })

    it("returns NOT_FOUND for non-existent NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { duplicateGeneratedNda } = await import("./actions")
      const result = await duplicateGeneratedNda("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })

  describe("finalizeNda", () => {
    it("finalizes a draft NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(org.id, user.id, { status: "draft" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { finalizeNda } = await import("./actions")
      const result = await finalizeNda(nda.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe("finalized")
      }
    })

    it("rejects finalization of non-draft NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(org.id, user.id, { status: "finalized" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { finalizeNda } = await import("./actions")
      const result = await finalizeNda(nda.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("BAD_REQUEST")
      }
    })
  })

  describe("archiveGeneratedNda", () => {
    it("archives an NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(org.id, user.id, { status: "finalized" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { archiveGeneratedNda } = await import("./actions")
      const result = await archiveGeneratedNda(nda.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe("archived")
      }
    })

    it("rejects archiving already archived NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(org.id, user.id, { status: "archived" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { archiveGeneratedNda } = await import("./actions")
      const result = await archiveGeneratedNda(nda.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("BAD_REQUEST")
      }
    })
  })

  describe("deleteGeneratedNda", () => {
    it("deletes an NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(org.id, user.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { deleteGeneratedNda } = await import("./actions")
      const result = await deleteGeneratedNda(nda.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.deleted).toBe(true)
      }
    })

    it("returns NOT_FOUND for non-existent NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { deleteGeneratedNda } = await import("./actions")
      const result = await deleteGeneratedNda("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("enforces tenant isolation", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const otherOrg = await createTestOrg()
      const otherUser = await createTestUser()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(otherOrg.id, otherUser.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { deleteGeneratedNda } = await import("./actions")
      const result = await deleteGeneratedNda(nda.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })

  describe("exportGeneratedNda", () => {
    it("returns SERVICE_UNAVAILABLE (placeholder)", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(org.id, user.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { exportGeneratedNda } = await import("./actions")
      const result = await exportGeneratedNda({ id: nda.id, format: "pdf" })

      // Placeholder returns SERVICE_UNAVAILABLE
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("SERVICE_UNAVAILABLE")
      }
    })

    it("returns NOT_FOUND for non-existent NDA", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { exportGeneratedNda } = await import("./actions")
      const result = await exportGeneratedNda({
        id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        format: "docx",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("validates export format", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const nda = await createTestGeneratedNda(org.id, user.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { exportGeneratedNda } = await import("./actions")
      // @ts-expect-error testing invalid format
      const result = await exportGeneratedNda({ id: nda.id, format: "invalid" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("validates NDA ID format", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { exportGeneratedNda } = await import("./actions")
      const result = await exportGeneratedNda({ id: "not-a-uuid", format: "pdf" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })
  })

  describe("generateNda with optional clauses", () => {
    it("generates NDA with non-solicitation clause", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { generateNda } = await import("./actions")
      const result = await generateNda({
        templateSource: "bonterms",
        title: "NDA with Non-Solicit",
        parameters: {
          disclosingParty: { name: "Acme Corp" },
          receivingParty: { name: "Test Inc" },
          effectiveDate: "2024-01-01",
          termYears: 2,
          mutual: false,
          governingLaw: "Delaware",
          includeNonSolicit: true,
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.content).toContain("NON-SOLICITATION")
      }
    })

    it("generates NDA with non-compete clause", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { generateNda } = await import("./actions")
      const result = await generateNda({
        templateSource: "commonaccord",
        title: "NDA with Non-Compete",
        parameters: {
          disclosingParty: { name: "Acme Corp" },
          receivingParty: { name: "Test Inc" },
          effectiveDate: "2024-01-01",
          termYears: 3,
          mutual: true,
          governingLaw: "New York",
          includeNonCompete: true,
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.content).toContain("NON-COMPETE")
      }
    })

    it("generates NDA with both non-solicit and non-compete", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { generateNda } = await import("./actions")
      const result = await generateNda({
        templateSource: "bonterms",
        title: "Full NDA",
        parameters: {
          disclosingParty: {
            name: "Acme Corp",
            jurisdiction: "Delaware",
            signerName: "John Doe",
            signerTitle: "CEO",
          },
          receivingParty: {
            name: "Test Inc",
            jurisdiction: "California",
            signerName: "Jane Smith",
            signerTitle: "CTO",
          },
          effectiveDate: "2024-06-01",
          termYears: 5,
          mutual: true,
          governingLaw: "California",
          disputeResolution: "arbitration",
          purposeDescription: "software development partnership",
          includeNonSolicit: true,
          includeNonCompete: true,
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.content).toContain("NON-SOLICITATION")
        expect(result.data.content).toContain("NON-COMPETE")
        expect(result.data.content).toContain("arbitration")
        expect(result.data.content).toContain("software development partnership")
        expect(result.data.content).toContain("John Doe")
        expect(result.data.content).toContain("Jane Smith")
      }
    })
  })
})
