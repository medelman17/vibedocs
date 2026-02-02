# TypeScript Advanced Types Design

**Date:** 2026-02-01
**Status:** Design Complete
**Author:** Claude + Mike

---

## Overview

This document defines advanced TypeScript patterns to improve type safety across the VibeDocs NDA Analyst codebase. The design prioritizes practical value over theoretical elegance, focusing on patterns that prevent real bugs.

## Areas Covered

1. **Type-Safe DAL & RLS** - Branded types for tenant isolation, role narrowing
2. **Agent Pipeline Types** - Clear I/O contracts between agents
3. **Database Schema Types** - Typed JSONB with Zod validation
4. **API/Action Patterns** - Result type, composable middleware

---

## Area 1: Type-Safe DAL & RLS

### Problem

UUIDs for `tenantId`, `userId`, `documentId` are all `string` - easy to confuse and cause security bugs:

```typescript
// Compiles but is a security bug:
eq(documents.tenantId, userId)
```

### Solution: Branded Types

```typescript
// src/lib/types/branded.ts

declare const __brand: unique symbol
type Brand<T, B> = T & { [__brand]: B }

export type TenantId = Brand<string, "TenantId">
export type UserId = Brand<string, "UserId">
export type DocumentId = Brand<string, "DocumentId">

export function asTenantId(id: string): TenantId {
  return id as TenantId
}

export function asUserId(id: string): UserId {
  return id as UserId
}

export function asDocumentId(id: string): DocumentId {
  return id as DocumentId
}
```

### DAL Context Types

```typescript
// src/lib/types/dal.ts

export const ROLES = ["owner", "admin", "member", "viewer"] as const
export type Role = (typeof ROLES)[number]

export interface SessionContext {
  userId: UserId
  user: NonNullable<Session["user"]>
  activeOrganizationId: TenantId | null
}

export interface TenantContext extends SessionContext {
  activeOrganizationId: TenantId  // Narrowed to non-null
  tenantId: TenantId              // Alias
  role: Role
  db: typeof db
}

export interface RoleContext<R extends Role> extends TenantContext {
  role: R  // Narrowed to specific roles
}
```

### Generic Role Narrowing

```typescript
// src/lib/dal.ts

export const requireRole = cache(
  async <R extends Role>(
    allowedRoles: readonly R[]
  ): Promise<RoleContext<R>> => {
    const ctx = await withTenant()

    if (!allowedRoles.includes(ctx.role as R)) {
      redirect("/dashboard?error=unauthorized")
    }

    return ctx as RoleContext<R>
  }
)

// Usage:
const ctx = await requireRole(["owner", "admin"])
ctx.role  // Type: "owner" | "admin"
```

### Drizzle Column Integration

```typescript
// src/db/_columns.ts

export const tenantId = {
  tenantId: uuid("tenant_id").notNull().$type<TenantId>(),
}

export const userRef = (columnName: string) =>
  uuid(columnName).$type<UserId>()

export const documentRef = (columnName: string) =>
  uuid(columnName).$type<DocumentId>()
```

---

## Area 2: Agent Pipeline Types

### Philosophy

Keep it simple. Inngest handles state progression - we just need clear I/O types.

**What we skipped:** Complex state machine transitions. Inngest already enforces step ordering.

### Agent I/O Types

```typescript
// src/agents/types/io.ts

export interface ParserInput {
  documentId: DocumentId
  rawText: string
}

export interface ParserOutput {
  documentId: DocumentId
  chunks: DocumentChunk[]
  sections: Section[]
  metadata: { tokenCount: number; chunkCount: number }
}

export interface ClassifierInput {
  chunks: DocumentChunk[]
  references: ReferenceClause[]
}

export interface ClassifierOutput {
  clauses: ClassifiedClause[]
}

export interface RiskScorerInput {
  clauses: ClassifiedClause[]
  references: ReferenceClause[]
}

export interface RiskScorerOutput {
  assessments: RiskAssessment[]
  overallScore: number
  overallLevel: RiskLevel
}

export interface GapAnalystInput {
  presentCategories: CuadCategory[]
  documentSummary: string
}

export interface GapAnalystOutput {
  missingCategories: MissingCategory[]
  weakCategories: WeakCategory[]
  gapScore: number
}
```

