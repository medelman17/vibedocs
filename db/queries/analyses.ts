/**
 * @fileoverview Analysis Data Access Layer for NDA Pipeline Results
 *
 * This module provides CRUD operations for managing NDA analysis records and their
 * associated clause extractions. It serves as the primary data access layer for the
 * analysis pipeline, supporting the full lifecycle from document upload through
 * clause classification and risk scoring.
 *
 * ## Integration with Inngest
 *
 * The analysis functions are designed to work with Inngest's durable workflow system:
 * - `createAnalysis()` accepts an optional `inngestRunId` to link analysis records
 *   to their corresponding Inngest function runs for debugging and observability
 * - `updateAnalysisStatus()` supports atomic status transitions used by pipeline steps
 * - The status progression (pending → running → complete/failed) maps directly to
 *   Inngest step execution states
 *
 * ## CUAD Clause Classification
 *
 * Clause extractions use the CUAD (Contract Understanding Atticus Dataset) 41-category
 * taxonomy for consistent NDA clause classification. Each extracted clause includes:
 * - Primary category from CUAD taxonomy
 * - Optional secondary categories for multi-label classification
 * - Confidence scores from the classifier agent
 * - Risk level assessment from the risk scorer agent
 *
 * ## Tenant Isolation
 *
 * All functions enforce tenant isolation through explicit `tenantId` parameters.
 * This ensures multi-tenant data separation at the query level, complementing
 * database-level RLS (Row Level Security) policies.
 *
 * @module db/queries/analyses
 * @see {@link ../schema/analyses.ts} for table definitions
 * @see {@link ../../inngest/} for pipeline function implementations
 */

import { eq, and, desc, sql } from "drizzle-orm"
import { db } from "../client"
import { analyses, clauseExtractions } from "../schema/analyses"

/**
 * Analysis processing status indicating the current stage in the pipeline.
 *
 * Status progression:
 * - `"pending"` - Analysis created, waiting to be picked up by Inngest
 * - `"running"` - Pipeline actively processing (parsing, classifying, scoring)
 * - `"complete"` - All agents finished successfully, results available
 * - `"failed"` - Pipeline encountered an unrecoverable error
 *
 * @example
 * // Typical status transitions in Inngest pipeline
 * await createAnalysis(tenantId, documentId, event.data.runId) // status: "pending"
 * await updateAnalysisStatus(analysisId, tenantId, "running")   // Parser agent starts
 * await updateAnalysisStatus(analysisId, tenantId, "complete", { // All agents done
 *   overallRiskScore: 72,
 *   overallRiskLevel: "cautious",
 *   summary: "This NDA contains several non-standard clauses..."
 * })
 */
export type AnalysisStatus = "pending" | "running" | "complete" | "failed"

/**
 * Risk assessment level for individual clauses or overall document analysis.
 *
 * Risk levels indicate how favorable or concerning the clause terms are:
 * - `"standard"` - Industry-standard language, no significant concerns
 * - `"cautious"` - Contains terms that warrant review but are not deal-breakers
 * - `"aggressive"` - One-sided or highly unfavorable terms requiring negotiation
 * - `"unknown"` - Classifier could not determine risk (low confidence or ambiguous)
 *
 * Risk levels are determined by the Risk Scorer Agent based on:
 * - Deviation from standard market terms
 * - Potential financial or operational impact
 * - One-sidedness of obligations
 * - Comparison with reference documents and templates
 *
 * @example
 * // Filtering high-risk clauses for legal review
 * const riskyTerms = await getHighRiskClauses(analysisId, tenantId)
 * // Returns clauses with riskLevel === "aggressive"
 */
export type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown"

