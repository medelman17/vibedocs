# Inngest Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the foundational Inngest infrastructure including client, serve route, and base patterns for durable workflow execution.

**Architecture:** Create the Inngest client singleton, configure the Next.js API route for the serve handler, and establish reusable patterns for rate-limited, tenant-scoped workflow functions. All functions will use step-based durability with automatic retry and observability.

**Tech Stack:** Inngest 3.x, Next.js 16 API routes, TypeScript, Zod for event validation

**Prerequisite Plans:** None (this is Plan 1 of 5)

**Dependent Plans:**
- Plan 2: Bootstrap Pipeline
- Plan 3: Agent Foundation
- Plan 4: Analysis Pipeline
- Plan 5: Comparison & Generation Pipelines

---

## Overview

This plan establishes the core Inngest infrastructure:
1. Inngest client singleton with tenant-aware configuration
2. Next.js API route for serve handler
3. Rate limiting and error handling utilities
4. Tenant context for Inngest functions (non-React)
5. Concurrency and retry configuration
6. Test utilities for Inngest functions
7. Environment variable and documentation updates

**Total Tasks:** 10
**Estimated Time:** 2-3 hours

---

## Task 1: Install Inngest Types and Create Client

**Files:**
- Create: `src/inngest/client.ts`
- Create: `src/inngest/types.ts`

**Step 1: Create the types file with event schemas**

```typescript
// src/inngest/types.ts
/**
 * @fileoverview Inngest Event Type Definitions
 *
 * Defines all event schemas for the VibeDocs durable workflow system.
 * Events follow the naming convention: `nda/<domain>.<action>`
 *
 * All events are validated at runtime using Zod schemas before processing.
 *
 * @module inngest/types
 */

import { z } from "zod"

/**
 * Base payload fields included in all tenant-scoped events.
 */
export const baseTenantPayload = z.object({
  /** Organization ID for tenant isolation */
  tenantId: z.string().uuid(),
  /** User who triggered the event (optional for system events) */
  userId: z.string().uuid().optional(),
})

/**
 * Document upload event - triggers processing pipeline.
 * Sent after a document is uploaded to blob storage.
 */
export const documentUploadedPayload = baseTenantPayload.extend({
  /** Database ID of the uploaded document */
  documentId: z.string().uuid(),
  /** Original filename */
  fileName: z.string(),
  /** MIME type */
  fileType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  /** Blob storage URL */
  fileUrl: z.string().url(),
})

/**
 * Analysis request event - triggers the full agent pipeline.
 * Sent after document processing completes or manually by user.
 */
export const analysisRequestedPayload = baseTenantPayload.extend({
  /** Document to analyze */
  documentId: z.string().uuid(),
  /** Analysis record ID (pre-created with status='pending') */
  analysisId: z.string().uuid(),
  /** Optional: specific analysis version (for re-analysis) */
  version: z.number().int().positive().optional(),
})

/**
 * Comparison request event - triggers side-by-side comparison.
 */
export const comparisonRequestedPayload = baseTenantPayload.extend({
  /** Comparison record ID (pre-created with status='pending') */
  comparisonId: z.string().uuid(),
  /** First document in comparison */
  documentAId: z.string().uuid(),
  /** Second document in comparison */
  documentBId: z.string().uuid(),
})

/**
 * NDA generation request event.
 */
export const generationRequestedPayload = baseTenantPayload.extend({
  /** Generated NDA record ID (pre-created with status='draft') */
  generatedNdaId: z.string().uuid(),
  /** Template source */
  templateSource: z.enum(["bonterms", "commonaccord", "custom"]),
  /** Generation parameters */
  parameters: z.object({
    disclosingParty: z.object({
      name: z.string(),
      jurisdiction: z.string(),
    }),
    receivingParty: z.object({
      name: z.string(),
      jurisdiction: z.string(),
    }),
    effectiveDate: z.string(),
    termYears: z.number().int().positive(),
    governingLaw: z.string(),
    mutual: z.boolean(),
    disputeResolution: z.enum(["arbitration", "litigation", "mediation"]).optional(),
  }),
})

/**
 * Bootstrap pipeline event - triggers reference data ingestion.
 * Only used during initial setup or dataset updates.
 */
export const bootstrapStartPayload = z.object({
  /** Which datasets to ingest (empty = all) */
  datasets: z.array(z.enum(["cuad", "contract_nli", "bonterms", "commonaccord", "kleister"])).optional(),
  /** Force re-ingestion even if data exists */
  force: z.boolean().default(false),
})

/**
 * Embedding generation event - batched embedding requests.
 * Used internally by pipelines for rate-limited embedding generation.
 */
export const embeddingsGeneratePayload = z.object({
  /** Batch ID for tracking */
  batchId: z.string().uuid(),
  /** Text chunks to embed */
  chunks: z.array(z.object({
    id: z.string(),
    content: z.string(),
  })),
  /** Target table for embeddings */
  target: z.enum(["document_chunks", "reference_embeddings"]),
  /** Optional tenant context (for document_chunks) */
  tenantId: z.string().uuid().optional(),
})

/**
 * All Inngest event types for the VibeDocs application.
 */
export type InngestEvents = {
  "nda/document.uploaded": {
    data: z.infer<typeof documentUploadedPayload>
  }
  "nda/analysis.requested": {
    data: z.infer<typeof analysisRequestedPayload>
  }
  "nda/comparison.requested": {
    data: z.infer<typeof comparisonRequestedPayload>
  }
  "nda/generation.requested": {
    data: z.infer<typeof generationRequestedPayload>
  }
  "nda/bootstrap.start": {
    data: z.infer<typeof bootstrapStartPayload>
  }
  "nda/embeddings.generate": {
    data: z.infer<typeof embeddingsGeneratePayload>
  }
}

/**
 * Payload types exported for function implementations.
 */
export type DocumentUploadedPayload = z.infer<typeof documentUploadedPayload>
export type AnalysisRequestedPayload = z.infer<typeof analysisRequestedPayload>
export type ComparisonRequestedPayload = z.infer<typeof comparisonRequestedPayload>
export type GenerationRequestedPayload = z.infer<typeof generationRequestedPayload>
export type BootstrapStartPayload = z.infer<typeof bootstrapStartPayload>
export type EmbeddingsGeneratePayload = z.infer<typeof embeddingsGeneratePayload>

/**
 * Map of event names to their Zod schemas for runtime validation.
 */
export const eventSchemas = {
  "nda/document.uploaded": documentUploadedPayload,
  "nda/analysis.requested": analysisRequestedPayload,
  "nda/comparison.requested": comparisonRequestedPayload,
  "nda/generation.requested": generationRequestedPayload,
  "nda/bootstrap.start": bootstrapStartPayload,
  "nda/embeddings.generate": embeddingsGeneratePayload,
} as const
```

