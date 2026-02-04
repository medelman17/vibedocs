# TypeScript Advanced Types Implementation Plan

> **Status:** ✅ COMPLETE (audited 2026-02-04)
> All 8 tasks completed with tests.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add branded types, typed JSONB, Result type, and composable API middleware for improved type safety across the codebase.

**Architecture:** Four layers of type improvements: (1) branded ID types prevent mixing TenantId/UserId, (2) DAL returns strongly-typed contexts with role narrowing, (3) JSONB columns get Zod schemas for runtime validation, (4) Result type and middleware composition for cleaner API handlers.

**Tech Stack:** TypeScript 5.9, Zod 4, Drizzle ORM, Next.js 16

---

## Task 1: Create Branded Types

**Files:**
- Create: `src/lib/types/branded.ts`
- Create: `src/lib/types/branded.test.ts`

**Step 1: Write the test file**

```typescript
// src/lib/types/branded.test.ts
import { describe, it, expect } from "vitest"
import {
  asTenantId,
  asUserId,
  asDocumentId,
  type TenantId,
  type UserId,
  type DocumentId,
} from "./branded"

describe("Branded Types", () => {
  describe("asTenantId", () => {
    it("creates a TenantId from string", () => {
      const id = asTenantId("org-123")
      expect(id).toBe("org-123")
    })

    it("returns a value that satisfies TenantId type", () => {
      const id: TenantId = asTenantId("org-123")
      expect(typeof id).toBe("string")
    })
  })

  describe("asUserId", () => {
    it("creates a UserId from string", () => {
      const id = asUserId("user-456")
      expect(id).toBe("user-456")
    })
  })

  describe("asDocumentId", () => {
    it("creates a DocumentId from string", () => {
      const id = asDocumentId("doc-789")
      expect(id).toBe("doc-789")
    })
  })

  describe("type safety", () => {
    it("branded types are structurally strings", () => {
      const tenantId = asTenantId("t1")
      const userId = asUserId("u1")
      const docId = asDocumentId("d1")

      // All are strings at runtime
      expect(typeof tenantId).toBe("string")
      expect(typeof userId).toBe("string")
      expect(typeof docId).toBe("string")
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/types/branded.test.ts`
Expected: FAIL with "Cannot find module './branded'"

**Step 3: Write the implementation**

```typescript
// src/lib/types/branded.ts
/**
 * Branded types for nominal typing of IDs.
 *
 * Prevents accidentally mixing TenantId, UserId, DocumentId at compile time.
 * Zero runtime cost - brands are erased during compilation.
 *
 * @example
 * ```typescript
 * const tenantId = asTenantId("org-123")
 * const userId = asUserId("user-456")
 *
 * // Compile error: UserId not assignable to TenantId
 * eq(documents.tenantId, userId)
 * ```
 */

declare const __brand: unique symbol

/**
 * Brand a base type with a unique tag for nominal typing.
 */
type Brand<T, B> = T & { readonly [__brand]: B }

/**
 * UUID that represents a tenant (organization).
 * Cannot be confused with UserId or DocumentId at compile time.
 */
export type TenantId = Brand<string, "TenantId">

/**
 * UUID that represents a user.
 * Cannot be confused with TenantId or DocumentId at compile time.
 */
export type UserId = Brand<string, "UserId">

/**
 * UUID that represents a document.
 * Cannot be confused with TenantId or UserId at compile time.
 */
export type DocumentId = Brand<string, "DocumentId">

/**
 * UUID that represents an analysis.
 */
export type AnalysisId = Brand<string, "AnalysisId">

/**
 * UUID that represents an organization.
 * Alias for TenantId for semantic clarity.
 */
export type OrganizationId = TenantId

/**
 * Create a TenantId from a string.
 */
export function asTenantId(id: string): TenantId {
  return id as TenantId
}

/**
 * Create a UserId from a string.
 */
export function asUserId(id: string): UserId {
  return id as UserId
}

/**
 * Create a DocumentId from a string.
 */
export function asDocumentId(id: string): DocumentId {
  return id as DocumentId
}

/**
 * Create an AnalysisId from a string.
 */
export function asAnalysisId(id: string): AnalysisId {
  return id as AnalysisId
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/types/branded.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/lib/types/branded.ts src/lib/types/branded.test.ts
git commit -m "feat(types): add branded types for TenantId, UserId, DocumentId

Prevents accidentally mixing ID types at compile time.
Zero runtime cost - brands are erased during compilation.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create DAL Type Definitions

**Files:**
- Create: `src/lib/types/dal.ts`
- Create: `src/lib/types/index.ts`

**Step 1: Create DAL types**

```typescript
// src/lib/types/dal.ts
/**
 * Data Access Layer type definitions.
 *
 * Defines context types returned by DAL functions with proper
 * type narrowing for roles and tenant isolation.
 */