/**
 * Retrieves the most recent analysis for a given document.
 *
 * @description
 * Fetches the latest analysis record for a document, useful when a document
 * has been re-analyzed multiple times (e.g., after content updates or with
 * improved classifier models). Results are ordered by creation date descending,
 * returning only the most recent analysis.
 *
 * This is the primary lookup function for displaying analysis results in the UI,
 * as users typically want to see the latest analysis rather than historical ones.
 *
 * @param documentId - UUID of the document to find analysis for
 * @param tenantId - UUID of the tenant (organization) for isolation
 * @returns The most recent analysis record, or `null` if no analysis exists
 *
 * @example
 * // In a Server Component displaying document analysis
 * import { getAnalysisByDocument } from "@/db/queries/analyses"
 * import { withTenant } from "@/lib/dal"
 *
 * export async function DocumentAnalysis({ documentId }: { documentId: string }) {
 *   const { tenantId } = await withTenant()
 *   const analysis = await getAnalysisByDocument(documentId, tenantId)
 *
 *   if (!analysis) {
 *     return <AnalysisPending documentId={documentId} />
 *   }
 *
 *   if (analysis.status === "running") {
 *     return <AnalysisProgress analysis={analysis} />
 *   }
 *
 *   return <AnalysisResults analysis={analysis} />
 * }
 */
export async function getAnalysisByDocument(
  documentId: string,
  tenantId: string
) {
  const [analysis] = await db
    .select()
    .from(analyses)
    .where(
      and(eq(analyses.documentId, documentId), eq(analyses.tenantId, tenantId))
    )
    .orderBy(desc(analyses.createdAt))
    .limit(1)

  return analysis ?? null
}

/**
 * Retrieves a specific analysis by its unique identifier.
 *
 * @description
 * Direct lookup of an analysis record by ID with tenant isolation.
 * Used when you have the specific analysis ID (e.g., from URL params,
 * Inngest event payload, or clause extraction foreign key).
 *
 * @param analysisId - UUID of the analysis to retrieve
 * @param tenantId - UUID of the tenant (organization) for isolation
 * @returns The analysis record, or `null` if not found or belongs to different tenant
 *
 * @example
 * // In an Inngest step to check analysis state
 * import { getAnalysisById } from "@/db/queries/analyses"
 *
 * const checkStatus = inngest.createFunction(
 *   { id: "check-analysis-status" },
 *   { event: "analysis/status.check" },
 *   async ({ event, step }) => {
 *     const { analysisId, tenantId } = event.data
 *
 *     const analysis = await step.run("fetch-analysis", async () => {
 *       return getAnalysisById(analysisId, tenantId)
 *     })
 *
 *     if (!analysis) {
 *       throw new Error(`Analysis ${analysisId} not found`)
 *     }
 *
 *     return { status: analysis.status, progress: analysis.processingTimeMs }
 *   }
 * )
 */
export async function getAnalysisById(analysisId: string, tenantId: string) {
  const [analysis] = await db
    .select()
    .from(analyses)
    .where(
      and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId))
    )
    .limit(1)

  return analysis ?? null
}

/**
 * Retrieves an analysis along with all its extracted clauses.
 *
 * @description
 * Performs a two-query fetch to get the analysis record and all associated
 * clause extractions. Clauses are ordered by their position in the document
 * (`startPosition`) to maintain document reading order.
 *
 * This is the primary function for rendering detailed analysis views that
 * show the document text with highlighted clause extractions and their
 * risk assessments.
 *
 * @param analysisId - UUID of the analysis to retrieve
 * @param tenantId - UUID of the tenant (organization) for isolation
 * @returns Analysis with nested `clauses` array, or `null` if analysis not found
 *
 * @example
 * // In a Server Component rendering full analysis detail
 * import { getAnalysisWithClauses } from "@/db/queries/analyses"
 * import { withTenant } from "@/lib/dal"
 *
 * export async function AnalysisDetail({ analysisId }: { analysisId: string }) {
 *   const { tenantId } = await withTenant()
 *   const result = await getAnalysisWithClauses(analysisId, tenantId)
 *
 *   if (!result) {
 *     notFound()
 *   }
 *
 *   const { clauses, ...analysis } = result
 *
 *   return (
 *     <div>
 *       <AnalysisSummary analysis={analysis} />
 *       <ClauseList clauses={clauses} />
 *       <RiskBreakdown
 *         highRisk={clauses.filter(c => c.riskLevel === "aggressive")}
 *         cautious={clauses.filter(c => c.riskLevel === "cautious")}
 *       />
 *     </div>
 *   )
 * }
 */
