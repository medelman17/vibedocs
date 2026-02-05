/**
 * @fileoverview Cancellation Cleanup Handler
 *
 * Listens for the `inngest/function.cancelled` system event, which fires
 * whenever an Inngest function is cancelled via `cancelOn`. Updates the
 * analysis status to 'cancelled' in the database.
 *
 * This is a system event handler - `inngest/function.cancelled` is NOT
 * added to the InngestEvents type map since it's an Inngest internal event.
 *
 * @module inngest/functions/cleanup-cancelled
 */

import { inngest, RETRY_CONFIG, withTenantContext } from "@/inngest"
import { analyses } from "@/db/schema/analyses"
import { eq } from "drizzle-orm"
import { sql } from "drizzle-orm"

/**
 * Cleanup handler for cancelled analysis functions.
 *
 * When analyzeNda or analyzeNdaAfterOcr is cancelled via cancelOn,
 * Inngest fires `inngest/function.cancelled`. This handler catches that
 * event and marks the analysis as 'cancelled' in the database.
 *
 * Only processes cancellations for analysis pipeline functions (analyze-nda
 * and analyze-nda-after-ocr). Other cancelled functions are skipped.
 */
export const cleanupCancelledAnalysis = inngest.createFunction(
  {
    id: "cleanup-cancelled-analysis",
    name: "Cleanup After Cancelled Analysis",
    retries: RETRY_CONFIG.nonCritical.retries,
  },
  // @ts-expect-error -- inngest/function.cancelled is a system event not in InngestEvents
  { event: "inngest/function.cancelled" },
  async ({ event, step }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventData = event.data as any

    const functionId = eventData?.function_id as string | undefined
    if (functionId !== "analyze-nda" && functionId !== "analyze-nda-after-ocr") {
      return { skipped: true, reason: `Not an analysis function: ${functionId}` }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalEvent = eventData?.event as any
    const analysisId = originalEvent?.data?.analysisId as string | undefined
    const tenantId = originalEvent?.data?.tenantId as string | undefined

    if (!analysisId || !tenantId) {
      return {
        skipped: true,
        reason: "Missing analysisId or tenantId in original event",
      }
    }

    await step.run("mark-cancelled", async () => {
      await withTenantContext(tenantId, async (ctx) => {
        await ctx.db
          .update(analyses)
          .set({
            status: "cancelled",
            progressStage: "cancelled",
            progressMessage: "Analysis cancelled by user",
            updatedAt: new Date(),
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              cancelledAt: new Date().toISOString(),
            })}::jsonb`,
          })
          .where(eq(analyses.id, analysisId))
      })
    })

    return { analysisId, cancelled: true }
  }
)
