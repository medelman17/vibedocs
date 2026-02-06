/**
 * @fileoverview NDA Gap Analysis Sub-Function — REFERENCE IMPLEMENTATION
 *
 * ============================================================================
 * CONTEXT FOR CLAUDE CODE
 * ============================================================================
 *
 * This file replaces inngest/functions/nda-analyze-gaps.ts.
 *
 * BUGS FIXED:
 *
 * 1. CONFIDENCE FIELD MISMATCH — latent data correctness bug.
 *
 *    The write path (persistRiskAssessments in db/queries/risk-scoring.ts):
 *      clauseExtractions.confidence     ← assessment.clause.confidence  (CLASSIFICATION confidence)
 *      clauseExtractions.metadata       ← { riskConfidence: assessment.confidence }  (RISK confidence)
 *
 *    The read path (original gap analyst orchestrator):
 *      confidence: e.confidence  → reads CLASSIFICATION confidence
 *
 *    But it assigns this to RiskAssessmentResult.confidence, which is the
 *    risk scorer's confidence in its own assessment — a fundamentally different
 *    metric. Classification confidence says "how sure am I this is a Non-Compete?"
 *    Risk confidence says "how sure am I this Non-Compete is aggressive?"
 *
 *    Currently harmless because detectGapStatus() only checks riskLevel, not
 *    confidence. But any future code that reads assessment.confidence from
 *    the reconstructed objects would get wrong values.
 *
 *    FIX: Read from metadata.riskConfidence with fallback to e.confidence.
 *
 * 2. UNNECESSARY `update-progress` STEP — wasteful scheduler round-trip.
 *
 *    The original had 3 steps:
 *      1. read-analysis-data (DB reads)
 *      2. gap-analyst-agent (agent call)
 *      3. update-progress (single DB write: progressPercent = 90)
 *
 *    Step 3 costs 500ms-2s of scheduler overhead for a ~20ms DB write.
 *    It doesn't need its own retry boundary because if it fails, the
 *    orchestrator (analyze-nda.ts) will set progress to 100% anyway
 *    when the gap analysis completes.
 *
 *    FIX: Fold progress write into the gap-analyst-agent step.
 *    Now 2 steps total: read-analysis-data, run-gap-analyst.
 *
 * 3. BUDGETTRACKER CREATED OUTSIDE STEP BOUNDARY — fragile on replays.
 *
 *    `const budgetTracker = new BudgetTracker()` was created in the outer
 *    closure. On Inngest replays, this creates a fresh empty tracker. The
 *    agent records into it, and getUsage() returns the agent's usage.
 *    This works by accident because the agent does a single .record() call.
 *
 *    FIX: Create BudgetTracker inside the step that uses it. The step
 *    returns serializable token usage data, which is all the orchestrator
 *    needs.
 *
 * WHAT DIDN'T CHANGE:
 * - The gap analyst agent itself (agents/gap-analyst.ts) — not modified here
 * - DB schema or queries
 * - The return type (matches what analyze-nda.ts expects)
 * - Classification reconstruction logic (kept as-is, but see DRY note below)
 *
 * ============================================================================
 * DRY VIOLATION: CLAUSE RECONSTRUCTION
 * ============================================================================
 *
 * The exact same pattern to reconstruct ClassifiedClause[] from
 * chunkClassifications + documentChunks appears in THREE places:
 *   1. nda-score-risks.ts (read-classifications step)
 *   2. nda-analyze-gaps.ts (read-analysis-data step)
 *   3. Any future function that needs classified clauses
 *
 * Recommended extraction:
 *
 *   // db/queries/classifications.ts
 *   export async function reconstructClassifiedClauses(
 *     dbClient: Database,
 *     analysisId: string
 *   ): Promise<ClassifiedClause[]> { ... }
 *
 * This wasn't done here to keep each reference implementation self-contained
 * and minimize blast radius. But it should be a follow-up.
 *
 * ============================================================================
 * AGENT-LEVEL PERFORMANCE OPPORTUNITIES (not addressed here)
 * ============================================================================
 *
 * The gap analyst agent (agents/gap-analyst.ts) has two significant
 * latency bottlenecks that are independent of the orchestrator:
 *
 * A) SEQUENTIAL HYPOTHESIS TESTS:
 *    The agent tests 5 ContractNLI hypotheses sequentially. Each is an
 *    independent LLM call (~3-5s). Total: 15-25s serial wait.
 *    Fix: Promise.all() on the 5 hypothesis calls → 3-5s total.
 *
 * B) SEQUENTIAL TEMPLATE RETRIEVAL:
 *    For each gap category, findTemplateBaselines() is called in a loop.
 *    These are independent vector searches (~50-100ms each, but N of them).
 *    Fix: Batch all gap categories, Promise.all() the searches.
 *
 * Combined, these would cut the agent's wall time by ~60-70%.
 * File a separate task for agents/gap-analyst.ts optimization.
 *
 * ============================================================================
 * STEP BUDGET IMPACT
 * ============================================================================
 *
 * Original: 3 steps (read-analysis-data, gap-analyst-agent, update-progress)
 * New: 2 steps (read-analysis-data, run-gap-analyst)
 *
 * @module inngest/functions/nda-analyze-gaps
 */