**Step 2: Create the Inngest client**

```typescript
// src/inngest/client.ts
/**
 * @fileoverview Inngest Client Configuration
 *
 * Singleton Inngest client instance for the VibeDocs application.
 * All durable workflow functions are created using this client.
 *
 * @module inngest/client
 * @see {@link https://www.inngest.com/docs/reference/client/create}
 */

import { Inngest, EventSchemas } from "inngest"
import type { InngestEvents } from "./types"

/**
 * Inngest client instance configured for the VibeDocs application.
 *
 * Features:
 * - Type-safe event schemas via InngestEvents
 * - Automatic retry with exponential backoff
 * - Step-based durability for fault tolerance
 * - Correlation IDs for observability
 *
 * @example
 * ```typescript
 * import { inngest } from "@/inngest/client"
 * import { analysisRequestedPayload } from "@/inngest/types"
 *
 * export const analyzeNda = inngest.createFunction(
 *   { id: "nda-analyze", concurrency: { limit: 5 } },
 *   { event: "nda/analysis.requested" },
 *   async ({ event, step }) => {
 *     // Validate event data at runtime
 *     const validated = analysisRequestedPayload.parse(event.data)
 *
 *     // Function implementation using validated data
 *     const result = await step.run("process", async () => {
 *       return await processDocument(validated.documentId)
 *     })
 *   }
 * )
 * ```
 */
export const inngest = new Inngest({
  id: "nda-analyst",
  schemas: new EventSchemas().fromRecord<InngestEvents>(),
})

/**
 * Type helper for Inngest function context.
 * Use when you need to type step functions or event handlers.
 */
export type InngestClient = typeof inngest
```

**Step 3: Run TypeScript type check**

Run: `pnpm tsc --noEmit`
Expected: No errors (types compile correctly)

**Step 4: Commit**

```bash
git add src/inngest/client.ts src/inngest/types.ts
git commit -m "feat(inngest): add client and event type definitions

- Create Inngest client singleton with typed event schemas
- Define all workflow events with Zod validation
- Events: document.uploaded, analysis.requested, comparison.requested,
  generation.requested, bootstrap.start, embeddings.generate
- Include eventSchemas map for runtime validation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create Serve Route and Function Registry

**Files:**
- Create: `src/inngest/functions/index.ts`
- Create: `app/api/inngest/route.ts`

**Step 1: Create function registry barrel export**

```typescript
// src/inngest/functions/index.ts
/**
 * @fileoverview Inngest Function Registry
 *
 * Barrel export for all Inngest functions. The serve handler imports
 * from this file to register all functions with Inngest.
 *
 * @module inngest/functions
 */

