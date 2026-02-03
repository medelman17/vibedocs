// src/db/schema/generated.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { generatedNdas } from "./index"
import { createTestOrg, createTestUser } from "@/test/factories"

describe("generatedNdas schema", () => {
  it("creates generated NDA with required fields", async () => {
    const org = await createTestOrg()

    const [nda] = await testDb
      .insert(generatedNdas)
      .values({
        tenantId: org.id,
        title: "Standard NDA",
        templateSource: "bonterms",
        parameters: { duration: "2 years" },
        content: "Full NDA text...",
      })
      .returning()

    expect(nda.id).toBeDefined()
    expect(nda.title).toBe("Standard NDA")
  })

  it("stores parameters as JSONB", async () => {
    const org = await createTestOrg()
    const params = { duration: "2 years", jurisdiction: "Delaware" }

    const [nda] = await testDb
      .insert(generatedNdas)
      .values({
        tenantId: org.id,
        title: "Test",
        templateSource: "bonterms",
        parameters: params,
        content: "...",
      })
      .returning()

    expect(nda.parameters).toEqual(params)
  })

  it("sets default status to draft", async () => {
    const org = await createTestOrg()

    const [nda] = await testDb
      .insert(generatedNdas)
      .values({
        tenantId: org.id,
        title: "Test",
        templateSource: "bonterms",
        parameters: {},
        content: "...",
      })
      .returning()

    expect(nda.status).toBe("draft")
  })

  it("links to creator user", async () => {
    const org = await createTestOrg()
    const user = await createTestUser()

    const [nda] = await testDb
      .insert(generatedNdas)
      .values({
        tenantId: org.id,
        createdBy: user.id,
        title: "Test",
        templateSource: "bonterms",
        parameters: {},
        content: "...",
      })
      .returning()

    expect(nda.createdBy).toBe(user.id)
  })
})
