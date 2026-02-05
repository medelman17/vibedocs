"use server";

/**
 * @fileoverview Analyses Server Actions
 *
 * This module provides all Server Actions for NDA analysis operations.
 * These actions handle triggering analysis pipelines, retrieving results,
 * managing analysis lifecycle, and exporting reports.
 *
 * All actions enforce tenant isolation via the DAL's `withTenant()` function
 * and return typed responses using the `ApiResponse<T>` envelope.
 *
 * @module app/(dashboard)/analyses/actions
 */

import { z } from "zod";
import { withTenant } from "@/lib/dal";
import { ok, err, type ApiResponse } from "@/lib/api-response";
import { analyses, clauseExtractions, documents } from "@/db/schema";
import { eq, and, desc, gte, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { inngest } from "@/inngest";
import {
  getClassificationsByCategory,
  getClassificationsByPosition,
  type ChunkClassificationRow,
  type ClassificationsByCategory,
} from "@/db/queries/classifications";
import {
  getRiskAssessments as queryRiskAssessments,
  type ClauseExtractionRow,
} from "@/db/queries/risk-scoring";
import { getGapAnalysis } from "@/db/queries/gap-analysis";
import type { EnhancedGapResult } from "@/agents/types";

// ============================================================================
// Types
// ============================================================================

/**
 * Analysis status values matching the database schema.
 */
export type AnalysisStatus = "pending" | "pending_ocr" | "processing" | "completed" | "failed" | "cancelled";

/**
 * Risk level classification for clauses (PRD-aligned taxonomy).
 * - standard: Typical NDA terms, acceptable risk
 * - cautious: Requires review, potentially unfavorable
 * - aggressive: Significantly one-sided, legal review recommended
 * - unknown: Unable to classify risk level
 */
export type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown";

/**
 * Analysis record type inferred from schema with proper typing.
 */
export type Analysis = typeof analyses.$inferSelect;

/**
 * Clause extraction record type.
 */
export type ClauseExtraction = typeof clauseExtractions.$inferSelect;

/**
 * Gap analysis result structure.
 */
export interface GapAnalysisResult {
  missingClauses: string[];
  weakClauses: Array<{ category: string; reason: string }>;
  recommendations: Array<{
    category: string;
    recommendation: string;
    priority: "low" | "medium" | "high";
  }>;
}

/**
 * Lightweight status response for polling.
 */
export interface AnalysisStatusResponse {
  status: AnalysisStatus;
  progress?: {
    step: string;
    percent: number;
  };
}

/**
 * Analysis with joined document info for history views.
 */
export interface AnalysisWithDocument extends Analysis {
  document: {
    id: string;
    title: string;
  };
}

/** Assessment perspective for risk scoring */
export type Perspective = "receiving" | "disclosing" | "balanced";

// Re-export classification and gap types for UI consumption
export type { ChunkClassificationRow, ClassificationsByCategory, ClauseExtractionRow };
export type { EnhancedGapResult };

// ============================================================================
// Input Schemas
// ============================================================================

const triggerAnalysisSchema = z.object({
  documentId: z.string().uuid("Invalid document ID"),
});

const getAnalysisClausesSchema = z.object({
  analysisId: z.string().uuid("Invalid analysis ID"),
  filters: z
    .object({
      category: z.string().optional(),
      riskLevel: z.enum(["standard", "cautious", "aggressive", "unknown"]).optional(),
      minConfidence: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  status: z.enum(["pending", "pending_ocr", "processing", "completed", "failed", "cancelled"]).optional(),
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Trigger an analysis pipeline for a document.
 *
 * Creates a new analysis record with status `pending` and prepares for
 * Inngest pipeline processing. The document must exist and have status `ready`.
 *
 * @param documentId - UUID of the document to analyze
 * @returns The created analysis record with placeholder inngestRunId
 *
 * @example
 * ```typescript
 * const result = await triggerAnalysis("doc-uuid-here");
 * if (result.success) {
 *   console.log("Analysis started:", result.data.id);
 * }
 * ```
 */
export async function triggerAnalysis(
  documentId: string,
  options?: { userPrompt?: string }
): Promise<ApiResponse<Analysis>> {
  // Validate input
  const parsed = triggerAnalysisSchema.safeParse({ documentId });
  if (!parsed.success) {
    return err(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid input"
    );
  }

  const { db, tenantId } = await withTenant();

  // Verify document exists, belongs to tenant, and is ready
  const document = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, documentId),
      eq(documents.tenantId, tenantId)
    ),
  });

  if (!document) {
    return err("NOT_FOUND", "Document not found");
  }

  if (document.status !== "ready") {
    return err(
      "CONFLICT",
      `Document is not ready for analysis. Current status: ${document.status}`
    );
  }

  // Get the latest version number for this document
  const latestAnalysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.documentId, documentId),
      eq(analyses.tenantId, tenantId)
    ),
    orderBy: [desc(analyses.version)],
    columns: { version: true },
  });

  const nextVersion = (latestAnalysis?.version ?? 0) + 1;

  // Create new analysis record
  const [analysis] = await db
    .insert(analyses)
    .values({
      tenantId,
      documentId,
      status: "pending",
      version: nextVersion,
      metadata: options?.userPrompt ? { userPrompt: options.userPrompt } : {},
      inngestRunId: `pending_${Date.now()}`, // Will be updated by Inngest
    })
    .returning();

  // Send analysis request event to Inngest
  await inngest.send({
    name: "nda/analysis.requested",
    data: {
      tenantId,
      documentId,
      analysisId: analysis.id,
      source: "web-upload" as const,
      userPrompt: options?.userPrompt,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/analyses");

  return ok(analysis);
}

/**
 * Get full analysis results by ID.
 *
 * Returns the complete analysis record including risk scores, summary,
 * gap analysis, and processing metadata.
 *
 * @param analysisId - UUID of the analysis to retrieve
 * @returns The full analysis record
 */
export async function getAnalysis(
  analysisId: string
): Promise<ApiResponse<Analysis>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID");
  }

  const { db, tenantId } = await withTenant();

  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
  });

  if (!analysis) {
    return err("NOT_FOUND", "Analysis not found");
  }

  return ok(analysis);
}