### Agent Function Signatures

```typescript
// src/agents/index.ts

export async function runParserAgent(input: ParserInput): Promise<ParserOutput>
export async function runClassifierAgent(input: ClassifierInput): Promise<ClassifierOutput>
export async function runRiskScorerAgent(input: RiskScorerInput): Promise<RiskScorerOutput>
export async function runGapAnalystAgent(input: GapAnalystInput): Promise<GapAnalystOutput>
```

---

## Area 3: Database Schema Types

### Problem

JSONB columns are type black holes:

```typescript
gapAnalysis: jsonb("gap_analysis")  // Type: unknown
```

### Solution: Zod Schemas + $type<>()

```typescript
// src/db/types/jsonb-schemas.ts

import { z } from "zod"

export const tokenUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  estimatedCost: z.number(),
  byAgent: z.object({
    parser: z.number(),
    classifier: z.number(),
    riskScorer: z.number(),
    gapAnalyst: z.number(),
  }).optional(),
})

export type TokenUsage = z.infer<typeof tokenUsageSchema>

export const gapAnalysisSchema = z.object({
  missingClauses: z.array(z.string()),
  weakClauses: z.array(z.string()),
  recommendations: z.array(z.object({
    category: z.string(),
    recommendation: z.string(),
    priority: z.enum(["low", "medium", "high"]),
  })),
  comparisonBasis: z.string().optional(),
})

export type GapAnalysis = z.infer<typeof gapAnalysisSchema>

export const clauseEvidenceSchema = z.object({
  citations: z.array(z.string()),
  comparisons: z.array(z.string()),
  cuadMatch: z.object({
    exampleId: z.string(),
    similarity: z.number().min(0).max(1),
    category: z.string(),
  }).optional(),
  reasoning: z.string().optional(),
  statistics: z.object({
    percentile: z.number().min(0).max(100),
    sampleSize: z.number(),
    description: z.string(),
  }).optional(),
})

export type ClauseEvidence = z.infer<typeof clauseEvidenceSchema>
```

### Schema Integration

```typescript
// src/db/schema/analyses.ts

export const analyses = pgTable("analyses", {
  // ...
  gapAnalysis: jsonb("gap_analysis").$type<GapAnalysis>(),
  tokenUsage: jsonb("token_usage").$type<TokenUsage>(),
})

export const clauseExtractions = pgTable("clause_extractions", {
  // ...
  evidence: jsonb("evidence").$type<ClauseEvidence>(),
})
```

### Validated Inserts

```typescript
// src/db/helpers/validated-jsonb.ts

export function validateJsonb<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  columnName: string
): T {
  const result = schema.safeParse(data)

  if (!result.success) {
    throw new ValidationError(`Invalid ${columnName} data`,
      result.error.issues.map(issue => ({
        field: `${columnName}.${issue.path.join(".")}`,
        message: issue.message,
      }))
    )
  }

  return result.data
}

export function jsonbColumn<T>(schema: z.ZodSchema<T>) {
  return {
    parse: (data: unknown): T => validateJsonb(schema, data, "jsonb"),
    schema,
  }
}
```

---

## Area 4: API/Action Patterns

### Result Type

```typescript
// src/lib/result.ts

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return result.ok ? Ok(fn(result.value)) : result
}

export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.ok ? fn(result.value) : result
}

export async function tryCatch<T>(
  fn: () => Promise<T>
): Promise<Result<T, Error>> {
  try {
    return Ok(await fn())
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)))
  }
}
```

### Composable Middleware

