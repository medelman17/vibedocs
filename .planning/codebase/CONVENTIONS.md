# Coding Conventions

**Analysis Date:** 2026-02-04

## Naming Patterns

**Files:**
- TypeScript/JavaScript source: `camelCase.ts` or `camelCase.tsx`
- Server actions: `actions.ts` (contains "use server" directive)
- Test files: `*.test.ts` (co-located with source or in same directory)
- API routes: `route.ts` in Next.js app directory structure
- Components: PascalCase (`ErrorBoundary.tsx`, `Chat.tsx`)
- Utility/library files: `kebab-case-utility.ts` or `camelCaseUtility.ts`

**Functions:**
- Use `camelCase` consistently throughout
- Factory/builder functions: `createTestUser()`, `createTestOrg()` (verb-first pattern)
- Async action wrappers: verb-first with "Action" suffix (e.g., `signOutAction()`, `switchOrganization()`)
- Error conversion utilities: `toAppError()`, `wrapError()`
- Handler wrappers: `withErrorHandling()`, `withActionErrorHandling()`

**Variables:**
- Use `camelCase` for all variable declarations
- Constants in files: `UPPERCASE_SNAKE_CASE` (e.g., `SCHEMA_SQL`, `SECTION_PATTERNS`)
- Mutable module-level state: `camelCase` with descriptive names (e.g., `inTransaction`, `mockSessionContext`)
- Boolean variables: prefix with `is` or use positive names (e.g., `hasError`, `inTransaction`, `isOperational`)

**Types:**
- Interfaces: `PascalCase` (e.g., `ErrorBoundaryProps`, `UserOrganization`, `RouteContext`)
- Type aliases: `PascalCase` (e.g., `ErrorCode`, `ApiResponse<T>`, `ActionResult<T>`)
- Generic types: Single letter or descriptive (e.g., `<T>`, `<TArgs>`, `<TResult>`)
- Discriminated union types: Use `type` keyword with literal values (e.g., `type ErrorCode = "BAD_REQUEST" | "VALIDATION_ERROR"`)

## Code Style

**Formatting:**
- No Prettier config enforced; ESLint is primary linter
- Line length: Follow Next.js default conventions (~80-100 chars)
- Indentation: 2 spaces (via ESLint config)
- Semicolons: Always included
- Trailing commas: Present in multi-line objects/arrays

**Linting:**
- Tool: ESLint with Next.js and TypeScript configs
- Config file: `eslint.config.mjs` (ESLint 9+ flat config)
- Ignored patterns:
  - `.next/**` and build output
  - `components/ui/**` and `components/ai-elements/**` (shadcn-generated)
  - `.worktrees/**` (git worktrees)
- Underscore prefix rule: Variables/params prefixed with `_` are exempt from unused-var checks (marks intentional non-use)

**Example underscore usage:**
```typescript
export async function handler(_request: Request, _context: RouteContext) {
  // intentionally not using request/context
}
```

## Import Organization

**Order:**
1. External packages from node_modules (`react`, `next`, `zod`, etc.)
2. Internal packages (e.g., `@/lib/...`, `@/db/...`, `@/components/...`)
3. Relative imports (e.g., `./types`, `../utils`)

**Path Aliases:**
- `@/*` → `./*` (defined in `vitest.config.ts` and `tsconfig.json`)
- Use `@/` prefix for all imports to avoid relative paths
- Examples:
  - `@/lib/errors` → error utilities
  - `@/db/client` → database client
  - `@/db/schema` → database schemas
  - `@/components/ui` → shadcn UI components
  - `@/test/setup` → test database setup

## Error Handling

**Pattern:**
Use custom error classes from `@/lib/errors.ts` throughout the codebase.

**Error class hierarchy:**
```typescript
AppError (base class)
├── BadRequestError
├── ValidationError (with `.fromZodError()` static method)
├── UnauthorizedError
├── ForbiddenError
├── NotFoundError
├── ConflictError
├── DuplicateError
├── RateLimitError
├── InternalError
├── ServiceUnavailableError
├── AnalysisFailedError
├── EmbeddingFailedError
└── LlmFailedError
```

