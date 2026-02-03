# Zod 4 Compatibility Notes

This project uses Zod 4, which has breaking API changes from Zod 3.

## Key Differences

### Error Array Property
- **Zod 3**: `zodError.errors` 
- **Zod 4**: `zodError.issues`

### SafeParse Errors
```typescript
// ❌ Wrong (Zod 3 style)
const result = schema.safeParse(data)
if (!result.success) {
  const firstError = result.error.errors[0]
}

// ✅ Correct (Zod 4 style)
const result = schema.safeParse(data)
if (!result.success) {
  const firstError = result.error.issues[0]
}
```

### ValidationError.fromZodError
The `ValidationError.fromZodError()` helper in `lib/errors.ts` expects Zod 4 format:

```typescript
// ✅ Correct usage
const zodError = { issues: [{ path: ["field"], message: "error" }] }
ValidationError.fromZodError(zodError)
```

## Reference
- CLAUDE.md documents this under "Auth Patterns > Zod 4 Compatibility"
- Tests in `lib/errors.test.ts` validate Zod 4 format
