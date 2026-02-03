// src/db/schema/comparisons.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { comparisons } from "./index"
import { createTestOrg, createTestDocument } from "@/test/factories"

describe("comparisons schema", () => {
  it("creates comparison between two documents", async () => {
    const org = await createTestOrg()
    const docA = await createTestDocument(org.id)
    const docB = await createTestDocument(org.id)

    const [comp] = await testDb
      .insert(comparisons)
      .values({
        tenantId: org.id,
        documentAId: docA.id,
        documentBId: docB.id,
      })
      .returning()

    expect(comp.id).toBeDefined()
    expect(comp.documentAId).toBe(docA.id)
    expect(comp.documentBId).toBe(docB.id)
  })

  it("sets default status to pending", async () => {
    const org = await createTestOrg()
    const docA = await createTestDocument(org.id)
    const docB = await createTestDocument(org.id)

    const [comp] = await testDb
      .insert(comparisons)
      .values({
        tenantId: org.id,
        documentAId: docA.id,
        documentBId: docB.id,
      })
      .returning()

    expect(comp.status).toBe("pending")
  })
})