**Standard error codes:**
- `BAD_REQUEST` - Invalid client input
- `VALIDATION_ERROR` - Input validation failed (for Zod errors)
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Authenticated but not authorized
- `NOT_FOUND` - Resource doesn't exist
- `CONFLICT` - Resource state conflict
- `DUPLICATE` - Resource already exists (more specific than CONFLICT)
- `RATE_LIMITED` - Too many requests
- `INTERNAL_ERROR` - Unexpected server error
- `SERVICE_UNAVAILABLE` - External dependency unavailable
- `ANALYSIS_FAILED`, `EMBEDDING_FAILED`, `LLM_FAILED` - Domain-specific errors

**Usage in API routes:**
```typescript
import { withErrorHandling, success, error } from "@/lib/api-utils"

export const GET = withErrorHandling(async (request, { params }) => {
  const { id } = await params

  if (!id) {
    return error(new BadRequestError("ID is required"))
  }

  const data = await fetchData(id)
  return success(data)
})
```

**Usage in server actions:**
```typescript
import { actionSuccess, actionError, type ActionResult } from "@/lib/api-utils"

export async function myAction(input: unknown): Promise<ActionResult<Data>> {
  try {
    const validated = schema.parse(input)
    const result = await process(validated)
    return actionSuccess(result)
  } catch (error) {
    return actionError(error)
  }
}
```

**Zod error conversion:**
```typescript
import { ValidationError } from "@/lib/errors"

const result = schema.safeParse(input)
if (!result.success) {
  throw ValidationError.fromZodError(result.error)
}
```

## Logging

**Framework:** `console` methods (no dedicated logging library)

**Patterns:**
- Use `console.error()` for operational errors (errors that propagate to user)
- Log within `withErrorHandling()` and `withActionErrorHandling()` wrappers
- Include context: `code`, `message`, `stack`, `url`/`method` for API routes
- Example from `lib/api-utils.ts`:
  ```typescript
  if (!appError.isOperational || appError.statusCode >= 500) {
    console.error("[API Error]", {
      code: appError.code,
      message: appError.message,
      stack: err instanceof Error ? err.stack : undefined,
      url: request.url,
      method: request.method,
    })
  }
  ```

## Comments

**When to Comment:**
- Module-level: JSDoc describing exports and major functionality
- Complex logic: Explain *why*, not *what*
- Section separators: Use ASCII lines for major sections (see `lib/document-processing.ts`)
- TODO/FIXME: Acceptable but preferably tracked in issues

**JSDoc/TSDoc:**
- File-level `@fileoverview` blocks for modules
- Function documentation with `@param`, `@returns`, `@example` tags
- See `app/(main)/(auth)/actions.ts` for comprehensive examples

**Example:**
```typescript
/**
 * @fileoverview Authentication and Session Server Actions
 *
 * This module provides server actions for session management...
 *
 * @module app/(auth)/actions
 * @see {@link src/lib/dal.ts} for session verification
 */

/**
 * Switch the active organization for the current user's session.
 *
 * Validates that the user is an accepted member of the target organization.
 *
 * @param input - Object containing the target organization ID
 * @returns Success if user is a member, or an error
 *
 * @example
 * ```typescript
 * const result = await switchOrganization({ orgId: "org-uuid" });
 * ```
 */
export async function switchOrganization(
  input: z.infer<typeof switchOrganizationSchema>
): Promise<ApiResponse<{ organizationId: string }>> {
  // implementation
}
```

## Function Design

**Size:** Keep functions focused and under 50-100 lines when practical (longer OK for complex business logic)

**Parameters:**
- Prefer object parameters for multiple args: `function action(input: { id: string; data: unknown })`
- Use destructuring in function signatures
- Validate parameters early using Zod schemas
- Example from actions:
  ```typescript
  const switchOrganizationSchema = z.object({
    orgId: z.string().uuid("Organization ID must be a valid UUID"),
  });

  export async function switchOrganization(
    input: z.infer<typeof switchOrganizationSchema>
  ) {
    // Zod schema ensures orgId is a valid UUID before function executes
  }
  ```