/**
 * Get lightweight analysis status for polling.
 *
 * Returns just the status and optional progress information for
 * efficient polling during analysis processing.
 *
 * @param analysisId - UUID of the analysis to check
 * @returns Status and optional progress info
 */
export async function getAnalysisStatus(
  analysisId: string
): Promise<ApiResponse<AnalysisStatusResponse>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID");
  }

  const { db, tenantId } = await withTenant();

  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: {
      status: true,
      progressStage: true,
      progressPercent: true,
    },
  });

  if (!analysis) {
    return err("NOT_FOUND", "Analysis not found");
  }

  // Map progress stage to human-readable message
  const stageMessages: Record<string, string> = {
    parsing: "Parsing document...",
    classifying: "Classifying clauses...",
    scoring: "Assessing risk levels...",
    analyzing_gaps: "Analyzing gaps...",
    complete: "Analysis complete",
    failed: "Analysis failed",
    cancelled: "Analysis cancelled",
  };

  const progress: AnalysisStatusResponse["progress"] = {
    step: analysis.progressStage
      ? stageMessages[analysis.progressStage] || analysis.progressStage
      : analysis.status === "pending"
        ? "Queued for analysis..."
        : analysis.status === "completed"
          ? "Complete"
          : "Processing...",
    percent: analysis.status === "completed"
      ? 100
      : analysis.progressPercent ?? 0,
  };

  return ok({
    status: analysis.status as AnalysisStatus,
    progress,
  });
}

/**
 * Get clause extractions with optional filters.
 *
 * Returns clauses from an analysis, optionally filtered by category,
 * risk level, or minimum confidence score.
 *
 * @param analysisId - UUID of the analysis
 * @param filters - Optional filtering criteria
 * @returns Filtered list of clause extractions
 */
export async function getAnalysisClauses(
  analysisId: string,
  filters?: {
    category?: string;
    riskLevel?: RiskLevel;
    minConfidence?: number;
  }
): Promise<ApiResponse<ClauseExtraction[]>> {
  const parsed = getAnalysisClausesSchema.safeParse({ analysisId, filters });
  if (!parsed.success) {
    return err(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid input"
    );
  }

  const { db, tenantId } = await withTenant();

  // Verify analysis exists and belongs to tenant
  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: { id: true },
  });

  if (!analysis) {
    return err("NOT_FOUND", "Analysis not found");
  }

  // Build dynamic where conditions
  const conditions = [
    eq(clauseExtractions.analysisId, analysisId),
    eq(clauseExtractions.tenantId, tenantId),
  ];

  if (filters?.category) {
    conditions.push(eq(clauseExtractions.category, filters.category));
  }

  if (filters?.riskLevel) {
    conditions.push(eq(clauseExtractions.riskLevel, filters.riskLevel));
  }

  if (filters?.minConfidence !== undefined) {
    conditions.push(gte(clauseExtractions.confidence, filters.minConfidence));
  }

  const clauses = await db
    .select()
    .from(clauseExtractions)
    .where(and(...conditions))
    .orderBy(desc(clauseExtractions.confidence));

  return ok(clauses);
}