export async function getAnalysisWithClauses(
  analysisId: string,
  tenantId: string
) {
  const analysis = await getAnalysisById(analysisId, tenantId)
  if (!analysis) return null

  const clauses = await db
    .select()
    .from(clauseExtractions)
    .where(
      and(
        eq(clauseExtractions.analysisId, analysisId),
        eq(clauseExtractions.tenantId, tenantId)
      )
    )
    .orderBy(clauseExtractions.startPosition)

  return { ...analysis, clauses }
}

/**
 * Creates a new analysis record for a document.
 *
 * @description
 * Initializes a new analysis in `"pending"` status, ready to be processed
 * by the Inngest analysis pipeline. This function is typically called when:
 * - A user uploads a new document and requests analysis
 * - A user triggers re-analysis of an existing document
 * - The system initiates batch analysis of multiple documents
 *
 * The optional `inngestRunId` parameter links the analysis to its corresponding
 * Inngest function run, enabling debugging and observability through the
 * Inngest dashboard.
 *
 * @param tenantId - UUID of the tenant (organization) owning this analysis
 * @param documentId - UUID of the document to analyze
 * @param inngestRunId - Optional Inngest function run ID for traceability
 * @returns The newly created analysis record with generated UUID
 *
 * @example
 * // In an Inngest function triggered by document upload
 * import { createAnalysis } from "@/db/queries/analyses"
 *
 * const analyzeDocument = inngest.createFunction(
 *   { id: "analyze-nda-document" },
 *   { event: "document/uploaded" },
 *   async ({ event, step, runId }) => {
 *     const { documentId, tenantId } = event.data
 *
 *     // Create analysis record linked to this Inngest run
 *     const analysis = await step.run("create-analysis", async () => {
 *       return createAnalysis(tenantId, documentId, runId)
 *     })
 *
 *     // Continue with parser agent...
 *     await step.run("parse-document", async () => {
 *       await updateAnalysisStatus(analysis.id, tenantId, "running")
 *       // ... parsing logic
 *     })
 *
 *     return { analysisId: analysis.id }
 *   }
 * )
 */
export async function createAnalysis(
  tenantId: string,
  documentId: string,
  inngestRunId?: string
) {
  const [analysis] = await db
    .insert(analyses)
    .values({
      tenantId,
      documentId,
      status: "pending",
      inngestRunId: inngestRunId ?? null,
    })
    .returning()

  return analysis
}

