// app/(dashboard)/analyses/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { testDb } from "@/test/setup"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestDocument,
  createTestAnalysis,
  createTestClauseExtraction,
  resetFactoryCounter,
} from "@/test/factories"

// Store mock state at module level
let mockTenantContext: {
  db: typeof testDb
  userId: string
  user: { id: string; name: string; email: string }
  tenantId: string
  role: string
} | null = null

// Mock the DAL module
vi.mock("@/lib/dal", () => ({
  withTenant: vi.fn(async () => {
    if (!mockTenantContext) {
      throw new Error("REDIRECT:/onboarding")
    }
    return mockTenantContext
  }),
}))

// Mock the db module to use testDb
vi.mock("@/db", async () => {
  const { testDb } = await import("@/test/setup")
  const schema = await import("@/db/schema")
  return {
    db: testDb,
    ...schema,
  }
})

// Mock revalidatePath (Next.js cache)
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

// Mock inngest
const mockInngestSend = vi.fn().mockResolvedValue({ ids: ["run_123"] })
vi.mock("@/inngest", () => ({
  inngest: {
    send: mockInngestSend,
  },
}))

// Helper to set up tenant context
function setupTenantContext(params: {
  user: { id: string; name: string | null; email: string }
  org: { id: string }
  membership: { role: string }
}): void {
  mockTenantContext = {
    db: testDb,
    userId: params.user.id,
    user: {
      id: params.user.id,
      name: params.user.name ?? "Test User",
      email: params.user.email,
    },
    tenantId: params.org.id,
    role: params.membership.role,
  }
}

