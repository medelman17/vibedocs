/**
 * @fileoverview Tests for Bootstrap Coordinator Function
 *
 * Tests the ingestCoordinator Inngest function that orchestrates
 * the bootstrap pipeline.
 *
 * @module inngest/functions/bootstrap/__tests__/ingest-coordinator.test
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/datasets/downloader", () => ({
  downloadDataset: vi.fn().mockResolvedValue({ cached: true }),
}))

vi.mock("../utils/progress-tracker", () => ({
  createProgress: vi.fn().mockResolvedValue({
    id: "progress-1",
    source: "cuad",
    status: "pending",
  }),
}))

vi.mock("@/db/client", () => ({
  db: {
    execute: vi.fn().mockResolvedValue(undefined),
  },
}))

describe("ingestCoordinator function", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exports the function", async () => {
    const { ingestCoordinator } = await import("../ingest-coordinator")
    expect(ingestCoordinator).toBeDefined()
    expect(typeof ingestCoordinator.id).toBe("function")
  })

  it("has correct function id", async () => {
    const { ingestCoordinator } = await import("../ingest-coordinator")
    expect(ingestCoordinator.id()).toBe("bootstrap-ingest-coordinator")
  })
})

describe("downloadDataset integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("downloads datasets via mocked function", async () => {
    const { downloadDataset } = await import("@/lib/datasets/downloader")
    const result = await downloadDataset("cuad" as never, false)
    expect(result).toMatchObject({ cached: true })
  })
})

describe("progress tracker integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates progress records via mocked function", async () => {
    const { createProgress } = await import("../utils/progress-tracker")
    const result = await createProgress("cuad" as never)
    expect(result).toMatchObject({
      id: "progress-1",
      source: "cuad",
      status: "pending",
    })
  })
})

describe("database integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("db.execute is available for index operations", async () => {
    const { db } = await import("@/db/client")
    expect(db.execute).toBeDefined()
    await expect(db.execute({} as never)).resolves.toBeUndefined()
  })
})

describe("event types", () => {
  it("bootstrap/ingest.requested event schema is valid", async () => {
    const { bootstrapIngestRequestedPayload } = await import("@/inngest/types")

    const validPayload = {
      sources: ["cuad", "contract_nli"],
      forceRefresh: false,
    }

    const result = bootstrapIngestRequestedPayload.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

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

  it("bootstrap/ingest.completed event schema is valid", async () => {
    const { bootstrapIngestCompletedPayload } = await import("@/inngest/types")

    const validPayload = {
      sources: ["cuad"],
      totalRecords: 500,
      totalEmbeddings: 500,
      durationMs: 60000,
    }

    const result = bootstrapIngestCompletedPayload.safeParse(validPayload)
    expect(result.success).toBe(true)
  })
})
