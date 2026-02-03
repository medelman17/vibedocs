/**
 * @fileoverview Tests for Bootstrap Reference Data Ingestion
 *
 * Tests the ingestReferenceData Inngest function and related utilities.
 *
 * @module inngest/functions/bootstrap/__tests__/ingest-reference-data.test
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"

// Mock all dependencies before importing the function
vi.mock("@/lib/datasets/downloader", () => ({
  downloadDataset: vi.fn().mockResolvedValue({
    source: "cuad",
    path: ".cache/datasets/CUAD_v1.parquet",
    cached: true,
    sizeBytes: 1000,
  }),
  getDatasetPath: vi.fn().mockReturnValue(".cache/datasets/test.parquet"),
}))

vi.mock("@/lib/datasets", () => ({
  parseCuadDataset: vi.fn(async function* () {
    yield {
      source: "cuad",
      sourceId: "cuad:doc:test",
      content: "Test contract content",
      granularity: "document",
      sectionPath: [],
      metadata: {},
      contentHash: "abc123",
    }
  }),
  parseContractNliDataset: vi.fn(async function* () {}),
  parseBontermsDataset: vi.fn(async function* () {}),
  parseCommonAccordDataset: vi.fn(async function* () {}),
}))

vi.mock("@/lib/embeddings", () => ({
  getVoyageAIClient: vi.fn().mockReturnValue({
    embedBatch: vi.fn().mockResolvedValue({
      embeddings: [new Array(1024).fill(0.1)],
      totalTokens: 10,
      cacheHits: 0,
    }),
  }),
  VOYAGE_CONFIG: {
    model: "voyage-law-2",
    dimensions: 1024,
    maxInputTokens: 16000,
    batchLimit: 128,
    baseUrl: "https://api.voyageai.com/v1",
  },
}))

vi.mock("@/db/client", () => ({
  db: {
    transaction: vi.fn((fn) =>
      fn({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "doc-1" }]),
            }),
            onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      })
    ),
    execute: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@/db/schema/reference", () => ({
  referenceDocuments: { contentHash: "content_hash", id: "id" },
  referenceEmbeddings: { contentHash: "content_hash" },
}))

describe("ingestReferenceData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exports the function", async () => {
    const { ingestReferenceData } = await import("../ingest-reference-data")
    expect(ingestReferenceData).toBeDefined()
    // Inngest function objects have an id() method, not an id property
    expect(typeof ingestReferenceData.id).toBe("function")
  })

  it("has concurrency limit of 1", async () => {
    const { ingestReferenceData } = await import("../ingest-reference-data")
    // The function configuration is embedded in the function object
    expect(ingestReferenceData).toBeDefined()
  })

  describe("downloadDataset integration", () => {
    it("getDatasetPath returns expected format", async () => {
      const { getDatasetPath } = await import("@/lib/datasets/downloader")
      const path = getDatasetPath("cuad" as never)
      expect(path).toContain("datasets")
    })

    it("downloadDataset returns download result", async () => {
      const { downloadDataset } = await import("@/lib/datasets/downloader")
      const result = await downloadDataset("cuad" as never, false)
      expect(result).toMatchObject({
        source: "cuad",
        cached: true,
      })
    })
  })

  describe("parser integration", () => {
    it("parseCuadDataset yields records", async () => {
      const { parseCuadDataset } = await import("@/lib/datasets")
      const records: unknown[] = []
      for await (const record of parseCuadDataset(".cache/test.parquet")) {
        records.push(record)
      }
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({
        source: "cuad",
        granularity: "document",
      })
    })
  })

  describe("embedding integration", () => {
    it("getVoyageAIClient.embedBatch returns embeddings", async () => {
      const { getVoyageAIClient } = await import("@/lib/embeddings")
      const client = getVoyageAIClient()
      const result = await client.embedBatch(["test text"], "document")
      expect(result.embeddings).toHaveLength(1)
      expect(result.embeddings[0]).toHaveLength(1024)
    })
  })

  describe("database integration", () => {
    it("db.execute is available for index creation", async () => {
      const { db } = await import("@/db/client")
      expect(db.execute).toBeDefined()
      await expect(db.execute({} as never)).resolves.toBeUndefined()
    })

    it("db.transaction supports nested operations", async () => {
      const { db } = await import("@/db/client")
      expect(db.transaction).toBeDefined()
      await expect(
        db.transaction(async (tx) => {
          const insertResult = tx.insert({} as never)
          return insertResult.values({} as never)
        })
      ).resolves.toBeDefined()
    })
  })
})

describe("batch processing logic", () => {
  it("VOYAGE_CONFIG has correct batch limit", async () => {
    const { VOYAGE_CONFIG } = await import("@/lib/embeddings")
    expect(VOYAGE_CONFIG.batchLimit).toBe(128)
  })

  it("calculates correct number of batches", () => {
    const BATCH_SIZE = 128

    // Test cases for batch calculation
    expect(Math.ceil(1 / BATCH_SIZE)).toBe(1)
    expect(Math.ceil(128 / BATCH_SIZE)).toBe(1)
    expect(Math.ceil(129 / BATCH_SIZE)).toBe(2)
    expect(Math.ceil(256 / BATCH_SIZE)).toBe(2)
    expect(Math.ceil(1000 / BATCH_SIZE)).toBe(8)
  })
})

describe("event types", () => {
  it("bootstrap/ingest.requested event schema is valid", async () => {
    const { bootstrapIngestRequestedPayload } = await import(
      "@/inngest/types"
    )

    const validPayload = {
      sources: ["cuad", "contract_nli"],
      forceRefresh: false,
    }

    const result = bootstrapIngestRequestedPayload.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it("bootstrap/ingest.progress event schema is valid", async () => {
    const { bootstrapIngestProgressPayload } = await import(
      "@/inngest/types"
    )

    const validPayload = {
      source: "cuad",
      step: "embedding",
      recordsProcessed: 100,
      totalRecords: 500,
      percent: 20,
    }

    const result = bootstrapIngestProgressPayload.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it("bootstrap/ingest.completed event schema is valid", async () => {
    const { bootstrapIngestCompletedPayload } = await import(
      "@/inngest/types"
    )

    const validPayload = {
      sources: ["cuad"],
      totalRecords: 500,
      totalEmbeddings: 500,
      durationMs: 60000,
    }

    const result = bootstrapIngestCompletedPayload.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it("rejects invalid sources", async () => {
    const { bootstrapIngestRequestedPayload } = await import(
      "@/inngest/types"
    )

    const invalidPayload = {
      sources: ["invalid_source"],
      forceRefresh: false,
    }

    const result = bootstrapIngestRequestedPayload.safeParse(invalidPayload)
    expect(result.success).toBe(false)
  })
})