// Placeholder exports - will be populated as functions are created
// import { processDocument } from "./process-document"
// import { analyzeNda } from "./analyze-nda"
// import { compareNdas } from "./compare-ndas"
// import { generateNda } from "./generate-nda"
// import { bootstrapPipeline } from "./bootstrap"
// import { generateEmbeddings } from "./embeddings"

/**
 * All registered Inngest functions.
 * Add new functions to this array as they are created.
 */
export const functions = [
  // processDocument,
  // analyzeNda,
  // compareNdas,
  // generateNda,
  // bootstrapPipeline,
  // generateEmbeddings,
]
```

**Step 2: Create the API route serve handler**

```typescript
// app/api/inngest/route.ts
/**
 * @fileoverview Inngest Serve Handler
 *
 * Next.js API route that serves as the webhook endpoint for Inngest.
 * All Inngest functions are registered here and invoked via this route.
 *
 * @see {@link https://www.inngest.com/docs/reference/serve}
 */

import { serve } from "inngest/next"
import { inngest } from "@/inngest/client"
import { functions } from "@/inngest/functions"

/**
 * Inngest serve handler for Next.js App Router.
 *
 * This route handles:
 * - Function registration with Inngest Cloud
 * - Webhook invocations for function execution
 * - Step state management and retries
 *
 * Environment variables required:
 * - INNGEST_EVENT_KEY: For sending events
 * - INNGEST_SIGNING_KEY: For webhook signature verification
 *
 * @route ANY /api/inngest
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
})
```

**Step 3: Verify route is accessible**

Run: `pnpm dev`

Then in another terminal:
Run: `curl http://localhost:3000/api/inngest`
Expected: JSON response with Inngest introspection data (empty functions array for now)

**Step 4: Commit**

```bash
git add src/inngest/functions/index.ts app/api/inngest/route.ts
git commit -m "feat(inngest): add serve route and function registry

- Create API route at /api/inngest for Inngest webhook
- Create function registry barrel export
- Placeholder structure for function implementations

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Rate Limiting and Error Handling Utilities

**Files:**
- Create: `src/inngest/utils/rate-limit.ts`
- Create: `src/inngest/utils/errors.ts`
- Create: `src/inngest/utils/errors.test.ts`

**Step 1: Create rate limiting utility functions**

```typescript
// src/inngest/utils/rate-limit.ts
/**
 * @fileoverview Rate Limiting Utilities for Inngest Functions
 *
 * Provides helpers for rate-limited API calls to external services.
 * Implements delays between calls to stay within API quotas.
 *
 * Rate limits enforced:
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
   * - 300 requests per minute
   * - Batch limit: 1000 texts or 120,000 tokens per request
   */
  voyageAi: {
    requestsPerMinute: 300,
    delayMs: 200, // 60000ms / 300 RPM = 200ms
    batchSize: 128, // Conservative batch size for embeddings
  },

  /**
   * Anthropic Claude API.
   * - 60 requests per minute (tier 1)
   * - May vary based on account tier
   */
  claude: {
    requestsPerMinute: 60,
    delayMs: 1000, // 60000ms / 60 RPM = 1000ms
  },
} as const

/**
 * Calculate delay needed between API calls.
 *
 * @param service - The service to get delay for
 * @returns Delay in milliseconds as a string for step.sleep()
 *
 * @example
 * ```typescript
 * await step.sleep("voyage-rate-limit", getRateLimitDelay("voyageAi"))
 * ```
 */
export function getRateLimitDelay(service: keyof typeof RATE_LIMITS): string {
  const ms = RATE_LIMITS[service].delayMs
  return `${ms}ms`
}

/**
 * Calculate optimal batch size for a service.
 *
 * @param service - The service to get batch size for
 * @param totalItems - Total items to process
 * @returns Recommended batch size
 */
export function getBatchSize(
  service: keyof typeof RATE_LIMITS,
  _totalItems?: number
): number {
  const config = RATE_LIMITS[service]
  return "batchSize" in config ? config.batchSize : 1
}