import type { TenantId, UserId } from "./branded"
import type { db } from "@/db"

/**
 * Organization roles as a const tuple for type inference.
 */
export const ROLES = ["owner", "admin", "member", "viewer"] as const

/**
 * Role type derived from ROLES tuple.
 */
export type Role = (typeof ROLES)[number]

/**
 * Session user shape from Auth.js.
 */
export interface SessionUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
}

/**
 * Authenticated session context.
 * Returned by verifySession() - proves user is logged in.
 */
export interface SessionContext {
  userId: UserId
  user: SessionUser
  activeOrganizationId: TenantId | null
}

/**
 * Tenant-scoped context with RLS guaranteed set.
 * Returned by withTenant() - proves tenant context exists.
 */
export interface TenantContext extends SessionContext {
  activeOrganizationId: TenantId  // Narrowed to non-null
  tenantId: TenantId              // Alias for clarity
  role: Role
  db: typeof db
}

/**
 * Role-restricted context - generic over allowed roles.
 * Returned by requireRole() - proves user has specific role.
 */
export interface RoleContext<R extends Role> extends TenantContext {
  role: R  // Narrowed to specific roles
}

/**
 * Check if a role is in the allowed list.
 */
export function isAllowedRole<R extends Role>(
  role: Role,
  allowedRoles: readonly R[]
): role is R {
  return allowedRoles.includes(role as R)
}
```

**Step 2: Create barrel export**

```typescript
// src/lib/types/index.ts
/**
 * Type definitions barrel export.
 */

export * from "./branded"
export * from "./dal"
```

**Step 3: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/types/dal.ts src/lib/types/index.ts
git commit -m "feat(types): add DAL context types with role narrowing

- SessionContext for authenticated users
- TenantContext with proven tenant isolation
- RoleContext<R> for role-specific narrowing

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Update DAL to Use Branded Types

**Files:**
- Modify: `src/lib/dal.ts`

**Step 1: Read current DAL implementation**

Run: `cat src/lib/dal.ts`

**Step 2: Update DAL with branded types**

```typescript
// src/lib/dal.ts
import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"
import { auth } from "./auth"
import { db } from "@/db"
import { organizationMembers } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { sql } from "drizzle-orm"
import {
  asTenantId,
  asUserId,
  type TenantId,
  type UserId,
  type SessionContext,
  type TenantContext,
  type RoleContext,
  type Role,
  isAllowedRole,
} from "./types"

export type { SessionContext, TenantContext, RoleContext, Role }
export { asTenantId, asUserId, type TenantId, type UserId }

export const verifySession = cache(async (): Promise<SessionContext> => {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  return {
    userId: asUserId(session.user.id),
    user: session.user,
    activeOrganizationId: session.activeOrganizationId
      ? asTenantId(session.activeOrganizationId)
      : null,
  }
})

export const withTenant = cache(async (): Promise<TenantContext> => {
  const session = await verifySession()

  if (!session.activeOrganizationId) {
    redirect("/onboarding")
  }

  const tenantId = session.activeOrganizationId

  // Verify user is member of this organization
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, session.userId as string),
      eq(organizationMembers.organizationId, tenantId as string)
    ),
  })

  if (!membership) {
    redirect("/onboarding")
  }

  // Set RLS context for the current request
  await db.execute(
    sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
  )

  return {
    ...session,
    activeOrganizationId: tenantId,
    tenantId,
    role: membership.role as Role,
    db,
  }
})

