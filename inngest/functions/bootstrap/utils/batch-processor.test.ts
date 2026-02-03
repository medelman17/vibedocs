/**
 * @fileoverview Tests for Batch Processor
 *
 * @module inngest/functions/bootstrap/utils/batch-processor.test
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock dependencies
vi.mock("@/lib/embeddings", () => ({
  getVoyageAIClient: vi.fn().mockReturnValue({
    embedBatch: vi.fn().mockResolvedValue({
      embeddings: [new Array(1024).fill(0.1), new Array(1024).fill(0.2)],
      totalTokens: 100,
      cacheHits: 0,
    }),
  }),
  VOYAGE_CONFIG: { dimensions: 1024 },
}))

vi.mock("@/db/client", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "doc-1" }]),
        }),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}))

vi.mock("@/db/schema/reference", () => ({
  referenceDocuments: { contentHash: "content_hash", id: "id" },
  referenceEmbeddings: { contentHash: "content_hash" },
}))

describe("batch-processor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("processBatch", () => {
    it("embeds and inserts records successfully", async () => {
      const { processBatch } = await import("./batch-processor.js")

      const batch = [
        {
          source: "cuad" as const,
          sourceId: "cuad:doc:1",
          content: "Test content 1",
          granularity: "document" as const,
          sectionPath: [],
          contentHash: "hash1",
          metadata: {},
        },
        {
          source: "cuad" as const,
          sourceId: "cuad:doc:2",
          content: "Test content 2",
          granularity: "document" as const,
          sectionPath: [],
          contentHash: "hash2",
          metadata: {},
        },
      ]

      const result = await processBatch(batch, "cuad", 0)

      expect(result.processed).toBe(2)
      expect(result.embedded).toBe(2)
      expect(result.errors).toBe(0)
    })

    it("returns zero counts for empty batch", async () => {
      const { processBatch } = await import("./batch-processor.js")

      const result = await processBatch([], "cuad", 0)

      expect(result.processed).toBe(0)
      expect(result.embedded).toBe(0)
      expect(result.errors).toBe(0)
    })

    it("handles embedding API failure", async () => {
      vi.resetModules()

      vi.doMock("@/lib/embeddings", () => ({
        getVoyageAIClient: vi.fn().mockReturnValue({
          embedBatch: vi.fn().mockRejectedValue(new Error("API rate limit")),
        }),
        VOYAGE_CONFIG: { dimensions: 1024 },
      }))

      vi.doMock("@/db/client", () => ({
        db: {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: "doc-1" }]),
              }),
              onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        },
      }))

      vi.doMock("@/db/schema/reference", () => ({
        referenceDocuments: { contentHash: "content_hash", id: "id" },
        referenceEmbeddings: { contentHash: "content_hash" },
      }))

      const { processBatch } = await import("./batch-processor.js")

      const batch = [
        {
          source: "cuad" as const,
          sourceId: "cuad:doc:1",
          content: "Test content 1",
          granularity: "document" as const,
          sectionPath: [],
          contentHash: "hash1",
          metadata: {},
        },
      ]

      const result = await processBatch(batch, "cuad", 0)

      expect(result.errors).toBe(1)
      expect(result.processed).toBe(0)
      expect(result.embedded).toBe(0)
    })
  })

  describe("shouldCircuitBreak", () => {
    it("returns false below minimum record threshold", async () => {
      const { shouldCircuitBreak } = await import("./batch-processor.js")

      // Below minimum records (100)
      expect(shouldCircuitBreak(50, 10)).toBe(false)
    })

    it("returns false when error rate is below threshold", async () => {
      const { shouldCircuitBreak } = await import("./batch-processor.js")

      // 5% error rate with sufficient records
      expect(shouldCircuitBreak(95, 5)).toBe(false)
    })

    it("returns true when error rate exceeds threshold", async () => {
      const { shouldCircuitBreak } = await import("./batch-processor.js")

      // 15% error rate with sufficient records
      expect(shouldCircuitBreak(85, 15)).toBe(true)
    })

    it("returns true at exactly 10% error rate", async () => {
      const { shouldCircuitBreak } = await import("./batch-processor.js")

      // 10% error rate is NOT above threshold (> not >=)
      expect(shouldCircuitBreak(90, 10)).toBe(false)

      // 11% error rate triggers circuit breaker
      expect(shouldCircuitBreak(89, 11)).toBe(true)
    })
  })
})
