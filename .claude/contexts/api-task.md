# API Task Context

## When to Use
Creating/modifying API routes, error handling, request validation

## Files to Read First
- `lib/api-utils.ts` - Handler wrappers (withErrorHandling, success)
- `lib/errors.ts` - Custom error classes
- `lib/dal.ts` - Auth/tenant context (verifySession, withTenant)
- `app/api/*/route.ts` - Existing route patterns

## Required Patterns

### Response Shape (ALWAYS use)
All API responses use a discriminated union envelope:
```typescript
// Success: { success: true, data: T }
// Error:   { success: false, error: { code, message, details? } }

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: SerializedError }
```

Use `success(data)` for responses - never return raw JSON:
```typescript
return success({ id: doc.id, title: doc.title })  // Correct
return NextResponse.json({ id: doc.id })          // Wrong - no envelope
```

### Route Handler Structure
```typescript
import { withErrorHandling, success } from "@/lib/api-utils"
import { verifySession, withTenant } from "@/lib/dal"
import { ValidationError } from "@/lib/errors"

export const GET = withErrorHandling(async (request: Request) => {
  const { userId } = await verifySession()
  const { db, tenantId } = await withTenant()

  // Your logic here
  const data = await fetchData(tenantId)

  return success(data)
})
```

### Dynamic Routes (Next.js 15+)
Params are Promise-based:
```typescript
export const GET = withErrorHandling(async (request, { params }) => {
  const { id } = await params  // Must await params
  // ...
})
```

### Error Handling
Use custom errors from `lib/errors.ts` (never raw `throw new Error()`):
```typescript
import { NotFoundError, ValidationError, ForbiddenError } from "@/lib/errors"

throw new NotFoundError("Document not found")           // 404
throw new ValidationError("Invalid input", details)     // 400
throw ValidationError.fromZodError(zodError)            // 400 from Zod
throw new ForbiddenError("Not authorized")              // 403
```

Available errors: `NotFoundError`, `ValidationError`, `BadRequestError`, `ForbiddenError`, `UnauthorizedError`, `ConflictError`, `RateLimitError`

### Request Validation
```typescript
import { z } from "zod"
import { ValidationError } from "@/lib/errors"

const schema = z.object({
  title: z.string().min(1),
  content: z.string()
})

const body = await request.json()
const parsed = schema.safeParse(body)
if (!parsed.success) {
  throw ValidationError.fromZodError(parsed.error)
}
const { title, content } = parsed.data
```

### Auth Patterns
- `verifySession()` - Check auth, redirects if not authenticated
- `withTenant()` - Get tenant context with RLS, redirects if no org
- `requireRole(["owner", "admin"])` - Role-based access control

### Server Actions (different from API routes)
Server actions use `ActionResult<T>` instead of `NextResponse`:
```typescript
import { actionSuccess, actionError, withActionErrorHandling } from "@/lib/api-utils"

export const createDocument = withActionErrorHandling(async (formData: FormData) => {
  const doc = await saveDocument(formData)
  return actionSuccess(doc)  // Returns { success: true, data: doc }
})
```

### Test File Template (REQUIRED)
Create a colocated `route.test.ts` file.
**CRITICAL**: Static mocks must come BEFORE imports!
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { TenantContext } from "@/lib/dal"

// Static mocks MUST be before other imports
vi.mock("@/lib/dal", () => ({
  withTenant: vi.fn(),
}))
vi.mock("@/db/queries/documents", () => ({
  getDocumentById: vi.fn(),
}))

// Import AFTER mocks
import { GET } from "./route"
import { withTenant } from "@/lib/dal"
import { getDocumentById } from "@/db/queries/documents"

describe("GET /api/your-route/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns data on success", async () => {
    vi.mocked(withTenant).mockResolvedValueOnce({
      tenantId: "org-123",
    } as TenantContext)
    vi.mocked(getDocumentById).mockResolvedValueOnce({ id: "doc-1" })

    const request = new Request("http://localhost/api/your-route/doc-1")
    const response = await GET(request, { params: Promise.resolve({ id: "doc-1" }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })

  it("returns 404 when not found", async () => {
    vi.mocked(withTenant).mockResolvedValueOnce({ tenantId: "org-123" } as TenantContext)
    vi.mocked(getDocumentById).mockResolvedValueOnce(null)

    const request = new Request("http://localhost/api/your-route/missing")
    const response = await GET(request, { params: Promise.resolve({ id: "missing" }) })

    expect(response.status).toBe(404)
  })
})
```

## Checklist Before Completing
- [ ] Used `success(data)` for responses (not raw `NextResponse.json`)?
- [ ] Wrapped handler with `withErrorHandling()`?
- [ ] Used `verifySession()` or `withTenant()` for auth?
- [ ] Used custom error classes from `lib/errors.ts`?
- [ ] Validated request body with Zod + `ValidationError.fromZodError()`?
- [ ] Awaited `params` in dynamic routes?
- [ ] For server actions: used `actionSuccess()` / `withActionErrorHandling()`?
- [ ] **Created colocated test file (`route.test.ts`)?** ← REQUIRED