import { inngest, RETRY_CONFIG, withTenantContext } from "@/inngest";
import { runGapAnalystAgent } from "@/agents/gap-analyst";
import type { GapAnalystOutput } from "@/agents/gap-analyst";
import { BudgetTracker } from "@/lib/ai/budget";
import {
  analyses,
  clauseExtractions,
  chunkClassifications,
} from "@/db/schema/analyses";
import { documentChunks } from "@/db/schema/documents";
import type { ClassifiedClause } from "@/agents/classifier";
import type { RiskAssessmentResult } from "@/agents/risk-scorer";
import type { CuadCategory, RiskLevel } from "@/agents/types";
import { eq, and, asc } from "drizzle-orm";

export const ndaAnalyzeGaps = inngest.createFunction(
  {
    id: "nda-analyze-gaps",
    name: "NDA Analyze Gaps",
    retries: RETRY_CONFIG.default.retries,
    cancelOn: [
      {
        event: "nda/analysis.cancelled",
        if: "async.data.analysisId == event.data.analysisId",
      },
    ],
  },
  { event: "nda/analyze-gaps.requested" },
  async ({ event, step }) => {
    const { tenantId, analysisId, documentSummary } = event.data;

    return await withTenantContext(tenantId, async (ctx) => {
      // ================================================================
      // Step 1: Read classified clauses + risk assessments from DB
      // ================================================================
      //
      // Isolated as its own step for memoization: if step 2 (the agent)
      // fails and retries, these DB reads don't re-execute.
      //
      // NOTE: This clause reconstruction logic is copy-pasted from
      // nda-score-risks.ts. See header comment for DRY extraction plan.
      //
      const { clauses, assessments } = await step.run(
        "read-analysis-data",
        async () => {
          // ---- Reconstruct ClassifiedClause[] ----

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

          const secondaryMap = new Map<string, string[]>();
          for (const s of secondaries) {
            const existing = secondaryMap.get(s.chunkId) ?? [];
            existing.push(s.category);
            secondaryMap.set(s.chunkId, existing);
          }

          const reconstructedClauses: ClassifiedClause[] = primaries
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

          // ---- Reconstruct RiskAssessmentResult[] ----

          const extractions = await ctx.db
            .select()
            .from(clauseExtractions)
            .where(eq(clauseExtractions.analysisId, analysisId));

          const clauseMap = new Map(
            reconstructedClauses.map((c) => [c.chunkId, c]),
          );

          const reconstructedAssessments: RiskAssessmentResult[] = extractions
            .filter((e) => e.chunkId && clauseMap.has(e.chunkId))
            .map((e) => {
              const clause = clauseMap.get(e.chunkId!)!;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const evidence = (e.evidence as any) ?? {
                citations: [],
                references: [],
              };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const meta = (e.metadata as any) ?? {};

              return {
                clauseId: e.id,
                clause,
                riskLevel: e.riskLevel as RiskLevel,
                // FIX: Read the RISK ASSESSMENT confidence, not the
                // CLASSIFICATION confidence.
                //
                // persistRiskAssessments stores them as:
                //   clauseExtractions.confidence     = clause.confidence  (classification)
                //   clauseExtractions.metadata        = { riskConfidence: assessment.confidence }
                //
                // RiskAssessmentResult.confidence should be the risk scorer's
                // confidence in its risk level determination.
                //
                // Fallback to e.confidence for rows written before this fix
                // (they'll have wrong values but at least won't NPE).
                confidence: meta.riskConfidence ?? e.confidence,
                explanation: e.riskExplanation ?? "",
                negotiationSuggestion: meta.negotiationSuggestion,
                atypicalLanguage: meta.atypicalLanguage ?? false,
                atypicalLanguageNote: meta.atypicalLanguageNote,
                evidence,
                startPosition: e.startPosition ?? 0,
                endPosition: e.endPosition ?? 0,
              };
            });

          return {
            clauses: reconstructedClauses,
            assessments: reconstructedAssessments,
          };
        },
      );

      // ================================================================
      // Step 2: Run gap analyst agent + update progress
      // ================================================================
      //
      // Merged the former step 3 (update-progress) into this step.
      // The progress write happens after the agent completes, so the UI
      // shows "Scoring..." → "Gap analysis complete" with no wasted
      // scheduler round-trip in between.
      //
      // BudgetTracker is created inside the step so it's never stale
      // across Inngest replays. The step returns serializable data only.
      //
      const gapResult = (await step.run("run-gap-analyst", async () => {
        const budgetTracker = new BudgetTracker();

        const result = await runGapAnalystAgent({
          clauses: clauses as ClassifiedClause[],
          assessments: assessments as RiskAssessmentResult[],
          documentSummary,
          budgetTracker,
        });

        // Progress update (was a separate step, now inline)
        await ctx.db
          .update(analyses)
          .set({
            progressStage: "analyzing_gaps",
            progressPercent: 90,
            progressMessage: "Gap analysis complete",
            updatedAt: new Date(),
          })
          .where(eq(analyses.id, analysisId));

        return {
          gapAnalysis: result.gapAnalysis,
          tokenUsage: budgetTracker.getUsage(),
        };
      })) as {
        gapAnalysis: GapAnalystOutput["gapAnalysis"];
        tokenUsage: ReturnType<BudgetTracker["getUsage"]>;
      };

      // ================================================================
      // Return
      // ================================================================
      return {
        gapAnalysis: gapResult.gapAnalysis,
        tokenUsage: gapResult.tokenUsage,
      };
    });
  },
);
