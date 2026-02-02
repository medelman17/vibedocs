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
  role = "member"
) {
  const [membership] = await testDb
    .insert(organizationMembers)
    .values({
      organizationId: orgId,
      userId,
      role,
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

// Reset counter between test runs
export function resetFactoryCounter() {
  counter = 0
}
