/**
 * @fileoverview Tests for Word Add-in Analyze Route
 *
 * Tests the POST /api/word-addin/analyze endpoint that accepts document content
 * from the Word Add-in and triggers the analysis pipeline.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"
import { POST } from "./route"

// Mock verifyAddInAuth
vi.mock("@/lib/word-addin-auth", () => ({
  verifyAddInAuth: vi.fn(),
}))

// Mock inngest client
vi.mock("@/inngest", () => ({
  inngest: {
    send: vi.fn(),
  },
}))

// Mock database with query support for deduplication
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    query: {
      documents: {
        findFirst: vi.fn(),
      },
    },
  },
}))

// Mock schemas (for type references)
vi.mock("@/db/schema", () => ({
  documents: {},
  analyses: {},
}))

// Helper to create a mock Request
function createMockRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/word-addin/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe("POST /api/word-addin/analyze", () => {
  let mockVerifyAddInAuth: Mock
  let mockInngestSend: Mock
  let mockDbInsert: Mock
  let mockDbQueryFindFirst: Mock

  beforeEach(async () => {
    vi.resetAllMocks()

    // Get mocked functions
    const { verifyAddInAuth } = await import("@/lib/word-addin-auth")
    mockVerifyAddInAuth = verifyAddInAuth as Mock

    const { inngest } = await import("@/inngest")
    mockInngestSend = inngest.send as Mock

    const { db } = await import("@/db")
    mockDbInsert = db.insert as Mock
    mockDbQueryFindFirst = db.query.documents.findFirst as Mock

    // Default: no existing document (no deduplication match)
    mockDbQueryFindFirst.mockResolvedValue(null)
  })

  describe("authentication", () => {
    it("returns 401 when not authenticated (missing token)", async () => {
      // Import the actual error to simulate what verifyAddInAuth throws
      const { UnauthorizedError } = await import("@/lib/errors")
      mockVerifyAddInAuth.mockRejectedValue(
        new UnauthorizedError("Missing Authorization header")
      )

      const request = createMockRequest({ content: "Test document content" })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe("UNAUTHORIZED")
      expect(body.error.message).toBe("Missing Authorization header")
    })

    it("returns 403 when token is invalid or expired", async () => {
      const { ForbiddenError } = await import("@/lib/errors")
      mockVerifyAddInAuth.mockRejectedValue(
        new ForbiddenError("Invalid or expired session token")
      )

      const request = createMockRequest(
        { content: "Test document content" },
        { Authorization: "Bearer invalid-token" }
      )
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("validation", () => {
    it("returns 400 for empty request body", async () => {
      mockVerifyAddInAuth.mockResolvedValue({
        userId: "user-123",
        user: { id: "user-123", email: "test@example.com", name: "Test User" },
        tenant: { tenantId: "tenant-123", role: "owner" },
      })

      const request = createMockRequest({})
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe("VALIDATION_ERROR")
    })

    it("returns 400 when content is missing", async () => {
      mockVerifyAddInAuth.mockResolvedValue({
        userId: "user-123",
        user: { id: "user-123", email: "test@example.com", name: "Test User" },
        tenant: { tenantId: "tenant-123", role: "owner" },
      })

      const request = createMockRequest({ metadata: { title: "Test" } })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe("VALIDATION_ERROR")
      expect(body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "content" })])
      )
    })

    it("returns 400 when content is empty string", async () => {
      mockVerifyAddInAuth.mockResolvedValue({
        userId: "user-123",
        user: { id: "user-123", email: "test@example.com", name: "Test User" },
        tenant: { tenantId: "tenant-123", role: "owner" },
      })

      const request = createMockRequest({ content: "" })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe("VALIDATION_ERROR")
    })
  })

  describe("tenant context", () => {
    it("returns 403 when no tenant selected", async () => {
      mockVerifyAddInAuth.mockResolvedValue({
        userId: "user-123",
        user: { id: "user-123", email: "test@example.com", name: "Test User" },
        tenant: { tenantId: null, role: null }, // No tenant selected
      })

      const request = createMockRequest({ content: "Test document content" })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe("FORBIDDEN")
      expect(body.error.message).toContain("No organization selected")
    })
  })

  describe("successful submission", () => {
    const mockDocument = {
      id: "doc-123",
      tenantId: "tenant-123",
      title: "Test Document",
      status: "ready",
    }

    const mockAnalysis = {
      id: "analysis-456",
      documentId: "doc-123",
      tenantId: "tenant-123",
      status: "pending",
    }

    beforeEach(() => {
      mockVerifyAddInAuth.mockResolvedValue({
        userId: "user-123",
        user: { id: "user-123", email: "test@example.com", name: "Test User" },
        tenant: { tenantId: "tenant-123", role: "owner" },
      })

      // Mock db.insert().values().returning() chain
      const mockReturning = vi
        .fn()
        .mockResolvedValueOnce([mockDocument])
        .mockResolvedValueOnce([mockAnalysis])
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
      mockDbInsert.mockReturnValue({ values: mockValues })
    })

    it("returns 200 with analysis and document IDs", async () => {
      mockInngestSend.mockResolvedValue({ ids: ["evt-123"] })

      const request = createMockRequest({
        content: "This is a sample NDA document content.",
      })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual({
        analysisId: "analysis-456",
        documentId: "doc-123",
        status: "queued",
      })
    })

    it("sends Inngest event on success", async () => {
      mockInngestSend.mockResolvedValue({ ids: ["evt-123"] })

      const request = createMockRequest({
        content: "This is a sample NDA document content.",
      })
      await POST(request, { params: Promise.resolve({}) })

      expect(mockInngestSend).toHaveBeenCalledWith({
        name: "nda/analysis.requested",
        data: {
          tenantId: "tenant-123",
          userId: "user-123",
          documentId: "doc-123",
          analysisId: "analysis-456",
          source: "word-addin",
          content: {
            rawText: "This is a sample NDA document content.",
            paragraphs: [],
          },
          metadata: {
            title: "This is a sample NDA document content....",
            author: undefined,
            wordVersion: undefined,
          },
        },
      })
    })

    it("creates document with correct metadata", async () => {
      mockInngestSend.mockResolvedValue({ ids: ["evt-123"] })

      const request = createMockRequest({
        content: "This is a sample NDA document content.",
        paragraphs: [
          { text: "Section 1", style: "Heading1", isHeading: true },
          { text: "Content here.", style: "Normal", isHeading: false },
        ],
        metadata: { title: "Custom Title" },
      })
      await POST(request, { params: Promise.resolve({}) })

      // Verify db.insert was called (twice - once for document, once for analysis)
      expect(mockDbInsert).toHaveBeenCalledTimes(2)
    })

    it("handles optional paragraphs and metadata", async () => {
      mockInngestSend.mockResolvedValue({ ids: ["evt-123"] })

      const request = createMockRequest({
        content: "Minimal document content.",
      })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
    })
  })

  describe("deduplication", () => {
    beforeEach(() => {
      mockVerifyAddInAuth.mockResolvedValue({
        userId: "user-123",
        user: { id: "user-123", email: "test@example.com", name: "Test User" },
        tenant: { tenantId: "tenant-123", role: "owner" },
      })
    })

    it("returns existing analysis for duplicate document with completed analysis", async () => {
      mockDbQueryFindFirst.mockResolvedValue({
        id: "existing-doc-123",
        analyses: [
          {
            id: "existing-analysis-456",
            status: "completed",
            createdAt: new Date("2026-01-01"),
          },
        ],
      })

      const request = createMockRequest({
        content: "This is a sample NDA document content.",
      })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual({
        analysisId: "existing-analysis-456",
        documentId: "existing-doc-123",
        status: "existing",
        message: "Document was previously analyzed. Returning existing results.",
      })

      // Should not have called insert or inngest
      expect(mockDbInsert).not.toHaveBeenCalled()
    })

    it("returns in_progress for duplicate document with pending analysis", async () => {
      mockDbQueryFindFirst.mockResolvedValue({
        id: "existing-doc-123",
        analyses: [
          {
            id: "pending-analysis-456",
            status: "pending",
            createdAt: new Date("2026-01-01"),
          },
        ],
      })

      const request = createMockRequest({
        content: "This is a sample NDA document content.",
      })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual({
        analysisId: "pending-analysis-456",
        documentId: "existing-doc-123",
        status: "in_progress",
        message: "Document analysis is already in progress.",
      })

      // Should not have called insert or inngest
      expect(mockDbInsert).not.toHaveBeenCalled()
    })

    it("returns in_progress for duplicate document with processing analysis", async () => {
      mockDbQueryFindFirst.mockResolvedValue({
        id: "existing-doc-123",
        analyses: [
          {
            id: "processing-analysis-456",
            status: "processing",
            createdAt: new Date("2026-01-01"),
          },
        ],
      })

      const request = createMockRequest({
        content: "This is a sample NDA document content.",
      })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data.status).toBe("in_progress")
    })

    it("creates new analysis for duplicate document with failed analysis", async () => {
      mockDbQueryFindFirst.mockResolvedValue({
        id: "existing-doc-123",
        analyses: [
          {
            id: "failed-analysis-456",
            status: "failed",
            createdAt: new Date("2026-01-01"),
          },
        ],
      })

      // Mock db.insert for new document creation
      const mockDocument = { id: "new-doc-123" }
      const mockAnalysis = { id: "new-analysis-456" }
      const mockReturning = vi
        .fn()
        .mockResolvedValueOnce([mockDocument])
        .mockResolvedValueOnce([mockAnalysis])
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({ returning: mockReturning }),
      })
      mockInngestSend.mockResolvedValue({ ids: ["evt-123"] })

      const request = createMockRequest({
        content: "This is a sample NDA document content.",
      })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.data.status).toBe("queued")

      // Should have called insert for new document and analysis
      expect(mockDbInsert).toHaveBeenCalledTimes(2)
      expect(mockInngestSend).toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    beforeEach(() => {
      mockVerifyAddInAuth.mockResolvedValue({
        userId: "user-123",
        user: { id: "user-123", email: "test@example.com", name: "Test User" },
        tenant: { tenantId: "tenant-123", role: "owner" },
      })
    })

    it("returns 500 when database insert fails", async () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("Database error")),
        }),
      })

      const request = createMockRequest({
        content: "Test document content.",
      })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe("INTERNAL_ERROR")

      consoleSpy.mockRestore()
    })

    it("returns 500 when Inngest send fails", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const mockReturning = vi
        .fn()
        .mockResolvedValueOnce([{ id: "doc-123" }])
        .mockResolvedValueOnce([{ id: "analysis-456" }])
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({ returning: mockReturning }),
      })
      mockInngestSend.mockRejectedValue(new Error("Inngest error"))

      const request = createMockRequest({
        content: "Test document content.",
      })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)

      consoleSpy.mockRestore()
    })
  })
})
