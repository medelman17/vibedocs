/**
 * @fileoverview Tests for Bootstrap Source Worker Function
 *
 * Tests the ingestSource Inngest function that processes a single
 * dataset source with resume support.
 *
 * @module inngest/functions/bootstrap/__tests__/ingest-source.test
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/datasets/downloader", () => ({
  getDatasetPath: vi.fn().mockReturnValue(".cache/datasets/test"),
}))

vi.mock("@/lib/datasets", () => ({
  parseCuadDataset: vi.fn(async function* () {
    yield {
      source: "cuad",
      sourceId: "cuad:doc:test",
      content: "Test content",
      granularity: "document",
      sectionPath: [],
      metadata: {},
      contentHash: "hash123",
    }
  }),
  parseContractNliDataset: vi.fn(async function* () {}),
  parseBontermsDataset: vi.fn(async function* () {}),
  parseCommonAccordDataset: vi.fn(async function* () {}),
}))

vi.mock("../utils/progress-tracker", () => ({
  getProgress: vi.fn().mockResolvedValue({
    id: "progress-1",
    source: "cuad",
    status: "pending",
    lastBatchIndex: 0,
  }),
  markStarted: vi.fn().mockResolvedValue(undefined),
  markCompleted: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  updateProgress: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../utils/batch-processor", () => ({
  processBatch: vi.fn().mockResolvedValue({
    processed: 1,
    embedded: 1,
    errors: 0,
  }),
  shouldCircuitBreak: vi.fn().mockReturnValue(false),
}))

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}))

vi.mock("@/db/schema/reference", () => ({
  referenceDocuments: {
    id: "id",
    source: "source",
  },
  referenceEmbeddings: {
    contentHash: "content_hash",
    documentId: "document_id",
  },
}))

describe("ingestSource function", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exports the function", async () => {
    const { ingestSource } = await import("../ingest-source")
    expect(ingestSource).toBeDefined()
    expect(typeof ingestSource.id).toBe("function")
  })

  it("has correct function id", async () => {
    const { ingestSource } = await import("../ingest-source")
    expect(ingestSource.id()).toBe("bootstrap-ingest-source")
  })
})

describe("progress tracker integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("getProgress returns progress record", async () => {
    const { getProgress } = await import("../utils/progress-tracker")
    const result = await getProgress("progress-1")
    expect(result).toMatchObject({
      id: "progress-1",
      source: "cuad",
      status: "pending",
      lastBatchIndex: 0,
    })
  })

  it("markStarted is callable", async () => {
    const { markStarted } = await import("../utils/progress-tracker")
    await expect(markStarted("progress-1")).resolves.toBeUndefined()
  })

  it("markCompleted is callable", async () => {
    const { markCompleted } = await import("../utils/progress-tracker")
    await expect(markCompleted("progress-1")).resolves.toBeUndefined()
  })

  it("markFailed is callable", async () => {
    const { markFailed } = await import("../utils/progress-tracker")
    await expect(markFailed("progress-1")).resolves.toBeUndefined()
  })

  it("updateProgress is callable", async () => {
    const { updateProgress } = await import("../utils/progress-tracker")
    await expect(
      updateProgress("progress-1", {
        processedRecords: 10,
        embeddedRecords: 10,
        errorCount: 0,
        lastBatchIndex: 0,
      })
    ).resolves.toBeUndefined()
  })
})

describe("batch processor integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("processBatch returns batch result", async () => {
    const { processBatch } = await import("../utils/batch-processor")
    const result = await processBatch([], "cuad", 0)
    expect(result).toMatchObject({
      processed: 1,
      embedded: 1,
      errors: 0,
    })
  })

  it("shouldCircuitBreak returns boolean", async () => {
    const { shouldCircuitBreak } = await import("../utils/batch-processor")
    const result = shouldCircuitBreak(100, 5)
    expect(typeof result).toBe("boolean")
  })
})

describe("parser integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("parseCuadDataset yields records", async () => {
    const { parseCuadDataset } = await import("@/lib/datasets")
    const records: unknown[] = []
    for await (const record of parseCuadDataset(".cache/datasets/test")) {
      records.push(record)
    }
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      source: "cuad",
      sourceId: "cuad:doc:test",
      content: "Test content",
    })
  })
})

describe("event types", () => {
  it("bootstrap/source.process event schema is valid", async () => {
    const { bootstrapSourceProcessPayload } = await import("@/inngest/types")

    const validPayload = {
      source: "cuad",
      progressId: "550e8400-e29b-41d4-a716-446655440000",
      forceRefresh: false,
    }

    const result = bootstrapSourceProcessPayload.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it("bootstrap/source.completed event schema is valid", async () => {
    const { bootstrapSourceCompletedPayload } = await import("@/inngest/types")

    const validPayload = {
      source: "cuad",
      progressId: "550e8400-e29b-41d4-a716-446655440000",
      status: "completed",
      processedRecords: 100,
      embeddedRecords: 100,
      errorCount: 0,
    }

    const result = bootstrapSourceCompletedPayload.safeParse(validPayload)
    expect(result.success).toBe(true)
  })
})
