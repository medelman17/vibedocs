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

import { inngest } from "@/inngest";
import { db } from "@/db/client";
import { downloadDataset } from "@/lib/datasets/downloader";
import type { DatasetSource } from "@/lib/datasets";
import { createProgress } from "./utils/progress-tracker";
import { sql } from "drizzle-orm";

/**
 * Coordinate the full bootstrap pipeline.
 *
 * Uses idiomatic Inngest patterns:
 * - Parallel operations within steps (Promise.all)
 * - Batch fan-out with single step.sendEvent call
 * - step.waitForEvent to await worker completion
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
    const { sources, forceRefresh = false } = event.data;
    const startedAt = Date.now();

    // Step 1: Download all datasets (parallel within single step)
    const downloadResults = await step.run("download-datasets", async () => {
      const results = await Promise.all(
        sources.map(async (source: DatasetSource) => {
          const result = await downloadDataset(source, forceRefresh);
          return { source, cached: result.cached };
        }),
      );
      return Object.fromEntries(results.map(({ source, cached }) => [source, cached]));
    });

    // Step 2: Create progress records (parallel within single step)
    const progressIds = await step.run("create-progress-records", async () => {
      const results = await Promise.all(
        sources.map(async (source: DatasetSource) => {
          const progress = await createProgress(source);
          return { source, progressId: progress.id };
        }),
      );
      return Object.fromEntries(
        results.map(({ source, progressId }) => [source, progressId]),
      ) as Record<DatasetSource, string>;
    });

    // Step 3: Fan-out to source workers (idiomatic batch pattern)
    await step.sendEvent(
      "fan-out-sources",
      sources.map((source: DatasetSource) => ({
        name: "bootstrap/source.process" as const,
        data: {
          source,
          progressId: progressIds[source],
          forceRefresh,
        },
      })),
    );

    // Step 4: Wait for all sources to complete before creating indexes
    await Promise.all(
      sources.map((source: DatasetSource) =>
        step.waitForEvent(`wait-for-${source}`, {
          event: "bootstrap/source.completed",
          if: `async.data.source == "${source}"`,
          timeout: "2h",
        }),
      ),
    );

    // Step 5: Create HNSW indexes after all data loaded
    await step.run("create-hnsw-indexes", async () => {
      await db.execute(sql`DROP INDEX IF EXISTS ref_embeddings_hnsw_idx`);
      await db.execute(sql`
        CREATE INDEX ref_embeddings_hnsw_idx
        ON reference_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
    });

    const durationMs = Date.now() - startedAt;

    // Emit completion event
    await step.sendEvent("emit-completed", {
      name: "bootstrap/ingest.completed",
      data: {
        sources,
        totalRecords: 0,
        totalEmbeddings: 0,
        durationMs,
      },
    });

    return {
      success: true,
      sources,
      downloaded: Object.entries(downloadResults)
        .filter(([, cached]) => !cached)
        .map(([source]) => source),
      progressIds,
      durationMs,
    };
  },
);
