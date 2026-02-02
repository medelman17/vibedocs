// src/db/schema/reference.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { eq, sql } from "drizzle-orm"
import {
  referenceDocuments,
  referenceEmbeddings,
  cuadCategories,
  contractNliHypotheses,
} from "./index"

describe("reference schema", () => {
  describe("referenceDocuments", () => {
    it("creates reference document", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({
          source: "cuad",
          title: "Test Contract",
        })
        .returning()

      expect(doc.id).toBeDefined()
      expect(doc.source).toBe("cuad")
      expect(doc.title).toBe("Test Contract")
    })

    it("enforces unique content_hash", async () => {
      await testDb.insert(referenceDocuments).values({
        source: "cuad",
        title: "Doc 1",
        contentHash: "hash123",
      })

      await expect(
        testDb.insert(referenceDocuments).values({
          source: "cuad",
          title: "Doc 2",
          contentHash: "hash123",
        })
      ).rejects.toThrow()
    })

    it("stores metadata as JSONB", async () => {
      const metadata = { categories: ["A", "B"], version: 1 }

      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({
          source: "cuad",
          title: "Test",
          metadata,
        })
        .returning()

      expect(doc.metadata).toEqual(metadata)
    })
  })

  describe("referenceEmbeddings", () => {
    it("creates embedding linked to document", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      const [embedding] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          granularity: "clause",
          content: "Test clause content",
          embedding: "mock-embedding",
        })
        .returning()

      expect(embedding.documentId).toBe(doc.id)
      expect(embedding.granularity).toBe("clause")
    })

    it("supports self-referential parent_id", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      const [parent] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          granularity: "section",
          content: "Parent section",
          embedding: "parent-embed",
        })
        .returning()

      const [child] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          parentId: parent.id,
          granularity: "clause",
          content: "Child clause",
          embedding: "child-embed",
        })
        .returning()

      expect(child.parentId).toBe(parent.id)
    })

    it("cascades delete when document deleted", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      await testDb.insert(referenceEmbeddings).values({
        documentId: doc.id,
        granularity: "clause",
        content: "Test",
        embedding: "embed",
      })

      await testDb.delete(referenceDocuments).where(eq(referenceDocuments.id, doc.id))

      const embeddings = await testDb
        .select()
        .from(referenceEmbeddings)
        .where(eq(referenceEmbeddings.documentId, doc.id))

      expect(embeddings).toHaveLength(0)
    })

    it("stores section_path as array", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      const [embedding] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          granularity: "clause",
          content: "Test",
          embedding: "embed",
          sectionPath: ["Article 1", "Section 1.1"],
        })
        .returning()

      expect(embedding.sectionPath).toEqual(["Article 1", "Section 1.1"])
    })
  })

  describe("cuadCategories", () => {
    it("creates category with serial ID", async () => {
      const [cat] = await testDb
        .insert(cuadCategories)
        .values({ name: "Non-Compete" })
        .returning()

      expect(cat.id).toBeGreaterThan(0)
      expect(cat.name).toBe("Non-Compete")
    })

    it("enforces unique name", async () => {
      await testDb.insert(cuadCategories).values({ name: "Unique Cat" })

      await expect(
        testDb.insert(cuadCategories).values({ name: "Unique Cat" })
      ).rejects.toThrow()
    })

    it("sets default risk_weight to 1.0", async () => {
      const [cat] = await testDb
        .insert(cuadCategories)
        .values({ name: "Default Weight" })
        .returning()

      expect(cat.riskWeight).toBe(1.0)
    })
  })

  describe("contractNliHypotheses", () => {
    it("creates hypothesis with integer ID", async () => {
      const [hyp] = await testDb
        .insert(contractNliHypotheses)
        .values({
          id: 1,
          text: "Confidential information is explicitly defined",
        })
        .returning()

      expect(hyp.id).toBe(1)
    })

    it("stores category for grouping", async () => {
      const [hyp] = await testDb
        .insert(contractNliHypotheses)
        .values({
          id: 2,
          text: "Test hypothesis",
          category: "confidentiality",
        })
        .returning()

      expect(hyp.category).toBe("confidentiality")
    })
  })
})
