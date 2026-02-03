# Database Task Context

## When to Use
Schema changes, query functions, migrations, database tests

## Files to Read First
- `db/_columns.ts` - Column helpers (MUST use)
- `db/schema/*.ts` - Existing table definitions
- `db/queries/*.ts` - Query function patterns
- `db/index.ts` - Barrel export structure

## Required Patterns

### Column Helpers (ALWAYS use)
```typescript
import { primaryId, timestamps, softDelete, tenantId } from "@/db/_columns"
import { pgTable, text } from "drizzle-orm/pg-core"

export const myTable = pgTable("my_table", {
  ...primaryId,     // UUID primary key, auto-generated
  ...tenantId,      // Required for tenant-scoped tables
  ...timestamps,    // createdAt, updatedAt (auto-managed)
  ...softDelete,    // deletedAt for soft deletes
  // your columns here
})
```

### Query Naming Convention
- `get*` - Fetch single/multiple records (getDocumentById, getDocumentsByTenant)
- `create*` - Insert new records (createDocument, createDocumentChunks)
- `update*` - Modify existing records (updateDocumentStatus)
- `find*` - Search with filters (findSimilarChunks)
- `soft*` - Soft delete operations (softDeleteDocument)

### Tenant Isolation (CRITICAL)
All tenant-scoped queries MUST:
1. Accept `tenantId` as parameter
2. Include `tenantId` in WHERE clause
3. Filter out soft-deleted records with `isNull(table.deletedAt)`

```typescript
import { eq, and, isNull } from "drizzle-orm"

export async function getDocumentById(documentId: string, tenantId: string) {
  return db.query.documents.findFirst({
    where: and(
      eq(documents.id, documentId),
      eq(documents.tenantId, tenantId),
      isNull(documents.deletedAt)
    )
  })
}
```

### Vector Similarity Queries
Use `cosineDistance()` for vector similarity:
```typescript
import { cosineDistance } from "drizzle-orm"
// Lower distance = more similar
.orderBy(cosineDistance(chunks.embedding, queryEmbedding))
```

### Test File Template (REQUIRED)
Create a colocated `*.test.ts` file:
```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { testDb } from "@/test/setup"
// Import your function
import { myQueryFunction } from "./my-file"

describe("myQueryFunction", () => {
  const tenantId = "test-tenant-id"

  beforeEach(async () => {
    // Insert test data
    await testDb.insert(myTable).values({
      id: "test-id",
      tenantId,
      // ... other fields
    })
  })

  it("returns data for correct tenant", async () => {
    const result = await myQueryFunction("test-id", tenantId)
    expect(result).toBeDefined()
    expect(result?.tenantId).toBe(tenantId)
  })

  it("returns null for wrong tenant", async () => {
    const result = await myQueryFunction("test-id", "other-tenant")
    expect(result).toBeNull()
  })
})
```

## Checklist Before Completing
- [ ] Used column helpers from `db/_columns.ts`?
- [ ] Added `...tenantId` for tenant-scoped table?
- [ ] Followed query naming convention (get/create/update/find/soft)?
- [ ] Included tenant isolation in queries?
- [ ] Filtered soft-deleted records with `isNull(deletedAt)`?
- [ ] **Created colocated test file (`*.test.ts`)?** ← REQUIRED
- [ ] Updated `db/index.ts` barrel export if adding new file?
- [ ] Used title case for CUAD categories if applicable?