```typescript
// src/lib/api/middleware.ts

type Middleware<In, Out> = (ctx: In) => Promise<Out | NextResponse>

export const withAuth: Middleware<BaseContext, AuthContext> = async (ctx) => {
  const session = await auth()
  if (!session?.user?.id) {
    return error(new UnauthorizedError())
  }
  return { ...ctx, userId: asUserId(session.user.id) }
}

export const withTenantCtx: Middleware<AuthContext, TenantCtx> = async (ctx) => {
  const tenantCtx = await withTenant()
  return { ...ctx, ...tenantCtx }
}

export function withRoles<R extends Role>(
  roles: readonly R[]
): Middleware<AuthContext, RoleCtx<R>> {
  return async (ctx) => {
    const roleCtx = await requireRole(roles)
    return { ...ctx, ...roleCtx }
  }
}

export function withBody<T>(
  schema: z.ZodSchema<T>
): Middleware<BaseContext, BaseContext & { body: T }> {
  return async (ctx) => {
    const json = await ctx.request.json().catch(() => ({}))
    const result = schema.safeParse(json)
    if (!result.success) {
      return error(ValidationError.fromZodError(result.error))
    }
    return { ...ctx, body: result.data }
  }
}
```

### Route Handler Factory

```typescript
// src/lib/api/handler.ts

export function createHandler<Ctx, T>(
  middleware: Middleware<BaseContext, Ctx>,
  handler: (ctx: Ctx) => Promise<T>
): (request: NextRequest) => Promise<NextResponse<ApiResponse<T>>> {
  return async (request) => {
    try {
      const ctx = await middleware({ request })
      if (ctx instanceof NextResponse) return ctx

      const data = await handler(ctx)
      return success(data)
    } catch (err) {
      return error(toAppError(err))
    }
  }
}

// Usage:
export const DELETE = createHandler(
  pipe(withAuth, withRoles(["owner", "admin"])),
  async (ctx) => {
    // ctx.role is "owner" | "admin"
    await deleteDocument(docId, ctx.tenantId)
    return { deleted: true }
  }
)
```

---

## Implementation Priority

| Pattern | Files | Priority | Rationale |
|---------|-------|----------|-----------|
| Branded types | `src/lib/types/branded.ts` | P0 | Security - prevents ID confusion |
| DAL context types | `src/lib/types/dal.ts`, `src/lib/dal.ts` | P0 | Foundation for everything |
| JSONB schemas | `src/db/types/jsonb-schemas.ts` | P1 | Runtime safety for agent output |
| Result type | `src/lib/result.ts` | P1 | Cleaner error handling |
| API middleware | `src/lib/api/middleware.ts` | P2 | Nice DX but existing works |
| Agent I/O types | `src/agents/types/io.ts` | P2 | Clarifies contracts |

---

## What We Intentionally Skipped

1. **State machine transitions** - Inngest already handles step ordering
2. **XState** - Per-state context not supported until v6
3. **Complex type gymnastics** - Prioritized clarity over cleverness

---

## Files to Create

```
src/
├── lib/
│   ├── types/
│   │   ├── branded.ts       # TenantId, UserId, DocumentId
│   │   └── dal.ts           # SessionContext, TenantContext, RoleContext
│   ├── result.ts            # Result<T, E>, Ok, Err, map, flatMap
│   └── api/
│       ├── middleware.ts    # withAuth, withTenantCtx, withRoles, withBody
│       └── handler.ts       # createHandler, pipe
├── db/
│   ├── types/
│   │   └── jsonb-schemas.ts # Zod schemas for JSONB columns
│   └── helpers/
│       └── validated-jsonb.ts # validateJsonb, jsonbColumn
└── agents/
    └── types/
        └── io.ts            # Agent input/output interfaces
```

---

## Next Steps

1. Review and approve this design
2. Create implementation plan with task breakdown
3. Implement in priority order (P0 → P1 → P2)
