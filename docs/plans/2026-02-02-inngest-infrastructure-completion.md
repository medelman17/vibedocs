# Inngest Infrastructure Completion Plan

> **Status:** ✅ COMPLETE (audited 2026-02-04)
>
> All tasks implemented. See inngest/ and agents/ directories.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the Inngest Infrastructure (Plan 1, Tasks 3-10) by adding rate limiting, error handling, tenant context, concurrency configuration, test utilities, and documentation.

**Architecture:** Create Inngest-specific utilities in `src/inngest/utils/` that work outside React Server Component context. Error classes use an `isRetriable` flag for Inngest retry control. Tenant context sets RLS via `set_config()` without membership verification (trusted event payloads). Rate limiting provides constants for `step.sleep()`.

**Tech Stack:** Inngest 3.50.0, Zod 4, Vitest, TypeScript

---

## Task 1: Create Inngest Error Classes

**Files:**
- Create: `src/inngest/utils/errors.ts`

**Step 1: Create the errors file**

```typescript
// src/inngest/utils/errors.ts
/**
 * @fileoverview Error Handling Utilities for Inngest Functions
 *
 * Provides custom error classes for Inngest workflows. Unlike src/lib/errors.ts
 * (HTTP-focused with statusCode), these use `isRetriable` for Inngest retry control.
 *
 * @module inngest/utils/errors
 */

/**
 * Base class for Inngest workflow errors.
 */
export abstract class InngestWorkflowError extends Error {
  /** Whether Inngest should retry this error */
  abstract readonly isRetriable: boolean
  /** Optional context for debugging */
  readonly context?: Record<string, unknown>

  constructor(message: string, context?: Record<string, unknown>) {
    super(message)
    this.name = this.constructor.name
    this.context = context
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Temporary failure that should be retried.
 * Use for: network timeouts, temporary unavailability, connection issues.
 */
export class RetriableError extends InngestWorkflowError {
  readonly isRetriable = true
}

/**
 * Permanent failure that should NOT be retried.
 * Use for: invalid input, missing resources, authorization failures.
 */
export class NonRetriableError extends InngestWorkflowError {
  readonly isRetriable = false
}

/**
 * Validation failure. Non-retriable since input won't change.
 */
export class ValidationError extends NonRetriableError {
  readonly validationErrors: Array<{ path: string; message: string }>

  constructor(
    message: string,
    validationErrors: Array<{ path: string; message: string }>,
    context?: Record<string, unknown>
  ) {
    super(message, context)
    this.validationErrors = validationErrors
  }

  /**
   * Create from Zod error (uses .issues per Zod 4).
   */
  static fromZodError(
    error: { issues: Array<{ path: (string | number)[]; message: string }> }
  ): ValidationError {
    const validationErrors = error.issues.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }))
    return new ValidationError("Validation failed", validationErrors)
  }
}

/**
 * Resource not found. Non-retriable since it won't appear.
 */
export class NotFoundError extends NonRetriableError {
  readonly resourceType: string
  readonly resourceId: string

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`, { resourceType, resourceId })
    this.resourceType = resourceType
    this.resourceId = resourceId
  }
}

/**
 * External API failure. Retriability depends on status code.
 */
export class ApiError extends InngestWorkflowError {
  readonly service: string
  readonly statusCode?: number
  readonly isRetriable: boolean

  constructor(
    service: string,
    message: string,
    statusCode?: number,
    context?: Record<string, unknown>
  ) {
    super(`${service} API error: ${message}`, context)
    this.service = service
    this.statusCode = statusCode
    // 5xx and specific 4xx codes are retriable
    this.isRetriable = statusCode
      ? statusCode >= 500 || statusCode === 408 || statusCode === 429
      : true
  }
}

/**
 * Check if an error should trigger Inngest retry.
 */
export function isRetriableError(error: unknown): boolean {
  if (error instanceof InngestWorkflowError) {
    return error.isRetriable
  }
  // Default: retry unknown errors (conservative approach)
  return true
}

/**
 * Wrap async function with error classification.
 */
