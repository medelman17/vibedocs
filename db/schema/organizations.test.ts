// src/db/schema/organizations.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { users, organizations, organizationMembers } from "./index"

describe("organizations schema", () => {
  it("creates an organization", async () => {
    const [org] = await testDb
      .insert(organizations)
      .values({
        name: "Test Org",
        slug: "test-org",
      })
      .returning()

    expect(org.id).toBeDefined()
    expect(org.name).toBe("Test Org")
    expect(org.slug).toBe("test-org")
    expect(org.plan).toBe("free")
  })

  it("creates organization membership", async () => {
    // Create user first
    const [user] = await testDb
      .insert(users)
      .values({
        email: "test@example.com",
        name: "Test User",
      })
      .returning()

    // Create org
    const [org] = await testDb
      .insert(organizations)
      .values({
        name: "Test Org",
        slug: "test-org",
      })
      .returning()

    // Create membership
    const [membership] = await testDb
      .insert(organizationMembers)
      .values({
        organizationId: org.id,
        userId: user.id,
        role: "owner",
      })
      .returning()

    expect(membership.organizationId).toBe(org.id)
    expect(membership.userId).toBe(user.id)
    expect(membership.role).toBe("owner")
  })

  it("enforces unique org membership per user", async () => {
    const [user] = await testDb
      .insert(users)
      .values({ email: "test@example.com" })
      .returning()

    const [org] = await testDb
      .insert(organizations)
      .values({ name: "Test Org", slug: "test-org" })
      .returning()

    // First membership should succeed
    await testDb.insert(organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: "member",
    })

    // Duplicate should fail
    await expect(
      testDb.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: "admin",
      })
    ).rejects.toThrow()
  })
})
