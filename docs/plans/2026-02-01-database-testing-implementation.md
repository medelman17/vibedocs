# Database Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement comprehensive database tests (~122 tests) covering all schema tables, relations, query helpers, and tenant isolation.

**Architecture:** TDD approach using Vitest + PGlite (in-memory WASM Postgres). Vector operations mocked since PGlite lacks pgvector support. Tests co-located with source files.

**Tech Stack:** Vitest, PGlite, Drizzle ORM, TypeScript

---

## Phase 1: Test Infrastructure

### Task 1: Update test setup with missing tables

**Files:**
- Modify: `src/test/setup.ts`

**Step 1: Add deleted_at to documents table**

In `src/test/setup.ts`, update the documents CREATE TABLE to include `deleted_at`:

```typescript
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    uploaded_by UUID REFERENCES users(id),
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    file_url TEXT,
    content_hash TEXT,
    raw_text TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )
`)
```

**Step 2: Add document_chunks table**

Add after documents table:

```typescript
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    section_path TEXT[],
    embedding TEXT,
    token_count INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(document_id, chunk_index)
  )
`)
```

**Step 3: Add analyses table**

```typescript
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    overall_risk_score REAL,
    overall_risk_level TEXT,
    summary TEXT,
    gap_analysis JSONB,
    token_usage JSONB,
    processing_time_ms INTEGER,
    inngest_run_id TEXT,
    completed_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`)
```

**Step 4: Add clause_extractions table**

```typescript
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS clause_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_id UUID REFERENCES document_chunks(id),
    category TEXT NOT NULL,
    secondary_categories TEXT[],
    clause_text TEXT NOT NULL,
    start_position INTEGER,
    end_position INTEGER,
    confidence REAL NOT NULL,
    risk_level TEXT NOT NULL,
    risk_explanation TEXT,
    evidence JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`)
```

**Step 5: Add comparisons table**

```typescript
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    document_a_id UUID NOT NULL REFERENCES documents(id),
    document_b_id UUID NOT NULL REFERENCES documents(id),
    status TEXT NOT NULL DEFAULT 'pending',
    summary TEXT,
    clause_alignments JSONB,
    key_differences JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`)
```

**Step 6: Add generated_ndas table**

```typescript
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS generated_ndas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    created_by UUID REFERENCES users(id),
    title TEXT NOT NULL,
    template_source TEXT NOT NULL,
    parameters JSONB NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`)
```

**Step 7: Add audit_logs table**

```typescript
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID,
    ip_address TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`)
```

**Step 8: Add reference_documents table**

```typescript
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS reference_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    source_id TEXT,
    title TEXT NOT NULL,
    raw_text TEXT,
    metadata JSONB DEFAULT '{}',
    content_hash TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`)
```

**Step 9: Add reference_embeddings table**

```typescript
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS reference_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES reference_documents(id) ON DELETE CASCADE,
    parent_id UUID,
    granularity TEXT NOT NULL,
    content TEXT NOT NULL,
    section_path TEXT[],
    category TEXT,
    hypothesis_id INTEGER,
    nli_label TEXT,
    embedding TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    content_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`)
```

**Step 10: Add cuad_categories table**

```typescript
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS cuad_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    risk_weight REAL DEFAULT 1.0,
    is_nda_relevant BOOLEAN DEFAULT true
  )
`)
```

**Step 11: Add contract_nli_hypotheses table**

```typescript
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS contract_nli_hypotheses (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    category TEXT
  )
`)
```

**Step 12: Run tests to verify setup works**

Run: `pnpm test`
Expected: All 11 existing tests pass

**Step 13: Commit**

```bash
git add src/test/setup.ts
git commit -m "test: add all missing tables to PGlite test setup"
```

---

### Task 2: Create test factories

**Files:**
- Create: `src/test/factories.ts`

**Step 1: Create factories file with user factory**

```typescript
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
```

**Step 2: Run tests to verify factories compile**

Run: `pnpm test`
Expected: All tests pass (factories not used yet but should compile)

**Step 3: Commit**

```bash
git add src/test/factories.ts
git commit -m "test: add test data factories"
```

---

## Phase 2: P0 Schema Tests

### Task 3: Documents schema tests

**Files:**
- Create: `src/db/schema/documents.test.ts`

**Step 1: Create documents test file with first test**

```typescript
// src/db/schema/documents.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { eq } from "drizzle-orm"
import { documents, documentChunks } from "./index"
import { createTestOrg, createTestDocument, createTestChunk } from "@/test/factories"

