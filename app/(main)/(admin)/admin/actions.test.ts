/**
 * @fileoverview Admin Actions Tests
 *
 * Tests admin document CRUD operations using PGlite in-memory database.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { testDb } from "@/test/setup"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestDocument,
  createTestAnalysis,
  resetFactoryCounter,
} from "@/test/factories"
import { documents, analyses, comparisons } from "@/db/schema"
import { eq } from "drizzle-orm"

// Store mock state at module level
let mockRoleContext: {
  db: typeof testDb
  userId: string
  user: { id: string; name: string; email: string }
  tenantId: string
  role: string
} | null = null

// Mock the DAL module
vi.mock("@/lib/dal", () => ({
  requireRole: vi.fn(async () => {
    if (!mockRoleContext) {
      throw new Error("REDIRECT:/dashboard?error=unauthorized")
    }
    return mockRoleContext
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

// Mock blob operations
vi.mock("@/lib/blob", () => ({
  deleteFile: vi.fn(async () => undefined),
}))

// Mock inngest
const mockInngestSend = vi.fn().mockResolvedValue({ ids: ["run_123"] })
vi.mock("@/inngest", () => ({
  inngest: {
    send: mockInngestSend,
  },
}))

// Mock revalidatePath
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

// Helper to set up admin role context
function setupAdminContext(params: {
  user: { id: string; name: string | null; email: string }
  org: { id: string }
}): void {
  mockRoleContext = {
    db: testDb,
    userId: params.user.id,
    user: {
      id: params.user.id,
      name: params.user.name ?? "Admin User",
      email: params.user.email,
    },
    tenantId: params.org.id,
    role: "admin",
  }
}

describe("Admin Actions", () => {
  beforeEach(() => {
    mockRoleContext = null
    resetFactoryCounter()
    mockInngestSend.mockClear()
  })

  describe("adminGetDocuments", () => {
    it("returns paginated results with total count", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupAdminContext({ user, org })

      // Create test documents
      await createTestDocument(org.id, { title: "Test Doc 1", status: "ready" })
      await createTestDocument(org.id, { title: "Test Doc 2", status: "ready" })

      const { adminGetDocuments } = await import("./actions")
      const result = await adminGetDocuments({
        page: 1,
        pageSize: 10,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.documents).toHaveLength(2)
        expect(result.data.total).toBe(2)
      }
    })

    it("filters by search term", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupAdminContext({ user, org })

      await createTestDocument(org.id, { title: "Acme NDA", status: "ready" })
      await createTestDocument(org.id, {
        title: "TechCorp Agreement",
        status: "ready",
      })

      const { adminGetDocuments } = await import("./actions")
      const result = await adminGetDocuments({
        page: 1,
        pageSize: 10,
        search: "Acme",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.documents).toHaveLength(1)
        expect(result.data.documents[0].title).toBe("Acme NDA")
      }
    })

    it("filters by status", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupAdminContext({ user, org })

      await createTestDocument(org.id, { title: "Ready Doc", status: "ready" })
      await createTestDocument(org.id, {
        title: "Pending Doc",
        status: "pending",
      })

      const { adminGetDocuments } = await import("./actions")
      const result = await adminGetDocuments({
        page: 1,
        pageSize: 10,
        status: "ready",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.documents).toHaveLength(1)
        expect(result.data.documents[0].status).toBe("ready")
      }
    })
  })

  describe("adminUpdateDocumentTitle", () => {
    it("updates document title successfully", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupAdminContext({ user, org })

      const doc = await createTestDocument(org.id, {
        title: "Old Title",
        status: "ready",
      })

      const { adminUpdateDocumentTitle } = await import("./actions")
      const result = await adminUpdateDocumentTitle({
        documentId: doc.id,
        title: "New Title",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.title).toBe("New Title")
      }
    })
  })

  describe("adminDeleteDocument", () => {
    it("cascade deletes comparisons when document is deleted", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupAdminContext({ user, org })

      // Create two documents
      const docA = await createTestDocument(org.id, {
        title: "Document A",
        status: "ready",
      })
      const docB = await createTestDocument(org.id, {
        title: "Document B",
        status: "ready",
      })

      // Create comparison between them
      await testDb.insert(comparisons).values({
        tenantId: org.id,
        documentAId: docA.id,
        documentBId: docB.id,
        status: "pending",
      })

      // Verify comparison exists
      const beforeDelete = await testDb
        .select()
        .from(comparisons)
        .where(eq(comparisons.tenantId, org.id))
      expect(beforeDelete).toHaveLength(1)

      // Delete document A
      const { adminDeleteDocument } = await import("./actions")
      const result = await adminDeleteDocument({ documentId: docA.id })
      expect(result.success).toBe(true)

      // Verify comparison was deleted
      const afterDelete = await testDb
        .select()
        .from(comparisons)
        .where(eq(comparisons.tenantId, org.id))
      expect(afterDelete).toHaveLength(0)

      // Verify document A is gone
      const docAAfter = await testDb
        .select()
        .from(documents)
        .where(eq(documents.id, docA.id))
      expect(docAAfter).toHaveLength(0)

      // Verify document B still exists
      const docBAfter = await testDb
        .select()
        .from(documents)
        .where(eq(documents.id, docB.id))
      expect(docBAfter).toHaveLength(1)
    })

    it("deletes comparisons where document is documentAId", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupAdminContext({ user, org })

      const docA = await createTestDocument(org.id, {
        title: "Document A",
        status: "ready",
      })
      const docB = await createTestDocument(org.id, {
        title: "Document B",
        status: "ready",
      })

      await testDb.insert(comparisons).values({
        tenantId: org.id,
        documentAId: docA.id,
        documentBId: docB.id,
        status: "pending",
      })

      const { adminDeleteDocument } = await import("./actions")
      await adminDeleteDocument({ documentId: docA.id })

      const remainingComparisons = await testDb
        .select()
        .from(comparisons)
        .where(eq(comparisons.tenantId, org.id))
      expect(remainingComparisons).toHaveLength(0)
    })

    it("deletes comparisons where document is documentBId", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupAdminContext({ user, org })

      const docA = await createTestDocument(org.id, {
        title: "Document A",
        status: "ready",
      })
      const docB = await createTestDocument(org.id, {
        title: "Document B",
        status: "ready",
      })

      await testDb.insert(comparisons).values({
        tenantId: org.id,
        documentAId: docA.id,
        documentBId: docB.id,
        status: "pending",
      })

      const { adminDeleteDocument } = await import("./actions")
      await adminDeleteDocument({ documentId: docB.id })

      const remainingComparisons = await testDb
        .select()
        .from(comparisons)
        .where(eq(comparisons.tenantId, org.id))
      expect(remainingComparisons).toHaveLength(0)
    })
  })

  describe("adminBulkDeleteDocuments", () => {
    it("handles partial failures gracefully", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupAdminContext({ user, org })

      const doc1 = await createTestDocument(org.id, {
        title: "Existing Doc",
        status: "ready",
      })

      const { adminBulkDeleteDocuments } = await import("./actions")
      const result = await adminBulkDeleteDocuments({
        documentIds: [doc1.id, "550e8400-e29b-41d4-a716-446655440000"],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.deleted).toBe(1)
        expect(result.data.errors).toHaveLength(1)
        expect(result.data.errors[0]).toContain("not found")
      }
    })
  })

  describe("adminDeleteAnalysis", () => {
    it("allows deleting the last analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupAdminContext({ user, org })

      const doc = await createTestDocument(org.id, {
        title: "Test Doc",
        status: "ready",
      })

      const analysis = await createTestAnalysis(org.id, doc.id, {
        status: "completed",
        version: 1,
      })

      // Verify analysis exists
      const beforeDelete = await testDb
        .select()
        .from(analyses)
        .where(eq(analyses.documentId, doc.id))
      expect(beforeDelete).toHaveLength(1)

      // Delete the last (and only) analysis
      const { adminDeleteAnalysis } = await import("./actions")
      const result = await adminDeleteAnalysis({ analysisId: analysis.id })
      expect(result.success).toBe(true)

      // Verify analysis was deleted
      const afterDelete = await testDb
        .select()
        .from(analyses)
        .where(eq(analyses.documentId, doc.id))
      expect(afterDelete).toHaveLength(0)
    })
  })

  describe("adminTriggerAnalysis", () => {
    it("creates new analysis and sends inngest event", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "admin")
      setupAdminContext({ user, org })

      const doc = await createTestDocument(org.id, {
        title: "Test Doc",
        status: "ready",
      })

      const { adminTriggerAnalysis } = await import("./actions")
      const result = await adminTriggerAnalysis({ documentId: doc.id })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe("pending")
        expect(result.data.version).toBe(1)
      }

      // Verify inngest event was sent
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "nda/analysis.requested",
          data: expect.objectContaining({
            tenantId: org.id,
            documentId: doc.id,
            source: "web",
          }),
        })
      )
    })
  })
})
