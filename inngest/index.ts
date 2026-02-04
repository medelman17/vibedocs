/**
 * @fileoverview Inngest Module - Main Entry Point
 *
 * This is the main barrel export for the `@/inngest` module. Utilities and types
 * should be imported from here. Functions are NOT exported to avoid pulling in
 * heavy dependencies (pdf-parse, browser APIs).
 *
 * @example Safe imports from this barrel:
 * ```typescript
 * import {
 *   inngest,
 *   RATE_LIMITS,
 *   CONCURRENCY,
 *   withTenantContext,
 *   ValidationError,
 * } from "@/inngest"
 * ```
 *
 * @example Functions must be imported directly:
 * ```typescript
 * // ❌ DO NOT import functions from barrel
 * import { functions } from "@/inngest"
 *
 * // ✅ Import from functions submodule (serve handler only)
 * import { functions } from "@/inngest/functions"
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

// IMPORTANT: Do NOT export functions from this barrel!
// The functions array pulls in the entire analysis pipeline, which includes
// pdf-parse (via document-processing.ts), which uses browser-only APIs like
// DOMMatrix and causes production crashes.
//
// Import functions directly in the serve handler only:
// import { functions } from "@/inngest/functions"
//
// See: https://github.com/medelman17/vibedocs/issues/43