describe("analyses/actions", () => {
  beforeEach(() => {
    mockTenantContext = null
    resetFactoryCounter()
    mockInngestSend.mockClear()
  })

  describe("triggerAnalysis", () => {
    it("creates a pending analysis for a ready document", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id, { status: "ready" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { triggerAnalysis } = await import("./actions")
      const result = await triggerAnalysis(doc.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.documentId).toBe(doc.id)
        expect(result.data.status).toBe("pending")
        expect(result.data.version).toBe(1)
      }
    })

    it("increments version for subsequent analyses", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id, { status: "ready" })
      await createTestAnalysis(org.id, doc.id, { version: 1 })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { triggerAnalysis } = await import("./actions")
      const result = await triggerAnalysis(doc.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.version).toBe(2)
      }
    })

    it("rejects analysis for non-ready document", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id, { status: "processing" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { triggerAnalysis } = await import("./actions")
      const result = await triggerAnalysis(doc.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
        expect(result.error.message).toContain("not ready")
      }
    })

    it("returns NOT_FOUND for non-existent document", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { triggerAnalysis } = await import("./actions")
      const result = await triggerAnalysis("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("validates document ID format", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { triggerAnalysis } = await import("./actions")
      const result = await triggerAnalysis("invalid-uuid")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires tenant context", async () => {
      const { triggerAnalysis } = await import("./actions")
      await expect(
        triggerAnalysis("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")
      ).rejects.toThrow("REDIRECT:/onboarding")
    })

    it("sends Inngest event with userPrompt", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id, { status: "ready" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { triggerAnalysis } = await import("./actions")
      const result = await triggerAnalysis(doc.id, { userPrompt: "Focus on IP" })

      expect(result.success).toBe(true)
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "nda/analysis.requested",
          data: expect.objectContaining({
            documentId: doc.id,
            tenantId: org.id,
            userPrompt: "Focus on IP",
            source: "web-upload",
          }),
        })
      )
    })

    it("sends Inngest event without userPrompt when not provided", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id, { status: "ready" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { triggerAnalysis } = await import("./actions")
      const result = await triggerAnalysis(doc.id)

      expect(result.success).toBe(true)
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "nda/analysis.requested",
          data: expect.objectContaining({
            documentId: doc.id,
            tenantId: org.id,
            source: "web-upload",
          }),
        })
      )
    })
  })

  describe("getAnalysis", () => {
    it("returns analysis by ID", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysis } = await import("./actions")
      const result = await getAnalysis(analysis.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(analysis.id)
      }
    })

    it("returns NOT_FOUND for non-existent analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysis } = await import("./actions")
      const result = await getAnalysis("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("enforces tenant isolation", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      const otherOrg = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(otherOrg.id)
      const analysis = await createTestAnalysis(otherOrg.id, doc.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysis } = await import("./actions")
      const result = await getAnalysis(analysis.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })

  describe("getAnalysisStatus", () => {
    it("returns status for polling", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id, { status: "processing" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysisStatus } = await import("./actions")
      const result = await getAnalysisStatus(analysis.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe("processing")
      }
    })

    it("returns progress for completed analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id, { status: "completed" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysisStatus } = await import("./actions")
      const result = await getAnalysisStatus(analysis.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe("completed")
        expect(result.data.progress?.percent).toBe(100)
      }
    })
  })

  describe("getAnalysisClauses", () => {
    it("returns all clauses for an analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id, { category: "Non-Compete" })
      await createTestClauseExtraction(org.id, analysis.id, doc.id, { category: "Confidentiality" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysisClauses } = await import("./actions")
      const result = await getAnalysisClauses(analysis.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
      }
    })

    it("filters by category", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id, { category: "Non-Compete" })
      await createTestClauseExtraction(org.id, analysis.id, doc.id, { category: "Confidentiality" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysisClauses } = await import("./actions")
      const result = await getAnalysisClauses(analysis.id, { category: "Non-Compete" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].category).toBe("Non-Compete")
      }
    })

    it("filters by risk level", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id, { riskLevel: "cautious" })
      await createTestClauseExtraction(org.id, analysis.id, doc.id, { riskLevel: "standard" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysisClauses } = await import("./actions")
      const result = await getAnalysisClauses(analysis.id, { riskLevel: "cautious" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].riskLevel).toBe("cautious")
      }
    })
  })

  describe("getAnalysisGaps", () => {
    it("returns gap analysis for completed analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id, {
        status: "completed",
        gapAnalysis: {
          missingClauses: ["Indemnification"],
          weakClauses: [],
          recommendations: [],
        },
      })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysisGaps } = await import("./actions")
      const result = await getAnalysisGaps(analysis.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.missingClauses).toContain("Indemnification")
      }
    })

    it("rejects gap analysis for non-completed analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id, { status: "processing" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysisGaps } = await import("./actions")
      const result = await getAnalysisGaps(analysis.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
      }
    })
  })

  describe("getDocumentAnalyses", () => {
    it("returns all analyses for a document", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      await createTestAnalysis(org.id, doc.id, { version: 1 })
      await createTestAnalysis(org.id, doc.id, { version: 2 })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getDocumentAnalyses } = await import("./actions")
      const result = await getDocumentAnalyses(doc.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
      }
    })

    it("returns NOT_FOUND for non-existent document", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getDocumentAnalyses } = await import("./actions")
      const result = await getDocumentAnalyses("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })
  })

  describe("getAnalysisHistory", () => {
    it("returns paginated analysis history", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc1 = await createTestDocument(org.id, { title: "Doc 1" })
      const doc2 = await createTestDocument(org.id, { title: "Doc 2" })
      await createTestAnalysis(org.id, doc1.id)
      await createTestAnalysis(org.id, doc2.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysisHistory } = await import("./actions")
      const result = await getAnalysisHistory({ limit: 10 })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.analyses).toHaveLength(2)
        expect(result.data.total).toBe(2)
      }
    })

    it("filters by status", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      await createTestAnalysis(org.id, doc.id, { status: "completed" })
      await createTestAnalysis(org.id, doc.id, { status: "pending" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { getAnalysisHistory } = await import("./actions")
      const result = await getAnalysisHistory({ status: "completed" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.analyses).toHaveLength(1)
        expect(result.data.analyses[0].status).toBe("completed")
      }
    })
  })

  describe("cancelAnalysis", () => {
    it("cancels a pending analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id, { status: "pending" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { cancelAnalysis } = await import("./actions")
      const result = await cancelAnalysis(analysis.id)

      expect(result.success).toBe(true)
    })

    it("cancels a processing analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id, { status: "processing" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { cancelAnalysis } = await import("./actions")
      const result = await cancelAnalysis(analysis.id)

      expect(result.success).toBe(true)
    })

    it("rejects cancellation of completed analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id, { status: "completed" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { cancelAnalysis } = await import("./actions")
      const result = await cancelAnalysis(analysis.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
      }
    })
  })

  describe("deleteAnalysis", () => {
    it("deletes an analysis when not the last one", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis1 = await createTestAnalysis(org.id, doc.id, { version: 1 })
      await createTestAnalysis(org.id, doc.id, { version: 2 })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { deleteAnalysis } = await import("./actions")
      const result = await deleteAnalysis(analysis1.id)

      expect(result.success).toBe(true)
    })

    it("rejects deletion of the last analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { deleteAnalysis } = await import("./actions")
      const result = await deleteAnalysis(analysis.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
        expect(result.error.message).toContain("last analysis")
      }
    })
  })

  describe("exportAnalysisPdf", () => {
    it("returns placeholder URL for completed analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id, { status: "completed" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { exportAnalysisPdf } = await import("./actions")
      const result = await exportAnalysisPdf(analysis.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.url).toContain("placeholder")
        expect(result.data.expiresAt).toBeDefined()
      }
    })

    it("rejects export for non-completed analysis", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "member")
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id, { status: "processing" })
      setupTenantContext({ user, org, membership: { role: "member" } })

      const { exportAnalysisPdf } = await import("./actions")
      const result = await exportAnalysisPdf(analysis.id)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("CONFLICT")
      }
    })
  })
})
