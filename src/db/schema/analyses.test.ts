// src/db/schema/analyses.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { eq } from "drizzle-orm"
import { documents, analyses, clauseExtractions } from "./index"
import {
  createTestOrg,
  createTestDocument,
  createTestAnalysis,
  createTestClauseExtraction,
} from "@/test/factories"

describe("analyses schema", () => {
  describe("analyses", () => {
    it("creates analysis for document", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      expect(analysis.id).toBeDefined()
      expect(analysis.documentId).toBe(doc.id)
      expect(analysis.tenantId).toBe(org.id)
    })

    it("sets default status to pending", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      expect(analysis.status).toBe("pending")
    })

    it("sets default version to 1", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      expect(analysis.version).toBe(1)
    })

    it("cascades delete when document deleted", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestAnalysis(org.id, doc.id)

      // Delete document
      await testDb.delete(documents).where(eq(documents.id, doc.id))

      // Analysis should be gone
      const found = await testDb
        .select()
        .from(analyses)
        .where(eq(analyses.documentId, doc.id))

      expect(found).toHaveLength(0)
    })
  })

  describe("clauseExtractions", () => {
    it("creates extraction linked to analysis", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      const clause = await createTestClauseExtraction(org.id, analysis.id, doc.id)

      expect(clause.id).toBeDefined()
      expect(clause.analysisId).toBe(analysis.id)
      expect(clause.documentId).toBe(doc.id)
    })

    it("stores secondary_categories as array", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      const clause = await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        secondaryCategories: ["Confidentiality", "Term"],
      })

      expect(clause.secondaryCategories).toEqual(["Confidentiality", "Term"])
    })

    it("cascades delete when analysis deleted", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id)

      // Delete analysis
      await testDb.delete(analyses).where(eq(analyses.id, analysis.id))

      // Clause should be gone
      const clauses = await testDb
        .select()
        .from(clauseExtractions)
        .where(eq(clauseExtractions.analysisId, analysis.id))

      expect(clauses).toHaveLength(0)
    })

    it("cascades delete when document deleted", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id)

      // Delete document (cascades to analysis, which cascades to clauses)
      await testDb.delete(documents).where(eq(documents.id, doc.id))

      // Clause should be gone
      const clauses = await testDb
        .select()
        .from(clauseExtractions)
        .where(eq(clauseExtractions.documentId, doc.id))

      expect(clauses).toHaveLength(0)
    })

    it("stores evidence as JSONB", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      const evidence = { citations: ["p.1", "p.3"], score: 0.95 }
      const clause = await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        evidence,
      })

      expect(clause.evidence).toEqual(evidence)
    })
  })
})
