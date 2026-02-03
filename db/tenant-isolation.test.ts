// src/db/tenant-isolation.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import {
  createTestOrg,
  createTestDocument,
  createTestAnalysis,
  createTestChunk,
} from "@/test/factories"
import {
  getDocumentsByTenant,
  getDocumentById,
  updateDocumentStatus,
  softDeleteDocument,
} from "@/db/queries/documents"
import {
  getAnalysisByDocument,
  updateAnalysisStatus,
} from "@/db/queries/analyses"

describe("tenant isolation", () => {
  let tenantA: string
  let tenantB: string
  let docA: string
  let docB: string

  beforeEach(async () => {
    const orgA = await createTestOrg({ slug: "tenant-a" })
    const orgB = await createTestOrg({ slug: "tenant-b" })
    tenantA = orgA.id
    tenantB = orgB.id

    const documentA = await createTestDocument(tenantA, { title: "Doc A" })
    const documentB = await createTestDocument(tenantB, { title: "Doc B" })
    docA = documentA.id
    docB = documentB.id
  })

  it("getDocumentsByTenant returns only own tenant's documents", async () => {
    const docsA = await getDocumentsByTenant(tenantA)
    const docsB = await getDocumentsByTenant(tenantB)

    expect(docsA).toHaveLength(1)
    expect(docsA[0].title).toBe("Doc A")
    expect(docsB).toHaveLength(1)
    expect(docsB[0].title).toBe("Doc B")
  })

  it("getDocumentById returns null for other tenant's document", async () => {
    const found = await getDocumentById(docA, tenantB)

    expect(found).toBeNull()
  })

  it("updateDocumentStatus fails silently for other tenant", async () => {
    const updated = await updateDocumentStatus(docA, tenantB, "complete")

    expect(updated).toBeNull()

    // Original document unchanged
    const doc = await getDocumentById(docA, tenantA)
    expect(doc!.status).toBe("pending")
  })

  it("softDeleteDocument fails silently for other tenant", async () => {
    const deleted = await softDeleteDocument(docA, tenantB)

    expect(deleted).toBeNull()

    // Original document not deleted
    const doc = await getDocumentById(docA, tenantA)
    expect(doc).not.toBeNull()
  })

  it("getAnalysisByDocument returns null for other tenant", async () => {
    await createTestAnalysis(tenantA, docA)

    const found = await getAnalysisByDocument(docA, tenantB)

    expect(found).toBeNull()
  })

  it("updateAnalysisStatus fails silently for other tenant", async () => {
    const analysis = await createTestAnalysis(tenantA, docA)

    const updated = await updateAnalysisStatus(analysis.id, tenantB, "complete")

    expect(updated).toBeNull()
  })

  it("query helpers never expose cross-tenant data in any return", async () => {
    // Create rich data in tenant A
    await createTestChunk(tenantA, docA, 0)
    await createTestChunk(tenantA, docA, 1)
    await createTestAnalysis(tenantA, docA)

    // Query as tenant B - should get nothing
    const docs = await getDocumentsByTenant(tenantB)
    const doc = await getDocumentById(docA, tenantB)
    const analysis = await getAnalysisByDocument(docA, tenantB)

    // Tenant B only sees their own doc
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe(docB)

    // Cannot access A's resources
    expect(doc).toBeNull()
    expect(analysis).toBeNull()
  })
})
