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
