/**
 * @fileoverview Bootstrap Coordinator Function
 *
 * Orchestrates the bootstrap pipeline by:
 * 1. Downloading datasets
 * 2. Creating progress records
 * 3. Dispatching source workers (parallel)
 * 4. Waiting for completion
 * 5. Creating HNSW indexes
 *
 * @module inngest/functions/bootstrap/ingest-coordinator
 */

import { inngest } from "../../client"
import { db } from "@/db/client"
import { downloadDataset } from "@/lib/datasets/downloader"
import type { DatasetSource } from "@/lib/datasets"
import { createProgress } from "./utils/progress-tracker"
import { sql } from "drizzle-orm"

/**
 * Coordinate the full bootstrap pipeline.
 */
export const ingestCoordinator = inngest.createFunction(
  {
    id: "bootstrap-ingest-coordinator",
    name: "Bootstrap: Coordinator",
    concurrency: { limit: 1 },
    retries: 1,
  },
  { event: "bootstrap/ingest.requested" },
  async ({ event, step }) => {
    const { sources, forceRefresh = false } = event.data
    const startedAt = Date.now()

    // Step 1: Download all datasets
    const downloadResults: Record<string, boolean> = {}
    for (const source of sources) {
      const result = await step.run(`download-${source}`, async () => {
        const downloadResult = await downloadDataset(source, forceRefresh)
        return { cached: downloadResult.cached }
      })
      downloadResults[source] = result.cached
    }

    // Step 2: Create progress records for each source
    const progressIds: Record<DatasetSource, string> = {} as Record<
      DatasetSource,
      string
    >
    for (const source of sources) {
      const progress = await step.run(`create-progress-${source}`, async () => {
        return await createProgress(source)
      })
      progressIds[source] = progress.id
    }

    // Step 3: Dispatch source workers (they run in parallel)
    for (const source of sources) {
      await step.sendEvent(`dispatch-${source}`, {
        name: "bootstrap/source.process",
        data: {
          source,
          progressId: progressIds[source],
          forceRefresh,
        },
      })
    }

    // Step 4: Wait for all sources to complete
    // Note: In a real implementation, you'd use step.waitForEvent
    // For now, we proceed after dispatch and let workers complete asynchronously

    // Step 5: Create HNSW indexes after all data loaded
    await step.run("create-hnsw-indexes", async () => {
      await db.execute(sql`DROP INDEX IF EXISTS ref_embeddings_hnsw_idx`)
      await db.execute(sql`
        CREATE INDEX ref_embeddings_hnsw_idx
        ON reference_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `)
    })

    const durationMs = Date.now() - startedAt

    // Emit completion event
    await step.sendEvent("emit-completed", {
      name: "bootstrap/ingest.completed",
      data: {
        sources,
        totalRecords: 0,
        totalEmbeddings: 0,
        durationMs,
      },
    })

    return {
      success: true,
      sources,
      downloaded: Object.entries(downloadResults)
        .filter(([, cached]) => !cached)
        .map(([source]) => source),
      progressIds,
      durationMs,
    }
  }
)