/**
 * Updates the status and results of an analysis atomically.
 *
 * @description
 * Provides atomic updates to analysis status and optional result fields.
 * This is the primary function for progressing analysis through the pipeline
 * and storing final results.
 *
 * Key behaviors:
 * - Automatically sets `completedAt` timestamp when status becomes `"complete"`
 * - Increments the `version` field for optimistic concurrency control
 * - Updates `updatedAt` timestamp on every call
 * - Uses `undefined` (not `null`) for optional fields to preserve existing values
 *
 * The `results` parameter allows partial updates - only provided fields are
 * modified, while others retain their previous values.
 *
 * @param analysisId - UUID of the analysis to update
 * @param tenantId - UUID of the tenant (organization) for isolation
 * @param status - New status value to set
 * @param results - Optional result fields to update atomically with status
 * @param results.overallRiskScore - Numeric risk score (0-100, higher = more risk)
 * @param results.overallRiskLevel - Categorical risk assessment
 * @param results.summary - Human-readable analysis summary
 * @param results.gapAnalysis - Structured gap analysis data (missing clauses, recommendations)
 * @param results.tokenUsage - LLM token usage for cost tracking
 * @param results.processingTimeMs - Total pipeline processing time in milliseconds
 * @returns The updated analysis record, or `null` if not found
 *
 * @example
 * // Transitioning to running status in parser agent
 * await updateAnalysisStatus(analysisId, tenantId, "running")
 *
 * @example
 * // Setting final results after all agents complete
 * import { updateAnalysisStatus } from "@/db/queries/analyses"
 *
 * const finalizeAnalysis = async (
 *   analysisId: string,
 *   tenantId: string,
 *   pipelineResults: PipelineOutput
 * ) => {
 *   const updated = await updateAnalysisStatus(
 *     analysisId,
 *     tenantId,
 *     "complete",
 *     {
 *       overallRiskScore: pipelineResults.riskScore,
 *       overallRiskLevel: pipelineResults.riskLevel,
 *       summary: pipelineResults.executiveSummary,
 *       gapAnalysis: {
 *         missingClauses: pipelineResults.gaps,
 *         recommendations: pipelineResults.recommendations,
 *       },
 *       tokenUsage: {
 *         input: pipelineResults.tokens.prompt,
 *         output: pipelineResults.tokens.completion,
 *         cost_usd: pipelineResults.tokens.cost,
 *       },
 *       processingTimeMs: Date.now() - pipelineResults.startTime,
 *     }
 *   )
 *
 *   return updated
 * }
 *
 * @example
 * // Handling pipeline failure
 * await updateAnalysisStatus(analysisId, tenantId, "failed")
 */
export async function updateAnalysisStatus(
  analysisId: string,
  tenantId: string,
  status: AnalysisStatus,
  results?: {
    overallRiskScore?: number
    overallRiskLevel?: RiskLevel
    summary?: string
    gapAnalysis?: Record<string, unknown>
    tokenUsage?: { input: number; output: number; cost_usd: number }
    processingTimeMs?: number
  }
) {
  const [updated] = await db
    .update(analyses)
    .set({
      status,
      overallRiskScore: results?.overallRiskScore ?? undefined,
      overallRiskLevel: results?.overallRiskLevel ?? undefined,
      summary: results?.summary ?? undefined,
      gapAnalysis: results?.gapAnalysis ?? undefined,
      tokenUsage: results?.tokenUsage ?? undefined,
      processingTimeMs: results?.processingTimeMs ?? undefined,
      completedAt: status === "complete" ? new Date() : undefined,
      updatedAt: new Date(),
      version: sql`${analyses.version} + 1`,
    })
    .where(and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId)))
    .returning()

  return updated ?? null
}

