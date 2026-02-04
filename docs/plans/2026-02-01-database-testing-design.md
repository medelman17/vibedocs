# Database Testing Strategy Design

> **Status:** ✅ COMPLETE (audited 2026-02-04)
>
> All tasks implemented and verified. See db/, test/, lib/dal.ts for implementation.

> Comprehensive testing strategy for the database schema implementation.
> Created: 2026-02-01

---

## Overview

This document defines the testing strategy for VibeDocs database layer, covering:
- 10 schema tables (tenant-scoped + shared reference)
- 13 Drizzle relation definitions
- 3 query helper modules
- Tenant isolation verification

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Vector handling | Mock `cosineDistance` | PGlite doesn't support pgvector; keeps tests fast |
| Test organization | Co-located files | Matches existing pattern, easy to maintain |
| Test runner | Vitest + PGlite | In-memory WASM Postgres, no Docker needed |

---

## Test Structure

```
src/db/
├── schema/
│   ├── auth.test.ts              ← NEW
│   ├── organizations.test.ts     ← EXTEND (exists)
│   ├── documents.test.ts         ← NEW
│   ├── analyses.test.ts          ← NEW
│   ├── comparisons.test.ts       ← NEW
│   ├── generated.test.ts         ← NEW
│   ├── audit.test.ts             ← NEW
│   ├── reference.test.ts         ← NEW
│   └── relations.test.ts         ← NEW
├── queries/
│   ├── documents.test.ts         ← NEW
│   ├── analyses.test.ts          ← NEW
│   └── similarity.test.ts        ← NEW (mocked vectors)
└── tenant-isolation.test.ts      ← NEW (cross-cutting)

src/test/
├── setup.ts                      ← UPDATE (add missing tables)
└── factories.ts                  ← NEW (test data helpers)
```

---

## Test Setup Updates

### New Tables in setup.ts

Add these tables to `createSchema()` in dependency order:

1. `document_chunks` (depends on documents)
2. `analyses` (depends on documents)
3. `clause_extractions` (depends on analyses, documents, document_chunks)
4. `comparisons` (depends on documents)
5. `generated_ndas` (depends on users)
6. `audit_logs` (standalone with tenant_id)
7. `reference_documents` (shared, no tenant_id)
8. `reference_embeddings` (depends on reference_documents)
9. `cuad_categories` (standalone)
10. `contract_nli_hypotheses` (standalone)

### Vector Column Fallback

PGlite doesn't support `VECTOR` type. Use `TEXT` as fallback in test schema:

```sql
-- In test setup
embedding TEXT,  -- PGlite fallback (real DB uses VECTOR(1024))
```

### Similarity Mock Strategy

```typescript
// In similarity.test.ts
import { vi } from "vitest"
import { sql } from "drizzle-orm"

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    cosineDistance: vi.fn(() => sql`0.5`), // Fixed similarity score
  }
})
```

---

## Test Factories

Create `src/test/factories.ts` with helpers:

```typescript
import { testDb } from "./setup"
import { users, organizations, organizationMembers, documents } from "@/db/schema"

export async function createTestUser(overrides = {}) {
  const [user] = await testDb
    .insert(users)
    .values({
      email: `test-${Date.now()}@example.com`,
      name: "Test User",
      ...overrides,
    })
    .returning()
  return user
}

export async function createTestOrg(overrides = {}) {
  const [org] = await testDb
    .insert(organizations)
    .values({
      name: "Test Org",
      slug: `test-org-${Date.now()}`,
      ...overrides,
    })
    .returning()
  return org
}

export async function createTestDocument(tenantId: string, overrides = {}) {
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

export async function createTestMembership(orgId: string, userId: string, role = "member") {
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
```

---

## Schema Test Specifications

### auth.test.ts

```typescript
describe("users", () => {
  it("creates user with email")
  it("enforces unique email constraint")
  it("allows null for optional fields (name, image, passwordHash)")
  it("sets timestamps automatically")
})

describe("accounts", () => {
  it("creates OAuth account linked to user")
  it("enforces composite primary key (provider, providerAccountId)")
  it("cascades delete when user deleted")
})

describe("sessions", () => {
  it("creates session with token")
  it("cascades delete when user deleted")
  it("allows null activeOrganizationId")
})
```

### documents.test.ts

```typescript
describe("documents", () => {
  it("creates document with required fields")
  it("enforces tenant_id NOT NULL")
  it("sets default status to 'pending'")
  it("soft delete sets deletedAt without removing row")
  it("allows null for optional fields (rawText, fileUrl, contentHash)")
})

describe("documentChunks", () => {
  it("creates chunk linked to document")
  it("enforces unique (documentId, chunkIndex)")
  it("cascades delete when document deleted")
  it("stores section_path as array")
})
```

### analyses.test.ts

