// src/inngest/utils/concurrency.ts
/**
 * @fileoverview Concurrency Configuration for Inngest Functions
 *
 * Defines concurrency limits, retry strategies, and step timeouts
 * for Inngest function execution. These configurations help prevent
 * resource exhaustion and ensure fair processing across tenants.
 *
 * @module inngest/utils/concurrency
 */

/**
 * Concurrency limits for Inngest functions.
 *
 * Each configuration specifies:
 * - `limit`: Maximum concurrent executions
 * - `key`: Event data field for per-tenant isolation (optional)
 *
 * Per-tenant keys ensure one tenant's workload doesn't block others.
 * Bootstrap operations run globally (no tenant key) since they're
 * system-wide reference data operations.
 *
 * @example
 * // In Inngest function definition:
 * inngest.createFunction(
 *   {
 *     id: "analyze-nda",
 *     concurrency: CONCURRENCY.analysis,
 *   },
 *   { event: "nda/document.uploaded" },
 *   async ({ event, step }) => { ... }
 * )
 */
export const CONCURRENCY = {
  /**
   * NDA analysis pipeline (parser, classifier, risk scorer, gap analyst).
   * Limited to 5 concurrent analyses per tenant to manage API costs.
   */
  analysis: { limit: 5, key: "event.data.tenantId" },

  /**
   * Embedding generation via Voyage AI.
   * Limited to 3 concurrent batches per tenant due to API rate limits.
   */
  embeddings: { limit: 3, key: "event.data.tenantId" },

  /**
   * Document processing (upload, parsing, text extraction).
   * Higher limit (10) since these are less resource-intensive.
   */
  documentProcessing: { limit: 10, key: "event.data.tenantId" },

  /**
   * NDA comparison operations (side-by-side clause matching).
   * Limited to 3 concurrent comparisons per tenant.
   */
  comparison: { limit: 3, key: "event.data.tenantId" },

  /**
   * NDA generation from templates.
   * Limited to 5 concurrent generations per tenant.
   */
  generation: { limit: 5, key: "event.data.tenantId" },

  /**
   * Reference data bootstrap (CUAD, ContractNLI, templates).
   * Global limit of 1 - only one bootstrap operation at a time.
   * No tenant key since this is a system-wide operation.
   */
  bootstrap: { limit: 1 },
} as const

/**
 * Retry configurations for different operation types.
 *
 * Inngest automatically retries failed steps with exponential backoff.
 * These configurations control the maximum retry attempts.
 *
 * @example
 * inngest.createFunction(
 *   {
 *     id: "process-document",
 *     retries: RETRY_CONFIG.default.retries,
 *   },
 *   { event: "nda/document.uploaded" },
 *   async ({ event, step }) => { ... }
 * )
 */
export const RETRY_CONFIG = {
  /**
   * Default retry strategy for most operations.
   * 5 retries with exponential backoff covers transient failures.
   */
  default: { retries: 5 },

  /**
   * Critical operations that must eventually succeed.
   * 10 retries for payment processing, data persistence, etc.
   */
  critical: { retries: 10 },

  /**
   * Non-critical operations where fast failure is acceptable.
   * 3 retries for notifications, analytics, etc.
   */
  nonCritical: { retries: 3 },
} as const

/**
 * Step timeout configurations.
 *
 * Controls how long individual steps can run before timing out.
 * Use with step.run() options to prevent hung operations.
 *
 * @example
 * const result = await step.run(
 *   { id: "call-claude", timeout: STEP_TIMEOUTS.long },
 *   async () => { ... }
 * )
 */
export const STEP_TIMEOUTS = {
  /**
   * Default timeout for most steps.
   * 5 minutes covers typical API calls and processing.
   */
  default: "5m",

  /**
   * Extended timeout for long-running operations.
   * 10 minutes for large document processing, bulk operations.
   */
  long: "10m",

  /**
   * Short timeout for quick operations.
   * 1 minute for simple validations, cache lookups.
   */
  short: "1m",
} as const

/**
 * Type for concurrency configuration values.
 */
export type ConcurrencyConfig = (typeof CONCURRENCY)[keyof typeof CONCURRENCY]

/**
 * Type for retry configuration values.
 */
export type RetryConfig = (typeof RETRY_CONFIG)[keyof typeof RETRY_CONFIG]

/**
 * Type for step timeout values.
 */
export type StepTimeout = (typeof STEP_TIMEOUTS)[keyof typeof STEP_TIMEOUTS]

/**
 * Keys for concurrency configurations.
 */
export type ConcurrencyKey = keyof typeof CONCURRENCY

/**
 * Keys for retry configurations.
 */
export type RetryKey = keyof typeof RETRY_CONFIG

/**
 * Keys for step timeout configurations.
 */
export type StepTimeoutKey = keyof typeof STEP_TIMEOUTS