export const requireRole = cache(
  async <R extends Role>(
    allowedRoles: readonly R[]
  ): Promise<RoleContext<R>> => {
    const ctx = await withTenant()

    if (!isAllowedRole(ctx.role, allowedRoles)) {
      redirect("/dashboard?error=unauthorized")
    }

    return ctx as RoleContext<R>
  }
)
```

**Step 3: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 4: Run existing tests**

Run: `pnpm test`
Expected: All tests pass (167 tests)

**Step 5: Commit**

```bash
git add src/lib/dal.ts
git commit -m "refactor(dal): use branded types and typed contexts

- verifySession returns SessionContext with UserId
- withTenant returns TenantContext with TenantId
- requireRole returns RoleContext<R> with narrowed role

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create JSONB Schemas

**Files:**
- Create: `src/db/types/jsonb-schemas.ts`
- Create: `src/db/types/jsonb-schemas.test.ts`

**Step 1: Write the test file**

```typescript
// src/db/types/jsonb-schemas.test.ts
import { describe, it, expect } from "vitest"
import {
  tokenUsageSchema,
  gapAnalysisSchema,
  clauseEvidenceSchema,
  clauseMetadataSchema,
} from "./jsonb-schemas"

describe("JSONB Schemas", () => {
  describe("tokenUsageSchema", () => {
    it("validates valid token usage", () => {
      const data = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        estimatedCost: 0.05,
      }
      expect(tokenUsageSchema.safeParse(data).success).toBe(true)
    })

    it("validates with optional byAgent", () => {
      const data = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        estimatedCost: 0.05,
        byAgent: {
          parser: 200,
          classifier: 400,
          riskScorer: 600,
          gapAnalyst: 300,
        },
      }
      expect(tokenUsageSchema.safeParse(data).success).toBe(true)
    })

    it("rejects missing required fields", () => {
      const data = { promptTokens: 1000 }
      expect(tokenUsageSchema.safeParse(data).success).toBe(false)
    })
  })

  describe("gapAnalysisSchema", () => {
    it("validates valid gap analysis", () => {
      const data = {
        missingClauses: ["Insurance", "Audit Rights"],
        weakClauses: ["Cap On Liability"],
        recommendations: [
          {
            category: "Insurance",
            recommendation: "Add cyber liability requirement",
            priority: "high",
          },
        ],
      }
      expect(gapAnalysisSchema.safeParse(data).success).toBe(true)
    })

    it("validates with optional comparisonBasis", () => {
      const data = {
        missingClauses: [],
        weakClauses: [],
        recommendations: [],
        comparisonBasis: "Bonterms Mutual NDA",
      }
      expect(gapAnalysisSchema.safeParse(data).success).toBe(true)
    })

    it("rejects invalid priority", () => {
      const data = {
        missingClauses: [],
        weakClauses: [],
        recommendations: [
          { category: "Test", recommendation: "Test", priority: "urgent" },
        ],
      }
      expect(gapAnalysisSchema.safeParse(data).success).toBe(false)
    })
  })

  describe("clauseEvidenceSchema", () => {
    it("validates valid evidence", () => {
      const data = {
        citations: ["governed by the laws of Delaware"],
        comparisons: ["Similar to CUAD example #123"],
      }
      expect(clauseEvidenceSchema.safeParse(data).success).toBe(true)
    })

    it("validates with all optional fields", () => {
      const data = {
        citations: ["text here"],
        comparisons: [],
        cuadMatch: {
          exampleId: "cuad-001",
          similarity: 0.95,
          category: "Governing Law",
        },
        reasoning: "Standard Delaware choice of law",
        statistics: {
          percentile: 85,
          sampleSize: 510,
          description: "85th percentile for duration",
        },
      }
      expect(clauseEvidenceSchema.safeParse(data).success).toBe(true)
    })

    it("rejects similarity out of range", () => {
      const data = {
        citations: [],
        comparisons: [],
        cuadMatch: { exampleId: "x", similarity: 1.5, category: "Test" },
      }
      expect(clauseEvidenceSchema.safeParse(data).success).toBe(false)
    })
  })

  describe("clauseMetadataSchema", () => {
    it("validates valid metadata", () => {
      const data = {
        extractionMethod: "llm",
        modelVersion: "claude-sonnet-4-5",
        processingOrder: 1,
        requiresReview: false,
        tags: ["mutual", "standard"],
      }
      expect(clauseMetadataSchema.safeParse(data).success).toBe(true)
    })

    it("allows empty object", () => {
      expect(clauseMetadataSchema.safeParse({}).success).toBe(true)
    })

    it("allows extra fields via passthrough", () => {
      const data = { customField: "allowed" }
      const result = clauseMetadataSchema.safeParse(data)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveProperty("customField", "allowed")
      }
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/db/types/jsonb-schemas.test.ts`
Expected: FAIL with "Cannot find module './jsonb-schemas'"

