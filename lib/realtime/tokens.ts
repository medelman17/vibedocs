/**
 * @fileoverview Server-Side Realtime Token Generation
 *
 * Generates scoped subscription tokens for Inngest Realtime channels.
 * Used by both the web UI (server actions) and Word Add-in (API routes)
 * to grant clients access to analysis progress streams.
 *
 * Auth checks are NOT performed here - callers are responsible:
 * - Web UI: uses `withTenant()` from DAL before calling
 * - Word Add-in: uses `verifyAddInAuth()` before calling
 *
 * @module lib/realtime/tokens
 * @see {@link https://www.inngest.com/docs/features/realtime}
 */

import { getSubscriptionToken, type Realtime } from "@inngest/realtime"
import { inngest } from "@/inngest/client"
import { analysisChannel } from "@/inngest/channels"

/**
 * Typed subscription token for analysis progress.
 * Scoped to a single analysis channel with the "progress" topic.
 */
export type AnalysisToken = Realtime.Token<
  typeof analysisChannel,
  ["progress"]
>

/**
 * Generate a subscription token for an analysis progress channel.
 *
 * The token is scoped to a specific analysis ID and only grants access
 * to the "progress" topic. Callers must verify auth and tenant ownership
 * before invoking this function.
 *
 * @param analysisId - The analysis to subscribe to
 * @returns A scoped subscription token for use with useInngestSubscription or subscribe()
 *
 * @example
 * ```typescript
 * // In a server action (web UI):
 * const { tenantId } = await withTenant()
 * // ... verify analysis belongs to tenant ...
 * const token = await generateAnalysisToken(analysisId)
 *
 * // In an API route (Word Add-in):
 * const authContext = await verifyAddInAuth(request)
 * // ... verify analysis belongs to tenant ...
 * const token = await generateAnalysisToken(analysisId)
 * ```
 */
export async function generateAnalysisToken(
  analysisId: string
): Promise<AnalysisToken> {
  return await getSubscriptionToken(inngest, {
    channel: analysisChannel(analysisId),
    topics: ["progress"],
  })
}
