# Error Handling Patterns

## Custom Error Classes (`lib/errors.ts`)

Base class `AppError` with specialized errors:

| Error Class | Status | Use Case |
|-------------|--------|----------|
| `BadRequestError` | 400 | Generic client error |
| `ValidationError` | 400 | Input validation failed |
| `UnauthorizedError` | 401 | Auth required/failed |
| `ForbiddenError` | 403 | Authenticated but not authorized |
| `NotFoundError` | 404 | Resource doesn't exist |
| `ConflictError` | 409 | Duplicate, already exists |
| `RateLimitError` | 429 | Too many requests |
| `InternalError` | 500 | Unexpected server error |
| `ServiceUnavailableError` | 503 | Dependency unavailable |

## Usage Patterns

### In Query Functions
```typescript
const doc = await db.select()...
if (!doc) throw new NotFoundError("Document not found")
```

### In API Routes
```typescript
import { withErrorHandling, success } from "@/lib/api-utils"

export const GET = withErrorHandling(async (request) => {
  const data = await fetchData()
  return success(data)
})
```

### In Server Actions
```typescript
import { withActionErrorHandling, actionSuccess } from "@/lib/api-utils"

export const createDocument = withActionErrorHandling(async (formData) => {
  const doc = await saveDocument(formData)
  return actionSuccess(doc)
})
```

### Zod Validation Integration
```typescript
try {
  const data = schema.parse(input)
} catch (e) {
  if (e instanceof ZodError) {
    throw ValidationError.fromZodError(e)
  }
  throw e
}
```

## Response Shapes

### API Response (`ApiResponse<T>`)
```typescript
// Success
{ success: true, data: T }

// Error
{ success: false, error: { code: string, message: string, details?: ErrorDetail[] } }
```

### Action Result (`ActionResult<T>`)
Same shape as ApiResponse, used for server actions since they can't return NextResponse.

## Utilities

- `isAppError(error)` - Type guard
- `toAppError(error)` - Convert any error to AppError (wraps unknown in InternalError)
- `withErrorHandling(handler)` - Wrap API route with error handling
- `withActionErrorHandling(action)` - Wrap server action with error handling

## Key Files
- `lib/errors.ts` - Error classes
- `lib/api-utils.ts` - Response helpers
- `lib/errors.test.ts` - Tests