/**
 * Estimate time to process items with rate limiting.
 *
 * @param service - The service being called
 * @param itemCount - Number of items to process
 * @returns Estimated time in seconds
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
 * Wrapper for rate-limited API calls within Inngest steps.
 *
 * Use this to wrap external API calls. It handles rate limiting
 * and converts errors to the appropriate retry behavior.
 *
 * @example
 * ```typescript
 * const result = await step.run("call-claude", async () => {
 *   return withRateLimit("claude", async () => {
 *     return await claude.messages.create({ ... })
 *   })
 * })
 * ```
 */
export async function withRateLimit<T>(
  service: keyof typeof RATE_LIMITS,
  fn: () => Promise<T>
): Promise<T> {
  // The actual delay is handled via step.sleep() before the call
  // This wrapper provides error handling for rate limit responses
  try {
    return await fn()
  } catch (error) {
    // Re-throw with rate limit context for proper Inngest retry
    if (isRateLimitError(error)) {
      const retryAfter = extractRetryAfter(error)
      throw new RateLimitError(service, retryAfter)
    }
    throw error
  }
}

/**
 * Check if an error is a rate limit error from an API.
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
 * Extract retry-after value from rate limit error.
 */
function extractRetryAfter(error: unknown): number {
  // Default to 60 seconds if not specified
  if (error instanceof Error && "headers" in error) {
    const headers = (error as Error & { headers?: Record<string, string> }).headers
    const retryAfter = headers?.["retry-after"]
    if (retryAfter) {
      return parseInt(retryAfter, 10) * 1000 // Convert to ms
    }
  }
  return 60000
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
```

**Step 2: Create error handling utilities**

```typescript
// src/inngest/utils/errors.ts
/**
 * @fileoverview Error Handling Utilities for Inngest Functions
 *
 * Provides custom error classes and utilities for proper error handling
 * in Inngest workflows. Distinguishes between retriable and non-retriable
 * errors to optimize retry behavior.
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
    this.context = context
  }
}

/**
 * Error indicating a temporary failure that should be retried.
 *
 * Use for:
 * - Network timeouts
 * - API rate limits (handled separately by RateLimitError)
 * - Temporary service unavailability
 * - Database connection issues
 *
 * @example
 * ```typescript
 * if (response.status === 503) {
 *   throw new RetriableError("Service temporarily unavailable", { status: 503 })
 * }
 * ```
 */
export class RetriableError extends InngestWorkflowError {
  readonly isRetriable = true
  readonly name = "RetriableError"
}

/**
 * Error indicating a permanent failure that should NOT be retried.
 *
 * Use for:
 * - Invalid input data
 * - Missing required resources (document not found)
 * - Authorization failures
 * - Business logic violations
 *
 * @example
 * ```typescript
 * if (!document) {
 *   throw new NonRetriableError("Document not found", { documentId })
 * }
 * ```
 */
export class NonRetriableError extends InngestWorkflowError {
  readonly isRetriable = false
  readonly name = "NonRetriableError"
}

/**
 * Error indicating validation failure.
 * Non-retriable since the input won't change on retry.
 */
export class ValidationError extends NonRetriableError {
  readonly name = "ValidationError"
  readonly validationErrors: Array<{ path: string; message: string }>

  constructor(
    message: string,
    validationErrors: Array<{ path: string; message: string }>,
    context?: Record<string, unknown>
  ) {
    super(message, context)
    this.validationErrors = validationErrors
  }
}

/**
 * Error indicating a resource was not found.
 * Non-retriable since the resource won't appear on retry.
 */
export class NotFoundError extends NonRetriableError {
  readonly name = "NotFoundError"
  readonly resourceType: string
  readonly resourceId: string

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`, { resourceType, resourceId })
    this.resourceType = resourceType
    this.resourceId = resourceId
  }
}

/**
 * Error indicating an external API failure.
 * Retriability depends on the HTTP status code.
 */
export class ApiError extends InngestWorkflowError {
  readonly name = "ApiError"
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
 * Wrap an async function with error classification.
 *
 * Catches errors and converts them to appropriate Inngest error types.
 *
 * @example
 * ```typescript
 * const result = await step.run("fetch-document", async () => {
 *   return wrapWithErrorHandling("database", async () => {
 *     return await db.documents.findById(documentId)
 *   })
 * })
 * ```
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

    // Default: wrap as retriable (let Inngest decide)
    throw new RetriableError(
      `${operation}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
```

**Step 3: Write error utility tests**

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
})
```

**Step 4: Run tests**

Run: `pnpm test src/inngest/utils/errors.test.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/inngest/utils/rate-limit.ts src/inngest/utils/errors.ts src/inngest/utils/errors.test.ts
git commit -m "feat(inngest): add rate limiting and error handling utilities

- Rate limits: Voyage AI (300 RPM), Claude (60 RPM)
- withRateLimit wrapper for API calls
- Error classes: RetriableError, NonRetriableError, ValidationError,
  NotFoundError, ApiError
- wrapWithErrorHandling for automatic error classification
- Comprehensive test coverage for error utilities

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create Tenant Context for Inngest Functions

**Files:**
- Create: `src/inngest/utils/tenant-context.ts`
- Create: `src/inngest/utils/tenant-context.test.ts`

**Step 1: Create tenant context utility**

```typescript
// src/inngest/utils/tenant-context.ts
/**
 * @fileoverview Tenant Context Utilities for Inngest Functions
 *
 * Provides tenant isolation for Inngest functions. Unlike the DAL
 * (src/lib/dal.ts) which uses React Server Component patterns,
 * these utilities work in the Inngest function context.
 *
 * Key differences from DAL:
 * - No React `cache()` - Inngest functions aren't React components
 * - No `redirect()` - Inngest functions handle errors differently
 * - Direct database access with RLS context setting
 *
 * @module inngest/utils/tenant-context
 */

import { db } from "@/db"
import { sql } from "drizzle-orm"
import { NonRetriableError, NotFoundError } from "./errors"

/**
 * Result of setting tenant context.
 */
export interface TenantContext {
  /** Database instance with RLS context set */
  db: typeof db
  /** The tenant ID that was set */
  tenantId: string
}

/**
 * Set RLS context for the current database session.
 *
 * Call this at the start of any Inngest step that accesses tenant-scoped data.
 * The RLS context is set for the current transaction only.
 *
 * @param tenantId - Organization ID from the event payload
 * @returns Database instance with RLS context set
 *
 * @throws {NonRetriableError} If tenantId is missing or invalid
 *
 * @example
 * ```typescript
 * export const analyzeNda = inngest.createFunction(
 *   { id: "nda-analyze" },
 *   { event: "nda/analysis.requested" },
 *   async ({ event, step }) => {
 *     const result = await step.run("load-document", async () => {
 *       const { db, tenantId } = await setTenantContext(event.data.tenantId)
 *
 *       // All queries now filtered by RLS
 *       const doc = await db.query.documents.findFirst({
 *         where: eq(documents.id, event.data.documentId)
 *       })
 *
 *       return doc
 *     })
 *   }
 * )
 * ```
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

  // Set RLS context for this database session
  // The 'true' parameter makes this setting transaction-local
  await db.execute(
    sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
  )

  return { db, tenantId }
}

/**
 * Execute a function with tenant context, ensuring proper cleanup.
 *
 * This is useful when you need to ensure tenant context is set for
 * multiple database operations within a single step.
 *
 * @example
 * ```typescript
 * const result = await step.run("process-document", async () => {
 *   return withTenantContext(event.data.tenantId, async ({ db }) => {
 *     const doc = await db.query.documents.findFirst({ ... })
 *     const analysis = await db.insert(analyses).values({ ... })
 *     return { doc, analysis }
 *   })
 * })
 * ```
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (ctx: TenantContext) => Promise<T>
): Promise<T> {
  const ctx = await setTenantContext(tenantId)
  return fn(ctx)
}

/**
 * Verify that a resource belongs to the specified tenant.
 *
 * Use this when you need to verify ownership before performing
 * operations that might bypass RLS (like direct updates).
 *
 * @throws {NotFoundError} If resource doesn't exist or belongs to different tenant
 */
export async function verifyTenantOwnership(
  tableName: string,
  resourceId: string,
  tenantId: string
): Promise<void> {
  // This is a safety check - RLS should already prevent cross-tenant access
  // but this provides defense-in-depth
  const result = await db.execute(
    sql`SELECT tenant_id FROM ${sql.identifier(tableName)} WHERE id = ${resourceId}`
  )

  const rows = result.rows as Array<{ tenant_id: string }>
  if (rows.length === 0) {
    throw new NotFoundError(tableName, resourceId)
  }

  if (rows[0].tenant_id !== tenantId) {
    // Log this as it might indicate a bug or attack
    console.error(
      `Tenant ownership mismatch: ${tableName}/${resourceId} belongs to ${rows[0].tenant_id}, not ${tenantId}`
    )
    throw new NotFoundError(tableName, resourceId)
  }
}
```

**Step 2: Write tenant context tests**

```typescript
// src/inngest/utils/tenant-context.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { setTenantContext, withTenantContext } from "./tenant-context"
import { NonRetriableError } from "./errors"

// Mock the database
vi.mock("@/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    query: {},
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
    })

    it("should throw NonRetriableError for invalid UUID format", async () => {
      await expect(setTenantContext("invalid-uuid")).rejects.toThrow(
        NonRetriableError
      )
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
  })
})
```

**Step 3: Run tests**

Run: `pnpm test src/inngest/utils/tenant-context.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/inngest/utils/tenant-context.ts src/inngest/utils/tenant-context.test.ts
git commit -m "feat(inngest): add tenant context utilities

