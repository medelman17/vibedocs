// src/test/factories.ts
import { testDb } from "./setup"
import {
  users,
  organizations,
  organizationMembers,
  documents,
  documentChunks,
  analyses,
  clauseExtractions,
} from "@/db/schema"

let counter = 0
const uniqueId = () => ++counter

export async function createTestUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await testDb
    .insert(users)
    .values({
      email: `test-${uniqueId()}@example.com`,
      name: "Test User",
      ...overrides,
    })
    .returning()
  return user
}

export async function createTestOrg(overrides: Partial<typeof organizations.$inferInsert> = {}) {
  const [org] = await testDb
    .insert(organizations)
    .values({
      name: "Test Org",
      slug: `test-org-${uniqueId()}`,
      ...overrides,
    })
    .returning()
  return org
}

export async function createTestMembership(
  orgId: string,
  userId: string,
  role = "member",
  overrides: Partial<{
    acceptedAt: Date | null
    invitedAt: Date | null
    invitedBy: string | null
  }> = {}
) {
  const [membership] = await testDb
    .insert(organizationMembers)
    .values({
      organizationId: orgId,
      userId,
      role,
      // Default to accepted membership (acceptedAt set)
      acceptedAt: overrides.acceptedAt !== undefined ? overrides.acceptedAt : new Date(),
      invitedAt: overrides.invitedAt ?? null,
      invitedBy: overrides.invitedBy ?? null,
    })
    .returning()
  return membership
}

export async function createTestDocument(
  tenantId: string,
  overrides: Partial<typeof documents.$inferInsert> = {}
) {
  const [doc] = await testDb
    .insert(documents)
    .values({
      tenantId,
      title: "Test Document",
      fileName: "test.pdf",
      fileType: "pdf",
      ...overrides,
    })
    .returning()
  return doc
}

export async function createTestChunk(
  tenantId: string,
  documentId: string,
  chunkIndex: number,
  overrides: Partial<typeof documentChunks.$inferInsert> = {}
) {
  const [chunk] = await testDb
    .insert(documentChunks)
    .values({
      tenantId,
      documentId,
      chunkIndex,
      content: `Test chunk content ${chunkIndex}`,
      ...overrides,
    })
    .returning()
  return chunk
}

export async function createTestAnalysis(
  tenantId: string,
  documentId: string,
  overrides: Partial<typeof analyses.$inferInsert> = {}
) {
  const [analysis] = await testDb
    .insert(analyses)
    .values({
      tenantId,
      documentId,
      ...overrides,
    })
    .returning()
  return analysis
}

export async function createTestClauseExtraction(
  tenantId: string,
  analysisId: string,
  documentId: string,
  overrides: Partial<typeof clauseExtractions.$inferInsert> = {}
) {
  const [clause] = await testDb
    .insert(clauseExtractions)
    .values({
      tenantId,
      analysisId,
      documentId,
      category: "Non-Compete",
      clauseText: "Test clause text",
      confidence: 0.9,
      riskLevel: "standard",
      ...overrides,
    })
    .returning()
  return clause
}

export async function createTestAuditLog(
  tenantId: string,
  overrides: Partial<{
    tableName: string
    recordId: string
    action: "INSERT" | "UPDATE" | "DELETE"
    oldValues: unknown
    newValues: unknown
    userId: string | null
    ipAddress: string | null
    performedAt: Date
  }> = {}
) {
  const { auditLogs } = await import("@/db/schema")
  const [log] = await testDb
    .insert(auditLogs)
    .values({
      tenantId,
      tableName: overrides.tableName ?? "documents",
      recordId: overrides.recordId ?? crypto.randomUUID(),
      action: overrides.action ?? "INSERT",
      oldValues: overrides.oldValues ?? null,
      newValues: overrides.newValues ?? { title: "Test" },
      userId: overrides.userId ?? null,
      ipAddress: overrides.ipAddress ?? null,
    })
    .returning()
  return log
}

export async function createTestCuadCategory(
  overrides: Partial<{
    name: string
    description: string | null
    riskWeight: number
    isNdaRelevant: boolean
  }> = {}
) {
  const { cuadCategories } = await import("@/db/schema")
  const [category] = await testDb
    .insert(cuadCategories)
    .values({
      name: overrides.name ?? `Test Category ${uniqueId()}`,
      description: overrides.description ?? "Test category description",
      riskWeight: overrides.riskWeight ?? 1.0,
      isNdaRelevant: overrides.isNdaRelevant ?? true,
    })
    .returning()
  return category
}

/**
 * Create a complete tenant context with user, organization, and membership.
 * Useful for setting up authenticated test scenarios.
 */
export async function createTestTenantContext(options: {
  role?: "owner" | "admin" | "member" | "viewer"
  userOverrides?: Partial<typeof users.$inferInsert>
  orgOverrides?: Partial<typeof organizations.$inferInsert>
} = {}) {
  const user = await createTestUser(options.userOverrides)
  const org = await createTestOrg(options.orgOverrides)
  const membership = await createTestMembership(
    org.id,
    user.id,
    options.role ?? "owner"
  )

  return { user, org, membership }
}

export async function createTestComparison(
  tenantId: string,
  documentAId: string,
  documentBId: string,
  overrides: Partial<{
    status: string
    summary: string | null
    clauseAlignments: unknown
    keyDifferences: unknown
  }> = {}
) {
  const { comparisons } = await import("@/db/schema")
  const [comparison] = await testDb
    .insert(comparisons)
    .values({
      tenantId,
      documentAId,
      documentBId,
      status: overrides.status ?? "pending",
      summary: overrides.summary ?? null,
      clauseAlignments: overrides.clauseAlignments ?? null,
      keyDifferences: overrides.keyDifferences ?? null,
    })
    .returning()
  return comparison
}

export async function createTestReferenceDocument(
  overrides: Partial<{
    source: string
    title: string
    rawText: string | null
    metadata: unknown
  }> = {}
) {
  const { referenceDocuments } = await import("@/db/schema")
  const [doc] = await testDb
    .insert(referenceDocuments)
    .values({
      source: overrides.source ?? "bonterms",
      title: overrides.title ?? `Test Template ${uniqueId()}`,
      rawText: overrides.rawText ?? "Test template content",
      metadata: overrides.metadata ?? {},
    })
    .returning()
  return doc
}

export async function createTestGeneratedNda(
  tenantId: string,
  createdBy: string,
  overrides: Partial<{
    title: string
    templateSource: string
    parameters: unknown
    content: string
    contentHtml: string | null
    status: "draft" | "finalized" | "archived"
  }> = {}
) {
  const { generatedNdas } = await import("@/db/schema")
  const [nda] = await testDb
    .insert(generatedNdas)
    .values({
      tenantId,
      createdBy,
      title: overrides.title ?? `Test NDA ${uniqueId()}`,
      templateSource: overrides.templateSource ?? "bonterms",
      parameters: overrides.parameters ?? {
        disclosingParty: { name: "Acme Corp" },
        receivingParty: { name: "Test Inc" },
        effectiveDate: "2024-01-01",
        termYears: 2,
        mutual: true,
        governingLaw: "California",
      },
      content: overrides.content ?? "# Test NDA Content",
      contentHtml: overrides.contentHtml ?? null,
      status: overrides.status ?? "draft",
    })
    .returning()
  return nda
}

// Reset counter between test runs
export function resetFactoryCounter() {
  counter = 0
}