/**
 * Get gap analysis results (legacy format).
 *
 * Returns the gap analysis data including missing clauses, weak clauses,
 * and prioritized recommendations.
 *
 * @deprecated Use {@link fetchGapAnalysis} instead, which returns the enhanced
 * EnhancedGapResult with two-tier gaps, coverage summary, and hypothesis coverage.
 *
 * @param analysisId - UUID of the analysis
 * @returns Gap analysis results (legacy format)
 */
export async function getAnalysisGaps(
  analysisId: string
): Promise<ApiResponse<GapAnalysisResult>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID");
  }

  const { db, tenantId } = await withTenant();

  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: {
      gapAnalysis: true,
      status: true,
    },
  });

  if (!analysis) {
    return err("NOT_FOUND", "Analysis not found");
  }

  if (analysis.status !== "completed") {
    return err(
      "CONFLICT",
      `Gap analysis not available. Analysis status: ${analysis.status}`
    );
  }

  // Parse gap analysis from JSONB
  const gapAnalysis = analysis.gapAnalysis as GapAnalysisResult | null;

  if (!gapAnalysis) {
    // Return empty results if gap analysis hasn't been computed
    return ok({
      missingClauses: [],
      weakClauses: [],
      recommendations: [],
    });
  }

  return ok(gapAnalysis);
}

/**
 * Fetch enhanced gap analysis results.
 *
 * Returns the full enhanced gap analysis including two-tier gaps,
 * coverage summary, recommended language, and hypothesis coverage.
 *
 * @param analysisId - UUID of the analysis
 * @returns Enhanced gap analysis results
 */
export async function fetchGapAnalysis(
  analysisId: string
): Promise<ApiResponse<EnhancedGapResult>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID");
  }

  const { tenantId } = await withTenant();

  const gapData = await getGapAnalysis(analysisId, tenantId);

  if (!gapData) {
    // Return empty result if gap analysis not available
    return ok({
      gaps: [],
      coverageSummary: {
        totalCategories: 0,
        presentCount: 0,
        missingCount: 0,
        incompleteCount: 0,
        coveragePercent: 0,
      },
      presentCategories: [],
      weakClauses: [],
      hypothesisCoverage: [],
      gapScore: 0,
    });
  }

  return ok(gapData);
}

/**
 * Get all analysis versions for a document.
 *
 * Returns all analyses performed on a specific document, ordered by
 * version number (most recent first).
 *
 * @param documentId - UUID of the document
 * @returns List of analyses for the document
 */
export async function getDocumentAnalyses(
  documentId: string
): Promise<ApiResponse<Analysis[]>> {
  if (!z.string().uuid().safeParse(documentId).success) {
    return err("VALIDATION_ERROR", "Invalid document ID");
  }

  const { db, tenantId } = await withTenant();

  // Verify document exists and belongs to tenant
  const document = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, documentId),
      eq(documents.tenantId, tenantId)
    ),
    columns: { id: true },
  });

  if (!document) {
    return err("NOT_FOUND", "Document not found");
  }

  const documentAnalyses = await db.query.analyses.findMany({
    where: and(
      eq(analyses.documentId, documentId),
      eq(analyses.tenantId, tenantId)
    ),
    orderBy: [desc(analyses.version)],
  });

  return ok(documentAnalyses);
}

/**
 * Get analysis history across all documents for the tenant.
 *
 * Returns a paginated list of all analyses with joined document info,
 * ordered by completion date (most recent first).
 *
 * @param input - Pagination and filter options
 * @returns Paginated list of analyses with document info
 */
export async function getAnalysisHistory(input?: {
  limit?: number;
  offset?: number;
  status?: AnalysisStatus;
}): Promise<
  ApiResponse<{
    analyses: AnalysisWithDocument[];
    total: number;
  }>