**Step 3: Write the implementation**

```typescript
// src/db/types/jsonb-schemas.ts
/**
 * Zod schemas for JSONB columns.
 *
 * These schemas provide:
 * 1. Type inference via z.infer<typeof schema>
 * 2. Runtime validation on insert/update
 * 3. IntelliSense when querying JSONB data
 */

import { z } from "zod"

/**
 * Token usage tracking for LLM cost monitoring.
 */
export const tokenUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  estimatedCost: z.number(),
  byAgent: z
    .object({
      parser: z.number(),
      classifier: z.number(),
      riskScorer: z.number(),
      gapAnalyst: z.number(),
    })
    .optional(),
})

export type TokenUsage = z.infer<typeof tokenUsageSchema>

/**
 * Gap analysis result from Gap Analyst Agent.
 */
export const gapAnalysisSchema = z.object({
  missingClauses: z.array(z.string()),
  weakClauses: z.array(z.string()),
  recommendations: z.array(
    z.object({
      category: z.string(),
      recommendation: z.string(),
      priority: z.enum(["low", "medium", "high"]),
    })
  ),
  comparisonBasis: z.string().optional(),
})

export type GapAnalysis = z.infer<typeof gapAnalysisSchema>

/**
 * Evidence supporting a clause classification and risk assessment.
 */
export const clauseEvidenceSchema = z.object({
  /** Direct quotes from the clause text */
  citations: z.array(z.string()),

  /** References to similar CUAD clauses */
  comparisons: z.array(z.string()),

  /** Best matching reference from corpus */
  cuadMatch: z
    .object({
      exampleId: z.string(),
      similarity: z.number().min(0).max(1),
      category: z.string(),
    })
    .optional(),

  /** LLM reasoning for the assessment */
  reasoning: z.string().optional(),

  /** Statistical context */
  statistics: z
    .object({
      percentile: z.number().min(0).max(100),
      sampleSize: z.number(),
      description: z.string(),
    })
    .optional(),
})

export type ClauseEvidence = z.infer<typeof clauseEvidenceSchema>

/**
 * Metadata for clause extraction process.
 */
export const clauseMetadataSchema = z
  .object({
    extractionMethod: z.enum(["llm", "rule", "hybrid"]).optional(),
    modelVersion: z.string().optional(),
    processingOrder: z.number().optional(),
    requiresReview: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough() // Allow additional fields for flexibility

export type ClauseMetadata = z.infer<typeof clauseMetadataSchema>

/**
 * Risk level for clauses and documents.
 */
export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"])

export type RiskLevel = z.infer<typeof riskLevelSchema>
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/db/types/jsonb-schemas.test.ts`
Expected: PASS (12 tests)

**Step 5: Commit**

```bash
git add src/db/types/jsonb-schemas.ts src/db/types/jsonb-schemas.test.ts
git commit -m "feat(db): add Zod schemas for JSONB columns

Schemas for tokenUsage, gapAnalysis, clauseEvidence, clauseMetadata.
Provides type inference and runtime validation.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create JSONB Validation Helpers

**Files:**
- Create: `src/db/helpers/validated-jsonb.ts`
- Create: `src/db/helpers/validated-jsonb.test.ts`

**Step 1: Write the test file**

```typescript
// src/db/helpers/validated-jsonb.test.ts
import { describe, it, expect } from "vitest"
import { validateJsonb, jsonbColumn } from "./validated-jsonb"
import { tokenUsageSchema } from "../types/jsonb-schemas"
import { ValidationError } from "@/lib/errors"

