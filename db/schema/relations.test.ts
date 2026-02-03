// src/db/schema/relations.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { eq } from "drizzle-orm"
import {
  users,
  accounts,
  organizations,
  documents,
  analyses,
  clauseExtractions,
  comparisons,
  referenceDocuments,
  referenceEmbeddings,
} from "./index"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestDocument,
  createTestChunk,
  createTestAnalysis,
  createTestClauseExtraction,
} from "@/test/factories"

// Mock 1024-dimensional embedding vector for tests
const mockEmbedding = () => Array.from({ length: 1024 }, () => Math.random())

describe("relations", () => {
  describe("user relations", () => {
    it("fetches user with accounts", async () => {
      const user = await createTestUser()
      await testDb.insert(accounts).values({
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId: "g123",
      })

      const result = await testDb.query.users.findFirst({
        where: eq(users.id, user.id),
        with: { accounts: true },
      })

      expect(result?.accounts).toHaveLength(1)
      expect(result?.accounts[0].provider).toBe("google")
    })

    it("fetches user with organization memberships", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")

      const result = await testDb.query.users.findFirst({
        where: eq(users.id, user.id),
        with: { organizationMemberships: true },
      })

      expect(result?.organizationMemberships).toHaveLength(1)
      expect(result?.organizationMemberships[0].role).toBe("owner")
    })

    it("fetches user with uploaded documents", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestDocument(org.id, { uploadedBy: user.id })

      const result = await testDb.query.users.findFirst({
        where: eq(users.id, user.id),
        with: { uploadedDocuments: true },
      })

      expect(result?.uploadedDocuments).toHaveLength(1)
    })
  })

  describe("organization relations", () => {
    it("fetches org with members", async () => {
      const org = await createTestOrg()
      const user = await createTestUser()
      await createTestMembership(org.id, user.id)

      const result = await testDb.query.organizations.findFirst({
        where: eq(organizations.id, org.id),
        with: { members: true },
      })

      expect(result?.members).toHaveLength(1)
    })

    it("fetches org with all documents", async () => {
      const org = await createTestOrg()
      await createTestDocument(org.id, { title: "Doc 1" })
      await createTestDocument(org.id, { title: "Doc 2" })

      const result = await testDb.query.organizations.findFirst({
        where: eq(organizations.id, org.id),
        with: { documents: true },
      })

      expect(result?.documents).toHaveLength(2)
    })

    it("fetches org with nested member -> user", async () => {
      const org = await createTestOrg()
      const user = await createTestUser({ name: "Test User" })
      await createTestMembership(org.id, user.id)

      const result = await testDb.query.organizations.findFirst({
        where: eq(organizations.id, org.id),
        with: {
          members: {
            with: { user: true },
          },
        },
      })

      expect(result?.members[0].user.name).toBe("Test User")
    })
  })

  describe("document relations", () => {
    it("fetches document with chunks", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestChunk(org.id, doc.id, 0)
      await createTestChunk(org.id, doc.id, 1)

      const result = await testDb.query.documents.findFirst({
        where: eq(documents.id, doc.id),
        with: { chunks: true },
      })

      expect(result?.chunks).toHaveLength(2)
    })

    it("fetches document with analyses", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestAnalysis(org.id, doc.id)

      const result = await testDb.query.documents.findFirst({
        where: eq(documents.id, doc.id),
        with: { analyses: true },
      })

      expect(result?.analyses).toHaveLength(1)
    })

    it("fetches document with uploader user", async () => {
      const user = await createTestUser({ name: "Uploader" })
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id, { uploadedBy: user.id })

      const result = await testDb.query.documents.findFirst({
        where: eq(documents.id, doc.id),
        with: { uploader: true },
      })

      expect(result?.uploader?.name).toBe("Uploader")
    })

    it("fetches document with nested analysis -> clauseExtractions", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id)

      const result = await testDb.query.documents.findFirst({
        where: eq(documents.id, doc.id),
        with: {
          analyses: {
            with: { clauseExtractions: true },
          },
        },
      })

      expect(result?.analyses[0].clauseExtractions).toHaveLength(1)
    })
  })

  describe("analysis relations", () => {
    it("fetches analysis with clause extractions", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id)

      const result = await testDb.query.analyses.findFirst({
        where: eq(analyses.id, analysis.id),
        with: { clauseExtractions: true },
      })

      expect(result?.clauseExtractions).toHaveLength(2)
    })

    it("fetches analysis with document", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id, { title: "My NDA" })
      const analysis = await createTestAnalysis(org.id, doc.id)

      const result = await testDb.query.analyses.findFirst({
        where: eq(analyses.id, analysis.id),
        with: { document: true },
      })

      expect(result?.document.title).toBe("My NDA")
    })

    it("fetches clause extraction with chunk", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const chunk = await createTestChunk(org.id, doc.id, 0)
      const analysis = await createTestAnalysis(org.id, doc.id)
      const clause = await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        chunkId: chunk.id,
      })

      const result = await testDb.query.clauseExtractions.findFirst({
        where: eq(clauseExtractions.id, clause.id),
        with: { chunk: true },
      })

      expect(result?.chunk?.id).toBe(chunk.id)
    })
  })

  describe("comparison relations", () => {
    it("fetches comparison with both documents", async () => {
      const org = await createTestOrg()
      const docA = await createTestDocument(org.id, { title: "NDA A" })
      const docB = await createTestDocument(org.id, { title: "NDA B" })

      const [comparison] = await testDb
        .insert(comparisons)
        .values({
          tenantId: org.id,
          documentAId: docA.id,
          documentBId: docB.id,
        })
        .returning()

      const result = await testDb.query.comparisons.findFirst({
        where: eq(comparisons.id, comparison.id),
        with: {
          documentA: true,
          documentB: true,
        },
      })

      expect(result?.documentA.title).toBe("NDA A")
      expect(result?.documentB.title).toBe("NDA B")
    })
  })

  describe("reference relations", () => {
    it("fetches reference document with embeddings", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      await testDb.insert(referenceEmbeddings).values({
        documentId: doc.id,
        granularity: "clause",
        content: "Test",
        embedding: mockEmbedding(),
      })

      const result = await testDb.query.referenceDocuments.findFirst({
        where: eq(referenceDocuments.id, doc.id),
        with: { embeddings: true },
      })

      expect(result?.embeddings).toHaveLength(1)
    })

    it("fetches embedding with parent (self-reference)", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      const [parent] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          granularity: "section",
          content: "Parent",
          embedding: mockEmbedding(),
        })
        .returning()

      const [child] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          parentId: parent.id,
          granularity: "clause",
          content: "Child",
          embedding: mockEmbedding(),
        })
        .returning()

      const result = await testDb.query.referenceEmbeddings.findFirst({
        where: eq(referenceEmbeddings.id, child.id),
        with: { parent: true },
      })

      expect(result?.parent?.id).toBe(parent.id)
    })

    it("fetches embedding with children", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      const [parent] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          granularity: "section",
          content: "Parent",
          embedding: mockEmbedding(),
        })
        .returning()

      await testDb.insert(referenceEmbeddings).values({
        documentId: doc.id,
        parentId: parent.id,
        granularity: "clause",
        content: "Child 1",
        embedding: mockEmbedding(),
      })

      await testDb.insert(referenceEmbeddings).values({
        documentId: doc.id,
        parentId: parent.id,
        granularity: "clause",
        content: "Child 2",
        embedding: mockEmbedding(),
      })

      const result = await testDb.query.referenceEmbeddings.findFirst({
        where: eq(referenceEmbeddings.id, parent.id),
        with: { children: true },
      })

      expect(result?.children).toHaveLength(2)
    })
  })
})