> {
  const parsed = paginationSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return err(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid input"
    );
  }

  const { limit, offset, status } = parsed.data;
  const { db, tenantId } = await withTenant();

  // Build where conditions
  const conditions = [eq(analyses.tenantId, tenantId)];

  if (status) {
    conditions.push(eq(analyses.status, status));
  }

  // Get analyses with document join
  const analysisRows = await db
    .select({
      analysis: analyses,
      document: {
        id: documents.id,
        title: documents.title,
      },
    })
    .from(analyses)
    .innerJoin(documents, eq(analyses.documentId, documents.id))
    .where(and(...conditions))
    .orderBy(desc(analyses.completedAt), desc(analyses.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const [countResult] = await db
    .select({ count: count() })
    .from(analyses)
    .where(and(...conditions));

  const total = countResult?.count ?? 0;

  // Transform to expected shape
  const analysesWithDocs: AnalysisWithDocument[] = analysisRows.map((row) => ({
    ...row.analysis,
    document: row.document,
  }));

  return ok({
    analyses: analysesWithDocs,
    total,
  });
}

/**
 * Create a new analysis version for a document.
 *
 * Increments the version number and triggers a new analysis pipeline.
 * Useful for re-analyzing documents after pipeline updates.
 *
 * @param documentId - UUID of the document to re-analyze
 * @returns The newly created analysis record
 */
export async function rerunAnalysis(
  documentId: string
): Promise<ApiResponse<Analysis>> {
  // rerunAnalysis is essentially the same as triggerAnalysis
  // but explicitly intended for documents that already have analyses
  return triggerAnalysis(documentId);
}

/**
 * Cancel an in-progress analysis.
 *
 * Only analyses with status `pending` or `processing` can be cancelled.
 * Sets the analysis status to `failed` with a cancellation message.
 *
 * @param analysisId - UUID of the analysis to cancel
 * @returns void on success
 */
export async function cancelAnalysis(
  analysisId: string
): Promise<ApiResponse<void>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID");
  }

  const { db, tenantId } = await withTenant();

  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: {
      id: true,
      status: true,
      inngestRunId: true,
    },
  });

  if (!analysis) {
    return err("NOT_FOUND", "Analysis not found");
  }

  if (analysis.status !== "pending" && analysis.status !== "processing") {
    return err(
      "CONFLICT",
      `Cannot cancel analysis with status: ${analysis.status}. Only pending or processing analyses can be cancelled.`
    );
  }

  // TODO: Cancel Inngest run via API
  // if (analysis.inngestRunId) {
  //   await inngest.cancel(analysis.inngestRunId);
  // }

  // Update status to failed with cancellation note
  await db
    .update(analyses)
    .set({
      status: "failed",
      updatedAt: new Date(),
    })
    .where(eq(analyses.id, analysisId));

  revalidatePath("/dashboard");
  revalidatePath("/analyses");

  return ok(undefined);
}

/**
 * Delete an analysis version.
 *
 * Hard deletes the analysis and cascades to clause extractions.
 * Cannot delete if it's the only analysis for a document.
 *
 * @param analysisId - UUID of the analysis to delete
 * @returns void on success
 */
export async function deleteAnalysis(
  analysisId: string
): Promise<ApiResponse<void>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID");
  }

  const { db, tenantId } = await withTenant();

  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: {
      id: true,
      documentId: true,
    },
  });

  if (!analysis) {
    return err("NOT_FOUND", "Analysis not found");
  }

  // Check if this is the only analysis for the document
  const [countResult] = await db
    .select({ count: count() })
    .from(analyses)
    .where(
      and(
        eq(analyses.documentId, analysis.documentId),
        eq(analyses.tenantId, tenantId)
      )
    );

  const analysisCount = countResult?.count ?? 0;

  if (analysisCount <= 1) {
    return err(
      "CONFLICT",
      "Cannot delete the last analysis for a document. Upload a new document or run a new analysis first."
    );
  }

  // Delete analysis (cascades to clause extractions via FK)
  await db.delete(analyses).where(eq(analyses.id, analysisId));

  revalidatePath("/dashboard");
  revalidatePath("/analyses");

  return ok(undefined);
}

/**
 * Generate a PDF report of the analysis.
 *
 * Creates a downloadable PDF with analysis results, clause extractions,
 * risk assessments, and recommendations.
 *
 * @param analysisId - UUID of the analysis to export
 * @returns Signed URL for PDF download with expiration
 */