describe("documents schema", () => {
  describe("documents", () => {
    it("creates document with required fields", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      expect(doc.id).toBeDefined()
      expect(doc.tenantId).toBe(org.id)
      expect(doc.title).toBe("Test Document")
      expect(doc.fileName).toBe("test.pdf")
      expect(doc.fileType).toBe("pdf")
    })

    it("sets default status to pending", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      expect(doc.status).toBe("pending")
    })

    it("soft delete sets deletedAt without removing row", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      // Soft delete
      const [updated] = await testDb
        .update(documents)
        .set({ deletedAt: new Date() })
        .where(eq(documents.id, doc.id))
        .returning()

      expect(updated.deletedAt).not.toBeNull()

      // Row still exists
      const [found] = await testDb
        .select()
        .from(documents)
        .where(eq(documents.id, doc.id))

      expect(found).toBeDefined()
      expect(found.deletedAt).not.toBeNull()
    })

    it("allows null for optional fields", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id, {
        rawText: null,
        fileUrl: null,
        contentHash: null,
      })

      expect(doc.rawText).toBeNull()
      expect(doc.fileUrl).toBeNull()
      expect(doc.contentHash).toBeNull()
    })
  })

  describe("documentChunks", () => {
    it("creates chunk linked to document", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const chunk = await createTestChunk(org.id, doc.id, 0)

      expect(chunk.id).toBeDefined()
      expect(chunk.documentId).toBe(doc.id)
      expect(chunk.chunkIndex).toBe(0)
    })

    it("enforces unique (documentId, chunkIndex)", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      await createTestChunk(org.id, doc.id, 0)

      // Duplicate should fail
      await expect(
        createTestChunk(org.id, doc.id, 0)
      ).rejects.toThrow()
    })

    it("cascades delete when document deleted", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestChunk(org.id, doc.id, 0)
      await createTestChunk(org.id, doc.id, 1)

      // Delete document
      await testDb.delete(documents).where(eq(documents.id, doc.id))

      // Chunks should be gone
      const chunks = await testDb
        .select()
        .from(documentChunks)
        .where(eq(documentChunks.documentId, doc.id))

      expect(chunks).toHaveLength(0)
    })

    it("stores section_path as array", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const chunk = await createTestChunk(org.id, doc.id, 0, {
        sectionPath: ["Article 1", "Section 1.1"],
      })

      expect(chunk.sectionPath).toEqual(["Article 1", "Section 1.1"])
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/db/schema/documents.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/db/schema/documents.test.ts
git commit -m "test: add documents schema tests"
```

---

### Task 4: Analyses schema tests

**Files:**
- Create: `src/db/schema/analyses.test.ts`

**Step 1: Create analyses test file**

```typescript
// src/db/schema/analyses.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { eq } from "drizzle-orm"
import { documents, analyses, clauseExtractions } from "./index"
import {
  createTestOrg,
  createTestDocument,
  createTestAnalysis,
  createTestClauseExtraction,
} from "@/test/factories"

describe("analyses schema", () => {
  describe("analyses", () => {
    it("creates analysis for document", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      expect(analysis.id).toBeDefined()
      expect(analysis.documentId).toBe(doc.id)
      expect(analysis.tenantId).toBe(org.id)
    })

    it("sets default status to pending", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      expect(analysis.status).toBe("pending")
    })

    it("sets default version to 1", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      expect(analysis.version).toBe(1)
    })

    it("cascades delete when document deleted", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestAnalysis(org.id, doc.id)

      // Delete document
      await testDb.delete(documents).where(eq(documents.id, doc.id))

      // Analysis should be gone
      const found = await testDb
        .select()
        .from(analyses)
        .where(eq(analyses.documentId, doc.id))

      expect(found).toHaveLength(0)
    })
  })

  describe("clauseExtractions", () => {
    it("creates extraction linked to analysis", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      const clause = await createTestClauseExtraction(org.id, analysis.id, doc.id)

      expect(clause.id).toBeDefined()
      expect(clause.analysisId).toBe(analysis.id)
      expect(clause.documentId).toBe(doc.id)
    })

    it("stores secondary_categories as array", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      const clause = await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        secondaryCategories: ["Confidentiality", "Term"],
      })

      expect(clause.secondaryCategories).toEqual(["Confidentiality", "Term"])
    })

    it("cascades delete when analysis deleted", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id)

      // Delete analysis
      await testDb.delete(analyses).where(eq(analyses.id, analysis.id))

      // Clause should be gone
      const clauses = await testDb
        .select()
        .from(clauseExtractions)
        .where(eq(clauseExtractions.analysisId, analysis.id))

      expect(clauses).toHaveLength(0)
    })

    it("cascades delete when document deleted", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id)

      // Delete document (cascades to analysis, which cascades to clauses)
      await testDb.delete(documents).where(eq(documents.id, doc.id))

      // Clause should be gone
      const clauses = await testDb
        .select()
        .from(clauseExtractions)
        .where(eq(clauseExtractions.documentId, doc.id))

      expect(clauses).toHaveLength(0)
    })

    it("stores evidence as JSONB", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      const evidence = { citations: ["p.1", "p.3"], score: 0.95 }
      const clause = await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        evidence,
      })

      expect(clause.evidence).toEqual(evidence)
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/db/schema/analyses.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/db/schema/analyses.test.ts
git commit -m "test: add analyses schema tests"
```

---

## Phase 3: P0 Query Helper Tests

### Task 5: Document query helper tests

**Files:**
- Create: `src/db/queries/documents.test.ts`

**Step 1: Create document queries test file**

```typescript
// src/db/queries/documents.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { testDb } from "@/test/setup"
import { eq } from "drizzle-orm"
import { documents } from "@/db/schema"
import {
  createTestOrg,
  createTestUser,
  createTestDocument,
  createTestChunk,
} from "@/test/factories"
import {
  getDocumentsByTenant,
  getDocumentById,
  getDocumentWithChunks,
  updateDocumentStatus,
  softDeleteDocument,
  createDocumentChunks,
} from "./documents"