describe("Validated JSONB", () => {
  describe("validateJsonb", () => {
    it("returns parsed data for valid input", () => {
      const data = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        estimatedCost: 0.01,
      }

      const result = validateJsonb(tokenUsageSchema, data, "tokenUsage")
      expect(result).toEqual(data)
    })

    it("throws ValidationError for invalid input", () => {
      const data = { promptTokens: "not a number" }

      expect(() =>
        validateJsonb(tokenUsageSchema, data, "tokenUsage")
      ).toThrow(ValidationError)
    })

    it("includes field path in error details", () => {
      const data = { promptTokens: 100 } // missing required fields

      try {
        validateJsonb(tokenUsageSchema, data, "tokenUsage")
        expect.fail("Should have thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        const ve = error as ValidationError
        expect(ve.details).toBeDefined()
        expect(ve.details?.some((d) => d.field?.includes("tokenUsage"))).toBe(
          true
        )
      }
    })
  })

  describe("jsonbColumn", () => {
    it("creates a column helper with parse method", () => {
      const col = jsonbColumn(tokenUsageSchema, "tokenUsage")

      const data = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        estimatedCost: 0.01,
      }

      expect(col.parse(data)).toEqual(data)
    })

    it("exposes the schema", () => {
      const col = jsonbColumn(tokenUsageSchema, "tokenUsage")
      expect(col.schema).toBe(tokenUsageSchema)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/db/helpers/validated-jsonb.test.ts`
Expected: FAIL with "Cannot find module './validated-jsonb'"

**Step 3: Write the implementation**

```typescript
// src/db/helpers/validated-jsonb.ts
/**
 * JSONB validation helpers.
 *
 * Provides runtime validation for JSONB data before database insert/update.
 * Ensures runtime safety matches compile-time types from $type<>().
 */

import { z } from "zod"
import { ValidationError } from "@/lib/errors"

/**
 * Validate and type JSONB data before insert.
 * Throws ValidationError if schema doesn't match.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param columnName - Column name for error messages
 * @returns Validated and typed data
 * @throws ValidationError if validation fails
 */
export function validateJsonb<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  columnName: string
): T {
  const result = schema.safeParse(data)

  if (!result.success) {
    throw new ValidationError(
      `Invalid ${columnName} data`,
      result.error.issues.map((issue) => ({
        field: `${columnName}.${issue.path.join(".")}`,
        message: issue.message,
      }))
    )
  }

  return result.data
}

/**
 * Create a validated JSONB column helper.
 * Provides a parse method for validation and exposes the schema.
 *
 * @example
 * ```typescript
 * const tokenUsage = jsonbColumn(tokenUsageSchema, "tokenUsage")
 *
 * await db.update(analyses).set({
 *   tokenUsage: tokenUsage.parse(rawData),
 * })
 * ```
 */
export function jsonbColumn<T>(schema: z.ZodSchema<T>, columnName: string) {
  return {
    /**
     * Parse and validate data for this column.
     */
    parse: (data: unknown): T => validateJsonb(schema, data, columnName),

    /**
     * The Zod schema for this column.
     */
    schema,

    /**
     * Column name for error messages.
     */
    columnName,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/db/helpers/validated-jsonb.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/db/helpers/validated-jsonb.ts src/db/helpers/validated-jsonb.test.ts
git commit -m "feat(db): add JSONB validation helpers

validateJsonb() throws ValidationError with field paths.
jsonbColumn() creates reusable column helpers.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Result Type

**Files:**
- Create: `src/lib/result.ts`
- Create: `src/lib/result.test.ts`

**Step 1: Write the test file**

```typescript
// src/lib/result.test.ts
import { describe, it, expect } from "vitest"
import { Ok, Err, map, flatMap, unwrap, unwrapOr, tryCatch } from "./result"

describe("Result Type", () => {
  describe("Ok", () => {
    it("creates a success result", () => {
      const result = Ok(42)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(42)
      }
    })
  })

  describe("Err", () => {
    it("creates a failure result", () => {
      const result = Err(new Error("failed"))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe("failed")
      }
    })
  })

  describe("map", () => {
    it("transforms success value", () => {
      const result = map(Ok(2), (x) => x * 3)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(6)
      }
    })

    it("passes through error", () => {
      const error = new Error("fail")
      const result = map(Err(error), (x: number) => x * 3)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe(error)
      }
    })
  })

  describe("flatMap", () => {
    it("chains successful operations", () => {
      const result = flatMap(Ok(2), (x) => Ok(x * 3))
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(6)
      }
    })

    it("short-circuits on first error", () => {
      const error = new Error("first")
      const result = flatMap(Err(error), () => Ok(42))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe(error)
      }
    })

    it("propagates error from chain", () => {
      const error = new Error("chain")
      const result = flatMap(Ok(2), () => Err(error))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe(error)
      }
    })
  })

  describe("unwrap", () => {
    it("returns value for Ok", () => {
      expect(unwrap(Ok(42))).toBe(42)
    })

    it("throws for Err", () => {
      expect(() => unwrap(Err(new Error("fail")))).toThrow("fail")
    })
  })

  describe("unwrapOr", () => {
    it("returns value for Ok", () => {
      expect(unwrapOr(Ok(42), 0)).toBe(42)
    })

    it("returns default for Err", () => {
      expect(unwrapOr(Err(new Error("fail")), 0)).toBe(0)
    })
  })

  describe("tryCatch", () => {
    it("wraps successful async function", async () => {
      const result = await tryCatch(async () => 42)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(42)
      }
    })

    it("wraps throwing async function", async () => {
      const result = await tryCatch(async () => {
        throw new Error("async fail")
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe("async fail")
      }
    })

    it("converts non-Error throws to Error", async () => {
      const result = await tryCatch(async () => {
        throw "string error"
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(Error)
        expect(result.error.message).toBe("string error")
      }
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/result.test.ts`
Expected: FAIL with "Cannot find module './result'"

**Step 3: Write the implementation**

```typescript
// src/lib/result.ts
/**
 * Result type for composable error handling.
 *
 * Represents either success (Ok) or failure (Err).
 * Enables functional error handling without try/catch pyramids.
 *
 * @example
 * ```typescript
 * const result = await getDocument(id, tenantId)
 *
 * if (!result.ok) {
 *   return { success: false, error: result.error.toJSON() }
 * }
 *
 * return { success: true, data: result.value }
 * ```
 */

/**
 * Result type - represents either success or failure.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

/**
 * Create a success result.
 */
export const Ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
})

/**
 * Create a failure result.
 */
export const Err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
})

/**
 * Transform the success value.
 * Error passes through unchanged.
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return result.ok ? Ok(fn(result.value)) : result
}

/**
 * Chain operations that might fail.
 * Short-circuits on first error.
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.ok ? fn(result.value) : result
}

/**
 * Unwrap the value or throw the error.
 * Use at boundaries where throwing is appropriate.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value
  throw result.error
}

/**
 * Unwrap with a default value for errors.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue
}

/**
 * Wrap an async operation that might throw.
 */
export async function tryCatch<T>(
  fn: () => Promise<T>
): Promise<Result<T, Error>> {
  try {
    return Ok(await fn())
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Wrap with a custom error mapper.
 */
export async function tryCatchWith<T, E>(
  fn: () => Promise<T>,
  mapError: (e: unknown) => E
): Promise<Result<T, E>> {
  try {
    return Ok(await fn())
  } catch (e) {
    return Err(mapError(e))
  }
}

/**
 * Check if a Result is Ok.
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok
}

/**
 * Check if a Result is Err.
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/result.test.ts`
Expected: PASS (12 tests)

**Step 5: Commit**

```bash
git add src/lib/result.ts src/lib/result.test.ts
git commit -m "feat(lib): add Result type for composable error handling

Ok/Err constructors, map, flatMap, unwrap, tryCatch.
Enables functional error handling without try/catch.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create API Middleware

**Files:**
- Create: `src/lib/api/middleware.ts`
- Create: `src/lib/api/handler.ts`
- Create: `src/lib/api/index.ts`

**Step 1: Create middleware types and functions**

```typescript
// src/lib/api/middleware.ts
/**
 * Composable API middleware with type inference.
 *
 * Middleware transforms context types, enabling compile-time
 * verification of auth, tenant, role, and validation requirements.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { withTenant as dalWithTenant, requireRole as dalRequireRole } from "@/lib/dal"
import { asUserId, type UserId, type TenantId, type Role, type TenantContext, type RoleContext } from "@/lib/types"
import { error } from "@/lib/api-utils"
import { UnauthorizedError, ValidationError } from "@/lib/errors"

/**
 * Base context with just the request.
 */
export type BaseContext = {
  request: NextRequest
}

/**
 * Context after authentication.
 */
export type AuthContext = BaseContext & {
  userId: UserId
}

/**
 * Context with tenant scope.
 */
export type TenantCtx = AuthContext & TenantContext

/**
 * Context with specific roles.
 */
export type RoleCtx<R extends Role> = AuthContext & RoleContext<R>

/**
 * Middleware function signature.
 * Returns either an extended context or a Response (to short-circuit).
 */
export type Middleware<In, Out> = (ctx: In) => Promise<Out | NextResponse>

/**
 * Compose two middlewares.
 */
export function compose<A, B, C>(
  m1: Middleware<A, B>,
  m2: Middleware<B, C>
): Middleware<A, C> {
  return async (ctx: A) => {
    const result1 = await m1(ctx)
    if (result1 instanceof NextResponse) return result1
    return m2(result1)
  }
}

/**
 * Pipe multiple middlewares left-to-right.
 */
export function pipe<A, B>(m1: Middleware<A, B>): Middleware<A, B>
export function pipe<A, B, C>(
  m1: Middleware<A, B>,
  m2: Middleware<B, C>
): Middleware<A, C>
export function pipe<A, B, C, D>(
  m1: Middleware<A, B>,
  m2: Middleware<B, C>,
  m3: Middleware<C, D>
): Middleware<A, D>
export function pipe<A, B, C, D, E>(
  m1: Middleware<A, B>,
  m2: Middleware<B, C>,
  m3: Middleware<C, D>,
  m4: Middleware<D, E>
): Middleware<A, E>
export function pipe(
  ...middlewares: Middleware<unknown, unknown>[]
): Middleware<unknown, unknown> {
  return async (ctx) => {
    let current = ctx
    for (const mw of middlewares) {
      const result = await mw(current)
      if (result instanceof NextResponse) return result
      current = result
    }
    return current
  }
}

/**
 * Require authentication.
 */
export const withAuth: Middleware<BaseContext, AuthContext> = async (ctx) => {
  const session = await auth()

  if (!session?.user?.id) {
    return error(new UnauthorizedError())
  }

  return {
    ...ctx,
    userId: asUserId(session.user.id),
  }
}

/**
 * Require tenant context.
 */
export const withTenantCtx: Middleware<AuthContext, TenantCtx> = async (ctx) => {
  try {
    const tenantCtx = await dalWithTenant()
    return { ...ctx, ...tenantCtx }
  } catch (e) {
    // dalWithTenant redirects on failure, but in API routes we return error
    return error(new UnauthorizedError("No active organization"))
  }
}

/**
 * Require specific roles.
 */
export function withRoles<R extends Role>(
  roles: readonly R[]
): Middleware<AuthContext, RoleCtx<R>> {
  return async (ctx) => {
    try {
      const roleCtx = await dalRequireRole(roles)
      return { ...ctx, ...roleCtx }
    } catch (e) {
      return error(new UnauthorizedError("Insufficient permissions"))
    }
  }
}

/**
 * Validate request body with Zod schema.
 */
export function withBody<T>(
  schema: z.ZodSchema<T>
): Middleware<BaseContext, BaseContext & { body: T }> {
  return async (ctx) => {
    let json: unknown
    try {
      json = await ctx.request.json()
    } catch {
      json = {}
    }

    const result = schema.safeParse(json)

    if (!result.success) {
      return error(
        new ValidationError(
          "Invalid request body",
          result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          }))
        )
      )
    }

    return { ...ctx, body: result.data }
  }
}

/**
 * Validate query parameters with Zod schema.
 */
export function withQuery<T>(
  schema: z.ZodSchema<T>
): Middleware<BaseContext, BaseContext & { query: T }> {
  return async (ctx) => {
    const params = Object.fromEntries(ctx.request.nextUrl.searchParams)
    const result = schema.safeParse(params)

    if (!result.success) {
      return error(
        new ValidationError(
          "Invalid query parameters",
          result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          }))
        )
      )
    }

    return { ...ctx, query: result.data }
  }
}
```

**Step 2: Create handler factory**

```typescript
// src/lib/api/handler.ts
/**
 * Route handler factory with middleware composition.
 */