```typescript
describe("analyses", () => {
  it("creates analysis for document")
  it("sets default status to 'pending'")
  it("increments version on update")
  it("cascades delete when document deleted")
})

describe("clauseExtractions", () => {
  it("creates extraction linked to analysis")
  it("stores secondary_categories as array")
  it("cascades delete when analysis deleted")
  it("cascades delete when document deleted")
})
```

### comparisons.test.ts

```typescript
describe("comparisons", () => {
  it("creates comparison between two documents")
  it("enforces tenant_id NOT NULL")
  it("references both documentA and documentB")
  it("sets default status to 'pending'")
})
```

### generated.test.ts

```typescript
describe("generatedNdas", () => {
  it("creates generated NDA with required fields")
  it("stores parameters as JSONB")
  it("sets default status to 'draft'")
  it("links to creator user (optional)")
})
```

### audit.test.ts

```typescript
describe("auditLogs", () => {
  it("creates audit log entry")
  it("stores old_values and new_values as JSONB")
  it("sets performedAt automatically")
  it("allows null userId for system actions")
})
```

### reference.test.ts

```typescript
describe("referenceDocuments", () => {
  it("creates reference document")
  it("enforces unique content_hash")
  it("allows idempotent insert via ON CONFLICT")
  it("stores metadata as JSONB")
})

describe("referenceEmbeddings", () => {
  it("creates embedding linked to document")
  it("supports self-referential parent_id")
  it("cascades delete when document deleted")
  it("stores section_path as array")
})

describe("cuadCategories", () => {
  it("creates category with serial ID")
  it("enforces unique name")
  it("sets default risk_weight to 1.0")
})

describe("contractNliHypotheses", () => {
  it("creates hypothesis with integer ID")
  it("stores category for grouping")
})
```

---

## Relations Test Specifications

### relations.test.ts

```typescript
describe("user relations", () => {
  it("fetches user with accounts")
  it("fetches user with organization memberships")
  it("fetches user with uploaded documents")
})

describe("organization relations", () => {
  it("fetches org with members")
  it("fetches org with all documents")
  it("fetches org with nested member → user")
})

describe("document relations", () => {
  it("fetches document with chunks")
  it("fetches document with analyses")
  it("fetches document with uploader user")
  it("fetches document with nested analysis → clauseExtractions")
})

describe("analysis relations", () => {
  it("fetches analysis with clause extractions")
  it("fetches analysis with document")
  it("fetches clause extraction with chunk")
})

describe("comparison relations", () => {
  it("fetches comparison with both documents (A and B)")
  it("handles named relations correctly")
})

describe("reference relations", () => {
  it("fetches reference document with embeddings")
  it("fetches embedding with parent (self-reference)")
  it("fetches embedding with children")
})
```

---

## Query Helper Test Specifications

### queries/documents.test.ts

```typescript
describe("getDocumentsByTenant", () => {
  it("returns only documents for specified tenant")
  it("excludes soft-deleted documents")
  it("filters by status when provided")
  it("orders by createdAt descending")
  it("respects limit and offset")
  it("returns empty array for tenant with no documents")
})

describe("getDocumentById", () => {
  it("returns document matching id and tenant")
  it("returns null for wrong tenant (isolation test)")
  it("returns null for soft-deleted document")
  it("returns null for non-existent id")
})

describe("getDocumentWithChunks", () => {
  it("returns document with ordered chunks")
  it("returns null for wrong tenant")
  it("returns empty chunks array when none exist")
})

describe("updateDocumentStatus", () => {
  it("updates status and updatedAt")
  it("sets error message when provided")
  it("clears error message when not provided")
  it("returns null for wrong tenant (no update)")
})

describe("softDeleteDocument", () => {
  it("sets deletedAt timestamp")
  it("returns null for wrong tenant")
})

describe("createDocumentChunks", () => {
  it("inserts multiple chunks in batch")
  it("returns empty array for empty input")
  it("sets correct chunk indexes")
})
```

### queries/analyses.test.ts

```typescript
describe("getAnalysisByDocument", () => {
  it("returns most recent analysis for document")
  it("returns null for wrong tenant")
  it("returns null when no analysis exists")
})

describe("getAnalysisWithClauses", () => {
  it("returns analysis with ordered clause extractions")
  it("returns null for wrong tenant")
})

describe("createAnalysis", () => {
  it("creates analysis with pending status")
  it("stores inngestRunId when provided")
  it("sets version to 1")
})

describe("updateAnalysisStatus", () => {
  it("updates status and results")
  it("sets completedAt when status is 'complete'")
  it("increments version (optimistic locking)")
  it("returns null for wrong tenant")
})

describe("createClauseExtractions", () => {
  it("inserts multiple clauses in batch")
  it("stores secondary_categories as array")
  it("stores evidence as JSONB")
})

describe("getHighRiskClauses", () => {
  it("returns only 'aggressive' risk level clauses")
  it("orders by confidence descending")
  it("enforces tenant isolation")
})
```