- setTenantContext sets RLS app.tenant_id for database session
- withTenantContext wrapper for scoped tenant operations
- verifyTenantOwnership for defense-in-depth checks
- Works in Inngest context (no React dependencies)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create Concurrency Configuration

**Files:**
- Create: `src/inngest/utils/concurrency.ts`

**Step 1: Create concurrency configuration**

```typescript
// src/inngest/utils/concurrency.ts
/**
 * @fileoverview Concurrency Configuration for Inngest Functions
 *
 * Defines concurrency limits for different workflow types to prevent
 * overwhelming external APIs and database connections.
 *
 * @module inngest/utils/concurrency
 */

/**
 * Concurrency configurations for different function types.
 * These limits are enforced by Inngest and apply across all workers.
 */
export const CONCURRENCY = {
  /**
   * NDA analysis pipeline.
   * Limit 5 concurrent analyses to manage Claude API load.
   * Each analysis makes ~33 Claude API calls.
   */
  analysis: {
    limit: 5,
    key: "event.data.tenantId", // Per-tenant limiting
  },

  /**
   * Embedding generation.
   * Limit 3 concurrent embedding batches for Voyage AI.
   * Protects against rate limit exhaustion during bulk operations.
   */
  embeddings: {
    limit: 3,
    key: "event.data.tenantId",
  },

  /**
   * Document processing (parsing, chunking).
   * Higher limit as this is CPU-bound, not API-bound.
   */
  documentProcessing: {
    limit: 10,
    key: "event.data.tenantId",
  },

  /**
   * Comparison pipeline.
   * Lower limit as comparisons use more memory.
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
    // No key - global limit, not per-tenant
  },
} as const

/**
 * Retry configuration for Inngest functions.
 */
export const RETRY_CONFIG = {
  /**
   * Default retry configuration.
   * 5 retries with exponential backoff (Inngest default).
   */
  default: {
    retries: 5,
  },

  /**
   * Critical operations (analysis, embedding).
   * More retries for important workflows.
   */
  critical: {
    retries: 10,
  },

  /**
   * Non-critical operations.
   * Fewer retries to fail fast.
   */
  nonCritical: {
    retries: 3,
  },
} as const

/**
 * Step timeout configuration.
 * Individual steps within a function have their own timeouts.
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
git commit -m "feat(inngest): add concurrency and retry configuration

- Define per-tenant concurrency limits for all workflow types
- Analysis: 5, Embeddings: 3, Processing: 10, Bootstrap: 1
- Retry configs: default (5), critical (10), non-critical (3)
- Step timeouts: default 5m, long 10m, short 1m

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Barrel Export for Inngest Module

**Files:**
- Create: `src/inngest/index.ts`

**Step 1: Create barrel export**

```typescript
// src/inngest/index.ts
/**
 * @fileoverview Inngest Module Barrel Export
 *
 * Main entry point for the Inngest durable workflow system.
 * Import from `@/inngest` for all Inngest-related functionality.
 *
 * @example
 * ```typescript
 * import {
 *   inngest,
 *   RATE_LIMITS,
 *   CONCURRENCY,
 *   setTenantContext,
 *   RetriableError,
 *   analysisRequestedPayload,
 * } from "@/inngest"
 *
 * // Create a new function
 * const myFunc = inngest.createFunction(
 *   { id: "my-func", concurrency: CONCURRENCY.analysis },
 *   { event: "nda/analysis.requested" },
 *   async ({ event, step }) => {
 *     // Validate event
 *     const data = analysisRequestedPayload.parse(event.data)
 *
 *     // Set tenant context
 *     const result = await step.run("process", async () => {
 *       const { db } = await setTenantContext(data.tenantId)
 *       // ... process with tenant-scoped db
 *     })
 *   }
 * )
 * ```
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

// Functions (exported for serve handler)
export { functions } from "./functions"
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/inngest/index.ts
git commit -m "feat(inngest): add barrel export for inngest module

- Export client, types, and all utilities from single entry point
- Import from @/inngest for all Inngest functionality

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create Test Utilities for Inngest Functions

**Files:**
- Create: `src/inngest/utils/test-helpers.ts`
- Create: `src/inngest/client.test.ts`

**Step 1: Create test helpers**

```typescript
// src/inngest/utils/test-helpers.ts
/**
 * @fileoverview Test Utilities for Inngest Functions
 *
 * Provides helpers for testing Inngest functions in isolation
 * without requiring the Inngest server.
 *
 * @module inngest/utils/test-helpers
 */

