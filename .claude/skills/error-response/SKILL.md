---
name: error-response
description: Use appropriate error classes from src/lib/errors.ts when handling errors in queries, API routes, and server actions. Apply automatically when writing error handling code.
user-invocable: false
---

# Error Handling Conventions

When writing code that can fail, use the custom error classes from `src/lib/errors.ts`.

## Error Class Selection

| Situation | Error Class | Example |
|-----------|-------------|---------|
| Resource not found | `NotFoundError` | `throw new NotFoundError("Document not found")` |
| Invalid input | `ValidationError` | `throw new ValidationError("Invalid email", [{ field: "email", message: "Invalid format" }])` |
| Not logged in | `UnauthorizedError` | `throw new UnauthorizedError()` |
| Wrong permissions | `ForbiddenError` | `throw new ForbiddenError("Admin access required")` |
| Duplicate/conflict | `ConflictError` | `throw new ConflictError("Email already exists")` |
| Rate limited | `RateLimitError` | `throw new RateLimitError("Too many requests", 60)` |
| External service down | `ServiceUnavailableError` | `throw new ServiceUnavailableError("Database unavailable")` |

## Patterns

### In Query Functions
```typescript
import { NotFoundError } from "@/lib/errors"

export async function getDocumentById(id: string, tenantId: string) {
  const [doc] = await db.select().from(documents).where(...)
  if (!doc) throw new NotFoundError(`Document ${id} not found`)
  return doc
}
```

### In API Routes
```typescript
import { withErrorHandling, success } from "@/lib/api-utils"
import { NotFoundError, ValidationError } from "@/lib/errors"

export const GET = withErrorHandling(async (request) => {
  const { tenantId } = await withTenant()
  const data = await getData(tenantId)
  return success(data)
})
```

### In Server Actions
```typescript
import { withActionErrorHandling, actionSuccess } from "@/lib/api-utils"

export const createDocument = withActionErrorHandling(async (formData: FormData) => {
  // Validation, business logic...
  return actionSuccess(doc)
})
```

### Zod Validation
```typescript
import { ValidationError } from "@/lib/errors"

try {
  const data = schema.parse(input)
} catch (e) {
  if (e instanceof ZodError) {
    throw ValidationError.fromZodError(e)
  }
  throw e
}
```

## Response Shape

All errors serialize to:
```typescript
{
  code: "NOT_FOUND" | "VALIDATION_ERROR" | "UNAUTHORIZED" | ...,
  message: string,
  details?: Array<{ field?: string, message: string }>
}
```
