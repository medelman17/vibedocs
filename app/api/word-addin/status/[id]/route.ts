/**
 * @fileoverview Word Add-in Analysis Status SSE Endpoint
 *
 * Provides real-time progress updates via Server-Sent Events (SSE)
 * for analysis jobs triggered from the Word Add-in.
 *
 * @module app/api/word-addin/status/[id]
 */

import { db } from "@/db"
import { analyses } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { verifyAddInAuth } from "@/lib/word-addin-auth"

/**
 * Progress stages with their corresponding percentages
 */
const STAGE_PROGRESS: Record<string, { percent: number; message: string }> = {
  pending: { percent: 0, message: "Waiting to start..." },
  processing: { percent: 10, message: "Starting analysis..." },
  parsing: { percent: 20, message: "Parsing document structure..." },
  classifying: { percent: 40, message: "Classifying clauses..." },
  scoring: { percent: 60, message: "Scoring risk levels..." },
  gap_analysis: { percent: 80, message: "Analyzing gaps..." },
  completed: { percent: 100, message: "Analysis complete" },
  failed: { percent: 0, message: "Analysis failed" },
}

/**
 * GET /api/word-addin/status/[id]
 *
 * SSE endpoint for real-time analysis progress updates.
 *
 * @description
 * Returns a Server-Sent Events stream that emits progress updates
 * for the specified analysis. The stream closes when analysis completes
 * or fails.
 *
 * Event format:
 * ```
 * data: {"stage":"classifying","progress":40,"message":"Classifying clauses..."}
 * ```
 *
 * @param request - HTTP request with Authorization header
 * @param params - Route params containing analysis ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: analysisId } = await params

  try {
    // Authenticate the request
    const authContext = await verifyAddInAuth(request)
    const tenantId = authContext.tenantId

    if (!tenantId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "FORBIDDEN", message: "No organization selected" },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    // Verify analysis exists and belongs to tenant
    const analysis = await db.query.analyses.findFirst({
      where: and(
        eq(analyses.id, analysisId),
        eq(analyses.tenantId, tenantId)
      ),
    })

    if (!analysis) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "NOT_FOUND", message: "Analysis not found" },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        /**
         * Send an SSE event
         */
        function sendEvent(data: object) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        // Send initial state
        const initialStatus = analysis.status as string
        const initialProgress = STAGE_PROGRESS[initialStatus] ?? STAGE_PROGRESS.pending
        sendEvent({
          stage: initialStatus,
          progress: initialProgress.percent,
          message: initialProgress.message,
        })

        // If already completed or failed, close immediately
        if (initialStatus === "completed" || initialStatus === "failed") {
          controller.close()
          return
        }

        // Poll for updates
        // In production, this would be replaced with Inngest event subscription
        const pollInterval = setInterval(async () => {
          try {
            const updated = await db.query.analyses.findFirst({
              where: eq(analyses.id, analysisId),
              columns: { status: true },
            })

            if (!updated) {
              clearInterval(pollInterval)
              sendEvent({
                stage: "failed",
                progress: 0,
                message: "Analysis not found",
              })
              controller.close()
              return
            }

            const status = updated.status as string
            const progress = STAGE_PROGRESS[status] ?? {
              percent: 50,
              message: `Processing: ${status}`,
            }

            sendEvent({
              stage: status,
              progress: progress.percent,
              message: progress.message,
            })

            // Close stream on terminal states
            if (status === "completed" || status === "failed") {
              clearInterval(pollInterval)
              controller.close()
            }
          } catch (error) {
            console.error("[SSE Poll Error]", error)
            clearInterval(pollInterval)
            sendEvent({
              stage: "failed",
              progress: 0,
              message: "Failed to fetch status",
            })
            controller.close()
          }
        }, 2000) // Poll every 2 seconds

        // Cleanup on client disconnect
        request.signal.addEventListener("abort", () => {
          clearInterval(pollInterval)
          controller.close()
        })
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      },
    })
  } catch (error) {
    // Handle known error types
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "UNAUTHORIZED", message: error.message },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      if (error.name === "ForbiddenError") {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "FORBIDDEN", message: error.message },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }
    }

    console.error("[GET /api/word-addin/status/[id]]", error)

    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to get status" },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