describe("document queries", () => {
  describe("getDocumentsByTenant", () => {
    it("returns only documents for specified tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })

      await createTestDocument(orgA.id, { title: "Doc A" })
      await createTestDocument(orgB.id, { title: "Doc B" })

      const docs = await getDocumentsByTenant(orgA.id)

      expect(docs).toHaveLength(1)
      expect(docs[0].title).toBe("Doc A")
    })

    it("excludes soft-deleted documents", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      // Soft delete
      await testDb
        .update(documents)
        .set({ deletedAt: new Date() })
        .where(eq(documents.id, doc.id))

      const docs = await getDocumentsByTenant(org.id)

      expect(docs).toHaveLength(0)
    })

    it("filters by status when provided", async () => {
      const org = await createTestOrg()
      await createTestDocument(org.id, { status: "pending" })
      await createTestDocument(org.id, { status: "complete" })

      const docs = await getDocumentsByTenant(org.id, { status: "complete" })

      expect(docs).toHaveLength(1)
      expect(docs[0].status).toBe("complete")
    })

    it("orders by createdAt descending", async () => {
      const org = await createTestOrg()
      const doc1 = await createTestDocument(org.id, { title: "First" })
      const doc2 = await createTestDocument(org.id, { title: "Second" })

      const docs = await getDocumentsByTenant(org.id)

      // Most recent first
      expect(docs[0].id).toBe(doc2.id)
      expect(docs[1].id).toBe(doc1.id)
    })

    it("respects limit and offset", async () => {
      const org = await createTestOrg()
      await createTestDocument(org.id, { title: "Doc 1" })
      await createTestDocument(org.id, { title: "Doc 2" })
      await createTestDocument(org.id, { title: "Doc 3" })

      const page1 = await getDocumentsByTenant(org.id, { limit: 2, offset: 0 })
      const page2 = await getDocumentsByTenant(org.id, { limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(1)
    })

    it("returns empty array for tenant with no documents", async () => {
      const org = await createTestOrg()

      const docs = await getDocumentsByTenant(org.id)

      expect(docs).toEqual([])
    })
  })

  describe("getDocumentById", () => {
    it("returns document matching id and tenant", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const found = await getDocumentById(doc.id, org.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(doc.id)
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)

      const found = await getDocumentById(doc.id, orgB.id)

      expect(found).toBeNull()
    })

    it("returns null for soft-deleted document", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      await testDb
        .update(documents)
        .set({ deletedAt: new Date() })
        .where(eq(documents.id, doc.id))

      const found = await getDocumentById(doc.id, org.id)

      expect(found).toBeNull()
    })

    it("returns null for non-existent id", async () => {
      const org = await createTestOrg()

      const found = await getDocumentById("00000000-0000-0000-0000-000000000000", org.id)

      expect(found).toBeNull()
    })
  })

  describe("getDocumentWithChunks", () => {
    it("returns document with ordered chunks", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestChunk(org.id, doc.id, 2, { content: "Chunk 2" })
      await createTestChunk(org.id, doc.id, 0, { content: "Chunk 0" })
      await createTestChunk(org.id, doc.id, 1, { content: "Chunk 1" })

      const result = await getDocumentWithChunks(doc.id, org.id)

      expect(result).not.toBeNull()
      expect(result!.chunks).toHaveLength(3)
      expect(result!.chunks[0].chunkIndex).toBe(0)
      expect(result!.chunks[1].chunkIndex).toBe(1)
      expect(result!.chunks[2].chunkIndex).toBe(2)
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)

      const result = await getDocumentWithChunks(doc.id, orgB.id)

      expect(result).toBeNull()
    })

    it("returns empty chunks array when none exist", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const result = await getDocumentWithChunks(doc.id, org.id)

      expect(result).not.toBeNull()
      expect(result!.chunks).toEqual([])
    })
  })

  describe("updateDocumentStatus", () => {
    it("updates status and updatedAt", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const originalUpdatedAt = doc.updatedAt

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10))

      const updated = await updateDocumentStatus(doc.id, org.id, "complete")

      expect(updated).not.toBeNull()
      expect(updated!.status).toBe("complete")
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
    })

    it("sets error message when provided", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const updated = await updateDocumentStatus(doc.id, org.id, "failed", "Parse error")

      expect(updated!.errorMessage).toBe("Parse error")
    })

    it("clears error message when not provided", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id, { errorMessage: "Old error" })

      const updated = await updateDocumentStatus(doc.id, org.id, "pending")

      expect(updated!.errorMessage).toBeNull()
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)

      const updated = await updateDocumentStatus(doc.id, orgB.id, "complete")

      expect(updated).toBeNull()
    })
  })

  describe("softDeleteDocument", () => {
    it("sets deletedAt timestamp", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const deleted = await softDeleteDocument(doc.id, org.id)

      expect(deleted).not.toBeNull()
      expect(deleted!.deletedAt).not.toBeNull()
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)

      const deleted = await softDeleteDocument(doc.id, orgB.id)

      expect(deleted).toBeNull()
    })
  })

  describe("createDocumentChunks", () => {
    it("inserts multiple chunks in batch", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const chunks = await createDocumentChunks(org.id, doc.id, [
        { content: "Chunk 0", chunkIndex: 0 },
        { content: "Chunk 1", chunkIndex: 1 },
        { content: "Chunk 2", chunkIndex: 2 },
      ])

      expect(chunks).toHaveLength(3)
    })

    it("returns empty array for empty input", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const chunks = await createDocumentChunks(org.id, doc.id, [])

      expect(chunks).toEqual([])
    })

    it("sets correct chunk indexes", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const chunks = await createDocumentChunks(org.id, doc.id, [
        { content: "A", chunkIndex: 0 },
        { content: "B", chunkIndex: 1 },
      ])

      expect(chunks[0].chunkIndex).toBe(0)
      expect(chunks[1].chunkIndex).toBe(1)
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/db/queries/documents.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/db/queries/documents.test.ts
git commit -m "test: add document query helper tests"
```

---

### Task 6: Analyses query helper tests

**Files:**
- Create: `src/db/queries/analyses.test.ts`

**Step 1: Create analyses queries test file**

```typescript
// src/db/queries/analyses.test.ts
import { describe, it, expect } from "vitest"
import {
  createTestOrg,
  createTestDocument,
  createTestAnalysis,
  createTestClauseExtraction,
} from "@/test/factories"
import {
  getAnalysisByDocument,
  getAnalysisById,
  getAnalysisWithClauses,
  createAnalysis,
  updateAnalysisStatus,
  createClauseExtractions,
  getHighRiskClauses,
} from "./analyses"

describe("analyses queries", () => {
  describe("getAnalysisByDocument", () => {
    it("returns most recent analysis for document", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestAnalysis(org.id, doc.id)
      const recent = await createTestAnalysis(org.id, doc.id)

      const found = await getAnalysisByDocument(doc.id, org.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(recent.id)
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)
      await createTestAnalysis(orgA.id, doc.id)

      const found = await getAnalysisByDocument(doc.id, orgB.id)

      expect(found).toBeNull()
    })

    it("returns null when no analysis exists", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const found = await getAnalysisByDocument(doc.id, org.id)

      expect(found).toBeNull()
    })
  })

  describe("getAnalysisWithClauses", () => {
    it("returns analysis with ordered clause extractions", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        startPosition: 100,
      })
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        startPosition: 50,
      })

      const result = await getAnalysisWithClauses(analysis.id, org.id)

      expect(result).not.toBeNull()
      expect(result!.clauses).toHaveLength(2)
      expect(result!.clauses[0].startPosition).toBe(50)
      expect(result!.clauses[1].startPosition).toBe(100)
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)
      const analysis = await createTestAnalysis(orgA.id, doc.id)

      const result = await getAnalysisWithClauses(analysis.id, orgB.id)

      expect(result).toBeNull()
    })
  })

  describe("createAnalysis", () => {
    it("creates analysis with pending status", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const analysis = await createAnalysis(org.id, doc.id)

      expect(analysis.status).toBe("pending")
    })

    it("stores inngestRunId when provided", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const analysis = await createAnalysis(org.id, doc.id, "run_123")

      expect(analysis.inngestRunId).toBe("run_123")
    })

    it("sets version to 1", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)

      const analysis = await createAnalysis(org.id, doc.id)

      expect(analysis.version).toBe(1)
    })
  })

  describe("updateAnalysisStatus", () => {
    it("updates status and results", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      const updated = await updateAnalysisStatus(analysis.id, org.id, "complete", {
        overallRiskScore: 0.75,
        overallRiskLevel: "cautious",
        summary: "Test summary",
      })

      expect(updated).not.toBeNull()
      expect(updated!.status).toBe("complete")
      expect(updated!.overallRiskScore).toBe(0.75)
      expect(updated!.overallRiskLevel).toBe("cautious")
      expect(updated!.summary).toBe("Test summary")
    })

    it("sets completedAt when status is complete", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      const updated = await updateAnalysisStatus(analysis.id, org.id, "complete")

      expect(updated!.completedAt).not.toBeNull()
    })

    it("returns null for wrong tenant", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)
      const analysis = await createTestAnalysis(orgA.id, doc.id)

      const updated = await updateAnalysisStatus(analysis.id, orgB.id, "complete")

      expect(updated).toBeNull()
    })
  })

  describe("createClauseExtractions", () => {
    it("inserts multiple clauses in batch", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      const clauses = await createClauseExtractions(org.id, analysis.id, doc.id, [
        {
          category: "Non-Compete",
          clauseText: "Clause 1",
          confidence: 0.9,
          riskLevel: "standard",
        },
        {
          category: "Termination",
          clauseText: "Clause 2",
          confidence: 0.85,
          riskLevel: "cautious",
        },
      ])

      expect(clauses).toHaveLength(2)
    })

    it("stores secondary_categories as array", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)

      const [clause] = await createClauseExtractions(org.id, analysis.id, doc.id, [
        {
          category: "Non-Compete",
          secondaryCategories: ["Confidentiality", "Term"],
          clauseText: "Test",
          confidence: 0.9,
          riskLevel: "standard",
        },
      ])

      expect(clause.secondaryCategories).toEqual(["Confidentiality", "Term"])
    })

    it("stores evidence as JSONB", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      const evidence = { citations: ["ref1", "ref2"] }

      const [clause] = await createClauseExtractions(org.id, analysis.id, doc.id, [
        {
          category: "Non-Compete",
          clauseText: "Test",
          confidence: 0.9,
          riskLevel: "standard",
          evidence,
        },
      ])

      expect(clause.evidence).toEqual(evidence)
    })
  })

  describe("getHighRiskClauses", () => {
    it("returns only aggressive risk level clauses", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        riskLevel: "standard",
      })
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        riskLevel: "aggressive",
      })

      const highRisk = await getHighRiskClauses(analysis.id, org.id)

      expect(highRisk).toHaveLength(1)
      expect(highRisk[0].riskLevel).toBe("aggressive")
    })

    it("orders by confidence descending", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        riskLevel: "aggressive",
        confidence: 0.7,
      })
      await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        riskLevel: "aggressive",
        confidence: 0.95,
      })

      const highRisk = await getHighRiskClauses(analysis.id, org.id)

      expect(highRisk[0].confidence).toBe(0.95)
      expect(highRisk[1].confidence).toBe(0.7)
    })

    it("enforces tenant isolation", async () => {
      const orgA = await createTestOrg({ slug: "org-a" })
      const orgB = await createTestOrg({ slug: "org-b" })
      const doc = await createTestDocument(orgA.id)
      const analysis = await createTestAnalysis(orgA.id, doc.id)
      await createTestClauseExtraction(orgA.id, analysis.id, doc.id, {
        riskLevel: "aggressive",
      })

      const highRisk = await getHighRiskClauses(analysis.id, orgB.id)

      expect(highRisk).toHaveLength(0)
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/db/queries/analyses.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/db/queries/analyses.test.ts
git commit -m "test: add analyses query helper tests"
```

---

## Phase 4: P0 Tenant Isolation Tests

### Task 7: Tenant isolation tests

**Files:**
- Create: `src/db/tenant-isolation.test.ts`

**Step 1: Create tenant isolation test file**

```typescript
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
  createDocumentChunks,
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
    const analysisA = await createTestAnalysis(tenantA, docA)

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
```

**Step 2: Run tests**

Run: `pnpm test src/db/tenant-isolation.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/db/tenant-isolation.test.ts
git commit -m "test: add critical tenant isolation tests"
```

---

## Phase 5: P1 Tests

### Task 8: Auth schema tests

**Files:**
- Create: `src/db/schema/auth.test.ts`

**Step 1: Create auth test file**

```typescript
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
```

**Step 2: Run tests**

Run: `pnpm test src/db/schema/auth.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/db/schema/auth.test.ts
git commit -m "test: add auth schema tests"
```

---

### Task 9: Reference schema tests

**Files:**
- Create: `src/db/schema/reference.test.ts`

**Step 1: Create reference test file**

```typescript
// src/db/schema/reference.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { eq, sql } from "drizzle-orm"
import {
  referenceDocuments,
  referenceEmbeddings,
  cuadCategories,
  contractNliHypotheses,
} from "./index"

describe("reference schema", () => {
  describe("referenceDocuments", () => {
    it("creates reference document", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({
          source: "cuad",
          title: "Test Contract",
        })
        .returning()

      expect(doc.id).toBeDefined()
      expect(doc.source).toBe("cuad")
      expect(doc.title).toBe("Test Contract")
    })

    it("enforces unique content_hash", async () => {
      await testDb.insert(referenceDocuments).values({
        source: "cuad",
        title: "Doc 1",
        contentHash: "hash123",
      })

      await expect(
        testDb.insert(referenceDocuments).values({
          source: "cuad",
          title: "Doc 2",
          contentHash: "hash123",
        })
      ).rejects.toThrow()
    })

    it("stores metadata as JSONB", async () => {
      const metadata = { categories: ["A", "B"], version: 1 }

      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({
          source: "cuad",
          title: "Test",
          metadata,
        })
        .returning()

      expect(doc.metadata).toEqual(metadata)
    })
  })

  describe("referenceEmbeddings", () => {
    it("creates embedding linked to document", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      const [embedding] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          granularity: "clause",
          content: "Test clause content",
          embedding: "mock-embedding",
        })
        .returning()

      expect(embedding.documentId).toBe(doc.id)
      expect(embedding.granularity).toBe("clause")
    })

    it("supports self-referential parent_id", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      const [parent] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          granularity: "section",
          content: "Parent section",
          embedding: "parent-embed",
        })
        .returning()

      const [child] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          parentId: parent.id,
          granularity: "clause",
          content: "Child clause",
          embedding: "child-embed",
        })
        .returning()

      expect(child.parentId).toBe(parent.id)
    })

    it("cascades delete when document deleted", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      await testDb.insert(referenceEmbeddings).values({
        documentId: doc.id,
        granularity: "clause",
        content: "Test",
        embedding: "embed",
      })

      await testDb.delete(referenceDocuments).where(eq(referenceDocuments.id, doc.id))

      const embeddings = await testDb
        .select()
        .from(referenceEmbeddings)
        .where(eq(referenceEmbeddings.documentId, doc.id))

      expect(embeddings).toHaveLength(0)
    })

    it("stores section_path as array", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      const [embedding] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          granularity: "clause",
          content: "Test",
          embedding: "embed",
          sectionPath: ["Article 1", "Section 1.1"],
        })
        .returning()

      expect(embedding.sectionPath).toEqual(["Article 1", "Section 1.1"])
    })
  })

  describe("cuadCategories", () => {
    it("creates category with serial ID", async () => {
      const [cat] = await testDb
        .insert(cuadCategories)
        .values({ name: "Non-Compete" })
        .returning()

      expect(cat.id).toBeGreaterThan(0)
      expect(cat.name).toBe("Non-Compete")
    })

    it("enforces unique name", async () => {
      await testDb.insert(cuadCategories).values({ name: "Unique Cat" })

      await expect(
        testDb.insert(cuadCategories).values({ name: "Unique Cat" })
      ).rejects.toThrow()
    })

    it("sets default risk_weight to 1.0", async () => {
      const [cat] = await testDb
        .insert(cuadCategories)
        .values({ name: "Default Weight" })
        .returning()

      expect(cat.riskWeight).toBe(1.0)
    })
  })

  describe("contractNliHypotheses", () => {
    it("creates hypothesis with integer ID", async () => {
      const [hyp] = await testDb
        .insert(contractNliHypotheses)
        .values({
          id: 1,
          text: "Confidential information is explicitly defined",
        })
        .returning()

      expect(hyp.id).toBe(1)
    })

    it("stores category for grouping", async () => {
      const [hyp] = await testDb
        .insert(contractNliHypotheses)
        .values({
          id: 2,
          text: "Test hypothesis",
          category: "confidentiality",
        })
        .returning()

      expect(hyp.category).toBe("confidentiality")
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/db/schema/reference.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/db/schema/reference.test.ts
git commit -m "test: add reference schema tests"
```

---

### Task 10: Relations tests

**Files:**
- Create: `src/db/schema/relations.test.ts`

**Step 1: Create relations test file**

```typescript
// src/db/schema/relations.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { eq } from "drizzle-orm"
import {
  users,
  accounts,
  organizations,
  organizationMembers,
  documents,
  documentChunks,
  analyses,
  clauseExtractions,
  comparisons,
  referenceDocuments,
  referenceEmbeddings,
} from "./index"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestDocument,
  createTestChunk,
  createTestAnalysis,
  createTestClauseExtraction,
} from "@/test/factories"

describe("relations", () => {
  describe("user relations", () => {
    it("fetches user with accounts", async () => {
      const user = await createTestUser()
      await testDb.insert(accounts).values({
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId: "g123",
      })

      const result = await testDb.query.users.findFirst({
        where: eq(users.id, user.id),
        with: { accounts: true },
      })

      expect(result?.accounts).toHaveLength(1)
      expect(result?.accounts[0].provider).toBe("google")
    })

    it("fetches user with organization memberships", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestMembership(org.id, user.id, "owner")

      const result = await testDb.query.users.findFirst({
        where: eq(users.id, user.id),
        with: { organizationMemberships: true },
      })

      expect(result?.organizationMemberships).toHaveLength(1)
      expect(result?.organizationMemberships[0].role).toBe("owner")
    })

    it("fetches user with uploaded documents", async () => {
      const user = await createTestUser()
      const org = await createTestOrg()
      await createTestDocument(org.id, { uploadedBy: user.id })

      const result = await testDb.query.users.findFirst({
        where: eq(users.id, user.id),
        with: { uploadedDocuments: true },
      })

      expect(result?.uploadedDocuments).toHaveLength(1)
    })
  })

  describe("organization relations", () => {
    it("fetches org with members", async () => {
      const org = await createTestOrg()
      const user = await createTestUser()
      await createTestMembership(org.id, user.id)

      const result = await testDb.query.organizations.findFirst({
        where: eq(organizations.id, org.id),
        with: { members: true },
      })

      expect(result?.members).toHaveLength(1)
    })

    it("fetches org with all documents", async () => {
      const org = await createTestOrg()
      await createTestDocument(org.id, { title: "Doc 1" })
      await createTestDocument(org.id, { title: "Doc 2" })

      const result = await testDb.query.organizations.findFirst({
        where: eq(organizations.id, org.id),
        with: { documents: true },
      })

      expect(result?.documents).toHaveLength(2)
    })

    it("fetches org with nested member → user", async () => {
      const org = await createTestOrg()
      const user = await createTestUser({ name: "Test User" })
      await createTestMembership(org.id, user.id)

      const result = await testDb.query.organizations.findFirst({
        where: eq(organizations.id, org.id),
        with: {
          members: {
            with: { user: true },
          },
        },
      })

      expect(result?.members[0].user.name).toBe("Test User")
    })
  })

  describe("document relations", () => {
    it("fetches document with chunks", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestChunk(org.id, doc.id, 0)
      await createTestChunk(org.id, doc.id, 1)

      const result = await testDb.query.documents.findFirst({
        where: eq(documents.id, doc.id),
        with: { chunks: true },
      })

      expect(result?.chunks).toHaveLength(2)
    })

    it("fetches document with analyses", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      await createTestAnalysis(org.id, doc.id)

      const result = await testDb.query.documents.findFirst({
        where: eq(documents.id, doc.id),
        with: { analyses: true },
      })

      expect(result?.analyses).toHaveLength(1)
    })

    it("fetches document with uploader user", async () => {
      const user = await createTestUser({ name: "Uploader" })
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id, { uploadedBy: user.id })

      const result = await testDb.query.documents.findFirst({
        where: eq(documents.id, doc.id),
        with: { uploader: true },
      })

      expect(result?.uploader?.name).toBe("Uploader")
    })

    it("fetches document with nested analysis → clauseExtractions", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id)

      const result = await testDb.query.documents.findFirst({
        where: eq(documents.id, doc.id),
        with: {
          analyses: {
            with: { clauseExtractions: true },
          },
        },
      })

      expect(result?.analyses[0].clauseExtractions).toHaveLength(1)
    })
  })

  describe("analysis relations", () => {
    it("fetches analysis with clause extractions", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const analysis = await createTestAnalysis(org.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id)
      await createTestClauseExtraction(org.id, analysis.id, doc.id)

      const result = await testDb.query.analyses.findFirst({
        where: eq(analyses.id, analysis.id),
        with: { clauseExtractions: true },
      })

      expect(result?.clauseExtractions).toHaveLength(2)
    })

    it("fetches analysis with document", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id, { title: "My NDA" })
      const analysis = await createTestAnalysis(org.id, doc.id)

      const result = await testDb.query.analyses.findFirst({
        where: eq(analyses.id, analysis.id),
        with: { document: true },
      })

      expect(result?.document.title).toBe("My NDA")
    })

    it("fetches clause extraction with chunk", async () => {
      const org = await createTestOrg()
      const doc = await createTestDocument(org.id)
      const chunk = await createTestChunk(org.id, doc.id, 0)
      const analysis = await createTestAnalysis(org.id, doc.id)
      const clause = await createTestClauseExtraction(org.id, analysis.id, doc.id, {
        chunkId: chunk.id,
      })

      const result = await testDb.query.clauseExtractions.findFirst({
        where: eq(clauseExtractions.id, clause.id),
        with: { chunk: true },
      })

      expect(result?.chunk?.id).toBe(chunk.id)
    })
  })

  describe("comparison relations", () => {
    it("fetches comparison with both documents", async () => {
      const org = await createTestOrg()
      const docA = await createTestDocument(org.id, { title: "NDA A" })
      const docB = await createTestDocument(org.id, { title: "NDA B" })

      const [comparison] = await testDb
        .insert(comparisons)
        .values({
          tenantId: org.id,
          documentAId: docA.id,
          documentBId: docB.id,
        })
        .returning()

      const result = await testDb.query.comparisons.findFirst({
        where: eq(comparisons.id, comparison.id),
        with: {
          documentA: true,
          documentB: true,
        },
      })

      expect(result?.documentA.title).toBe("NDA A")
      expect(result?.documentB.title).toBe("NDA B")
    })
  })

  describe("reference relations", () => {
    it("fetches reference document with embeddings", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      await testDb.insert(referenceEmbeddings).values({
        documentId: doc.id,
        granularity: "clause",
        content: "Test",
        embedding: "embed",
      })

      const result = await testDb.query.referenceDocuments.findFirst({
        where: eq(referenceDocuments.id, doc.id),
        with: { embeddings: true },
      })

      expect(result?.embeddings).toHaveLength(1)
    })

    it("fetches embedding with parent (self-reference)", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      const [parent] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          granularity: "section",
          content: "Parent",
          embedding: "p-embed",
        })
        .returning()

      const [child] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          parentId: parent.id,
          granularity: "clause",
          content: "Child",
          embedding: "c-embed",
        })
        .returning()

      const result = await testDb.query.referenceEmbeddings.findFirst({
        where: eq(referenceEmbeddings.id, child.id),
        with: { parent: true },
      })

      expect(result?.parent?.id).toBe(parent.id)
    })

    it("fetches embedding with children", async () => {
      const [doc] = await testDb
        .insert(referenceDocuments)
        .values({ source: "cuad", title: "Test" })
        .returning()

      const [parent] = await testDb
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          granularity: "section",
          content: "Parent",
          embedding: "p-embed",
        })
        .returning()

      await testDb.insert(referenceEmbeddings).values({
        documentId: doc.id,
        parentId: parent.id,
        granularity: "clause",
        content: "Child 1",
        embedding: "c1-embed",
      })

      await testDb.insert(referenceEmbeddings).values({
        documentId: doc.id,
        parentId: parent.id,
        granularity: "clause",
        content: "Child 2",
        embedding: "c2-embed",
      })

      const result = await testDb.query.referenceEmbeddings.findFirst({
        where: eq(referenceEmbeddings.id, parent.id),
        with: { children: true },
      })

      expect(result?.children).toHaveLength(2)
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/db/schema/relations.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/db/schema/relations.test.ts
git commit -m "test: add relations tests"
```

---

### Task 11: Run full test suite and verify coverage

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Run coverage report**

Run: `pnpm test:coverage`
Expected: Coverage >80% on `src/db/` directory

**Step 3: Commit any fixes if needed**

If tests fail, fix and commit.

**Step 4: Final commit for P1 tests**

```bash
git add -A
git commit -m "test: complete P1 database tests

