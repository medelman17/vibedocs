/**
 * @fileoverview Progress Tracker Tests
 *
 * Unit tests for bootstrap progress tracking utilities.
 *
 * @module inngest/functions/bootstrap/utils/progress-tracker.test
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Create mock functions that can be reconfigured per test
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockSelect = vi.fn()
const mockValues = vi.fn()
const mockReturning = vi.fn()
const mockSet = vi.fn()
const mockFrom = vi.fn()
const mockWhere = vi.fn()
const mockOrderBy = vi.fn()
const mockLimit = vi.fn()

// Mock db with configurable mock functions
vi.mock("@/db/client", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  },
}))

vi.mock("@/db/schema/bootstrap", () => ({
  bootstrapProgress: {
    id: Symbol("id"),
    source: Symbol("source"),
    createdAt: Symbol("created_at"),
    processedRecords: Symbol("processed_records"),
    embeddedRecords: Symbol("embedded_records"),
    errorCount: Symbol("error_count"),
  },
}))

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: true, a, b })),
  sql: vi.fn((strings, ...values) => ({ sql: true, strings, values })),
  desc: vi.fn((col) => ({ desc: true, col })),
}))

describe("progress-tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset chain: insert().values().returning()
    mockReturning.mockResolvedValue([
      {
        id: "test-progress-id",
        source: "cuad",
        status: "pending",
        processedRecords: 0,
        embeddedRecords: 0,
        errorCount: 0,
        lastBatchIndex: 0,
      },
    ])
    mockValues.mockReturnValue({ returning: mockReturning })
    mockInsert.mockReturnValue({ values: mockValues })

    // Reset chain: update().set().where()
    mockWhere.mockResolvedValue(undefined)
    mockSet.mockReturnValue({ where: mockWhere })
    mockUpdate.mockReturnValue({ set: mockSet })

    // Reset chain: select().from().where() or select().from().where().orderBy().limit()
    mockLimit.mockResolvedValue([
      {
        id: "test-progress-id",
        source: "cuad",
        status: "in_progress",
        processedRecords: 100,
      },
    ])
    mockOrderBy.mockReturnValue({ limit: mockLimit })
    mockWhere.mockReturnValue({ orderBy: mockOrderBy })
    mockFrom.mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })
  })

  it("createProgress creates a new progress record", async () => {
    const { createProgress } = await import("./progress-tracker.js")
    const progress = await createProgress("cuad")

    expect(progress.id).toBe("test-progress-id")
    expect(progress.source).toBe("cuad")
    expect(progress.status).toBe("pending")
    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "cuad",
        status: "pending",
      })
    )
  })

  it("updateProgress updates specified fields", async () => {
    const { updateProgress } = await import("./progress-tracker.js")
    await updateProgress("test-progress-id", {
      processedRecords: 100,
      lastBatchIndex: 1,
    })

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({
      processedRecords: 100,
      lastBatchIndex: 1,
    })
  })

  it("getProgress retrieves progress by id", async () => {
    // Mock for getProgress (no orderBy/limit chain)
    const mockWhereSimple = vi.fn().mockResolvedValue([
      {
        id: "test-progress-id",
        processedRecords: 100,
      },
    ])
    mockFrom.mockReturnValue({ where: mockWhereSimple })

    const { getProgress } = await import("./progress-tracker.js")
    const progress = await getProgress("test-progress-id")

    expect(progress?.processedRecords).toBe(100)
    expect(mockSelect).toHaveBeenCalled()
  })

  it("getProgress returns null when not found", async () => {
    const mockWhereEmpty = vi.fn().mockResolvedValue([])
    mockFrom.mockReturnValue({ where: mockWhereEmpty })

    const { getProgress } = await import("./progress-tracker.js")
    const progress = await getProgress("nonexistent-id")

    expect(progress).toBeNull()
  })

  it("getLatestProgress retrieves most recent progress for source", async () => {
    mockLimit.mockResolvedValue([
      {
        id: "latest-progress-id",
        source: "contract_nli",
        status: "completed",
        processedRecords: 500,
      },
    ])

    const { getLatestProgress } = await import("./progress-tracker.js")
    const progress = await getLatestProgress("contract_nli")

    expect(progress?.id).toBe("latest-progress-id")
    expect(progress?.status).toBe("completed")
    expect(mockOrderBy).toHaveBeenCalled()
    expect(mockLimit).toHaveBeenCalledWith(1)
  })

  it("getLatestProgress returns null when not found", async () => {
    mockLimit.mockResolvedValue([])

    const { getLatestProgress } = await import("./progress-tracker.js")
    const progress = await getLatestProgress("bonterms")

    expect(progress).toBeNull()
  })

  it("markStarted updates status to in_progress", async () => {
    const { markStarted } = await import("./progress-tracker.js")
    await markStarted("test-progress-id", 1000)

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "in_progress",
        totalRecords: 1000,
      })
    )
  })

  it("markCompleted updates status to completed", async () => {
    const { markCompleted } = await import("./progress-tracker.js")
    await markCompleted("test-progress-id")

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
      })
    )
  })

  it("markFailed updates status to failed", async () => {
    const { markFailed } = await import("./progress-tracker.js")
    await markFailed("test-progress-id")

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
      })
    )
  })

  it("incrementProgress updates counters atomically", async () => {
    const { incrementProgress } = await import("./progress-tracker.js")
    await incrementProgress("test-progress-id", {
      processed: 10,
      embedded: 5,
      errors: 1,
    })

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        processedRecords: expect.objectContaining({ sql: true }),
        embeddedRecords: expect.objectContaining({ sql: true }),
        errorCount: expect.objectContaining({ sql: true }),
      })
    )
  })

  it("incrementProgress does nothing when no counts provided", async () => {
    const { incrementProgress } = await import("./progress-tracker.js")
    await incrementProgress("test-progress-id", {})

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("incrementProgress handles partial counts", async () => {
    const { incrementProgress } = await import("./progress-tracker.js")
    await incrementProgress("test-progress-id", {
      processed: 5,
    })

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({
      processedRecords: expect.objectContaining({ sql: true }),
    })
  })
})
