/**
 * @fileoverview NDA Score Risks Sub-Function — REFERENCE IMPLEMENTATION
 *
 * ============================================================================
 * CONTEXT FOR CLAUDE CODE
 * ============================================================================
 *
 * This file replaces inngest/functions/nda-score-risks.ts.
 *
 * BUGS FIXED:
 *
 * 1. DATA CORRECTNESS BUG — lastRiskResult only reflects the LAST batch.
 *
 *    The original batched clauses into groups of 3 and called runRiskScorerAgent
 *    on each batch. The agent's calculateOverallRisk(), computeRiskDistribution(),
 *    and generateExecutiveSummary() all operate on the assessments passed to them.
 *    When called with 3 clauses, they compute metrics for ONLY those 3 clauses.
 *
 *    The orchestrator used `lastRiskResult!` to grab the final batch's metrics:
 *      - overallRiskScore: computed from last 3 clauses, not all 30
 *      - executiveSummary: describes last 3 clauses, not all 30
 *      - riskDistribution: counts from last 3 clauses, not all 30
 *
 *    The weighted risk from calculateWeightedRisk() was correct (it processes
 *    all assessments), which is why the weighted score in the DB was fine.
 *    But the executive summary and risk distribution were wrong.
 *
 *    FIX: Send ALL clauses to runRiskScorerAgent in a single call.
 *    The agent iterates clause-by-clause internally anyway — the batch size
 *    at the orchestrator level never changed the number of LLM calls.
 *    With all clauses in one call, calculateOverallRisk, generateExecutiveSummary,
 *    and computeRiskDistribution all see the full picture.
 *
 * 2. STEP EXPLOSION — N steps for N batches.
 *
 *    SCORER_BATCH_SIZE = 3, so a 30-clause NDA created 10 steps
 *    (score-batch-0 through score-batch-9). Each step costs:
 *    - A scheduler round-trip (500ms-2s without checkpointing)
 *    - A full function re-invocation (withTenantContext setup)
 *    - A step memoization replay of all previous steps
 *
 *    FIX: Single step.run('score-clauses') that calls runRiskScorerAgent once
 *    with all clauses. The agent handles its own internal iteration.
 *
 * 3. setTimeout RATE LIMITING — broken and wasteful.
 *
 *    `await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.claude.delayMs))`
 *    inside step.run() doesn't actually rate-limit. Inngest replays the entire
 *    function body on each step re-invocation, so the setTimeout runs on every
 *    replay even for memoized steps. And it wastes 1 second of serverless
 *    compute time per batch doing nothing.
 *
 *    FIX: Remove entirely. Rate limiting should be handled at the Inngest
 *    function level via throttle/concurrency config (see inngest-patterns
 *    memory), not inside step code.
 *
 * 4. PROGRESS WRITES COUPLED TO BATCH STEPS.
 *
 *    Each batch step did an inline ctx.db.update(analyses) for progress.
 *    With the single-step consolidation, we lose per-batch granularity,
 *    but this is acceptable because:
 *    - The scoring stage is 60-80% of the progress bar (20% range)
 *    - Users see "Scoring clauses..." for ~30s-2min either way
 *    - The step before (read-classifications) and after (persist + weighted-risk)
 *      both update progress, so the UI isn't stuck
 *
 *    If per-clause progress is needed in the future, the risk scorer agent
 *    should accept an onProgress callback and use Inngest Realtime channels.
 *
 * 5. NON-NULL ASSERTIONS on lastRiskResult.
 *
 *    `lastRiskResult!.overallRiskScore` was technically safe (the loop always
 *    runs at least once if clauses.length > 0) but the ! assertion masked the
 *    data correctness bug. With a single agent call, the result is always defined.
 *
 * WHAT DIDN'T CHANGE:
 * - The risk scorer agent itself (agents/risk-scorer.ts) — no changes needed
 * - The DB queries (persistRiskAssessments, calculateWeightedRisk)
 * - The classification reconstruction logic (read-classifications step)
 * - The return type (matches what analyze-nda.ts expects)
 *
 * STEP BUDGET IMPACT:
 * Original: 2 + N steps (read-classifications, score-batch-0..N, persist)
 *   → 30 clauses / batch 3 = 12 steps
 * New: 3 steps (read-classifications, score-clauses, persist-and-compute)
 *   → Always 3 steps regardless of clause count
 *
 * TIMEOUT CONSIDERATIONS:
 * The risk scorer agent now batches all clauses into a single LLM call.
 * Evidence retrieval for all clauses runs in parallel (~100ms total),
 * then one LLM call processes all clauses at once (~20-30s for 24 clauses).
 * Total step time: ~25-35s, well within Inngest's 300s step timeout.
 *
 * @module inngest/functions/nda-score-risks
 */

