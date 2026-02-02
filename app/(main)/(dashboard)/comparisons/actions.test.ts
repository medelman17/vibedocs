// app/(dashboard)/comparisons/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { testDb } from "@/test/setup"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestDocument,
  createTestComparison,
  createTestReferenceDocument,
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
  withTenant: vi.fn(async () => {
    if (!mockTenantContext) {
      throw new Error("REDIRECT:/onboarding")
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

describe("comparisons/actions", () => {
  beforeEach(() => {
    mockTenantContext = null
    resetFactoryCounter()
  })

  describe("createComparison", () => {
    it("creates a comparison between two documents", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const docA = await createTestDocument(org.id, { title: "Doc A" })
      const docB = await createTestDocument(org.id, { title: "Doc B" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { createComparison } = await import("./actions")
      const result = await createComparison({
        documentAId: docA.id,
        documentBId: docB.id,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.documentAId).toBe(docA.id)
        expect(result.data.documentBId).toBe(docB.id)
        expect(result.data.status).toBe("pending")
      }
    })

    it("rejects comparing a document with itself", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { createComparison } = await import("./actions")
      const result = await createComparison({
        documentAId: doc.id,
        documentBId: doc.id,
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
        expect(result.error.message).toContain("Cannot compare a document with itself")
      }
    })

    it("returns NOT_FOUND for non-existent document A", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const docB = await createTestDocument(org.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { createComparison } = await import("./actions")
      const result = await createComparison({
        documentAId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        documentBId: docB.id,
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
        expect(result.error.message).toContain("Document A")
      }
    })

    it("returns NOT_FOUND for non-existent document B", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const docA = await createTestDocument(org.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { createComparison } = await import("./actions")
      const result = await createComparison({
        documentAId: docA.id,
        documentBId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
        expect(result.error.message).toContain("Document B")
      }
    })

    it("enforces tenant isolation", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const otherOrg = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const docA = await createTestDocument(org.id)
      const docB = await createTestDocument(otherOrg.id) // Other org
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { createComparison } = await import("./actions")
      const result = await createComparison({
        documentAId: docA.id,
        documentBId: docB.id,
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("requires tenant context", async () => {
      const { createComparison } = await import("./actions")
      await expect(
        createComparison({
          documentAId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
          documentBId: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
        })
      ).rejects.toThrow("REDIRECT:/onboarding")
    })
  })

  describe("compareWithTemplate", () => {
    it("creates a comparison with a reference template", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const template = await createTestReferenceDocument({ title: "Bonterms NDA" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { compareWithTemplate } = await import("./actions")
      const result = await compareWithTemplate({
        documentId: doc.id,
        templateId: template.id,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.documentAId).toBe(doc.id)
        expect(result.data.status).toBe("pending")
      }
    })

    it("returns NOT_FOUND for non-existent document", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const template = await createTestReferenceDocument()
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { compareWithTemplate } = await import("./actions")
      const result = await compareWithTemplate({
        documentId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        templateId: template.id,
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("returns NOT_FOUND for non-existent template", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { compareWithTemplate } = await import("./actions")
      const result = await compareWithTemplate({
        documentId: doc.id,
        templateId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
        expect(result.error.message).toContain("template")
      }
    })
  })

  describe("getComparison", () => {
    it("returns comparison with documents", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const docA = await createTestDocument(org.id)
      const docB = await createTestDocument(org.id)
      const comparison = await createTestComparison(org.id, docA.id, docB.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getComparison } = await import("./actions")
      const result = await getComparison({ comparisonId: comparison.id })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(comparison.id)
        expect(result.data.documentA).toBeDefined()
        expect(result.data.documentB).toBeDefined()
      }
    })

    it("returns NOT_FOUND for non-existent comparison", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getComparison } = await import("./actions")
      const result = await getComparison({
        comparisonId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("enforces tenant isolation", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const otherOrg = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const docA = await createTestDocument(otherOrg.id)
      const docB = await createTestDocument(otherOrg.id)
      const comparison = await createTestComparison(otherOrg.id, docA.id, docB.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getComparison } = await import("./actions")
      const result = await getComparison({ comparisonId: comparison.id })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })

  describe("getComparisonStatus", () => {
    it("returns lightweight status for polling", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const docA = await createTestDocument(org.id)
      const docB = await createTestDocument(org.id)
      const comparison = await createTestComparison(org.id, docA.id, docB.id, {
        status: "processing",
      })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getComparisonStatus } = await import("./actions")
      const result = await getComparisonStatus({ comparisonId: comparison.id })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(comparison.id)
        expect(result.data.status).toBe("processing")
      }
    })

    it("validates comparison ID format", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getComparisonStatus } = await import("./actions")
      const result = await getComparisonStatus({ comparisonId: "invalid-uuid" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })
  })

  describe("getDocumentComparisons", () => {
    it("returns all comparisons for a document", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const docB = await createTestDocument(org.id)
      const docC = await createTestDocument(org.id)
      await createTestComparison(org.id, doc.id, docB.id)
      await createTestComparison(org.id, docC.id, doc.id) // doc as B
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getDocumentComparisons } = await import("./actions")
      const result = await getDocumentComparisons({ documentId: doc.id })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
      }
    })

    it("returns NOT_FOUND for non-existent document", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getDocumentComparisons } = await import("./actions")
      const result = await getDocumentComparisons({
        documentId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })

  describe("retryComparison", () => {
    it("retries a comparison with error status", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const docA = await createTestDocument(org.id)
      const docB = await createTestDocument(org.id)
      const comparison = await createTestComparison(org.id, docA.id, docB.id, {
        status: "error",
      })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { retryComparison } = await import("./actions")
      const result = await retryComparison({ comparisonId: comparison.id })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe("pending")
      }
    })

    it("rejects retry for non-error status", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const docA = await createTestDocument(org.id)
      const docB = await createTestDocument(org.id)
      const comparison = await createTestComparison(org.id, docA.id, docB.id, {
        status: "completed",
      })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { retryComparison } = await import("./actions")
      const result = await retryComparison({ comparisonId: comparison.id })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("BAD_REQUEST")
        expect(result.error.message).toContain("error")
      }
    })

    it("returns NOT_FOUND for non-existent comparison", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { retryComparison } = await import("./actions")
      const result = await retryComparison({
        comparisonId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })

  describe("deleteComparison", () => {
    it("deletes a comparison", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const docA = await createTestDocument(org.id)
      const docB = await createTestDocument(org.id)
      const comparison = await createTestComparison(org.id, docA.id, docB.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { deleteComparison } = await import("./actions")
      const result = await deleteComparison({ comparisonId: comparison.id })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.deleted).toBe(true)
      }
    })

    it("returns NOT_FOUND for non-existent comparison", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { deleteComparison } = await import("./actions")
      const result = await deleteComparison({
        comparisonId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("enforces tenant isolation", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const otherOrg = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const docA = await createTestDocument(otherOrg.id)
      const docB = await createTestDocument(otherOrg.id)
      const comparison = await createTestComparison(otherOrg.id, docA.id, docB.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { deleteComparison } = await import("./actions")
      const result = await deleteComparison({ comparisonId: comparison.id })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })
})