**Return Values:**
- API routes: Return `NextResponse<ApiResponse<T>>` from handlers
- Server actions: Return `ActionResult<T>` (discriminated union with success/error)
- Async operations: Use `Promise<T>` explicitly
- Example return types:
  ```typescript
  // API route
  export const GET: NextApiHandler = withErrorHandling(async (...) => {
    return success(data)
  })

  // Server action
  export async function myAction(): Promise<ActionResult<Data>> {
    return actionSuccess(result)
  }
  ```

## Module Design

**Exports:**
- Export specific functions/types, not default exports
- Keep module size reasonable (under 300 lines for complex logic)
- Group related functions by concern

**Example:**
```typescript
// lib/errors.ts
export type ErrorCode = "BAD_REQUEST" | "VALIDATION_ERROR" | ...
export class AppError extends Error { ... }
export class BadRequestError extends AppError { ... }
export function isAppError(error: unknown): error is AppError { ... }
export function toAppError(error: unknown): AppError { ... }
```

**Barrel Files (Index Exports):**
- **Avoid creating new barrel exports** - they can cause production crashes
- Import directly for heavy modules: `import { functions } from "@/inngest/functions"` not `import { functions } from "@/inngest"`
- Existing safe barrels:
  - `@/db` (client, schema, queries) - lightweight
  - `@/inngest` (client, utils, types - functions removed due to heavy deps)
  - `@/db/schema` (table definitions) - lightweight

## TypeScript

**Strict Mode:** Enabled in `tsconfig.json`

**Type Patterns:**
- Use `type` for type aliases, `interface` for object shapes when extending
- Discriminated unions over enums for error codes and status
- Generics for reusable patterns (e.g., `ApiResponse<T>`, `ActionResult<T>`)
- Type guards for narrowing:
  ```typescript
  export function isAppError(error: unknown): error is AppError {
    return error instanceof AppError
  }
  ```

**Zod Compatibility (v4):**
- Use `.issues` not `.errors` for error arrays
- `ValidationError.fromZodError()` expects `{ issues: [...] }`
- `z.record()` requires key type: `z.record(z.string(), z.unknown())`
- `ZodIssue.path` is `PropertyKey[]` (includes symbols)

## Component Patterns (React/Next.js)

**Styling:**
- Use Tailwind CSS v4 with shadcn/ui components
- Attribute-based styling: `data-slot` attributes for styling hooks
- CVA (class-variance-authority) for component variants
- `cn()` utility from `@/lib/utils` for conditional classNames

**Component Structure:**
```typescript
"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ComponentProps {
  className?: string
  // props
}

export function Component({ className, ...props }: ComponentProps) {
  return <div className={cn("base-styles", className)} {...props} />
}
```

**Motion:**
- Import from `motion/react` (not `framer-motion`)

## AI SDK 6 Patterns

**Client-side with `useChat`:**
```typescript
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"

const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({ api: "/api/chat", body: { conversationId } }),
  onToolCall: async ({ toolCall }) => { /* handle */ },
})

// Send with: sendMessage({ text: "..." }) NOT append()
```

**Server-side with `streamText`:**
- Use `stepCountIs(n)` to replace `maxSteps`
- Use `maxOutputTokens` (replaces `maxTokens`)
- Tool definition: if no `execute` function, tool is client-side
- Message persistence in `onFinish` callback

## Inngest Patterns

**Function creation with proper context:**
```typescript
import {
  inngest,
  CONCURRENCY,
  RETRY_CONFIG,
  withTenantContext,
} from "@/inngest"

export const analyzeNda = inngest.createFunction(
  {
    id: "nda-analyze",
    concurrency: CONCURRENCY.analysis,
    retries: RETRY_CONFIG.default.retries,
  },
  { event: "nda/analysis.requested" },
  async ({ event, step }) => {
    const { tenantId, documentId } = event.data

    await withTenantContext(tenantId, async (ctx) => {
      // ctx.db has RLS context set
    })
  }
)
```

**Event naming:** `nda/<domain>.<action>` (e.g., `nda/analysis.requested`)

---

*Convention analysis: 2026-02-04*
