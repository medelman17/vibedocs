/**
 * @fileoverview Inngest Realtime Channel Definitions
 *
 * Typed channel definitions for real-time progress streaming.
 * Each analysis gets its own channel scoped by analysis ID.
 *
 * IMPORTANT: Do NOT re-export from inngest/index.ts barrel.
 * Import directly: `import { analysisChannel } from "@/inngest/channels"`
 *
 * @module inngest/channels
 * @see {@link https://www.inngest.com/docs/features/realtime}
 */

import { channel, topic } from "@inngest/realtime"
import { z } from "zod"

/**
 * Analysis progress channel - scoped per analysis ID.
 *
 * Each running analysis publishes progress updates to its own channel,
 * ensuring clients only receive events for the analysis they're watching.
 *
 * @example
 * ```typescript
 * // Publishing (in Inngest function handler):
 * await publish(analysisChannel(analysisId).progress({ stage, percent, message }))
 *
 * // Subscribing (via token):
 * const token = await getSubscriptionToken(inngest, {
 *   channel: analysisChannel(analysisId),
 *   topics: ["progress"],
 * })
 * ```
 */
export const analysisChannel = channel(
  (analysisId: string) => `analysis:${analysisId}`
).addTopic(
  topic("progress").schema(
    z.object({
      /** Pipeline stage name */
      stage: z.string(),
      /** Progress percentage (0-100) */
      percent: z.number().min(0).max(100),
      /** Human-readable progress message */
      message: z.string(),
      /** Optional chunk-level metadata */
      metadata: z
        .object({
          chunksProcessed: z.number().optional(),
          totalChunks: z.number().optional(),
        })
        .optional(),
    })
  )
)
