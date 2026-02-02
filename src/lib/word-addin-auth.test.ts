// src/lib/word-addin-auth.test.ts
import "@/test/setup"
import { describe, it, expect, beforeEach } from "vitest"
import { testDb } from "@/test/setup"
import { users, sessions, organizations, organizationMembers } from "@/db/schema"
import { verifyAddInAuth, withAddInAuth } from "./word-addin-auth"
import { UnauthorizedError, ForbiddenError } from "./errors"

describe("word-addin-auth", () => {
  // Test fixtures
  const testUser = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    email: "test@example.com",
    name: "Test User",
  }

  const testOrg = {
    id: "660e8400-e29b-41d4-a716-446655440001",
    name: "Test Organization",
    slug: "test-org",
  }

  const validToken = "valid-session-token-123"
  const expiredToken = "expired-session-token-456"

  beforeEach(async () => {
    // Insert test user
    await testDb.insert(users).values({
      id: testUser.id,
      email: testUser.email,
      name: testUser.name,
    })

    // Insert test organization
    await testDb.insert(organizations).values({
      id: testOrg.id,
      name: testOrg.name,
      slug: testOrg.slug,
    })

    // Insert organization membership
    await testDb.insert(organizationMembers).values({
      organizationId: testOrg.id,
      userId: testUser.id,
      role: "admin",
    })

    // Insert valid session (expires in 1 hour)
    await testDb.insert(sessions).values({
      sessionToken: validToken,
      userId: testUser.id,
      expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      activeOrganizationId: testOrg.id,
    })

    // Insert expired session
    await testDb.insert(sessions).values({
      sessionToken: expiredToken,
      userId: testUser.id,
      expires: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    })
  })

  describe("verifyAddInAuth", () => {
    it("throws UnauthorizedError when Authorization header is missing", async () => {
      const request = new Request("http://localhost/api/test")

      await expect(verifyAddInAuth(request)).rejects.toThrow(UnauthorizedError)
      await expect(verifyAddInAuth(request)).rejects.toThrow(
        "Missing Authorization header"
      )
    })

    it("throws UnauthorizedError when Authorization header is not Bearer", async () => {
      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: "Basic dXNlcjpwYXNz",
        },
      })

      await expect(verifyAddInAuth(request)).rejects.toThrow(UnauthorizedError)
      await expect(verifyAddInAuth(request)).rejects.toThrow(
        "Missing Authorization header"
      )
    })

    it("throws ForbiddenError for invalid session token", async () => {
      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: "Bearer invalid-token",
        },
      })

      await expect(verifyAddInAuth(request)).rejects.toThrow(ForbiddenError)
      await expect(verifyAddInAuth(request)).rejects.toThrow(
        "Invalid or expired session token"
      )
    })

    it("throws ForbiddenError for expired session token", async () => {
      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: `Bearer ${expiredToken}`,
        },
      })

      await expect(verifyAddInAuth(request)).rejects.toThrow(ForbiddenError)
      await expect(verifyAddInAuth(request)).rejects.toThrow(
        "Invalid or expired session token"
      )
    })

    it("returns auth context for valid session token", async () => {
      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      })

      const authContext = await verifyAddInAuth(request)

      expect(authContext.userId).toBe(testUser.id)
      expect(authContext.user.id).toBe(testUser.id)
      expect(authContext.user.email).toBe(testUser.email)
      expect(authContext.user.name).toBe(testUser.name)
    })

    it("returns tenant context when session has activeOrganizationId", async () => {
      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      })

      const authContext = await verifyAddInAuth(request)

      expect(authContext.tenant.tenantId).toBe(testOrg.id)
      expect(authContext.tenant.role).toBe("admin")
    })

    it("returns null tenant context when session has no activeOrganizationId", async () => {
      // Insert session without activeOrganizationId
      const noOrgToken = "no-org-session-token"
      await testDb.insert(sessions).values({
        sessionToken: noOrgToken,
        userId: testUser.id,
        expires: new Date(Date.now() + 60 * 60 * 1000),
        activeOrganizationId: null,
      })

      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: `Bearer ${noOrgToken}`,
        },
      })

      const authContext = await verifyAddInAuth(request)

      expect(authContext.tenant.tenantId).toBeNull()
      expect(authContext.tenant.role).toBeNull()
    })

    it("returns null tenant context when user is not a member of the active org", async () => {
      // Create a new organization that the user is not a member of
      const otherOrg = {
        id: "770e8400-e29b-41d4-a716-446655440002",
        name: "Other Organization",
        slug: "other-org",
      }
      await testDb.insert(organizations).values(otherOrg)

      // Insert session with activeOrganizationId set to org user is not a member of
      const otherOrgToken = "other-org-session-token"
      await testDb.insert(sessions).values({
        sessionToken: otherOrgToken,
        userId: testUser.id,
        expires: new Date(Date.now() + 60 * 60 * 1000),
        activeOrganizationId: otherOrg.id,
      })

      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      })

      const authContext = await verifyAddInAuth(request)

      expect(authContext.tenant.tenantId).toBeNull()
      expect(authContext.tenant.role).toBeNull()
    })

    // Note: Testing "user deleted" scenario is challenging with FK constraints
    // In production, the session would cascade-delete when user is deleted
    // This edge case is already covered by DB-level ON DELETE CASCADE
  })

  describe("withAddInAuth", () => {
    it("calls handler with auth context for valid token", async () => {
      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      })

      const result = await withAddInAuth(request, async (authContext) => {
        return {
          userId: authContext.userId,
          email: authContext.user.email,
        }
      })

      expect(result.userId).toBe(testUser.id)
      expect(result.email).toBe(testUser.email)
    })

    it("throws UnauthorizedError for missing auth", async () => {
      const request = new Request("http://localhost/api/test")

      await expect(
        withAddInAuth(request, async () => ({ data: "test" }))
      ).rejects.toThrow(UnauthorizedError)
    })

    it("throws ForbiddenError for invalid token", async () => {
      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: "Bearer invalid-token",
        },
      })

      await expect(
        withAddInAuth(request, async () => ({ data: "test" }))
      ).rejects.toThrow(ForbiddenError)
    })

    it("passes tenant context to handler", async () => {
      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      })

      const result = await withAddInAuth(request, async (authContext) => {
        return {
          tenantId: authContext.tenant.tenantId,
          role: authContext.tenant.role,
        }
      })

      expect(result.tenantId).toBe(testOrg.id)
      expect(result.role).toBe("admin")
    })

    it("returns handler result", async () => {
      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      })

      const expected = { success: true, data: [1, 2, 3] }
      const result = await withAddInAuth(request, async () => expected)

      expect(result).toEqual(expected)
    })
  })

  describe("extractBearerToken (implicit via verifyAddInAuth)", () => {
    it("handles empty Bearer token as missing authorization", async () => {
      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: "Bearer ",
        },
      })

      // "Bearer " followed by empty string extracts to empty string
      // extractBearerToken returns null for empty strings after slice
      // Actually, let's check the implementation - it returns authHeader.slice(7)
      // For "Bearer ", slice(7) returns "" which is falsy, but not null
      // Let's verify: it returns empty string, which gets passed to DB lookup
      // DB lookup returns null for empty token, so it should throw ForbiddenError
      // But wait - the code returns authHeader.slice(7) which is ""
      // Then !token is !""  which is true, so it throws UnauthorizedError
      await expect(verifyAddInAuth(request)).rejects.toThrow(UnauthorizedError)
    })

    it("handles token with spaces", async () => {
      // Insert a session with a token that has spaces
      const spacedToken = "token with spaces"
      await testDb.insert(sessions).values({
        sessionToken: spacedToken,
        userId: testUser.id,
        expires: new Date(Date.now() + 60 * 60 * 1000),
      })

      const request = new Request("http://localhost/api/test", {
        headers: {
          Authorization: `Bearer ${spacedToken}`,
        },
      })

      const authContext = await verifyAddInAuth(request)
      expect(authContext.userId).toBe(testUser.id)
    })
  })

  describe("organization role mapping", () => {
    const roles = ["owner", "admin", "member", "viewer"] as const

    for (const role of roles) {
      it(`correctly maps ${role} role from membership`, async () => {
        // Create a new org and membership for this test
        const roleTestOrg = {
          id: `990e8400-e29b-41d4-a716-44665544000${roles.indexOf(role)}`,
          name: `${role} Test Org`,
          slug: `${role}-test-org`,
        }
        await testDb.insert(organizations).values(roleTestOrg)
        await testDb.insert(organizationMembers).values({
          organizationId: roleTestOrg.id,
          userId: testUser.id,
          role,
        })

        const roleToken = `role-test-token-${role}`
        await testDb.insert(sessions).values({
          sessionToken: roleToken,
          userId: testUser.id,
          expires: new Date(Date.now() + 60 * 60 * 1000),
          activeOrganizationId: roleTestOrg.id,
        })

        const request = new Request("http://localhost/api/test", {
          headers: {
            Authorization: `Bearer ${roleToken}`,
          },
        })

        const authContext = await verifyAddInAuth(request)
        expect(authContext.tenant.role).toBe(role)
      })
    }
  })
})