import { NextRequest, NextResponse } from "next/server"
import { type Middleware, type BaseContext } from "./middleware"
import { success, error, type ApiResponse } from "@/lib/api-utils"
import { toAppError } from "@/lib/errors"

/**
 * Create a route handler with middleware chain.
 *
 * @example
 * ```typescript
 * export const GET = createHandler(
 *   pipe(withAuth, withTenantCtx),
 *   async (ctx) => {
 *     const docs = await getDocuments(ctx.tenantId)
 *     return docs
 *   }
 * )
 * ```
 */
export function createHandler<Ctx, T>(
  middleware: Middleware<BaseContext, Ctx>,
  handler: (ctx: Ctx) => Promise<T>
): (request: NextRequest) => Promise<NextResponse<ApiResponse<T>>> {
  return async (request) => {
    try {
      const ctx = await middleware({ request })

      // Middleware returned early response
      if (ctx instanceof NextResponse) {
        return ctx as NextResponse<ApiResponse<T>>
      }

      const data = await handler(ctx)
      return success(data)
    } catch (err) {
      const appError = toAppError(err)

      // Log server errors
      if (appError.statusCode >= 500) {
        console.error("[API Error]", {
          code: appError.code,
          message: appError.message,
          url: request.url,
          method: request.method,
        })
      }

      return error(appError)
    }
  }
}
```

**Step 3: Create barrel export**

```typescript
// src/lib/api/index.ts
/**
 * API utilities barrel export.
 */