import type { InngestEvents } from "../types"

/**
 * Create a mock event for testing Inngest functions.
 *
 * @param name - Event name from InngestEvents
 * @param data - Event payload data
 * @returns Mock event object matching Inngest event shape
 *
 * @example
 * ```typescript
 * const mockEvent = createMockEvent("nda/document.uploaded", {
 *   tenantId: "tenant-123",
 *   documentId: "doc-456",
 *   fileName: "test.pdf",
 *   fileType: "application/pdf",
 *   fileUrl: "https://example.com/test.pdf",
 * })
 * ```
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
 * Create a mock step object for testing Inngest functions.
 *
 * Tracks step executions for assertions.
 *
 * @example
 * ```typescript
 * const { step, getStepResults } = createMockStep()
 *
 * await myFunction({ event: mockEvent, step })
 *
 * expect(getStepResults()).toHaveLength(3)
 * expect(getStepResults()[0].name).toBe("parse-document")
 * ```
 */
export function createMockStep() {
  const stepResults: Array<{ name: string; result: unknown }> = []
  const sleepCalls: Array<{ name: string; duration: string }> = []
  const sentEvents: Array<{ stepName: string; events: Array<{ name: string; data: unknown }> }> = []

  const step = {
    /**
     * Mock step.run() - executes the function and records result.
     */
    run: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      const result = await fn()
      stepResults.push({ name, result })
      return result
    },

    /**
     * Mock step.sleep() - records sleep call without waiting.
     */
    sleep: async (name: string, duration: string): Promise<void> => {
      sleepCalls.push({ name, duration })
    },

    /**
     * Mock step.sendEvent() - records event send.
     */
    sendEvent: async (
      stepName: string,
      events: Array<{ name: string; data: unknown }> | { name: string; data: unknown }
    ) => {
      const eventArray = Array.isArray(events) ? events : [events]
      sentEvents.push({ stepName, events: eventArray })
      stepResults.push({ name: `sendEvent:${stepName}`, result: eventArray })
      return eventArray.map(() => ({ id: `mock-${Date.now()}` }))
    },

    /**
     * Mock step.waitForEvent() - returns immediately with mock event.
     */
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
 * Assert that a step was executed with expected name.
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
 * Assert that a step was executed with expected result.
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
 * Create a mock tenant context for testing.
 */
export function createMockTenantContext(tenantId: string = "test-tenant-id") {
  return {
    db: {} as never, // Tests should mock specific queries
    tenantId,
  }
}
```

**Step 2: Write the client tests**

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

  it("should have typed event schemas", () => {
    expect(inngest).toBeDefined()
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
    const event = createMockEvent("nda/document.uploaded", {
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      documentId: "550e8400-e29b-41d4-a716-446655440001",
      fileName: "test.pdf",
      fileType: "application/pdf",
      fileUrl: "https://example.com/test.pdf",
    })

    expect(event.name).toBe("nda/document.uploaded")
    expect(event.data.tenantId).toBe("550e8400-e29b-41d4-a716-446655440000")
    expect(event.data.documentId).toBe("550e8400-e29b-41d4-a716-446655440001")
    expect(event.id).toMatch(/^mock-event-/)
  })

  it("should track step executions", async () => {
    const { step, getStepResults, getSleepCalls } = createMockStep()

    // Simulate function execution
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
      name: "nda/analysis.completed",
      data: { analysisId: "123" },
    })

    expect(getSentEvents()).toHaveLength(1)
    expect(getSentEvents()[0].stepName).toBe("notify")
    expect(getSentEvents()[0].events[0].name).toBe("nda/analysis.completed")
  })

  it("should throw when expected step not found", () => {
    const stepResults = [{ name: "actual-step", result: null }]

    expect(() => expectStepExecuted(stepResults, "missing-step")).toThrow(
      'Expected step "missing-step" to be executed'
    )
  })
})
```

**Step 3: Run tests**

Run: `pnpm test src/inngest/client.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/inngest/utils/test-helpers.ts src/inngest/client.test.ts
git commit -m "test(inngest): add test utilities and client tests

- Create mock event and step helpers for function testing
- Test client configuration and event schema validation
- Test helper functionality for step/event tracking

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Create Environment Variable Documentation

**Files:**
- Modify: `.env.example`

**Step 1: Read current .env.example**

Run: Read the current `.env.example` file to see what exists

**Step 2: Add Inngest environment variables**

Add to `.env.example`:

```bash
# =============================================================================
# Inngest - Durable Workflow Orchestration
# =============================================================================
# Get keys from: https://app.inngest.com/env/{env}/manage/keys

# Event key for sending events to Inngest
# Format: Starts with "signkey-prod-" or "signkey-test-"
INNGEST_EVENT_KEY=

# Signing key for webhook signature verification
# Format: Starts with "signkey-prod-" or "signkey-test-"
INNGEST_SIGNING_KEY=
```

**Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add Inngest environment variables to .env.example

- INNGEST_EVENT_KEY for sending events
- INNGEST_SIGNING_KEY for webhook verification

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Update CLAUDE.md with Inngest Patterns

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add Inngest section to CLAUDE.md**

Add after the existing "Inngest Patterns" section (or create if it doesn't exist):

```markdown
### Inngest Function Patterns

All durable workflows use Inngest with these patterns:

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
    // Step 1: Validate event data at runtime
    const data = analysisRequestedPayload.parse(event.data)

    // Step 2: Set tenant context and perform DB operation
    const document = await step.run("load-document", async () => {
      const { db } = await setTenantContext(data.tenantId)
      const doc = await db.query.documents.findFirst({
        where: eq(documents.id, data.documentId)
      })
      if (!doc) {
        throw new NonRetriableError("Document not found")
      }
      return doc
    })

    // Step 3: Rate-limited API call
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
- **Set tenant context** at the start of steps that access tenant-scoped data
- **Wrap ALL external API calls** in `step.run()` for durability
- **Use `step.sleep()`** between API calls to respect rate limits
- **Use error classes** - `RetriableError` for temporary failures, `NonRetriableError` for permanent failures
- **Concurrency keys**: Use `"event.data.tenantId"` for per-tenant limiting
- **Event naming**: Use convention `nda/<domain>.<action>`
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Inngest patterns to CLAUDE.md

- Document function creation pattern with validation
- Tenant context setup for RLS
- Rate limiting and error handling conventions
- Event naming and concurrency key conventions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Verify Complete Infrastructure

**Files:**
- No new files

**Step 1: Run full type check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass, including new Inngest tests

**Step 3: Run linter**

Run: `pnpm lint`
Expected: No errors

**Step 4: Start dev server and verify route**

Run: `pnpm dev`

In another terminal:
Run: `curl -s http://localhost:3000/api/inngest | head -20`
Expected: JSON response with Inngest introspection data

**Step 5: Final commit for infrastructure completion**

```bash
git add -A
git commit -m "feat(inngest): complete infrastructure setup

Infrastructure Plan complete:
- Inngest client with typed event schemas + runtime validation
- Serve route at /api/inngest
- Rate limiting utilities (Voyage 300 RPM, Claude 60 RPM)
- Error handling (RetriableError, NonRetriableError, ApiError)
- Tenant context for Inngest functions (non-React)
- Concurrency configuration (analysis: 5, embeddings: 3)
- Test utilities for function testing
- Environment variable and CLAUDE.md documentation

Ready for: Bootstrap Pipeline (Plan 2)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

This plan establishes the complete Inngest infrastructure:

| Component | File | Purpose |
|-----------|------|---------|
| Client | `src/inngest/client.ts` | Singleton Inngest instance |
| Types | `src/inngest/types.ts` | Event schemas with Zod + validation map |
| Serve Route | `app/api/inngest/route.ts` | Webhook endpoint |
| Rate Limits | `src/inngest/utils/rate-limit.ts` | API quota management + withRateLimit wrapper |
| Errors | `src/inngest/utils/errors.ts` | Retriable/NonRetriable error classes |
| Tenant Context | `src/inngest/utils/tenant-context.ts` | RLS context for Inngest functions |
| Concurrency | `src/inngest/utils/concurrency.ts` | Workflow limits |
| Test Helpers | `src/inngest/utils/test-helpers.ts` | Testing utilities |
| Barrel | `src/inngest/index.ts` | Module exports |

**Total Tasks:** 10
**Key Additions from Brainstorm:**
- Task 3 expanded: Error handling utilities (`RetriableError`, `NonRetriableError`, `ApiError`, `wrapWithErrorHandling`)
- Task 4 added: Tenant context for Inngest (`setTenantContext`, `withTenantContext`)
- Task 1 enhanced: `eventSchemas` map for runtime validation pattern

**Next Plan:** [Bootstrap Pipeline](./2026-02-01-inngest-bootstrap.md) - Ingest CUAD, ContractNLI, and template datasets into the shared reference database.
