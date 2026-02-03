/**
 * @fileoverview Demo Inngest Function
 *
 * A simple demonstration function to verify Inngest is working.
 * This function simulates a multi-step workflow with progress tracking.
 *
 * @module inngest/functions/demo
 */

import { inngest } from "../client"
import { RETRY_CONFIG } from "../utils/concurrency"

/**
 * Demo function that simulates a document processing workflow.
 *
 * Steps:
 * 1. Validate input
 * 2. Simulate processing with delay
 * 3. Return a result
 *
 * Trigger via Inngest Dev UI:
 * ```json
 * {
 *   "name": "demo/process",
 *   "data": {
 *     "documentId": "test-123",
 *     "message": "Hello from Inngest!"
 *   }
 * }
 * ```
 */
export const demoProcess = inngest.createFunction(
  {
    id: "demo-process",
    name: "Demo: Process Document",
    concurrency: { limit: 5 },
    retries: RETRY_CONFIG.default.retries,
  },
  { event: "demo/process" },
  async ({ event, step }) => {
    const { documentId, message } = event.data as {
      documentId: string
      message?: string
    }

    // Step 1: Validate
    const validation = await step.run("validate-input", async () => {
      console.log(`Validating document: ${documentId}`)
      if (!documentId) {
        throw new Error("documentId is required")
      }
      return { valid: true, documentId }
    })

    // Step 2: Simulate processing with a short delay
    await step.sleep("processing-delay", "2s")

    // Step 3: Process the document
    const result = await step.run("process-document", async () => {
      console.log(`Processing document: ${validation.documentId}`)
      return {
        documentId: validation.documentId,
        message: message || "No message provided",
        processedAt: new Date().toISOString(),
        status: "completed",
      }
    })

    // Step 4: Log completion
    await step.run("log-completion", async () => {
      console.log(`Completed processing: ${JSON.stringify(result)}`)
      return { logged: true }
    })

    return {
      success: true,
      result,
    }
  }
)

/**
 * Demo function that shows step-based workflow with multiple stages.
 *
 * Trigger via Inngest Dev UI:
 * ```json
 * {
 *   "name": "demo/multi-step",
 *   "data": {
 *     "steps": 3,
 *     "delayMs": 1000
 *   }
 * }
 * ```
 */
export const demoMultiStep = inngest.createFunction(
  {
    id: "demo-multi-step",
    name: "Demo: Multi-Step Workflow",
    retries: RETRY_CONFIG.nonCritical.retries,
  },
  { event: "demo/multi-step" },
  async ({ event, step }) => {
    const { steps = 3, delayMs = 1000 } = event.data as {
      steps?: number
      delayMs?: number
    }

    const results: Array<{ step: number; completedAt: string }> = []

    for (let i = 1; i <= steps; i++) {
      // Each iteration is a separate step for durability
      const stepResult = await step.run(`step-${i}`, async () => {
        console.log(`Executing step ${i} of ${steps}`)
        return {
          step: i,
          completedAt: new Date().toISOString(),
        }
      })
      results.push(stepResult)

      // Delay between steps (except after last step)
      if (i < steps) {
        await step.sleep(`delay-after-step-${i}`, `${delayMs}ms`)
      }
    }

    return {
      totalSteps: steps,
      results,
      completedAt: new Date().toISOString(),
    }
  }
)
