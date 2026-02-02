/**
 * Zod schemas for JSONB columns.
 *
 * These schemas provide:
 * 1. Type inference via z.infer<typeof schema>
 * 2. Runtime validation on insert/update
 * 3. IntelliSense when querying JSONB data
 */

import { z } from "zod"

/**
 * Token usage tracking for LLM cost monitoring.
 */
export const tokenUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  estimatedCost: z.number(),
  byAgent: z
    .object({
      parser: z.number(),
      classifier: z.number(),
      riskScorer: z.number(),
      gapAnalyst: z.number(),
    })
    .optional(),
})

export type TokenUsage = z.infer<typeof tokenUsageSchema>

/**
 * Gap analysis result from Gap Analyst Agent.
 */
export const gapAnalysisSchema = z.object({
  missingClauses: z.array(z.string()),
  weakClauses: z.array(z.string()),
  recommendations: z.array(
    z.object({
      category: z.string(),
      recommendation: z.string(),
      priority: z.enum(["low", "medium", "high"]),
    })
  ),
  comparisonBasis: z.string().optional(),
})

export type GapAnalysis = z.infer<typeof gapAnalysisSchema>

/**
 * Evidence supporting a clause classification and risk assessment.
 */
export const clauseEvidenceSchema = z.object({
  /** Direct quotes from the clause text */
  citations: z.array(z.string()),

  /** References to similar CUAD clauses */
  comparisons: z.array(z.string()),

  /** Best matching reference from corpus */
  cuadMatch: z
    .object({
      exampleId: z.string(),
      similarity: z.number().min(0).max(1),
      category: z.string(),
    })
    .optional(),

  /** LLM reasoning for the assessment */
  reasoning: z.string().optional(),

  /** Statistical context */
  statistics: z
    .object({
      percentile: z.number().min(0).max(100),
      sampleSize: z.number(),
      description: z.string(),
    })
    .optional(),
})

export type ClauseEvidence = z.infer<typeof clauseEvidenceSchema>

/**
 * Metadata for clause extraction process.
 */
export const clauseMetadataSchema = z
  .object({
    extractionMethod: z.enum(["llm", "rule", "hybrid"]).optional(),
    modelVersion: z.string().optional(),
    processingOrder: z.number().optional(),
    requiresReview: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough() // Allow additional fields for flexibility

export type ClauseMetadata = z.infer<typeof clauseMetadataSchema>

/**
 * Risk level for clauses and documents.
 */
export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"])

export type RiskLevel = z.infer<typeof riskLevelSchema>
