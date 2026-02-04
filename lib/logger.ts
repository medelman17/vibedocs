import * as Sentry from "@sentry/nextjs";

/**
 * Structured logger using Sentry.logger
 *
 * @example
 * ```ts
 * import { logger } from "@/lib/logger";
 *
 * // Basic logging
 * logger.info("User logged in", { userId: "123" });
 * logger.warn("Rate limit approaching", { current: 95, limit: 100 });
 * logger.error("Payment failed", { orderId: "456", error: err.message });
 *
 * // Template literal formatting (creates searchable attributes)
 * logger.info(Sentry.logger.fmt`User ${userId} purchased ${productName}`);
 * ```
 */
export const logger = Sentry.logger;

// Re-export for template literal formatting
export const fmt = Sentry.logger.fmt;
