// app/(dashboard)/settings/profile/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { testDb } from "@/test/setup"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  resetFactoryCounter,
} from "@/test/factories"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"

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

// Mock password utilities
const mockVerifyPassword = vi.fn()
const mockHashPassword = vi.fn()
const mockValidatePassword = vi.fn()

vi.mock("@/lib/password", () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  validatePassword: (...args: unknown[]) => mockValidatePassword(...args),
}))

// Mock the db module to use testDb
vi.mock("@/db/client", async () => {
  const { testDb } = await import("@/test/setup")
  return { db: testDb }
})

// Helper to set up session context
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

describe("profile/actions", () => {
  beforeEach(() => {
    mockSessionContext = null
    resetFactoryCounter()
    mockVerifyPassword.mockReset()
    mockHashPassword.mockReset()
    mockValidatePassword.mockReset()
  })

  describe("updateProfile", () => {
    it("updates user name", async () => {
      const user = await createTestUser({ name: "Old Name" })
      setupSessionContext({ user })

      const { updateProfile } = await import("./actions")
      const result = await updateProfile({ name: "New Name" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe("New Name")
      }
    })

    it("updates user image", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { updateProfile } = await import("./actions")
      const result = await updateProfile({ image: "https://example.com/avatar.png" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.image).toBe("https://example.com/avatar.png")
      }
    })

    it("updates both name and image", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { updateProfile } = await import("./actions")
      const result = await updateProfile({
        name: "Jane Doe",
        image: "https://example.com/jane.png",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe("Jane Doe")
        expect(result.data.image).toBe("https://example.com/jane.png")
      }
    })

    it("rejects empty update (no fields provided)", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { updateProfile } = await import("./actions")
      const result = await updateProfile({})

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
        expect(result.error.message).toContain("No fields to update")
      }
    })

    it("rejects invalid image URL", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { updateProfile } = await import("./actions")
      const result = await updateProfile({ image: "not-a-url" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("rejects empty name", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { updateProfile } = await import("./actions")
      const result = await updateProfile({ name: "" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("requires authentication", async () => {
      const { updateProfile } = await import("./actions")
      await expect(updateProfile({ name: "Test" })).rejects.toThrow("REDIRECT:/login")
    })
  })

  describe("changePassword", () => {
    it("changes password when current password is correct", async () => {
      const user = await createTestUser()
      // Set password hash in database
      await testDb
        .update(users)
        .set({ passwordHash: "hashed_old_password" })
        .where(eq(users.id, user.id))
      setupSessionContext({ user })

      mockVerifyPassword
        .mockResolvedValueOnce(true) // current password check
        .mockResolvedValueOnce(false) // same password check
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] })
      mockHashPassword.mockResolvedValue("hashed_new_password")

      const { changePassword } = await import("./actions")
      const result = await changePassword({
        currentPassword: "oldPassword123!",
        newPassword: "newPassword456@",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.changed).toBe(true)
      }
      expect(mockHashPassword).toHaveBeenCalledWith("newPassword456@")
    })

    it("rejects incorrect current password", async () => {
      const user = await createTestUser()
      await testDb
        .update(users)
        .set({ passwordHash: "hashed_password" })
        .where(eq(users.id, user.id))
      setupSessionContext({ user })

      mockVerifyPassword.mockResolvedValue(false)

      const { changePassword } = await import("./actions")
      const result = await changePassword({
        currentPassword: "wrongPassword",
        newPassword: "newPassword456@",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("UNAUTHORIZED")
        expect(result.error.message).toContain("incorrect")
      }
    })

    it("rejects weak new password", async () => {
      const user = await createTestUser()
      await testDb
        .update(users)
        .set({ passwordHash: "hashed_password" })
        .where(eq(users.id, user.id))
      setupSessionContext({ user })

      mockVerifyPassword.mockResolvedValue(true)
      mockValidatePassword.mockReturnValue({
        valid: false,
        errors: ["Must contain uppercase", "Must contain special character"],
      })

      const { changePassword } = await import("./actions")
      const result = await changePassword({
        currentPassword: "correctPassword",
        newPassword: "weakpassword", // 12 chars but fails strength check
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
        expect(result.error.message).toContain("uppercase")
      }
    })

    it("rejects same password as current", async () => {
      const user = await createTestUser()
      await testDb
        .update(users)
        .set({ passwordHash: "hashed_password" })
        .where(eq(users.id, user.id))
      setupSessionContext({ user })

      mockVerifyPassword
        .mockResolvedValueOnce(true) // current password check passes
        .mockResolvedValueOnce(true) // same password check - new = current
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] })

      const { changePassword } = await import("./actions")
      const result = await changePassword({
        currentPassword: "samePassword123!",
        newPassword: "samePassword123!",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
        expect(result.error.message).toContain("different")
      }
    })

    it("rejects for OAuth-only users (no password hash)", async () => {
      const user = await createTestUser()
      // Don't set passwordHash - simulates OAuth-only user
      setupSessionContext({ user })

      const { changePassword } = await import("./actions")
      const result = await changePassword({
        currentPassword: "anyPassword",
        newPassword: "newPassword456@",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("BAD_REQUEST")
        expect(result.error.message).toContain("OAuth")
      }
    })

    it("validates new password length (min 8 chars)", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { changePassword } = await import("./actions")
      const result = await changePassword({
        currentPassword: "currentPass",
        newPassword: "short",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
        expect(result.error.message).toContain("8 characters")
      }
    })

    it("requires authentication", async () => {
      const { changePassword } = await import("./actions")
      await expect(
        changePassword({ currentPassword: "old", newPassword: "newPass123!" })
      ).rejects.toThrow("REDIRECT:/login")
    })
  })

  describe("deleteAccount", () => {
    it("deletes account with correct confirmation", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { deleteAccount } = await import("./actions")
      const result = await deleteAccount({ confirmation: "DELETE" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.deleted).toBe(true)
      }

      // Verify user is actually deleted
      const deletedUser = await testDb.query.users.findFirst({
        where: eq(users.id, user.id),
      })
      expect(deletedUser).toBeUndefined()
    })

    it("rejects incorrect confirmation string", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { deleteAccount } = await import("./actions")
      const result = await deleteAccount({ confirmation: "delete" }) // lowercase

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
        expect(result.error.message).toContain('type "DELETE"')
      }
    })

    it("prevents deletion when user is sole owner of an org", async () => {
      const user = await createTestUser()
      const org = await createTestOrg({ name: "My Organization" })
      await createTestMembership(org.id, user.id, "owner")
      setupSessionContext({ user })

      const { deleteAccount } = await import("./actions")
      const result = await deleteAccount({ confirmation: "DELETE" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("FORBIDDEN")
        expect(result.error.message).toContain("sole owner")
        expect(result.error.message).toContain("My Organization")
      }
    })

    it("allows deletion when org has multiple owners", async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user1.id, "owner")
      await createTestMembership(org.id, user2.id, "owner")
      setupSessionContext({ user: user1 })

      const { deleteAccount } = await import("./actions")
      const result = await deleteAccount({ confirmation: "DELETE" })

      expect(result.success).toBe(true)
    })

    it("allows deletion for non-owner members", async () => {
      const user = await createTestUser()
      const owner = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, owner.id, "owner")
      await createTestMembership(org.id, user.id, "member")
      setupSessionContext({ user })

      const { deleteAccount } = await import("./actions")
      const result = await deleteAccount({ confirmation: "DELETE" })

      expect(result.success).toBe(true)
    })

    it("requires authentication", async () => {
      const { deleteAccount } = await import("./actions")
      await expect(
        deleteAccount({ confirmation: "DELETE" })
      ).rejects.toThrow("REDIRECT:/login")
    })
  })

  describe("exportUserData", () => {
    it("exports user data without password hash", async () => {
      const user = await createTestUser({ name: "Export User" })
      await testDb
        .update(users)
        .set({ passwordHash: "secret_hash_should_not_appear" })
        .where(eq(users.id, user.id))
      setupSessionContext({ user })

      const { exportUserData } = await import("./actions")
      const result = await exportUserData()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.user.id).toBe(user.id)
        expect(result.data.user.email).toBe(user.email)
        expect(result.data.user.name).toBe("Export User")
        // Ensure passwordHash is NOT in the export
        expect("passwordHash" in result.data.user).toBe(false)
        expect(JSON.stringify(result.data)).not.toContain("secret_hash")
      }
    })

    it("includes organization memberships", async () => {
      const user = await createTestUser()
      const org1 = await createTestOrg({ name: "Org One" })
      const org2 = await createTestOrg({ name: "Org Two" })
      await createTestMembership(org1.id, user.id, "owner")
      await createTestMembership(org2.id, user.id, "member")
      setupSessionContext({ user })

      const { exportUserData } = await import("./actions")
      const result = await exportUserData()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.organizations).toHaveLength(2)
        expect(result.data.organizations.map((o) => o.name)).toContain("Org One")
        expect(result.data.organizations.map((o) => o.name)).toContain("Org Two")

        const org1Data = result.data.organizations.find((o) => o.name === "Org One")
        expect(org1Data?.role).toBe("owner")
      }
    })

    it("includes export timestamp", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const before = new Date()
      const { exportUserData } = await import("./actions")
      const result = await exportUserData()
      const after = new Date()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.exportedAt).toBeDefined()
        const exportTime = new Date(result.data.exportedAt)
        expect(exportTime.getTime()).toBeGreaterThanOrEqual(before.getTime())
        expect(exportTime.getTime()).toBeLessThanOrEqual(after.getTime())
      }
    })

    it("returns empty organizations for user with no memberships", async () => {
      const user = await createTestUser()
      setupSessionContext({ user })

      const { exportUserData } = await import("./actions")
      const result = await exportUserData()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.organizations).toHaveLength(0)
      }
    })

    it("requires authentication", async () => {
      const { exportUserData } = await import("./actions")
      await expect(exportUserData()).rejects.toThrow("REDIRECT:/login")
    })
  })
})