- auth schema tests
- reference schema tests
- relations tests
- All tests passing (~80+ tests)"
```

---

## Phase 6: P2 Tests (Optional)

### Task 12: Comparisons schema tests

**Files:**
- Create: `src/db/schema/comparisons.test.ts`

```typescript
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
```

---

### Task 13: Generated NDAs schema tests

**Files:**
- Create: `src/db/schema/generated.test.ts`

```typescript
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
```

---

### Task 14: Audit logs schema tests

**Files:**
- Create: `src/db/schema/audit.test.ts`

```typescript
// src/db/schema/audit.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { auditLogs } from "./index"
import { createTestOrg, createTestUser, createTestDocument } from "@/test/factories"

describe("auditLogs schema", () => {
  it("creates audit log entry", async () => {
    const org = await createTestOrg()
    const doc = await createTestDocument(org.id)

    const [log] = await testDb
      .insert(auditLogs)
      .values({
        tenantId: org.id,
        tableName: "documents",
        recordId: doc.id,
        action: "INSERT",
      })
      .returning()

    expect(log.id).toBeDefined()
    expect(log.action).toBe("INSERT")
  })

  it("stores old_values and new_values as JSONB", async () => {
    const org = await createTestOrg()
    const doc = await createTestDocument(org.id)

    const [log] = await testDb
      .insert(auditLogs)
      .values({
        tenantId: org.id,
        tableName: "documents",
        recordId: doc.id,
        action: "UPDATE",
        oldValues: { status: "pending" },
        newValues: { status: "complete" },
      })
      .returning()

    expect(log.oldValues).toEqual({ status: "pending" })
    expect(log.newValues).toEqual({ status: "complete" })
  })

  it("sets performedAt automatically", async () => {
    const org = await createTestOrg()
    const doc = await createTestDocument(org.id)

    const [log] = await testDb
      .insert(auditLogs)
      .values({
        tenantId: org.id,
        tableName: "documents",
        recordId: doc.id,
        action: "INSERT",
      })
      .returning()

    expect(log.performedAt).toBeInstanceOf(Date)
  })

  it("allows null userId for system actions", async () => {
    const org = await createTestOrg()
    const doc = await createTestDocument(org.id)

    const [log] = await testDb
      .insert(auditLogs)
      .values({
        tenantId: org.id,
        tableName: "documents",
        recordId: doc.id,
        action: "SYSTEM_CLEANUP",
        userId: null,
      })
      .returning()

    expect(log.userId).toBeNull()
  })
})
```

---

## Success Criteria

After completing all tasks:

- [ ] `pnpm test` passes with ~100+ tests
- [ ] `pnpm test:coverage` shows >80% coverage on `src/db/`
- [ ] All tenant isolation tests pass
- [ ] Tests complete in <30 seconds
- [ ] Clean commit history with logical grouping
