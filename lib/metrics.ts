import * as Sentry from "@sentry/nextjs";

/**
 * Sentry Metrics utilities for tracking counters, gauges, and distributions
 *
 * @example
 * ```ts
 * import { metrics, withTiming } from "@/lib/metrics";
 *
 * // Counter - track occurrences
 * metrics.count("api.request", 1, { endpoint: "/api/analyze", method: "POST" });
 *
 * // Gauge - point-in-time values
 * metrics.gauge("queue.depth", 42, { queue: "analysis" });
 *
 * // Distribution - statistical analysis
 * metrics.distribution("api.latency", 187.5, "millisecond", { endpoint: "/api/analyze" });
 *
 * // Timing helper
 * const result = await withTiming("nda.analysis.duration", async () => {
 *   return await analyzeDocument(doc);
 * }, { documentType: "nda" });
 * ```
 */
export const metrics = {
  /**
   * Increment a counter metric
   * Use for: button clicks, API calls, errors, business events
   */
  count(
    name: string,
    value: number = 1,
    attributes?: Record<string, string | number | boolean>
  ) {
    Sentry.metrics.count(name, value, { attributes });
  },

  /**
   * Record a gauge (point-in-time snapshot)
   * Use for: queue depth, memory usage, active connections
   */
  gauge(
    name: string,
    value: number,
    attributes?: Record<string, string | number | boolean>,
    unit?: string
  ) {
    Sentry.metrics.gauge(name, value, { unit, attributes });
  },

  /**
   * Record a distribution value for statistical analysis
   * Use for: response times, cart amounts, query durations
   */
  distribution(
    name: string,
    value: number,
    unit?: string,
    attributes?: Record<string, string | number | boolean>
  ) {
    Sentry.metrics.distribution(name, value, { unit, attributes });
  },
};

/**
 * Helper to time async operations and record as distribution
 *
 * @example
 * ```ts
 * const result = await withTiming("db.query.duration", async () => {
 *   return await db.query.documents.findMany();
 * }, { table: "documents" });
 * ```
 */
export async function withTiming<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    Sentry.metrics.distribution(name, duration, {
      unit: "millisecond",
      attributes,
    });
  }
}

/**
 * Sync version of timing helper
 */
export function withTimingSync<T>(
  name: string,
  fn: () => T,
  attributes?: Record<string, string | number | boolean>
): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    const duration = performance.now() - start;
    Sentry.metrics.distribution(name, duration, {
      unit: "millisecond",
      attributes,
    });
  }
}

// Re-export flush for manual flushing before process exit
export const flush = Sentry.flush;

// ============================================================================
// Tracing utilities
// ============================================================================

type SpanAttributes = Record<string, string | number | boolean | undefined>;

/**
 * Create a traced span for an async operation
 *
 * @example
 * ```ts
 * import { startSpan } from "@/lib/metrics";
 *
 * const result = await startSpan("fetch-user", "db.query", async () => {
 *   return await db.query.users.findFirst({ where: eq(users.id, id) });
 * }, { userId: id });
 * ```
 */
export async function startSpan<T>(
  name: string,
  op: string,
  fn: () => Promise<T>,
  attributes?: SpanAttributes
): Promise<T> {
  return Sentry.startSpan({ name, op, attributes }, fn);
}

/**
 * Create a traced span for a sync operation
 */
export function startSpanSync<T>(
  name: string,
  op: string,
  fn: () => T,
  attributes?: SpanAttributes
): T {
  return Sentry.startSpan({ name, op, attributes }, fn);
}

/**
 * Common operation types for consistent span naming
 */
export const SpanOp = {
  // Database
  DB_QUERY: "db.query",
  DB_INSERT: "db.insert",
  DB_UPDATE: "db.update",
  DB_DELETE: "db.delete",

  // HTTP
  HTTP_CLIENT: "http.client",
  HTTP_SERVER: "http.server",

  // AI/LLM (gen_ai.* ops are auto-captured by Sentry)
  AI_GENERATE: "ai.generate",
  AI_EMBED: "ai.embed",

  // Tasks
  TASK: "task",
  FUNCTION: "function",

  // Cache
  CACHE_GET: "cache.get",
  CACHE_SET: "cache.set",
} as const;

// ============================================================================
// Vercel AI SDK Telemetry Helper
// ============================================================================

/**
 * Telemetry config for Vercel AI SDK functions.
 * Pass this to generateText, generateObject, streamText, etc.
 *
 * @example
 * ```ts
 * import { aiTelemetry } from "@/lib/metrics";
 * import { generateObject } from "ai";
 *
 * const result = await generateObject({
 *   model: anthropic("claude-sonnet-4-20250514"),
 *   schema: mySchema,
 *   prompt: "...",
 *   experimental_telemetry: aiTelemetry("clause-classifier"),
 * });
 * ```
 */
export function aiTelemetry(functionId: string) {
  return {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    functionId,
  };
}