### queries/similarity.test.ts (Mocked)

```typescript
// Mock cosineDistance at module level
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal()),
  cosineDistance: vi.fn(() => sql`0.5`),
}))

describe("findSimilarChunks", () => {
  it("queries with tenant isolation")
  it("filters by documentId when provided")
  it("applies limit parameter")
  it("filters results by threshold")
})

describe("findSimilarReferences", () => {
  it("queries without tenant restriction (shared data)")
  it("filters by granularity when provided")
  it("filters by category when provided")
})

describe("findMatchingCategories", () => {
  it("calls findSimilarReferences with granularity='clause'")
})

describe("findSimilarTemplates", () => {
  it("calls findSimilarReferences with granularity='template'")
})
```

---

## Tenant Isolation Tests

### tenant-isolation.test.ts

Critical security tests — a failure here could leak data between tenants:

```typescript
describe("tenant isolation", () => {
  // Setup: create 2 orgs (tenantA, tenantB) with documents in each
  let tenantA: string
  let tenantB: string
  let docA: string
  let docB: string

  beforeEach(async () => {
    const orgA = await createTestOrg({ slug: "tenant-a" })
    const orgB = await createTestOrg({ slug: "tenant-b" })
    tenantA = orgA.id
    tenantB = orgB.id

    const documentA = await createTestDocument(tenantA)
    const documentB = await createTestDocument(tenantB)
    docA = documentA.id
    docB = documentB.id
  })

  it("getDocumentsByTenant returns only own tenant's documents")
  it("getDocumentById returns null for other tenant's document")
  it("updateDocumentStatus fails silently for other tenant")
  it("softDeleteDocument fails silently for other tenant")
  it("getAnalysisByDocument returns null for other tenant")
  it("updateAnalysisStatus fails silently for other tenant")
  it("createDocumentChunks cannot insert with wrong tenantId")
  it("query helpers never expose cross-tenant data in any return")
})
```

---

## Edge Cases & Error Handling

```typescript
describe("cascade deletes", () => {
  it("deleting document removes all chunks")
  it("deleting document removes all analyses")
  it("deleting analysis removes all clause extractions")
  it("deleting org cascades to memberships")
  it("deleting user cascades to accounts and sessions")
})

describe("null handling", () => {
  it("handles null embedding in chunks gracefully")
  it("handles null optional fields throughout")
})

describe("concurrent updates", () => {
  it("version increment prevents lost updates (optimistic lock)")
})

describe("empty states", () => {
  it("handles empty arrays for batch inserts")
  it("handles queries on empty tables")
})
```

---

## Implementation Plan

### Priority Levels

| Priority | Description |
|----------|-------------|
| P0 | Critical path — must pass for app to function |
| P1 | Important — covers core features |
| P2 | Nice to have — lower risk areas |

### Test Count by File

| File | Tests | Priority |
|------|-------|----------|
| `schema/documents.test.ts` | ~12 | P0 |
| `schema/analyses.test.ts` | ~10 | P0 |
| `queries/documents.test.ts` | ~15 | P0 |
| `queries/analyses.test.ts` | ~12 | P0 |
| `tenant-isolation.test.ts` | ~10 | P0 |
| `schema/auth.test.ts` | ~10 | P1 |
| `schema/reference.test.ts` | ~12 | P1 |
| `schema/relations.test.ts` | ~15 | P1 |
| `queries/similarity.test.ts` | ~8 | P1 |
| `schema/organizations.test.ts` | ~3 | P1 |
| `schema/comparisons.test.ts` | ~5 | P2 |
| `schema/generated.test.ts` | ~5 | P2 |
| `schema/audit.test.ts` | ~5 | P2 |
| **Total** | **~122** | |

### Implementation Order

1. **Update `src/test/setup.ts`** — Add all missing tables with vector→text fallback
2. **Create `src/test/factories.ts`** — Test data helper functions
3. **P0 tests** — documents, analyses, query helpers, tenant isolation
4. **P1 tests** — auth, reference, relations, similarity (mocked)
5. **P2 tests** — comparisons, generated, audit

---

## Success Criteria

- [ ] All tests pass with `pnpm test`
- [ ] Coverage >80% on `src/db/` directory
- [ ] Zero tenant isolation test failures
- [ ] Tests complete in <30 seconds
- [ ] No flaky tests (deterministic results)

---

## Future Considerations

### When to Add Real Vector Tests

Consider adding integration tests against real Neon DB when:
- Vector similarity becomes a critical feature
- Need to verify HNSW index performance
- Testing embedding quality thresholds

### RLS Testing

If RLS policies are enabled (via `0002_enable_rls.sql`), add tests that:
- Verify RLS blocks cross-tenant access at DB level
- Test session variable `app.tenant_id` is required
- Confirm RLS + application layer provide defense-in-depth