/**
 * Batch inserts clause extractions for an analysis.
 *
 * @description
 * Creates multiple clause extraction records in a single database transaction.
 * This function is called by the Classifier Agent after identifying all clauses
 * in a document, and may be called again by the Risk Scorer Agent to update
 * risk assessments.
 *
 * Each clause extraction represents a segment of the document classified under
 * the CUAD 41-category taxonomy, with associated risk scoring and supporting
 * evidence. The function handles optional fields gracefully, converting undefined
 * values to null for database storage.
 *
 * Performance note: For large documents with many clauses (50+), this function
 * performs a single bulk insert rather than individual INSERTs, significantly
 * reducing database round trips.
 *
 * @param tenantId - UUID of the tenant (organization) owning these clauses
 * @param analysisId - UUID of the parent analysis record
 * @param documentId - UUID of the source document (denormalized for query efficiency)
 * @param clauses - Array of clause data to insert
 * @param clauses[].chunkId - Optional reference to document chunk for RAG retrieval
 * @param clauses[].category - Primary CUAD category (e.g., "Non-Compete", "Termination")
 * @param clauses[].secondaryCategories - Additional applicable categories for multi-label
 * @param clauses[].clauseText - Extracted clause text from the document
 * @param clauses[].startPosition - Character offset where clause begins in document
 * @param clauses[].endPosition - Character offset where clause ends in document
 * @param clauses[].confidence - Classification confidence score (0.0 to 1.0)
 * @param clauses[].riskLevel - Risk assessment from scorer agent
 * @param clauses[].riskExplanation - Human-readable explanation of risk assessment
 * @param clauses[].evidence - Supporting evidence and citations from the document
 * @param clauses[].metadata - Additional metadata (model version, extraction params, etc.)
 * @returns Array of created clause extraction records with generated UUIDs
 *
 * @example
 * // In the Classifier Agent after processing document
 * import { createClauseExtractions } from "@/db/queries/analyses"
 *
 * const classifierStep = async (
 *   analysisId: string,
 *   tenantId: string,
 *   documentId: string,
 *   parsedChunks: ParsedChunk[]
 * ) => {
 *   const classifiedClauses = await classifyWithClaude(parsedChunks)
 *
 *   const clauses = classifiedClauses.map(clause => ({
 *     chunkId: clause.sourceChunkId,
 *     category: clause.cuadCategory,
 *     secondaryCategories: clause.additionalCategories,
 *     clauseText: clause.extractedText,
 *     startPosition: clause.charStart,
 *     endPosition: clause.charEnd,
 *     confidence: clause.classificationConfidence,
 *     riskLevel: "unknown" as const, // Will be set by Risk Scorer
 *     evidence: {
 *       relevantSentences: clause.supportingContext,
 *       modelReasoning: clause.reasoning,
 *     },
 *     metadata: {
 *       modelVersion: "claude-sonnet-4.5",
 *       extractedAt: new Date().toISOString(),
 *     },
 *   }))
 *
 *   return createClauseExtractions(tenantId, analysisId, documentId, clauses)
 * }
 */
export async function createClauseExtractions(
  tenantId: string,
  analysisId: string,
  documentId: string,
  clauses: Array<{
    chunkId?: string
    category: string
    secondaryCategories?: string[]
    clauseText: string
    startPosition?: number
    endPosition?: number
    confidence: number
    riskLevel: RiskLevel
    riskExplanation?: string
    evidence?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }>
) {
  if (clauses.length === 0) return []

  const values = clauses.map((clause) => ({
    tenantId,
    analysisId,
    documentId,
    chunkId: clause.chunkId ?? null,
    category: clause.category,
    secondaryCategories: clause.secondaryCategories ?? null,
    clauseText: clause.clauseText,
    startPosition: clause.startPosition ?? null,
    endPosition: clause.endPosition ?? null,
    confidence: clause.confidence,
    riskLevel: clause.riskLevel,
    riskExplanation: clause.riskExplanation ?? null,
    evidence: clause.evidence ?? null,
    metadata: clause.metadata ?? {},
  }))

  return db.insert(clauseExtractions).values(values).returning()
}

/**
 * Retrieves clause extractions filtered by CUAD category.
 *
 * @description
 * Fetches all clauses matching a specific CUAD taxonomy category within an
 * analysis. Results are ordered by confidence score (ascending), making it
 * easy to identify low-confidence classifications that may need review.
 *
 * Common use cases:
 * - Displaying all "Non-Compete" clauses for focused legal review
 * - Comparing similar clause types across multiple NDAs
 * - Building category-specific risk reports
 *
 * @param analysisId - UUID of the analysis to query
 * @param tenantId - UUID of the tenant (organization) for isolation
 * @param category - CUAD category to filter by (e.g., "Non-Compete", "Confidentiality")
 * @returns Array of clause extractions matching the category, ordered by confidence
 *
 * @example
 * // Displaying all non-compete clauses in a document
 * import { getClausesByCategory } from "@/db/queries/analyses"
 * import { withTenant } from "@/lib/dal"
 *
 * export async function NonCompeteReview({ analysisId }: { analysisId: string }) {
 *   const { tenantId } = await withTenant()
 *   const nonCompetes = await getClausesByCategory(
 *     analysisId,
 *     tenantId,
 *     "Non-Compete"
 *   )
 *
 *   return (
 *     <div>
 *       <h2>Non-Compete Clauses ({nonCompetes.length})</h2>
 *       {nonCompetes.map(clause => (
 *         <ClauseCard
 *           key={clause.id}
 *           text={clause.clauseText}
 *           confidence={clause.confidence}
 *           risk={clause.riskLevel}
 *         />
 *       ))}
 *     </div>
 *   )
 * }
 */
