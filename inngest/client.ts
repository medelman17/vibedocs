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
import { realtimeMiddleware } from "@inngest/realtime/middleware"
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
  middleware: [realtimeMiddleware()],
})

/**
 * Type helper for Inngest function context.
 * Use when you need to type step functions or event handlers.
 */
export type InngestClient = typeof inngest