export async function exportAnalysisPdf(
  analysisId: string
): Promise<ApiResponse<{ url: string; expiresAt: string }>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID");
  }

  const { db, tenantId } = await withTenant();

  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: {
      id: true,
      status: true,
    },
  });

  if (!analysis) {
    return err("NOT_FOUND", "Analysis not found");
  }

  if (analysis.status !== "completed") {
    return err(
      "CONFLICT",
      `Cannot export analysis with status: ${analysis.status}. Analysis must be completed.`
    );
  }

  // TODO: Implement PDF generation using pdf-lib
  // 1. Fetch full analysis with clauses and gaps
  // 2. Generate PDF document
  // 3. Upload to Vercel Blob
  // 4. Return signed URL

  // Placeholder response
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  return ok({
    url: `https://placeholder.blob.vercel-storage.com/analysis-${analysisId}.pdf`,
    expiresAt,
  });
}

/**
 * Get CUAD classifications for an analysis.
 *
 * Supports two views:
 * - "category": Grouped by CUAD category with all instances per category
 * - "position": In document order (by chunk index), primary labels first
 *
 * Both views include "Uncategorized" entries for chunks matching no category,
 * and all secondary labels alongside primary ones.
 *
 * @param analysisId - UUID of the analysis
 * @param view - View mode: "category" for grouped view, "position" for document order
 * @returns Classifications in the requested view format
 */
export async function getAnalysisClassifications(
  analysisId: string,
  view: "category" | "position" = "category"
): Promise<ApiResponse<ClassificationsByCategory[] | ChunkClassificationRow[]>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID");
  }

  const { db, tenantId } = await withTenant();

  // Verify analysis exists and belongs to tenant
  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: { id: true },
  });

  if (!analysis) {
    return err("NOT_FOUND", "Analysis not found");
  }

  if (view === "category") {
    const result = await getClassificationsByCategory(analysisId, tenantId);
    return ok(result);
  } else {
    const result = await getClassificationsByPosition(analysisId, tenantId);
    return ok(result);
  }
}

// ============================================================================
// Risk Scoring Actions
// ============================================================================

/**
 * Trigger re-scoring of an analysis with a different perspective.
 *
 * Only triggers when the perspective actually changes (no-op if same).
 * Re-scoring runs via Inngest to avoid serverless timeout.
 *
 * @param analysisId - UUID of the analysis to re-score
 * @param perspective - New perspective: receiving | disclosing | balanced
 * @returns void on success
 */
export async function triggerRescore(
  analysisId: string,
  perspective: Perspective
): Promise<ApiResponse<void>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID");
  }

  if (!["receiving", "disclosing", "balanced"].includes(perspective)) {
    return err("VALIDATION_ERROR", "Invalid perspective");
  }

  const { db, tenantId } = await withTenant();

  // Verify analysis exists, is completed, and belongs to tenant
  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: {
      id: true,
      status: true,
      metadata: true,
    },
  });

  if (!analysis) {
    return err("NOT_FOUND", "Analysis not found");
  }

  if (analysis.status !== "completed") {
    return err(
      "CONFLICT",
      `Cannot re-score analysis with status: ${analysis.status}. Analysis must be completed.`
    );
  }

  // Check if perspective actually changed (no-op if same)
  const metadata = analysis.metadata as Record<string, unknown> | null;
  const currentPerspective = metadata?.perspective as string | undefined;
  if (currentPerspective === perspective) {
    return err("CONFLICT", "Analysis is already scored from this perspective");
  }

  // Send re-score event to Inngest
  await inngest.send({
    name: "nda/analysis.rescore",
    data: {
      tenantId,
      analysisId,
      perspective,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/analyses");

  return ok(undefined);
}

/**
 * Fetch risk assessments (clause extractions) for an analysis.
 *
 * Returns all clause extractions ordered by document position.
 *
 * @param analysisId - UUID of the analysis
 * @returns Array of clause extraction rows in document order
 */
export async function fetchRiskAssessments(
  analysisId: string
): Promise<ApiResponse<ClauseExtractionRow[]>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID");
  }

  const { db, tenantId } = await withTenant();

  // Verify analysis exists and belongs to tenant
  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: { id: true },
  });

  if (!analysis) {
    return err("NOT_FOUND", "Analysis not found");
  }

  const assessments = await queryRiskAssessments(analysisId, tenantId);
  return ok(assessments);
}
