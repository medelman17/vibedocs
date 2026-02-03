// src/db/queries/analyses.test.ts
import { describe, it, expect } from "vitest"
import {
  createTestOrg,
  createTestDocument,
  createTestAnalysis,
  createTestClauseExtraction,
} from "@/test/factories"
import {
  getAnalysisByDocument,
  getAnalysisById,
  getAnalysisWithClauses,
  createAnalysis,
  updateAnalysisStatus,
  createClauseExtractions,
  getHighRiskClauses,
} from "./analyses"

describe("analyses queries", () => {
  describe("getAnalysisByDocument", () => {
    it("returns most recent analysis for document", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestAnalysis(org.id, doc.id)
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10))
      const recent = await createTestAnalysis(org.id, doc.id)

      const found = await getAnalysisByDocument(doc.id, org.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(recent.id)
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)
      await createTestAnalysis(orgA.id, doc.id)

      const found = await getAnalysisByDocument(doc.id, orgB.id)

      expect(found).toBeNull()
    })

    it("returns null when no analysis exists", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const found = await getAnalysisByDocument(doc.id, org.id)

      expect(found).toBeNull()
    })
  })

  describe("getAnalysisById", () => {
    it("returns analysis matching id and tenant", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      const found = await getAnalysisById(analysis.id, org.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(analysis.id)
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)
      const analysis = await createTestAnalysis(orgA.id, doc.id)

      const found = await getAnalysisById(analysis.id, orgB.id)

      expect(found).toBeNull()
    })

    it("returns null for non-existent id", async () => {
      const org = await createTestOrg()

      const found = await getAnalysisById("00000000-0000-0000-0000-000000000000", org.id)

      expect(found).toBeNull()
    })
  })

  describe("getAnalysisWithClauses", () => {
    it("returns analysis with ordered clause extractions", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        startPosition: 100,
      })
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        startPosition: 50,
      })

      const result = await getAnalysisWithClauses(analysis.id, org.id)

      expect(result).not.toBeNull()
      expect(result!.clauses).toHaveLength(2)
      expect(result!.clauses[0].startPosition).toBe(50)
      expect(result!.clauses[1].startPosition).toBe(100)
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)
      const analysis = await createTestAnalysis(orgA.id, doc.id)

      const result = await getAnalysisWithClauses(analysis.id, orgB.id)

      expect(result).toBeNull()
    })

    it("returns empty clauses array when none exist", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      const result = await getAnalysisWithClauses(analysis.id, org.id)

      expect(result).not.toBeNull()
      expect(result!.clauses).toEqual([])
    })
  })

  describe("createAnalysis", () => {
    it("creates analysis with pending status", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const analysis = await createAnalysis(org.id, doc.id)

      expect(analysis.status).toBe("pending")
    })

    it("stores inngestRunId when provided", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const analysis = await createAnalysis(org.id, doc.id, "run_123")

      expect(analysis.inngestRunId).toBe("run_123")
    })

    it("sets version to 1", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const analysis = await createAnalysis(org.id, doc.id)

      expect(analysis.version).toBe(1)
    })
  })

  describe("updateAnalysisStatus", () => {
    it("updates status and results", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      const updated = await updateAnalysisStatus(analysis.id, org.id, "complete", {
        overallRiskScore: 0.75,
        overallRiskLevel: "cautious",
        summary: "Test summary",
      })

      expect(updated).not.toBeNull()
      expect(updated!.status).toBe("complete")
      expect(updated!.overallRiskScore).toBeCloseTo(0.75)
      expect(updated!.overallRiskLevel).toBe("cautious")
      expect(updated!.summary).toBe("Test summary")
    })

    it("sets completedAt when status is complete", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      const updated = await updateAnalysisStatus(analysis.id, org.id, "complete")

      expect(updated!.completedAt).not.toBeNull()
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)
      const analysis = await createTestAnalysis(orgA.id, doc.id)

      const updated = await updateAnalysisStatus(analysis.id, orgB.id, "complete")

      expect(updated).toBeNull()
    })
  })

  describe("createClauseExtractions", () => {
    it("inserts multiple clauses in batch", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      const clauses = await createClauseExtractions(org.id, analysis.id, doc.id, [
        {
          category: "Non-Compete",
          clauseText: "Clause 1",
          confidence: 0.9,
          riskLevel: "standard",
        },
        {
          category: "Termination",
          clauseText: "Clause 2",
          confidence: 0.85,
          riskLevel: "cautious",
        },
      ])

      expect(clauses).toHaveLength(2)
    })

    it("stores secondary_categories as array", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      const [clause] = await createClauseExtractions(org.id, analysis.id, doc.id, [
        {
          category: "Non-Compete",
          secondaryCategories: ["Confidentiality", "Term"],
          clauseText: "Test",
          confidence: 0.9,
          riskLevel: "standard",
        },
      ])

      expect(clause.secondaryCategories).toEqual(["Confidentiality", "Term"])
    })

    it("stores evidence as JSONB", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      const evidence = { citations: ["ref1", "ref2"] }

      const [clause] = await createClauseExtractions(org.id, analysis.id, doc.id, [
        {
          category: "Non-Compete",
          clauseText: "Test",
          confidence: 0.9,
          riskLevel: "standard",
          evidence,
        },
      ])

      expect(clause.evidence).toEqual(evidence)
    })

    it("returns empty array for empty input", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      const clauses = await createClauseExtractions(org.id, analysis.id, doc.id, [])

      expect(clauses).toEqual([])
    })
  })

  describe("getHighRiskClauses", () => {
    it("returns only aggressive risk level clauses", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        riskLevel: "standard",
      })
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        riskLevel: "aggressive",
      })

      const highRisk = await getHighRiskClauses(analysis.id, org.id)

      expect(highRisk).toHaveLength(1)
      expect(highRisk[0].riskLevel).toBe("aggressive")
    })

    it("orders by confidence descending", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        riskLevel: "aggressive",
        confidence: 0.7,
      })
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        riskLevel: "aggressive",
        confidence: 0.95,
      })

      const highRisk = await getHighRiskClauses(analysis.id, org.id)

      expect(highRisk[0].confidence).toBeCloseTo(0.95)
      expect(highRisk[1].confidence).toBeCloseTo(0.7)
    })

    it("enforces tenant isolation", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)
      const analysis = await createTestAnalysis(orgA.id, doc.id)
      await createTestClauseExtraction(orgA.id, analysis.id, doc.id, {
        riskLevel: "aggressive",
      })

      const highRisk = await getHighRiskClauses(analysis.id, orgB.id)

      expect(highRisk).toHaveLength(0)
    })
  })
})
