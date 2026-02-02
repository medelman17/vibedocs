// src/db/schema/documents.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { eq } from "drizzle-orm"
import { documents, documentChunks } from "./index"
import { createTestOrg, createTestDocument, createTestChunk } from "@/test/factories"

describe("documents schema", () => {
  describe("documents", () => {
    it("creates document with required fields", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      expect(doc.id).toBeDefined()
      expect(doc.tenantId).toBe(org.id)
      expect(doc.title).toBe("Test Document")
      expect(doc.fileName).toBe("test.pdf")
      expect(doc.fileType).toBe("pdf")
    })

    it("sets default status to pending", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      expect(doc.status).toBe("pending")
    })

    it("soft delete sets deletedAt without removing row", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      // Soft delete
      const [updated] = await testDb
        .update(documents)
        .set({ deletedAt: new Date() })
        .where(eq(documents.id, doc.id))
        .returning()

      expect(updated.deletedAt).not.toBeNull()

      // Row still exists
      const [found] = await testDb
        .select()
        .from(documents)
        .where(eq(documents.id, doc.id))

      expect(found).toBeDefined()
      expect(found.deletedAt).not.toBeNull()
    })

    it("allows null for optional fields", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id, {
        rawText: null,
        fileUrl: null,
        contentHash: null,
      })

      expect(doc.rawText).toBeNull()
      expect(doc.fileUrl).toBeNull()
      expect(doc.contentHash).toBeNull()
    })
  })

  describe("documentChunks", () => {
    it("creates chunk linked to document", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const chunk = await createTestChunk(org.id, doc.id, 0)

      expect(chunk.id).toBeDefined()
      expect(chunk.documentId).toBe(doc.id)
      expect(chunk.chunkIndex).toBe(0)
    })

    it("enforces unique (documentId, chunkIndex)", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      await createTestChunk(org.id, doc.id, 0)

      // Duplicate should fail
      await expect(
        createTestChunk(org.id, doc.id, 0)
      ).rejects.toThrow()
    })

    it("cascades delete when document deleted", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestChunk(org.id, doc.id, 0)
      await createTestChunk(org.id, doc.id, 1)

      // Delete document
      await testDb.delete(documents).where(eq(documents.id, doc.id))

      // Chunks should be gone
      const chunks = await testDb
        .select()
        .from(documentChunks)
        .where(eq(documentChunks.documentId, doc.id))

      expect(chunks).toHaveLength(0)
    })

    it("stores section_path as array", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const chunk = await createTestChunk(org.id, doc.id, 0, {
        sectionPath: ["Article 1", "Section 1.1"],
      })

      expect(chunk.sectionPath).toEqual(["Article 1", "Section 1.1"])
    })
  })
})