export * from "./middleware"
export * from "./handler"
```

**Step 4: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/lib/api/middleware.ts src/lib/api/handler.ts src/lib/api/index.ts
git commit -m "feat(api): add composable middleware and handler factory

- pipe() for middleware composition
- withAuth, withTenantCtx, withRoles middlewares
- withBody, withQuery for Zod validation
- createHandler() for type-safe route handlers

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Run Full Test Suite and Final Commit

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass (180+ tests)

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Run linter**

Run: `pnpm lint`
Expected: No errors (or only pre-existing warnings)

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete TypeScript advanced types implementation

Summary:
- Branded types (TenantId, UserId, DocumentId)
- DAL context types with role narrowing
- JSONB schemas with Zod validation
- Result type for composable error handling
- API middleware composition with type inference

Files added:
- src/lib/types/branded.ts
- src/lib/types/dal.ts
- src/db/types/jsonb-schemas.ts
- src/db/helpers/validated-jsonb.ts
- src/lib/result.ts
- src/lib/api/middleware.ts
- src/lib/api/handler.ts

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

| Task | Files | Tests Added |
|------|-------|-------------|
| 1. Branded Types | `src/lib/types/branded.ts` | 5 |
| 2. DAL Types | `src/lib/types/dal.ts` | - |
| 3. Update DAL | `src/lib/dal.ts` | - |
| 4. JSONB Schemas | `src/db/types/jsonb-schemas.ts` | 12 |
| 5. JSONB Helpers | `src/db/helpers/validated-jsonb.ts` | 5 |
| 6. Result Type | `src/lib/result.ts` | 12 |
| 7. API Middleware | `src/lib/api/*.ts` | - |
| 8. Final Verification | - | - |

**Total new tests:** ~34
**Estimated time:** 45-60 minutes
