// src/db/types/jsonb-schemas.test.ts
import { describe, it, expect } from "vitest"
import {
  tokenUsageSchema,
  gapAnalysisSchema,
  clauseEvidenceSchema,
  clauseMetadataSchema,
} from "./jsonb-schemas"

describe("JSONB Schemas", () => {
  describe("tokenUsageSchema", () => {
    it("validates valid token usage", () => {
      const data = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        estimatedCost: 0.05,
      }
      expect(tokenUsageSchema.safeParse(data).success).toBe(true)
    })

    it("validates with optional byAgent", () => {
      const data = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        estimatedCost: 0.05,
        byAgent: {
          parser: 200,
          classifier: 400,
          riskScorer: 600,
          gapAnalyst: 300,
        },
      }
      expect(tokenUsageSchema.safeParse(data).success).toBe(true)
    })

    it("rejects missing required fields", () => {
      const data = { promptTokens: 1000 }
      expect(tokenUsageSchema.safeParse(data).success).toBe(false)
    })
  })

  describe("gapAnalysisSchema", () => {
    it("validates valid gap analysis", () => {
      const data = {
        missingClauses: ["Insurance", "Audit Rights"],
        weakClauses: ["Cap On Liability"],
        recommendations: [
          {
            category: "Insurance",
            recommendation: "Add cyber liability requirement",
            priority: "high",
          },
        ],
      }
      expect(gapAnalysisSchema.safeParse(data).success).toBe(true)
    })

    it("validates with optional comparisonBasis", () => {
      const data = {
        missingClauses: [],
        weakClauses: [],
        recommendations: [],
        comparisonBasis: "Bonterms Mutual NDA",
      }
      expect(gapAnalysisSchema.safeParse(data).success).toBe(true)
    })

    it("rejects invalid priority", () => {
      const data = {
        missingClauses: [],
        weakClauses: [],
        recommendations: [
          { category: "Test", recommendation: "Test", priority: "urgent" },
        ],
      }
      expect(gapAnalysisSchema.safeParse(data).success).toBe(false)
    })
  })

  describe("clauseEvidenceSchema", () => {
    it("validates valid evidence", () => {
      const data = {
        citations: ["governed by the laws of Delaware"],
        comparisons: ["Similar to CUAD example #123"],
      }
      expect(clauseEvidenceSchema.safeParse(data).success).toBe(true)
    })

    it("validates with all optional fields", () => {
      const data = {
        citations: ["text here"],
        comparisons: [],
        cuadMatch: {
          exampleId: "cuad-001",
          similarity: 0.95,
          category: "Governing Law",
        },
        reasoning: "Standard Delaware choice of law",
        statistics: {
          percentile: 85,
          sampleSize: 510,
          description: "85th percentile for duration",
        },
      }
      expect(clauseEvidenceSchema.safeParse(data).success).toBe(true)
    })

    it("rejects similarity out of range", () => {
      const data = {
        citations: [],
        comparisons: [],
        cuadMatch: { exampleId: "x", similarity: 1.5, category: "Test" },
      }
      expect(clauseEvidenceSchema.safeParse(data).success).toBe(false)
    })
  })

  describe("clauseMetadataSchema", () => {
    it("validates valid metadata", () => {
      const data = {
        extractionMethod: "llm",
        modelVersion: "claude-sonnet-4-5",
        processingOrder: 1,
        requiresReview: false,
        tags: ["mutual", "standard"],
      }
      expect(clauseMetadataSchema.safeParse(data).success).toBe(true)
    })

    it("allows empty object", () => {
      expect(clauseMetadataSchema.safeParse({}).success).toBe(true)
    })

    it("allows extra fields via passthrough", () => {
      const data = { customField: "allowed" }
      const result = clauseMetadataSchema.safeParse(data)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveProperty("customField", "allowed")
      }
    })
  })
})
