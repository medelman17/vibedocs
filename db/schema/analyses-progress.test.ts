import { describe, it, expect, beforeEach } from "vitest"
import { testDb } from "@/test/setup"
import { analyses } from "./analyses"
import { documents } from "./documents"
import { organizations } from "./organizations"

describe("analyses progress columns", () => {
  let tenantId: string
  let documentId: string

  beforeEach(async () => {
    // Create org and document
    const [org] = await testDb
      .insert(organizations)
      .values({ name: "Test Org", slug: "test-org" })
      .returning()
    tenantId = org.id

    const [doc] = await testDb
      .insert(documents)
      .values({
        tenantId,
        title: "Test NDA",
        fileName: "test.pdf",
        fileType: "application/pdf",
        fileSize: 1000,
        status: "ready",
      })
      .returning()
    documentId = doc.id
  })

  it("stores progressStage and progressPercent", async () => {
    const [analysis] = await testDb
      .insert(analyses)
      .values({
        tenantId,
        documentId,
        status: "processing",
        progressStage: "classifying",
        progressPercent: 45,
      })
      .returning()

    expect(analysis.progressStage).toBe("classifying")
    expect(analysis.progressPercent).toBe(45)
  })

  it("stores userPrompt in metadata", async () => {
    const [analysis] = await testDb
      .insert(analyses)
      .values({
        tenantId,
        documentId,
        status: "pending",
        metadata: { userPrompt: "Focus on IP clauses" },
      })
      .returning()

    expect(
      (analysis.metadata as { userPrompt?: string })?.userPrompt
    ).toBe("Focus on IP clauses")
  })

  it("defaults progressPercent to 0", async () => {
    const [analysis] = await testDb
      .insert(analyses)
      .values({ tenantId, documentId, status: "pending" })
      .returning()

    expect(analysis.progressPercent).toBe(0)
  })
})
