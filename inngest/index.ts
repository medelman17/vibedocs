/**
 * @fileoverview Inngest Module - Main Entry Point
 *
 * This is the main barrel export for the `@/inngest` module. All Inngest
 * utilities, types, and functions should be imported from here in production code.
 *
 * @example
 * ```typescript
 * import {
 *   inngest,
 *   RATE_LIMITS,
 *   CONCURRENCY,
 *   withTenantContext,
 *   ValidationError,
 *   functions,
 * } from "@/inngest"
 * ```
 *
 * Note: Test helpers are intentionally NOT exported from this barrel.
 * Import them directly in test files:
 * ```typescript
 * import { createMockEvent, createMockStep } from "@/inngest/utils/test-helpers"
 * ```
 *
 * @module inngest
 */

// =============================================================================
// Client
// =============================================================================

export { inngest } from "./client"
export type { InngestClient } from "./client"

// =============================================================================
// Event Types & Schemas
// =============================================================================

export * from "./types"

// =============================================================================
// Rate Limiting Utilities
// =============================================================================

export {
  RATE_LIMITS,
  getRateLimitDelay,
  getBatchSize,
  estimateProcessingTime,
  withRateLimit,
  RateLimitError,
} from "./utils/rate-limit"

// =============================================================================
// Concurrency & Retry Configuration
// =============================================================================

export { CONCURRENCY, RETRY_CONFIG, STEP_TIMEOUTS } from "./utils/concurrency"

// =============================================================================
// Tenant Context Utilities
// =============================================================================

export {
  setTenantContext,
  withTenantContext,
  verifyTenantOwnership,
  type TenantContext,
} from "./utils/tenant-context"

// =============================================================================
// Error Handling
// =============================================================================

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

// =============================================================================
// Function Registry
// =============================================================================
// NOTE: Functions are NOT exported from this barrel to avoid pulling in
// heavy dependencies (pdf-parse, pdfjs-dist) that require browser APIs.
// Import functions directly from "@/inngest/functions" in the serve handler only.
// See: https://github.com/medelman17/vibedocs/issues/43
