// src/db/schema/auth.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { eq } from "drizzle-orm"
import { users, accounts, sessions } from "./index"
import { createTestUser } from "@/test/factories"

describe("auth schema", () => {
  describe("users", () => {
    it("creates user with email", async () => {
      const user = await createTestUser({ email: "test@example.com" })

      expect(user.id).toBeDefined()
      expect(user.email).toBe("test@example.com")
    })

    it("enforces unique email constraint", async () => {
      await createTestUser({ email: "unique@example.com" })

      await expect(
        createTestUser({ email: "unique@example.com" })
      ).rejects.toThrow()
    })

    it("allows null for optional fields", async () => {
      const [user] = await testDb
        .insert(users)
        .values({
          email: "minimal@example.com",
        })
        .returning()

      expect(user.name).toBeNull()
      expect(user.image).toBeNull()
      expect(user.passwordHash).toBeNull()
    })

    it("sets timestamps automatically", async () => {
      const user = await createTestUser()

      expect(user.createdAt).toBeInstanceOf(Date)
      expect(user.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe("accounts", () => {
    it("creates OAuth account linked to user", async () => {
      const user = await createTestUser()

      const [account] = await testDb
        .insert(accounts)
        .values({
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: "google-123",
        })
        .returning()

      expect(account.userId).toBe(user.id)
      expect(account.provider).toBe("google")
    })

    it("enforces composite primary key", async () => {
      const user = await createTestUser()

      await testDb.insert(accounts).values({
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId: "google-123",
      })

      // Same provider + providerAccountId should fail
      await expect(
        testDb.insert(accounts).values({
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: "google-123",
        })
      ).rejects.toThrow()
    })

    it("cascades delete when user deleted", async () => {
      const user = await createTestUser()
      await testDb.insert(accounts).values({
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId: "cascade-test",
      })

      await testDb.delete(users).where(eq(users.id, user.id))

      const found = await testDb
        .select()
        .from(accounts)
        .where(eq(accounts.providerAccountId, "cascade-test"))

      expect(found).toHaveLength(0)
    })
  })

  describe("sessions", () => {
    it("creates session with token", async () => {
      const user = await createTestUser()

      const [session] = await testDb
        .insert(sessions)
        .values({
          sessionToken: "test-token-123",
          userId: user.id,
          expires: new Date(Date.now() + 86400000),
        })
        .returning()

      expect(session.sessionToken).toBe("test-token-123")
      expect(session.userId).toBe(user.id)
    })

    it("cascades delete when user deleted", async () => {
      const user = await createTestUser()
      await testDb.insert(sessions).values({
        sessionToken: "cascade-session",
        userId: user.id,
        expires: new Date(Date.now() + 86400000),
      })

      await testDb.delete(users).where(eq(users.id, user.id))

      const found = await testDb
        .select()
        .from(sessions)
        .where(eq(sessions.sessionToken, "cascade-session"))

      expect(found).toHaveLength(0)
    })

    it("allows null activeOrganizationId", async () => {
      const user = await createTestUser()

      const [session] = await testDb
        .insert(sessions)
        .values({
          sessionToken: "no-org-session",
          userId: user.id,
          expires: new Date(Date.now() + 86400000),
          activeOrganizationId: null,
        })
        .returning()

      expect(session.activeOrganizationId).toBeNull()
    })
  })
})