import { inngest, RETRY_CONFIG, withTenantContext } from "@/inngest";
import { runRiskScorerAgent } from "@/agents/risk-scorer";
import type { RiskScorerOutput } from "@/agents/risk-scorer";
import { BudgetTracker } from "@/lib/ai/budget";
import { analyses, chunkClassifications } from "@/db/schema/analyses";
import { documentChunks } from "@/db/schema/documents";
import {
  persistRiskAssessments,
  calculateWeightedRisk,
} from "@/db/queries/risk-scoring";
import type { ClassifiedClause } from "@/agents/classifier";
import type { CuadCategory } from "@/agents/types";
import { eq, and, asc } from "drizzle-orm";

export const ndaScoreRisks = inngest.createFunction(
  {
    id: "nda-score-risks",
    name: "NDA Score Risks",
    retries: RETRY_CONFIG.default.retries,
    cancelOn: [
      {
        event: "nda/analysis.cancelled",
        if: "async.data.analysisId == event.data.analysisId",
      },
    ],
  },
  { event: "nda/score-risks.requested" },
  async ({ event, step }) => {
    const { documentId, tenantId, analysisId } = event.data;

    return await withTenantContext(tenantId, async (ctx) => {
      // ================================================================
      // Step 1: Read classifications + chunk content from DB
      // ================================================================
      // This step is identical to the original. The classification
      // reconstruction is a pure DB read — no LLM calls, no external APIs.
      // It's correctly isolated as its own step for memoization: if step 2
      // fails and retries, this DB read doesn't re-execute.
      const clauses = (await step.run("read-classifications", async () => {
        // Get primary classifications with chunk content
        const primaries = await ctx.db
          .select({
            chunkId: chunkClassifications.chunkId,
            category: chunkClassifications.category,
            confidence: chunkClassifications.confidence,
            rationale: chunkClassifications.rationale,
            chunkIndex: chunkClassifications.chunkIndex,
            startPosition: chunkClassifications.startPosition,
            endPosition: chunkClassifications.endPosition,
            content: documentChunks.content,
          })
          .from(chunkClassifications)
          .innerJoin(
            documentChunks,
            eq(documentChunks.id, chunkClassifications.chunkId),
          )
          .where(
            and(
              eq(chunkClassifications.analysisId, analysisId),
              eq(chunkClassifications.isPrimary, true),
            ),
          )
          .orderBy(asc(chunkClassifications.chunkIndex));

        // Get all secondary classifications for these chunks
        const secondaries = await ctx.db
          .select({
            chunkId: chunkClassifications.chunkId,
            category: chunkClassifications.category,
          })
          .from(chunkClassifications)
          .where(
            and(
              eq(chunkClassifications.analysisId, analysisId),
              eq(chunkClassifications.isPrimary, false),
            ),
          );

        // Group secondaries by chunkId
        const secondaryMap = new Map<string, string[]>();
        for (const s of secondaries) {
          const existing = secondaryMap.get(s.chunkId) ?? [];
          existing.push(s.category);
          secondaryMap.set(s.chunkId, existing);
        }

        // Reconstruct ClassifiedClause[]
        // Filter out Uncategorized — the risk scorer can't score them
        return primaries
          .filter((p) => p.category !== "Uncategorized")
          .map((p) => ({
            chunkId: p.chunkId,
            clauseText: p.content,
            category: p.category as CuadCategory,
            secondaryCategories: (secondaryMap.get(p.chunkId) ??
              []) as CuadCategory[],
            confidence: p.confidence,
            reasoning: p.rationale ?? "",
            startPosition: p.startPosition ?? 0,
            endPosition: p.endPosition ?? 0,
          }));
      })) as unknown as ClassifiedClause[];

      // ================================================================
      // Step 2: Score ALL clauses in a single agent call
      // ================================================================
      //
      // The agent now batches all clauses into a single LLM call:
      //   1. All evidence searches fire in parallel (N×3 concurrent, ~100ms)
      //   2. One batched prompt with per-clause evidence sections
      //   3. One LLM call returns all assessments (~20-30s for 24 clauses)
      //   4. Summary functions see ALL clauses (fixes data correctness bug)
      //
      // Total: ~25-35s vs ~120-240s with the sequential per-clause approach.
      //
      const scorerResult = (await step.run("score-clauses", async () => {
        if (clauses.length === 0) {
          // No clauses to score — return empty result
          // This can happen if all chunks were classified as Uncategorized
          return {
            assessments: [],
            overallRiskScore: 0,
            overallRiskLevel: "standard" as const,
            perspective: "balanced" as const,
            executiveSummary: "No scorable clauses found in document.",
            riskDistribution: {
              standard: 0,
              cautious: 0,
              aggressive: 0,
              unknown: 0,
            },
            tokenUsage: { inputTokens: 0, outputTokens: 0 },
          } satisfies RiskScorerOutput;
        }

        // Update progress before starting (fire-and-forget)
        ctx.db
          .update(analyses)
          .set({
            progressStage: "scoring",
            progressPercent: 60,
            progressMessage: `Scoring ${clauses.length} clauses...`,
            updatedAt: new Date(),
          })
          .where(eq(analyses.id, analysisId))
          .catch(() => {}); // Don't fail the step on progress write failure

        const budgetTracker = new BudgetTracker();

        const result = await runRiskScorerAgent({
          clauses,
          budgetTracker,
          perspective: "balanced",
        });

        // Return the full result — now computed from ALL clauses, not just a batch
        const usage = budgetTracker.getUsage();
        return {
          ...result,
          tokenUsage: {
            inputTokens: usage.total.input,
            outputTokens: usage.total.output,
          },
        };
      })) as RiskScorerOutput;

      // ================================================================
      // Step 3: Persist risk assessments + calculate weighted risk
      // ================================================================
      //
      // Combined into one step because:
      // - persistRiskAssessments is a batch INSERT (fast, ~50-100ms)
      // - calculateWeightedRisk is a SELECT + computation (fast, ~20ms)
      // - Splitting them would add a scheduler round-trip for no benefit
      //
      // If persistRiskAssessments fails, the retry re-runs both operations.
      // persistRiskAssessments uses ON CONFLICT DO UPDATE, so re-running
      // after a partial write is safe (idempotent).
      //
      const weightedRisk = (await step.run(
        "persist-and-compute-weighted-risk",
        async () => {
          await persistRiskAssessments(
            ctx.db,
            tenantId,
            analysisId,
            documentId,
            scorerResult.assessments,
            scorerResult.perspective,
          );

          // Update progress after persist
          await ctx.db
            .update(analyses)
            .set({
              progressStage: "scoring",
              progressPercent: 80,
              progressMessage: "Risk scoring complete",
              updatedAt: new Date(),
            })
            .where(eq(analyses.id, analysisId));

          return await calculateWeightedRisk(ctx.db, scorerResult.assessments);
        },
      )) as { score: number; level: string };

      // ================================================================
      // Return: all metrics now computed from ALL clauses
      // ================================================================
      //
      // BEFORE (broken):
      //   overallRiskScore: lastRiskResult!.overallRiskScore  ← last 3 clauses
      //   executiveSummary: lastRiskResult!.executiveSummary   ← last 3 clauses
      //   riskDistribution: lastRiskResult!.riskDistribution   ← last 3 clauses
      //
      // AFTER (correct):
      //   overallRiskScore: scorerResult.overallRiskScore  ← ALL clauses
      //   executiveSummary: scorerResult.executiveSummary   ← ALL clauses
      //   riskDistribution: scorerResult.riskDistribution   ← ALL clauses
      //
      return {
        overallRiskScore: scorerResult.overallRiskScore,
        overallRiskLevel: scorerResult.overallRiskLevel,
        weightedRiskScore: weightedRisk.score,
        weightedRiskLevel: weightedRisk.level,
        executiveSummary: scorerResult.executiveSummary,
        perspective: scorerResult.perspective,
        riskDistribution: scorerResult.riskDistribution,
        assessmentCount: scorerResult.assessments.length,
        tokenUsage: scorerResult.tokenUsage,
      };
    });
  },
);
