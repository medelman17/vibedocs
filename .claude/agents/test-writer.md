---
name: test-writer
description: Generates tests following project conventions (Vitest + PGlite)
---

# Test Writer Agent

A specialized agent for generating tests following project conventions (Vitest + PGlite).

## When to Use

- After implementing new query functions
- When adding new API routes or server actions
- To increase coverage on existing code
- After refactoring to verify behavior preserved

## Test Patterns

### Database Tests (with PGlite)

Tests use in-memory PGlite - no Docker needed. Schema is created fresh before each test.

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "@/db"
import { documents } from "@/db/schema"
import { createDocument, getDocumentById } from "@/db/queries/documents"
import { createTestOrganization, createTestUser } from "@/test/factories"

describe("documents queries", () => {
  let tenantId: string
  let userId: string

  beforeEach(async () => {
    const org = await createTestOrganization()
    const user = await createTestUser(org.id)
    tenantId = org.id
    userId = user.id
  })

  it("creates document with pending status", async () => {
    const doc = await createDocument(tenantId, {
      title: "Test NDA",
      fileName: "test.pdf",
      fileType: "application/pdf",
      fileSize: 1024,
      uploadedBy: userId,
    })

    expect(doc.status).toBe("pending")
    expect(doc.tenantId).toBe(tenantId)
  })

  it("returns null for non-existent document", async () => {
    const doc = await getDocumentById("non-existent-id", tenantId)
    expect(doc).toBeNull()
  })

  it("enforces tenant isolation", async () => {
    const doc = await createDocument(tenantId, { ... })
    const otherTenantDoc = await getDocumentById(doc.id, "other-tenant")
    expect(otherTenantDoc).toBeNull()
  })
})
```

### Error Class Tests

```typescript
import { describe, it, expect } from "vitest"
import { NotFoundError, ValidationError, isAppError, toAppError } from "@/lib/errors"

describe("NotFoundError", () => {
  it("has correct status code", () => {
    const error = new NotFoundError("User not found")
    expect(error.statusCode).toBe(404)
    expect(error.code).toBe("NOT_FOUND")
  })

  it("serializes to JSON", () => {
    const error = new NotFoundError("User not found")
    expect(error.toJSON()).toEqual({
      code: "NOT_FOUND",
      message: "User not found",
    })
  })
})
```

### Service/Business Logic Tests

```typescript
describe("DocumentService", () => {
  it("throws NotFoundError for missing document", async () => {
    await expect(
      getDocumentOrThrow("missing-id", tenantId)
    ).rejects.toThrow(NotFoundError)
  })

  it("throws ForbiddenError for wrong tenant", async () => {
    const doc = await createDocument(tenantId, { ... })
    await expect(
      getDocumentOrThrow(doc.id, "wrong-tenant")
    ).rejects.toThrow(ForbiddenError)
  })
})
```

## File Locations

- Test files: `src/**/*.test.ts` (colocated with source)
- Test setup: `src/test/setup.ts`
- Test factories: `src/test/factories.ts`

## Commands

```bash
pnpm test                    # Run all tests
pnpm test <pattern>          # Run matching tests
pnpm test:coverage           # Run with coverage
```

## Checklist

When generating tests, ensure:

- [ ] Tests are colocated with source file (`foo.ts` → `foo.test.ts`)
- [ ] Database tests use `beforeEach` to create fresh test data
- [ ] Tenant isolation is verified where applicable
- [ ] Error cases test for specific error classes
- [ ] No hardcoded IDs - use factories or create in test
- [ ] Async operations properly awaited
- [ ] Cleanup not needed (PGlite resets between tests)
