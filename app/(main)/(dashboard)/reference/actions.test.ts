// app/(dashboard)/reference/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestCuadCategory,
  resetFactoryCounter,
} from "@/test/factories"

// Store mock state at module level
let mockSessionContext: {
  userId: string
  user: { id: string; name: string; email: string }
  activeOrganizationId: string | null
} | null = null

// Mock the DAL module
vi.mock("@/lib/dal", () => ({
  verifySession: vi.fn(async () => {
    if (!mockSessionContext) {
      throw new Error("REDIRECT:/login")
    }
    return mockSessionContext
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

// Helper to set up session context for tests
function setupSessionContext(params: {
  user: { id: string; name: string | null; email: string }
  activeOrganizationId?: string | null
}): void {
  mockSessionContext = {
    userId: params.user.id,
    user: {
      id: params.user.id,
      name: params.user.name ?? "Test User",
      email: params.user.email,
    },
    activeOrganizationId: params.activeOrganizationId ?? null,
  }
}

describe("reference/actions", () => {
  beforeEach(() => {
    mockSessionContext = null
    resetFactoryCounter()
  })

  describe("getCategories", () => {
    it("returns all CUAD categories when no filter is provided", async () => {
      // Setup authenticated user
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupSessionContext({ user, activeOrganizationId: org.id })

      // Create test categories
      await createTestCuadCategory({ name: "Non-Compete", isNdaRelevant: true })
      await createTestCuadCategory({ name: "Governing Law", isNdaRelevant: true })
      await createTestCuadCategory({ name: "IP Assignment", isNdaRelevant: false })

      const { getCategories } = await import("./actions")
      const result = await getCategories()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(3)
        expect(result.data.map((c) => c.name)).toContain("Non-Compete")
        expect(result.data.map((c) => c.name)).toContain("Governing Law")
        expect(result.data.map((c) => c.name)).toContain("IP Assignment")
      }
    })

    it("filters to NDA-relevant categories when ndaRelevantOnly is true", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")
      setupSessionContext({ user, activeOrganizationId: org.id })

      await createTestCuadCategory({ name: "Non-Compete", isNdaRelevant: true })
      await createTestCuadCategory({ name: "Governing Law", isNdaRelevant: true })
      await createTestCuadCategory({ name: "IP Assignment", isNdaRelevant: false })

      const { getCategories } = await import("./actions")
      const result = await getCategories({ ndaRelevantOnly: true })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
        expect(result.data.map((c) => c.name)).toContain("Non-Compete")
        expect(result.data.map((c) => c.name)).toContain("Governing Law")
        expect(result.data.map((c) => c.name)).not.toContain("IP Assignment")
      }
    })

    it("returns empty array when no categories exist", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { getCategories } = await import("./actions")
      const result = await getCategories()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(0)
      }
    })

    it("includes risk weight and description in response", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      await createTestCuadCategory({
        name: "Confidentiality",
        description: "Obligation to keep information confidential",
        riskWeight: 1.5,
        isNdaRelevant: true,
      })

      const { getCategories } = await import("./actions")
      const result = await getCategories()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        const category = result.data[0]
        expect(category.name).toBe("Confidentiality")
        expect(category.description).toBe("Obligation to keep information confidential")
        expect(category.riskWeight).toBe(1.5)
        expect(category.isNdaRelevant).toBe(true)
      }
    })

    it("requires authentication", async () => {
      // Don't set up session context - should fail
      const { getCategories } = await import("./actions")

      await expect(getCategories()).rejects.toThrow("REDIRECT:/login")
    })
  })
})
