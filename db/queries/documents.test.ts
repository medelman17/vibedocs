// src/db/queries/documents.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { eq } from "drizzle-orm"
import { documents } from "@/db/schema"
import {
  createTestOrg,
  createTestDocument,
  createTestChunk,
} from "@/test/factories"
import {
  getDocumentsByTenant,
  getDocumentById,
  getDocumentWithChunks,
  updateDocumentStatus,
  softDeleteDocument,
  createDocumentChunks,
} from "./documents"

describe("document queries", () => {
  describe("getDocumentsByTenant", () => {
    it("returns only documents for specified tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })

      await createTestDocument(orgA.id, { title: "Doc A" })
      await createTestDocument(orgB.id, { title: "Doc B" })

      const docs = await getDocumentsByTenant(orgA.id)

      expect(docs).toHaveLength(1)
      expect(docs[0].title).toBe("Doc A")
    })

    it("excludes soft-deleted documents", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      // Soft delete
      await testDb
        .update(documents)
        .set({ deletedAt: new Date() })
        .where(eq(documents.id, doc.id))

      const docs = await getDocumentsByTenant(org.id)

      expect(docs).toHaveLength(0)
    })

    it("filters by status when provided", async () => {
      const org = await createTestOrg()
      await createTestDocument(org.id, { status: "pending" })
      await createTestDocument(org.id, { status: "complete" })

      const docs = await getDocumentsByTenant(org.id, { status: "complete" })

      expect(docs).toHaveLength(1)
      expect(docs[0].status).toBe("complete")
    })

    it("orders by createdAt descending", async () => {
      const org = await createTestOrg()
      const doc1 = await createTestDocument(org.id, { title: "First" })
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10))
      const doc2 = await createTestDocument(org.id, { title: "Second" })

      const docs = await getDocumentsByTenant(org.id)

      // Most recent first
      expect(docs[0].id).toBe(doc2.id)
      expect(docs[1].id).toBe(doc1.id)
    })

    it("respects limit and offset", async () => {
      const org = await createTestOrg()
      await createTestDocument(org.id, { title: "Doc 1" })
      await createTestDocument(org.id, { title: "Doc 2" })
      await createTestDocument(org.id, { title: "Doc 3" })

      const page1 = await getDocumentsByTenant(org.id, { limit: 2, offset: 0 })
      const page2 = await getDocumentsByTenant(org.id, { limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(1)
    })

    it("returns empty array for tenant with no documents", async () => {
      const org = await createTestOrg()

      const docs = await getDocumentsByTenant(org.id)

      expect(docs).toEqual([])
    })
  })

  describe("getDocumentById", () => {
    it("returns document matching id and tenant", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const found = await getDocumentById(doc.id, org.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(doc.id)
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)

      const found = await getDocumentById(doc.id, orgB.id)

      expect(found).toBeNull()
    })

    it("returns null for soft-deleted document", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      await testDb
        .update(documents)
        .set({ deletedAt: new Date() })
        .where(eq(documents.id, doc.id))

      const found = await getDocumentById(doc.id, org.id)

      expect(found).toBeNull()
    })

    it("returns null for non-existent id", async () => {
      const org = await createTestOrg()

      const found = await getDocumentById("00000000-0000-0000-0000-000000000000", org.id)

      expect(found).toBeNull()
    })
  })

  describe("getDocumentWithChunks", () => {
    it("returns document with ordered chunks", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestChunk(org.id, doc.id, 2, { content: "Chunk 2" })
      await createTestChunk(org.id, doc.id, 0, { content: "Chunk 0" })
      await createTestChunk(org.id, doc.id, 1, { content: "Chunk 1" })

      const result = await getDocumentWithChunks(doc.id, org.id)

      expect(result).not.toBeNull()
      expect(result!.chunks).toHaveLength(3)
      expect(result!.chunks[0].chunkIndex).toBe(0)
      expect(result!.chunks[1].chunkIndex).toBe(1)
      expect(result!.chunks[2].chunkIndex).toBe(2)
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)

      const result = await getDocumentWithChunks(doc.id, orgB.id)

      expect(result).toBeNull()
    })

    it("returns empty chunks array when none exist", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const result = await getDocumentWithChunks(doc.id, org.id)

      expect(result).not.toBeNull()
      expect(result!.chunks).toEqual([])
    })
  })

  describe("updateDocumentStatus", () => {
    it("updates status and updatedAt", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const originalUpdatedAt = doc.updatedAt

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10))

      const updated = await updateDocumentStatus(doc.id, org.id, "complete")

      expect(updated).not.toBeNull()
      expect(updated!.status).toBe("complete")
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
    })

    it("sets error message when provided", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const updated = await updateDocumentStatus(doc.id, org.id, "failed", "Parse error")

      expect(updated!.errorMessage).toBe("Parse error")
    })

    it("clears error message when not provided", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id, { errorMessage: "Old error" })

      const updated = await updateDocumentStatus(doc.id, org.id, "pending")

      expect(updated!.errorMessage).toBeNull()
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)

      const updated = await updateDocumentStatus(doc.id, orgB.id, "complete")

      expect(updated).toBeNull()
    })
  })

  describe("softDeleteDocument", () => {
    it("sets deletedAt timestamp", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const deleted = await softDeleteDocument(doc.id, org.id)

      expect(deleted).not.toBeNull()
      expect(deleted!.deletedAt).not.toBeNull()
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)

      const deleted = await softDeleteDocument(doc.id, orgB.id)

      expect(deleted).toBeNull()
    })
  })

  describe("createDocumentChunks", () => {
    it("inserts multiple chunks in batch", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const chunks = await createDocumentChunks(org.id, doc.id, [
        { content: "Chunk 0", chunkIndex: 0 },
        { content: "Chunk 1", chunkIndex: 1 },
        { content: "Chunk 2", chunkIndex: 2 },
      ])

      expect(chunks).toHaveLength(3)
    })

    it("returns empty array for empty input", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const chunks = await createDocumentChunks(org.id, doc.id, [])

      expect(chunks).toEqual([])
    })

    it("sets correct chunk indexes", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const chunks = await createDocumentChunks(org.id, doc.id, [
        { content: "A", chunkIndex: 0 },
        { content: "B", chunkIndex: 1 },
      ])

      expect(chunks[0].chunkIndex).toBe(0)
      expect(chunks[1].chunkIndex).toBe(1)
    })
  })
})