export async function wrapWithErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    // Already classified errors pass through
    if (error instanceof InngestWorkflowError) {
      throw error
    }

    // Classify common error patterns
    if (error instanceof Error) {
      const message = error.message.toLowerCase()

      // Network/connection errors are retriable
      if (
        message.includes("timeout") ||
        message.includes("econnrefused") ||
        message.includes("network")
      ) {
        throw new RetriableError(`${operation}: ${error.message}`, {
          originalError: error.name,
        })
      }

      // Not found errors are not retriable
      if (message.includes("not found") || message.includes("404")) {
        throw new NonRetriableError(`${operation}: ${error.message}`)
      }
    }

    // Default: wrap as retriable
    throw new RetriableError(
      `${operation}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/inngest/utils/errors.ts
git commit -m "$(cat <<'EOF'
feat(inngest): add error classes with isRetriable flag

- InngestWorkflowError base class with isRetriable abstract property
- RetriableError for temporary failures (network, timeout)
- NonRetriableError for permanent failures (validation, not found)
- ValidationError with Zod 4 integration (.issues)
- NotFoundError with resourceType/resourceId
- ApiError with status-based retriability
- wrapWithErrorHandling utility for error classification

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create Error Tests

**Files:**
- Create: `src/inngest/utils/errors.test.ts`

**Step 1: Write the error tests**

```typescript
// src/inngest/utils/errors.test.ts
import { describe, it, expect } from "vitest"
import {
  RetriableError,
  NonRetriableError,
  ValidationError,
  NotFoundError,
  ApiError,
  isRetriableError,
  wrapWithErrorHandling,
} from "./errors"

describe("Error Classes", () => {
  describe("RetriableError", () => {
    it("should be marked as retriable", () => {
      const error = new RetriableError("Temporary failure")
      expect(error.isRetriable).toBe(true)
      expect(error.name).toBe("RetriableError")
    })

    it("should include context", () => {
      const error = new RetriableError("Failed", { attempt: 3 })
      expect(error.context).toEqual({ attempt: 3 })
    })
  })

  describe("NonRetriableError", () => {
    it("should be marked as non-retriable", () => {
      const error = new NonRetriableError("Invalid input")
      expect(error.isRetriable).toBe(false)
      expect(error.name).toBe("NonRetriableError")
    })
  })

  describe("ValidationError", () => {
    it("should include validation errors", () => {
      const error = new ValidationError("Invalid payload", [
        { path: "tenantId", message: "Required" },
      ])
      expect(error.isRetriable).toBe(false)
      expect(error.validationErrors).toHaveLength(1)
      expect(error.validationErrors[0].path).toBe("tenantId")
    })

    it("should create from Zod error", () => {
      const zodError = {
        issues: [
          { path: ["user", "email"], message: "Invalid email" },
          { path: ["age"], message: "Must be positive" },
        ],
      }
      const error = ValidationError.fromZodError(zodError)
      expect(error.validationErrors).toHaveLength(2)
      expect(error.validationErrors[0].path).toBe("user.email")
      expect(error.validationErrors[1].path).toBe("age")
    })
  })

  describe("NotFoundError", () => {
    it("should include resource details", () => {
      const error = new NotFoundError("Document", "doc-123")
      expect(error.isRetriable).toBe(false)
      expect(error.resourceType).toBe("Document")
      expect(error.resourceId).toBe("doc-123")
      expect(error.message).toContain("Document not found")
    })
  })

  describe("ApiError", () => {
    it("should be retriable for 5xx errors", () => {
      const error = new ApiError("Claude", "Server error", 500)
      expect(error.isRetriable).toBe(true)
    })

    it("should be retriable for 429 (rate limit)", () => {
      const error = new ApiError("Voyage", "Rate limited", 429)
      expect(error.isRetriable).toBe(true)
    })

    it("should not be retriable for 4xx errors (except 408, 429)", () => {
      const error = new ApiError("Claude", "Bad request", 400)
      expect(error.isRetriable).toBe(false)
    })

    it("should be retriable for 408 (timeout)", () => {
      const error = new ApiError("Voyage", "Request timeout", 408)
      expect(error.isRetriable).toBe(true)
    })

    it("should be retriable when no status code", () => {
      const error = new ApiError("Unknown", "Connection failed")
      expect(error.isRetriable).toBe(true)
    })
  })
})

describe("isRetriableError", () => {
  it("should return true for RetriableError", () => {
    expect(isRetriableError(new RetriableError("temp"))).toBe(true)
  })

  it("should return false for NonRetriableError", () => {
    expect(isRetriableError(new NonRetriableError("perm"))).toBe(false)
  })

  it("should return true for unknown errors (conservative)", () => {
    expect(isRetriableError(new Error("unknown"))).toBe(true)
  })
})

describe("wrapWithErrorHandling", () => {
  it("should pass through successful results", async () => {
    const result = await wrapWithErrorHandling("test", async () => "success")
    expect(result).toBe("success")
  })

  it("should convert timeout errors to RetriableError", async () => {
    await expect(
      wrapWithErrorHandling("test", async () => {
        throw new Error("Connection timeout")
      })
    ).rejects.toThrow(RetriableError)
  })

  it("should convert not found errors to NonRetriableError", async () => {
    await expect(
      wrapWithErrorHandling("test", async () => {
        throw new Error("Resource not found")
      })
    ).rejects.toThrow(NonRetriableError)
  })

  it("should pass through already-classified errors", async () => {
    const original = new ValidationError("Invalid", [])
    await expect(
      wrapWithErrorHandling("test", async () => {
        throw original
      })
    ).rejects.toBe(original)
  })

  it("should wrap unknown errors as RetriableError", async () => {
    await expect(
      wrapWithErrorHandling("test", async () => {
        throw new Error("Something unexpected")
      })
    ).rejects.toThrow(RetriableError)
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/inngest/utils/errors.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/inngest/utils/errors.test.ts
git commit -m "$(cat <<'EOF'
test(inngest): add error class tests

- Test isRetriable flag for all error types
- Test ValidationError.fromZodError with Zod 4 format
- Test ApiError status-based retriability
- Test wrapWithErrorHandling error classification

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create Rate Limiting Utilities

**Files:**
- Create: `src/inngest/utils/rate-limit.ts`

**Step 1: Create the rate limit file**

```typescript
// src/inngest/utils/rate-limit.ts
/**
 * @fileoverview Rate Limiting Utilities for Inngest Functions
 *
 * Provides helpers for rate-limited API calls to external services.
 * Uses step.sleep() for durable delays between calls.
 *
 * Rate limits:
 * - Voyage AI: 300 RPM (200ms between calls)
 * - Claude API: 60 RPM (1000ms between calls)
 *
 * @module inngest/utils/rate-limit
 */

/**
 * Rate limit configurations for external APIs.
 */
export const RATE_LIMITS = {
  /**
   * Voyage AI embedding API.
   * 300 requests per minute, batch limit ~128 texts per request.
   */
  voyageAi: {
    requestsPerMinute: 300,
    delayMs: 200, // 60000ms / 300 RPM
    batchSize: 128,
  },

  /**
   * Anthropic Claude API.
   * 60 requests per minute (tier 1).
   */
  claude: {
    requestsPerMinute: 60,
    delayMs: 1000, // 60000ms / 60 RPM
  },
} as const

/**
 * Get delay string for step.sleep().
 *
 * @example
 * await step.sleep("voyage-rate-limit", getRateLimitDelay("voyageAi"))
 */
export function getRateLimitDelay(service: keyof typeof RATE_LIMITS): string {
  const ms = RATE_LIMITS[service].delayMs
  return `${ms}ms`
}

/**
 * Get optimal batch size for a service.
 */
export function getBatchSize(service: keyof typeof RATE_LIMITS): number {
  const config = RATE_LIMITS[service]
  return "batchSize" in config ? config.batchSize : 1
}

/**
 * Estimate processing time in seconds.
 */
export function estimateProcessingTime(
  service: keyof typeof RATE_LIMITS,
  itemCount: number
): number {
  const config = RATE_LIMITS[service]
  const batchSize = "batchSize" in config ? config.batchSize : 1
  const batches = Math.ceil(itemCount / batchSize)
  return (batches * config.delayMs) / 1000
}

/**
 * Rate limit error with retry information.
 */
export class RateLimitError extends Error {
  readonly service: string
  readonly retryAfterMs: number
  readonly isRetriable = true

  constructor(service: string, retryAfterMs: number) {
    super(`Rate limit exceeded for ${service}. Retry after ${retryAfterMs}ms`)
    this.name = "RateLimitError"
    this.service = service
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * Check if error is rate limit related.
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes("rate limit") ||
      message.includes("429") ||
      message.includes("too many requests")
    )
  }
  return false
}

/**
 * Extract retry-after value from error.
 */
function extractRetryAfter(error: unknown): number {
  if (error instanceof Error && "headers" in error) {
    const headers = (error as Error & { headers?: Record<string, string> }).headers
    const retryAfter = headers?.["retry-after"]
    if (retryAfter) {
      return parseInt(retryAfter, 10) * 1000
    }
  }
  return 60000 // Default 60 seconds
}

/**
 * Wrapper for rate-limited API calls.
 *
 * @example
 * const result = await step.run("call-claude", async () => {
 *   return withRateLimit("claude", async () => {
 *     return await claude.messages.create({ ... })
 *   })
 * })
 */
export async function withRateLimit<T>(
  service: keyof typeof RATE_LIMITS,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (isRateLimitError(error)) {
      const retryAfter = extractRetryAfter(error)
      throw new RateLimitError(service, retryAfter)
    }
    throw error
  }
}
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/inngest/utils/rate-limit.ts
git commit -m "$(cat <<'EOF'
feat(inngest): add rate limiting utilities

- RATE_LIMITS config for Voyage AI (300 RPM) and Claude (60 RPM)
- getRateLimitDelay() for step.sleep() duration strings
- getBatchSize() for optimal batching
- estimateProcessingTime() for progress estimation
- withRateLimit() wrapper for error handling
- RateLimitError class with retry info

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create Tenant Context Utilities

**Files:**
- Create: `src/inngest/utils/tenant-context.ts`

**Step 1: Create the tenant context file**

```typescript
// src/inngest/utils/tenant-context.ts
/**
 * @fileoverview Tenant Context Utilities for Inngest Functions
 *
 * Provides tenant isolation for Inngest functions. Unlike src/lib/dal.ts
 * (React Server Components with redirects), these work in Inngest context.
 *
 * Key differences:
 * - No React cache() - Inngest functions aren't React components
 * - No redirect() - Inngest handles errors via retry/fail
 * - No membership verification - event payloads are trusted
 *
 * @module inngest/utils/tenant-context
 */

import { db } from "@/db"
import { sql } from "drizzle-orm"
import { NonRetriableError, NotFoundError } from "./errors"

/**
 * Tenant context with database and tenant ID.
 */
export interface TenantContext {
  /** Database instance with RLS context set */
  db: typeof db
  /** The tenant ID that was set */
  tenantId: string
}

/**
 * Set RLS context for database session.
 *
 * Call at start of any Inngest step accessing tenant-scoped data.
 *
 * @throws {NonRetriableError} If tenantId is missing or invalid UUID
 *
 * @example
 * const result = await step.run("load-document", async () => {
 *   const { db } = await setTenantContext(event.data.tenantId)
 *   return await db.query.documents.findFirst({
 *     where: eq(documents.id, event.data.documentId)
 *   })
 * })
 */
export async function setTenantContext(tenantId: string): Promise<TenantContext> {
  if (!tenantId) {
    throw new NonRetriableError("tenantId is required for tenant-scoped operations")
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(tenantId)) {
    throw new NonRetriableError(`Invalid tenantId format: ${tenantId}`)
  }

  // Set RLS context (transaction-local via 'true' parameter)
  await db.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)

  return { db, tenantId }
}

/**
 * Execute function with tenant context.
 *
 * @example
 * const result = await step.run("process", async () => {
 *   return withTenantContext(event.data.tenantId, async ({ db }) => {
 *     const doc = await db.query.documents.findFirst({ ... })
 *     await db.insert(analyses).values({ ... })
 *     return { doc }
 *   })
 * })
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (ctx: TenantContext) => Promise<T>
): Promise<T> {
  const ctx = await setTenantContext(tenantId)
  return fn(ctx)
}

/**
 * Verify resource belongs to tenant. Defense-in-depth check.
 *
 * @throws {NotFoundError} If resource doesn't exist or belongs to different tenant
 */
export async function verifyTenantOwnership(
  tableName: string,
  resourceId: string,
  tenantId: string
): Promise<void> {
  const result = await db.execute(
    sql`SELECT tenant_id FROM ${sql.identifier(tableName)} WHERE id = ${resourceId}`
  )

  const rows = result.rows as Array<{ tenant_id: string }>
  if (rows.length === 0) {
    throw new NotFoundError(tableName, resourceId)
  }

  if (rows[0].tenant_id !== tenantId) {
    console.error(
      `Tenant ownership mismatch: ${tableName}/${resourceId} belongs to ${rows[0].tenant_id}, not ${tenantId}`
    )
    throw new NotFoundError(tableName, resourceId)
  }
}
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/inngest/utils/tenant-context.ts
git commit -m "$(cat <<'EOF'
feat(inngest): add tenant context utilities

- setTenantContext() sets RLS via set_config('app.tenant_id', ...)
- withTenantContext() wrapper for scoped operations
- verifyTenantOwnership() for defense-in-depth checks
- UUID validation for tenantId
- Works in Inngest context (no React dependencies)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create Tenant Context Tests

**Files:**
- Create: `src/inngest/utils/tenant-context.test.ts`

**Step 1: Write the tenant context tests**

```typescript
// src/inngest/utils/tenant-context.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { setTenantContext, withTenantContext } from "./tenant-context"
import { NonRetriableError } from "./errors"

// Mock the database
vi.mock("@/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

describe("tenant-context", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("setTenantContext", () => {
    it("should set RLS context for valid tenantId", async () => {
      const { db } = await import("@/db")
      const tenantId = "550e8400-e29b-41d4-a716-446655440000"

      const result = await setTenantContext(tenantId)

      expect(result.tenantId).toBe(tenantId)
      expect(result.db).toBe(db)
      expect(db.execute).toHaveBeenCalledTimes(1)
    })

    it("should throw NonRetriableError for missing tenantId", async () => {
      await expect(setTenantContext("")).rejects.toThrow(NonRetriableError)
      await expect(setTenantContext("")).rejects.toThrow("tenantId is required")
    })

    it("should throw NonRetriableError for invalid UUID format", async () => {
      await expect(setTenantContext("invalid-uuid")).rejects.toThrow(NonRetriableError)
      await expect(setTenantContext("invalid-uuid")).rejects.toThrow("Invalid tenantId format")
    })

    it("should accept various valid UUID formats", async () => {
      const validUuids = [
        "550e8400-e29b-41d4-a716-446655440000",
        "550E8400-E29B-41D4-A716-446655440000", // uppercase
        "00000000-0000-0000-0000-000000000000", // all zeros
      ]

      for (const uuid of validUuids) {
        const result = await setTenantContext(uuid)
        expect(result.tenantId).toBe(uuid)
      }
    })
  })

  describe("withTenantContext", () => {
    it("should execute function with tenant context", async () => {
      const tenantId = "550e8400-e29b-41d4-a716-446655440000"

      const result = await withTenantContext(tenantId, async (ctx) => {
        expect(ctx.tenantId).toBe(tenantId)
        return "success"
      })

      expect(result).toBe("success")
    })

    it("should propagate errors from inner function", async () => {
      const tenantId = "550e8400-e29b-41d4-a716-446655440000"

      await expect(
        withTenantContext(tenantId, async () => {
          throw new Error("Inner error")
        })
      ).rejects.toThrow("Inner error")
    })

    it("should validate tenantId before executing function", async () => {
      const fn = vi.fn()

      await expect(withTenantContext("invalid", fn)).rejects.toThrow(NonRetriableError)
      expect(fn).not.toHaveBeenCalled()
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/inngest/utils/tenant-context.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/inngest/utils/tenant-context.test.ts
git commit -m "$(cat <<'EOF'
test(inngest): add tenant context tests

- Test RLS context setting with valid UUIDs
- Test error handling for missing/invalid tenantId
- Test withTenantContext wrapper execution
- Test validation before function execution

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Create Concurrency Configuration

**Files:**
- Create: `src/inngest/utils/concurrency.ts`

**Step 1: Create the concurrency config file**

```typescript
// src/inngest/utils/concurrency.ts
/**
 * @fileoverview Concurrency Configuration for Inngest Functions
 *
 * Defines limits for different workflow types to prevent
 * overwhelming external APIs and database connections.
 *
 * @module inngest/utils/concurrency
 */

/**
 * Concurrency configurations by function type.
 * Enforced by Inngest across all workers.
 */
export const CONCURRENCY = {
  /**
   * NDA analysis pipeline.
   * Limit 5 concurrent analyses (each makes ~33 Claude calls).
   */
  analysis: {
    limit: 5,
    key: "event.data.tenantId",
  },

  /**
   * Embedding generation.
   * Limit 3 concurrent batches for Voyage AI rate limits.
   */
  embeddings: {
    limit: 3,
    key: "event.data.tenantId",
  },

  /**
   * Document processing (parsing, chunking).
   * Higher limit - CPU-bound, not API-bound.
   */
  documentProcessing: {
    limit: 10,
    key: "event.data.tenantId",
  },

  /**
   * Comparison pipeline.
   * Lower limit - uses more memory.
   */
  comparison: {
    limit: 3,
    key: "event.data.tenantId",
  },

  /**
   * NDA generation.
   * Moderate limit for Claude-based generation.
   */
  generation: {
    limit: 5,
    key: "event.data.tenantId",
  },

  /**
   * Bootstrap pipeline (reference data ingestion).
   * Single instance only - runs once during setup.
   */
  bootstrap: {
    limit: 1,
  },
} as const

/**
 * Retry configuration for Inngest functions.
 */
export const RETRY_CONFIG = {
  /** Default: 5 retries with exponential backoff */
  default: { retries: 5 },
  /** Critical operations: more retries */
  critical: { retries: 10 },
  /** Non-critical: fail fast */
  nonCritical: { retries: 3 },
} as const

/**
 * Step timeout configuration.
 */
export const STEP_TIMEOUTS = {
  /** Default step timeout */
  default: "5m",
  /** Long-running steps (embedding large batches) */
  long: "10m",
  /** Quick steps (database operations) */
  short: "1m",
} as const
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/inngest/utils/concurrency.ts
git commit -m "$(cat <<'EOF'
feat(inngest): add concurrency and retry configuration

- Per-tenant concurrency limits for all workflow types
- Analysis: 5, Embeddings: 3, Processing: 10, Bootstrap: 1
- Retry configs: default (5), critical (10), non-critical (3)
- Step timeouts: default 5m, long 10m, short 1m

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Create Test Helpers

**Files:**
- Create: `src/inngest/utils/test-helpers.ts`

**Step 1: Create the test helpers file**

```typescript
// src/inngest/utils/test-helpers.ts
/**
 * @fileoverview Test Utilities for Inngest Functions
 *
 * Helpers for testing Inngest functions without the server.
 *
 * @module inngest/utils/test-helpers
 */

import type { InngestEvents } from "../types"

/**
 * Create mock event for testing.
 *
 * @example
 * const mockEvent = createMockEvent("nda/uploaded", {
 *   tenantId: "tenant-123",
 *   documentId: "doc-456",
 *   fileName: "test.pdf",
 *   fileType: "application/pdf",
 *   fileUrl: "https://example.com/test.pdf",
 * })
 */
export function createMockEvent<K extends keyof InngestEvents>(
  name: K,
  data: InngestEvents[K]["data"]
) {
  return {
    name,
    data,
    id: `mock-event-${Date.now()}`,
    ts: Date.now(),
  }
}

/**
 * Create mock step object for testing.
 * Tracks step executions for assertions.
 *
 * @example
 * const { step, getStepResults } = createMockStep()
 * await myFunction({ event: mockEvent, step })
 * expect(getStepResults()).toHaveLength(3)
 */
export function createMockStep() {
  const stepResults: Array<{ name: string; result: unknown }> = []
  const sleepCalls: Array<{ name: string; duration: string }> = []
  const sentEvents: Array<{ stepName: string; events: Array<{ name: string; data: unknown }> }> = []

  const step = {
    run: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      const result = await fn()
      stepResults.push({ name, result })
      return result
    },

    sleep: async (name: string, duration: string): Promise<void> => {
      sleepCalls.push({ name, duration })
    },

    sendEvent: async (
      stepName: string,
      events: Array<{ name: string; data: unknown }> | { name: string; data: unknown }
    ) => {
      const eventArray = Array.isArray(events) ? events : [events]
      sentEvents.push({ stepName, events: eventArray })
      stepResults.push({ name: `sendEvent:${stepName}`, result: eventArray })
      return eventArray.map(() => ({ id: `mock-${Date.now()}` }))
    },

    waitForEvent: async <T>(
      name: string,
      _opts: { event: string; timeout: string; match?: string }
    ): Promise<T | null> => {
      stepResults.push({ name: `waitForEvent:${name}`, result: null })
      return null
    },
  }

  return {
    step,
    getStepResults: () => stepResults,
    getSleepCalls: () => sleepCalls,
    getSentEvents: () => sentEvents,
    reset: () => {
      stepResults.length = 0
      sleepCalls.length = 0
      sentEvents.length = 0
    },
  }
}

/**
 * Assert step was executed.
 */
export function expectStepExecuted(
  stepResults: Array<{ name: string; result: unknown }>,
  expectedName: string
) {
  const found = stepResults.find((s) => s.name === expectedName)
  if (!found) {
    throw new Error(
      `Expected step "${expectedName}" to be executed. ` +
        `Executed steps: ${stepResults.map((s) => s.name).join(", ")}`
    )
  }
  return found
}

/**
 * Assert step result matches expected.
 */
export function expectStepResult<T>(
  stepResults: Array<{ name: string; result: unknown }>,
  expectedName: string,
  expectedResult: T
) {
  const found = expectStepExecuted(stepResults, expectedName)
  if (JSON.stringify(found.result) !== JSON.stringify(expectedResult)) {
    throw new Error(
      `Step "${expectedName}" result mismatch.\n` +
        `Expected: ${JSON.stringify(expectedResult)}\n` +
        `Actual: ${JSON.stringify(found.result)}`
    )
  }
}

/**
 * Create mock tenant context for testing.
 */
export function createMockTenantContext(tenantId: string = "test-tenant-id") {
  return {
    db: {} as never,
    tenantId,
  }
}
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/inngest/utils/test-helpers.ts
git commit -m "$(cat <<'EOF'
feat(inngest): add test utilities

- createMockEvent() for type-safe test events
- createMockStep() tracks step executions, sleeps, sent events
- expectStepExecuted() and expectStepResult() assertions
- createMockTenantContext() for tenant isolation tests

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Create Barrel Export

**Files:**
- Create: `src/inngest/index.ts`

**Step 1: Create the barrel export file**

```typescript
// src/inngest/index.ts
/**
 * @fileoverview Inngest Module Barrel Export
 *
 * Main entry point for the Inngest durable workflow system.
 * Import from `@/inngest` for all Inngest-related functionality.
 *
 * @example
 * import {
 *   inngest,
 *   RATE_LIMITS,
 *   CONCURRENCY,
 *   setTenantContext,
 *   RetriableError,
 *   analysisRequestedPayload,
 * } from "@/inngest"
 *
 * @module inngest
 */

// Client
export { inngest } from "./client"
export type { InngestClient } from "./client"

// Types and Schemas
export * from "./types"

// Rate Limiting
export {
  RATE_LIMITS,
  getRateLimitDelay,
  getBatchSize,
  estimateProcessingTime,
  withRateLimit,
  RateLimitError,
} from "./utils/rate-limit"

// Concurrency
export { CONCURRENCY, RETRY_CONFIG, STEP_TIMEOUTS } from "./utils/concurrency"

// Tenant Context
export {
  setTenantContext,
  withTenantContext,
  verifyTenantOwnership,
  type TenantContext,
} from "./utils/tenant-context"

// Error Handling
export {
  InngestWorkflowError,
  RetriableError,
  NonRetriableError,
  ValidationError,
  NotFoundError,
  ApiError,
  isRetriableError,
  wrapWithErrorHandling,
} from "./utils/errors"

// Functions (for serve handler)
export { functions } from "./functions"
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/inngest/index.ts
git commit -m "$(cat <<'EOF'
feat(inngest): add barrel export

- Export client, types, and all utilities from @/inngest
- Single import for all Inngest functionality

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Create Client Tests

**Files:**
- Create: `src/inngest/client.test.ts`

**Step 1: Write the client tests**

```typescript
// src/inngest/client.test.ts
import { describe, it, expect } from "vitest"
import { inngest } from "./client"
import {
  createMockEvent,
  createMockStep,
  expectStepExecuted,
} from "./utils/test-helpers"
import { documentUploadedPayload } from "./types"

describe("Inngest Client", () => {
  it("should be configured with correct app ID", () => {
    expect(inngest.id).toBe("nda-analyst")
  })

  it("should have createFunction method", () => {
    expect(typeof inngest.createFunction).toBe("function")
  })
})

describe("Event Schemas", () => {
  it("should validate document uploaded payload", () => {
    const validPayload = {
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      documentId: "550e8400-e29b-41d4-a716-446655440001",
      fileName: "test.pdf",
      fileType: "application/pdf" as const,
      fileUrl: "https://example.com/test.pdf",
    }

    const result = documentUploadedPayload.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it("should reject invalid UUID in payload", () => {
    const invalidPayload = {
      tenantId: "not-a-uuid",
      documentId: "550e8400-e29b-41d4-a716-446655440001",
      fileName: "test.pdf",
      fileType: "application/pdf",
      fileUrl: "https://example.com/test.pdf",
    }

    const result = documentUploadedPayload.safeParse(invalidPayload)
    expect(result.success).toBe(false)
  })

  it("should reject invalid file type", () => {
    const invalidPayload = {
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      documentId: "550e8400-e29b-41d4-a716-446655440001",
      fileName: "test.txt",
      fileType: "text/plain",
      fileUrl: "https://example.com/test.txt",
    }

    const result = documentUploadedPayload.safeParse(invalidPayload)
    expect(result.success).toBe(false)
  })
})

describe("Test Helpers", () => {
  it("should create mock events with correct shape", () => {
    const event = createMockEvent("nda/uploaded", {
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      documentId: "550e8400-e29b-41d4-a716-446655440001",
      fileName: "test.pdf",
      fileType: "application/pdf",
      fileUrl: "https://example.com/test.pdf",
    })

    expect(event.name).toBe("nda/uploaded")
    expect(event.data.tenantId).toBe("550e8400-e29b-41d4-a716-446655440000")
    expect(event.id).toMatch(/^mock-event-/)
  })

  it("should track step executions", async () => {
    const { step, getStepResults, getSleepCalls } = createMockStep()

    const result = await step.run("step-1", async () => "result-1")
    await step.sleep("rate-limit", "1s")
    await step.run("step-2", async () => "result-2")

    expect(result).toBe("result-1")
    expect(getStepResults()).toHaveLength(2)
    expect(getSleepCalls()).toHaveLength(1)
    expectStepExecuted(getStepResults(), "step-1")
    expectStepExecuted(getStepResults(), "step-2")
  })

  it("should track sent events", async () => {
    const { step, getSentEvents } = createMockStep()

    await step.sendEvent("notify", {
      name: "nda/analysis.progress",
      data: { analysisId: "123", step: "parsing", percent: 25 },
    })

    expect(getSentEvents()).toHaveLength(1)
    expect(getSentEvents()[0].stepName).toBe("notify")
    expect(getSentEvents()[0].events[0].name).toBe("nda/analysis.progress")
  })

  it("should throw when expected step not found", () => {
    const stepResults = [{ name: "actual-step", result: null }]

    expect(() => expectStepExecuted(stepResults, "missing-step")).toThrow(
      'Expected step "missing-step" to be executed'
    )
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/inngest/client.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/inngest/client.test.ts
git commit -m "$(cat <<'EOF'
test(inngest): add client and test helper tests

- Test client configuration and app ID
- Test event schema validation with Zod
- Test mock event and step helper functionality

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update Environment Variables

**Files:**
- Modify: `.env.example`

**Step 1: Append Inngest variables**

Add to end of `.env.example`:

```bash
# =============================================================================
# Inngest - Durable Workflow Orchestration
# =============================================================================
# Get keys from: https://app.inngest.com/env/{env}/manage/keys

# Event key for sending events to Inngest
INNGEST_EVENT_KEY=

# Signing key for webhook signature verification
INNGEST_SIGNING_KEY=
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "$(cat <<'EOF'
docs: add Inngest environment variables

- INNGEST_EVENT_KEY for sending events
- INNGEST_SIGNING_KEY for webhook verification

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Expand Inngest Patterns section (around line 157)**

Replace the existing brief Inngest Patterns section with:

```markdown
### Inngest Patterns

All durable workflows use Inngest. Import from `@/inngest`:

```typescript
import {
  inngest,
  CONCURRENCY,
  RATE_LIMITS,
  getRateLimitDelay,
  setTenantContext,
  withRateLimit,
  RetriableError,
  NonRetriableError,
  analysisRequestedPayload,
} from "@/inngest"

export const myFunction = inngest.createFunction(
  {
    id: "my-function",
    concurrency: CONCURRENCY.analysis,
    retries: 5,
  },
  { event: "nda/analysis.requested" },
  async ({ event, step }) => {
    // 1. Validate event data at runtime
    const data = analysisRequestedPayload.parse(event.data)

    // 2. Set tenant context for RLS
    const document = await step.run("load-document", async () => {
      const { db } = await setTenantContext(data.tenantId)
      const doc = await db.query.documents.findFirst({
        where: eq(documents.id, data.documentId)
      })
      if (!doc) throw new NonRetriableError("Document not found")
      return doc
    })

    // 3. Rate-limited API call
    await step.sleep("rate-limit", getRateLimitDelay("claude"))
    const analysis = await step.run("analyze", async () => {
      return withRateLimit("claude", async () => {
        return await claude.messages.create({ ... })
      })
    })

    return { success: true }
  }
)
```

Key conventions:
- **Validate events** at runtime using Zod schemas from `@/inngest/types`
- **Set tenant context** at start of steps accessing tenant-scoped data
- **Wrap ALL external API calls** in `step.run()` for durability
- **Use `step.sleep()`** between API calls to respect rate limits
- **Error classes**: `RetriableError` for temporary, `NonRetriableError` for permanent
- **Concurrency keys**: `"event.data.tenantId"` for per-tenant limiting
- **Event naming**: `nda/<domain>.<action>` convention
- **Progress events**: Emit `nda/analysis.progress` at each stage for real-time UI
- **Partial persistence**: Save results after each agent for resume capability
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: expand Inngest patterns in CLAUDE.md

- Full function creation pattern with validation
- Tenant context setup for RLS
- Rate limiting utilities and step.sleep()
- Error handling classes (RetriableError, NonRetriableError)
- Event naming and concurrency conventions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Final Verification

**Step 1: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 2: Run all Inngest tests**

Run: `pnpm test src/inngest`
Expected: All tests pass

**Step 3: Run linter**

Run: `pnpm lint`
Expected: No errors

**Step 4: Start dev server and verify route**

Run: `pnpm dev` (in background or separate terminal)

Then:
Run: `curl -s http://localhost:3000/api/inngest | head -20`
Expected: JSON response with Inngest introspection data

**Step 5: Final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(inngest): complete infrastructure setup

Infrastructure complete:
- Error classes with isRetriable flag for retry control
- Rate limiting utilities (Voyage 300 RPM, Claude 60 RPM)
- Tenant context for RLS in Inngest functions
- Concurrency configuration
- Test utilities for function testing
- Barrel export at @/inngest
- Environment variables and CLAUDE.md documentation

Ready for: Bootstrap Pipeline (Plan 2)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `src/inngest/utils/errors.ts` | Error classes with isRetriable |
| 2 | `src/inngest/utils/errors.test.ts` | Error tests |
| 3 | `src/inngest/utils/rate-limit.ts` | Rate limiting utilities |
| 4 | `src/inngest/utils/tenant-context.ts` | RLS tenant context |
| 5 | `src/inngest/utils/tenant-context.test.ts` | Tenant context tests |
| 6 | `src/inngest/utils/concurrency.ts` | Concurrency config |
| 7 | `src/inngest/utils/test-helpers.ts` | Test utilities |
| 8 | `src/inngest/index.ts` | Barrel export |
| 9 | `src/inngest/client.test.ts` | Client tests |
| 10 | `.env.example` | Environment variables |
| 11 | `CLAUDE.md` | Documentation |
| 12 | - | Final verification |

**Total: 12 tasks, ~45-60 minutes**

**Next Plan:** Bootstrap Pipeline (Plan 2) - Ingest CUAD, ContractNLI, and templates into reference database.
