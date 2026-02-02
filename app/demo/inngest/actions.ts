"use server"

import { inngest } from "@/inngest/client"

export type DemoResult = {
  success: boolean
  eventId?: string
  error?: string
}

/**
 * Send a demo/process event to Inngest
 */
export async function triggerDemoProcess(
  documentId: string,
  message: string
): Promise<DemoResult> {
  try {
    const result = await inngest.send({
      name: "demo/process",
      data: {
        documentId,
        message,
      },
    })
    return {
      success: true,
      eventId: result.ids[0],
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Send a demo/multi-step event to Inngest
 */
export async function triggerDemoMultiStep(
  steps: number,
  delayMs: number
): Promise<DemoResult> {
  try {
    const result = await inngest.send({
      name: "demo/multi-step",
      data: {
        steps,
        delayMs,
      },
    })
    return {
      success: true,
      eventId: result.ids[0],
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