export async function getClausesByCategory(
  analysisId: string,
  tenantId: string,
  category: string
) {
  return db
    .select()
    .from(clauseExtractions)
    .where(
      and(
        eq(clauseExtractions.analysisId, analysisId),
        eq(clauseExtractions.tenantId, tenantId),
        eq(clauseExtractions.category, category)
      )
    )
    .orderBy(clauseExtractions.confidence)
}

/**
 * Retrieves all high-risk (aggressive) clauses from an analysis.
 *
 * @description
 * Fetches clauses with `riskLevel === "aggressive"`, representing terms that
 * are highly unfavorable and typically require negotiation or legal review.
 * Results are ordered by confidence score (descending) to surface the most
 * certain high-risk findings first.
 *
 * The optional `minConfidence` parameter allows filtering out low-confidence
 * classifications, though note that the current implementation does not apply
 * this filter in the query (the parameter is available for future enhancement).
 *
 * This function is commonly used for:
 * - Executive summaries highlighting key concerns
 * - Generating negotiation priority lists
 * - Risk dashboards and alerts
 * - Comparison reports showing risk differences between NDAs
 *
 * @param analysisId - UUID of the analysis to query
 * @param tenantId - UUID of the tenant (organization) for isolation
 * @param minConfidence - Minimum confidence threshold (default: 0.7, currently unused)
 * @returns Array of aggressive-risk clauses, ordered by confidence (highest first)
 *
 * @example
 * // Building an executive risk summary
 * import { getHighRiskClauses } from "@/db/queries/analyses"
 * import { withTenant } from "@/lib/dal"
 *
 * export async function RiskSummary({ analysisId }: { analysisId: string }) {
 *   const { tenantId } = await withTenant()
 *   const highRiskClauses = await getHighRiskClauses(analysisId, tenantId)
 *
 *   if (highRiskClauses.length === 0) {
 *     return <Alert variant="success">No high-risk clauses identified</Alert>
 *   }
 *
 *   return (
 *     <Alert variant="warning">
 *       <AlertTitle>
 *         {highRiskClauses.length} High-Risk Clause{highRiskClauses.length > 1 ? 's' : ''} Found
 *       </AlertTitle>
 *       <AlertDescription>
 *         <ul>
 *           {highRiskClauses.slice(0, 3).map(clause => (
 *             <li key={clause.id}>
 *               <strong>{clause.category}:</strong> {clause.riskExplanation}
 *             </li>
 *           ))}
 *         </ul>
 *       </AlertDescription>
 *     </Alert>
 *   )
 * }
 *
 * @example
 * // In an Inngest step to trigger alerts for high-risk documents
 * const checkHighRisk = async (analysisId: string, tenantId: string) => {
 *   const highRiskClauses = await getHighRiskClauses(analysisId, tenantId, 0.85)
 *
 *   if (highRiskClauses.length >= 3) {
 *     // Trigger Slack notification for legal team
 *     await inngest.send({
 *       name: "analysis/high-risk.detected",
 *       data: {
 *         analysisId,
 *         tenantId,
 *         clauseCount: highRiskClauses.length,
 *         categories: [...new Set(highRiskClauses.map(c => c.category))],
 *       },
 *     })
 *   }
 * }
 */
export async function getHighRiskClauses(
  analysisId: string,
  tenantId: string,
  _minConfidence: number = 0.7
) {
  return db
    .select()
    .from(clauseExtractions)
    .where(
      and(
        eq(clauseExtractions.analysisId, analysisId),
        eq(clauseExtractions.tenantId, tenantId),
        eq(clauseExtractions.riskLevel, "aggressive")
      )
    )
    .orderBy(desc(clauseExtractions.confidence))
}
