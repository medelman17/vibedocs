/**
 * @fileoverview NDA Analysis Pipeline Output Storage Schema
 *
 * This module defines the database schema for storing NDA analysis results produced
 * by the LangGraph-powered agent pipeline. The analysis workflow follows this sequence:
 *
 * ```
 * Parser Agent → Classifier Agent → Risk Scorer Agent → Gap Analyst Agent
 * ```
 *
 * Each agent runs within an Inngest `step.run()` for durability and fault tolerance.
 * The pipeline processes uploaded NDA documents and produces:
 *
 * 1. **Overall Analysis** (`analyses` table): Aggregate risk scores, summaries, and gap analysis
 * 2. **Clause Extractions** (`clauseExtractions` table): Individual clauses classified by CUAD taxonomy
 *
 * ## CUAD 41-Category Taxonomy
 *
 * The clause extraction follows the Contract Understanding Atticus Dataset (CUAD) taxonomy,
 * which defines 41 legal clause categories commonly found in contracts. Categories include:
 *
 * - Document Name, Parties, Agreement Date, Effective Date, Expiration Date
 * - Renewal Term, Notice Period To Terminate Renewal, Governing Law, Jurisdiction
 * - Anti-Assignment, Non-Compete, Exclusivity, No-Solicitation of Employees/Customers
 * - Competitive Restriction Exception, Non-Disparagement, Termination For Convenience
 * - Rofr/Rofo/Rofn, Change of Control, Audit Rights, Uncapped Liability
 * - Cap On Liability, Liquidated Damages, Warranty Duration, Insurance
 * - Covenant Not To Sue, Third Party Beneficiary, IP Ownership Assignment
 * - Joint IP Ownership, License Grant, Non-Transferable License, Affiliate License
 * - Unlimited/All-You-Can-Eat License, Irrevocable Or Perpetual License
 * - Source Code Escrow, Post-Termination Services, Most Favored Nation
 * - Price Restrictions, Minimum Commitment, Volume Restriction, Revenue/Profit Sharing
 *
 * @module db/schema/analyses
 * @see {@link https://www.atticusprojectai.org/cuad|CUAD Dataset}
 * @see {@link ../documents|Documents Schema} for source document storage
 * @see {@link ../../inngest|Inngest Functions} for pipeline orchestration
 */

import {
  pgTable,
  text,
  uuid,
  integer,
  real,
  index,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId } from "../_columns"
import { documents, documentChunks } from "./documents"

/**
 * Risk level classification for documents and clauses (PRD-aligned).
 *
 * @typedef {'standard' | 'cautious' | 'aggressive' | 'unknown'} RiskLevel
 *
 * Risk levels are determined by the Risk Scorer Agent based on:
 * - **standard**: Typical NDA terms, acceptable risk
 * - **cautious**: Requires review, potentially unfavorable
 * - **aggressive**: Significantly one-sided, legal review recommended
 * - **unknown**: Unable to classify risk level
 */

/**
 * Analysis processing status values.
 *
 * @typedef {'pending' | 'processing' | 'completed' | 'failed'} AnalysisStatus
 *
 * Status progression:
 * - **pending**: Analysis queued, awaiting processing
 * - **processing**: Inngest workflow actively running agents
 * - **completed**: All agents finished successfully
 * - **failed**: Pipeline encountered unrecoverable error
 */

/**
 * Gap analysis result structure stored in JSONB.
 *
 * @typedef {Object} GapAnalysisResult
 * @property {string[]} missingClauses - CUAD categories not found in the document
 * @property {string[]} weakClauses - Categories present but with concerning language
 * @property {Array<{category: string, recommendation: string, priority: 'low' | 'medium' | 'high'}>} recommendations - Suggested improvements
 * @property {string} [comparisonBasis] - Reference template used for comparison (if applicable)
 *
 * @example
 * ```json
 * {
 *   "missingClauses": ["Insurance", "Audit Rights"],
 *   "weakClauses": ["Cap On Liability"],
 *   "recommendations": [
 *     {
 *       "category": "Insurance",
 *       "recommendation": "Add cyber liability insurance requirement",
 *       "priority": "high"
 *     }
 *   ]
 * }
 * ```
 */

/**
 * Token usage tracking for LLM cost monitoring.
 *
 * @typedef {Object} TokenUsage
 * @property {number} promptTokens - Input tokens sent to Claude
 * @property {number} completionTokens - Output tokens received from Claude
 * @property {number} totalTokens - Sum of prompt and completion tokens
 * @property {Object} [byAgent] - Breakdown by agent step
 * @property {number} byAgent.parser - Tokens used by Parser Agent
 * @property {number} byAgent.classifier - Tokens used by Classifier Agent
 * @property {number} byAgent.riskScorer - Tokens used by Risk Scorer Agent
 * @property {number} byAgent.gapAnalyst - Tokens used by Gap Analyst Agent
 *
 * @example
 * ```json
 * {
 *   "promptTokens": 45000,
 *   "completionTokens": 8500,
 *   "totalTokens": 53500,
 *   "byAgent": {
 *     "parser": 12000,
 *     "classifier": 18000,
 *     "riskScorer": 15000,
 *     "gapAnalyst": 8500
 *   }
 * }
 * ```
 */

/**
 * NDA Analysis Results Table
 *
 * Stores the aggregate results of the NDA analysis pipeline for each document.
 * Each document can have multiple analysis versions (tracked via `version` field)
 * to support re-analysis when the pipeline is updated.
 *
 * @description
 * The `analyses` table captures the overall assessment of an NDA document after
 * processing through the complete agent pipeline. It serves as the parent record
 * for all clause-level extractions and provides:
 *
 * - **Risk Assessment**: Overall risk score (0-100) and categorical risk level
 * - **Executive Summary**: LLM-generated summary of key findings
 * - **Gap Analysis**: Comparison against expected clauses and best practices
 * - **Processing Metadata**: Timing, token usage, and Inngest correlation
 *
 * ## Inngest Integration
 *
 * The `inngestRunId` field stores the Inngest run identifier, enabling:
 * - Correlation with Inngest dashboard for debugging
 * - Resume/retry capability for failed analyses
 * - Observability into pipeline execution
 *
 * ## Multi-Tenancy
 *
 * This table uses Row-Level Security (RLS) via `tenantId`. All queries must
 * go through the DAL's `withTenant()` to ensure proper tenant isolation.
 *
 * @example
 * ```typescript
 * // Query analyses for a document
 * const { db, tenantId } = await withTenant()
 * const results = await db
 *   .select()
 *   .from(analyses)
 *   .where(and(
 *     eq(analyses.documentId, docId),
 *     eq(analyses.tenantId, tenantId),
 *     eq(analyses.status, 'completed')
 *   ))
 *   .orderBy(desc(analyses.version))
 *   .limit(1)
 * ```
 *
 * @see {@link clauseExtractions} for individual clause results
 * @see {@link documents} for source document reference
 */
export const analyses = pgTable(
  "analyses",
  {
    /**
     * Primary key (UUID v7 for time-ordered sorting).
     * @see {@link primaryId} helper from _columns.ts
     */
    ...primaryId,

    /**
     * Tenant identifier for multi-org isolation.
     * References the organization that owns this analysis.
     * @see {@link tenantId} helper from _columns.ts
     */
    ...tenantId,

    /**
     * Reference to the source document being analyzed.
     * Cascades on delete to remove analyses when document is deleted.
     */
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    /**
     * Current processing status of the analysis.
     *
     * Valid values:
     * - `'pending'` - Analysis queued, awaiting Inngest pickup
     * - `'processing'` - Agent pipeline actively running
     * - `'completed'` - All agents finished successfully
     * - `'failed'` - Pipeline encountered unrecoverable error
     *
     * @default 'pending'
     */
    status: text("status").notNull().default("pending"),

    /**
     * Aggregate risk score from 0-100.
     *
     * Calculated by the Risk Scorer Agent as a weighted average of:
     * - Individual clause risk scores
     * - Missing critical clause penalties
     * - Cumulative exposure factors
     *
     * @example 67.5 (indicating medium-high risk)
     */
    overallRiskScore: real("overall_risk_score"),

    /**
     * Categorical risk level derived from overallRiskScore.
     *
     * Valid values: `'low'` | `'medium'` | `'high'` | `'critical'`
     *
     * Thresholds:
     * - low: 0-25
     * - medium: 26-50
     * - high: 51-75
     * - critical: 76-100
     */
    overallRiskLevel: text("overall_risk_level"),

    /**
     * LLM-generated executive summary of the NDA analysis.
     *
     * Includes:
     * - Key risk factors identified
     * - Notable missing protections
     * - Recommended negotiation points
     * - Overall assessment recommendation
     */
    summary: text("summary"),

    /**
     * Structured gap analysis results.
     *
     * JSONB schema: {@link GapAnalysisResult}
     *
     * Contains:
     * - `missingClauses`: CUAD categories not found in the document
     * - `weakClauses`: Categories present but with concerning language
     * - `recommendations`: Prioritized list of suggested improvements
     *
     * @see GapAnalysisResult for full schema
     */
    gapAnalysis: jsonb("gap_analysis"),

    /**
     * LLM token consumption tracking for cost monitoring.
     *
     * JSONB schema: {@link TokenUsage}
     *
     * Tracks prompt and completion tokens across all agent steps
     * to enable cost attribution and optimization.
     *
     * @see TokenUsage for full schema
     */
    tokenUsage: jsonb("token_usage"),

    /**
     * Total wall-clock processing time in milliseconds.
     *
     * Measured from Inngest function start to completion.
     * Useful for performance monitoring and SLA tracking.
     */
    processingTimeMs: integer("processing_time_ms"),

    /**
     * Inngest run identifier for pipeline correlation.
     *
     * Format: `run_xxxxxxxxxxxxxxxxxxxxxxxx`
     *
     * Enables:
     * - Debugging via Inngest dashboard
     * - Resume/retry of failed analyses
     * - Distributed tracing correlation
     *
     * @see {@link https://www.inngest.com/docs/functions/run-ids|Inngest Run IDs}
     */
    inngestRunId: text("inngest_run_id"),

    /**
     * Current progress stage for UI display.
     * Updated by Inngest function as pipeline progresses.
     *
     * Valid values: 'parsing' | 'classifying' | 'scoring' | 'analyzing_gaps' | 'complete' | 'failed'
     */
    progressStage: text("progress_stage"),

    /**
     * Progress percentage (0-100) for UI progress bar.
     * @default 0
     */
    progressPercent: integer("progress_percent").default(0),

    /**
     * Additional analysis metadata including user prompts.
     * JSONB structure may include: { userPrompt?: string, ... }
     */
    metadata: jsonb("metadata").default({}),

    /**
     * Timestamp when analysis completed successfully.
     *
     * Only set when `status` transitions to `'completed'`.
     * Null for pending, processing, or failed analyses.
     */
    completedAt: timestamp("completed_at", { withTimezone: true }),

    /**
     * Analysis version number for the document.
     *
     * Incremented when re-analyzing a document (e.g., after pipeline updates).
     * Allows historical comparison of analysis results.
     *
     * @default 1
     */
    version: integer("version").notNull().default(1),

    /**
     * Automatic timestamp fields (createdAt, updatedAt).
     * @see {@link timestamps} helper from _columns.ts
     */
    ...timestamps,
  },
  (table) => [
    /**
     * Index for efficient document lookup.
     * Used when retrieving all analyses for a specific document.
     */
    index("idx_analyses_document").on(table.documentId),

    /**
     * Composite index for tenant-scoped status queries.
     * Optimizes dashboard queries filtering by status within a tenant.
     */
    index("idx_analyses_tenant").on(table.tenantId, table.status),
  ]
)

/**
 * Evidence structure for clause risk assessment.
 *
 * @typedef {Object} ClauseEvidence
 * @property {string[]} citations - Specific text excerpts supporting the assessment
 * @property {string[]} [comparisons] - References to similar clauses in training data
 * @property {Object} [cuadMatch] - CUAD dataset match information
 * @property {string} cuadMatch.exampleId - CUAD example identifier
 * @property {number} cuadMatch.similarity - Cosine similarity score (0-1)
 * @property {string} [reasoning] - LLM explanation of risk assessment
 *
 * @example
 * ```json
 * {
 *   "citations": [
 *     "Receiving Party shall not disclose... for a period of five (5) years"
 *   ],
 *   "comparisons": ["cuad_nda_042", "cuad_nda_187"],
 *   "cuadMatch": {
 *     "exampleId": "cuad_nda_042",
 *     "similarity": 0.94
 *   },
 *   "reasoning": "Standard 5-year term is market-appropriate for trade secrets"
 * }
 * ```
 */

/**
 * Clause extraction metadata structure.
 *
 * @typedef {Object} ClauseMetadata
 * @property {string} [extractionMethod] - How the clause was identified ('llm' | 'rule' | 'hybrid')
 * @property {string} [modelVersion] - Claude model version used for extraction
 * @property {number} [processingOrder] - Order in which clause was processed
 * @property {boolean} [requiresReview] - Flag for human review queue
 * @property {string[]} [tags] - Custom tags for filtering
 *
 * @example
 * ```json
 * {
 *   "extractionMethod": "llm",
 *   "modelVersion": "claude-sonnet-4-20250514",
 *   "processingOrder": 12,
 *   "requiresReview": false,
 *   "tags": ["mutual", "standard-term"]
 * }
 * ```
 */

/**
 * Clause Extractions Table
 *
 * Stores individual clauses extracted from NDA documents, classified according
 * to the CUAD 41-category taxonomy with risk assessments and supporting evidence.
 *
 * @description
 * The `clauseExtractions` table captures granular clause-level analysis produced
 * by the Classifier Agent and Risk Scorer Agent. Each row represents a single
 * clause identified in the document with:
 *
 * - **Classification**: Primary CUAD category and optional secondary categories
 * - **Risk Assessment**: Per-clause risk level with explanation
 * - **Evidence**: Citations and reasoning supporting the assessment
 * - **Position**: Character offsets for document highlighting
 *
 * ## CUAD Classification
 *
 * The `category` field contains one of the 41 CUAD taxonomy categories.
 * Some clauses may span multiple categories (e.g., a non-compete with
 * non-solicitation language), captured in `secondaryCategories`.
 *
 * Common categories for NDAs:
 * - `'Parties'` - Identification of contracting parties
 * - `'Effective Date'` - When the agreement becomes effective
 * - `'Expiration Date'` - Term end date or duration
 * - `'Governing Law'` - Choice of law clause
 * - `'Non-Compete'` - Competitive restriction provisions
 * - `'Exclusivity'` - Exclusive dealing requirements
 * - `'Termination For Convenience'` - Early termination rights
 * - `'Cap On Liability'` - Liability limitation provisions
 *
 * ## Chunk Association
 *
 * The optional `chunkId` field links to the document chunk containing this
 * clause, enabling efficient retrieval of surrounding context and vector
 * similarity searches against the clause embedding.
 *
 * @example
 * ```typescript
 * // Query high-risk clauses for an analysis
 * const { db, tenantId } = await withTenant()
 * const riskyClause = await db
 *   .select()
 *   .from(clauseExtractions)
 *   .where(and(
 *     eq(clauseExtractions.analysisId, analysisId),
 *     eq(clauseExtractions.tenantId, tenantId),
 *     inArray(clauseExtractions.riskLevel, ['high', 'critical'])
 *   ))
 *   .orderBy(desc(clauseExtractions.confidence))
 * ```
 *
 * @see {@link analyses} for parent analysis record
 * @see {@link documentChunks} for associated text chunks
 */
export const clauseExtractions = pgTable(
  "clause_extractions",
  {
    /**
     * Primary key (UUID v7 for time-ordered sorting).
     * @see {@link primaryId} helper from _columns.ts
     */
    ...primaryId,

    /**
     * Tenant identifier for multi-org isolation.
     * Must match parent analysis tenantId.
     * @see {@link tenantId} helper from _columns.ts
     */
    ...tenantId,

    /**
     * Reference to the parent analysis record.
     * Cascades on delete to remove extractions when analysis is deleted.
     */
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),

    /**
     * Reference to the source document.
     * Denormalized for efficient document-level clause queries.
     * Cascades on delete to remove extractions when document is deleted.
     */
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    /**
     * Optional reference to the document chunk containing this clause.
     *
     * Links to the chunked representation for:
     * - Retrieving surrounding context
     * - Vector similarity searches via chunk embeddings
     * - Position mapping within the document
     *
     * May be null if clause spans multiple chunks or was extracted
     * from the full document without chunking.
     */
    chunkId: uuid("chunk_id").references(() => documentChunks.id),

    /**
     * Primary CUAD taxonomy category for this clause.
     *
     * One of 41 categories from the Contract Understanding Atticus Dataset:
     *
     * **Identification & Dates:**
     * - `'Document Name'`, `'Parties'`, `'Agreement Date'`
     * - `'Effective Date'`, `'Expiration Date'`
     *
     * **Terms & Conditions:**
     * - `'Renewal Term'`, `'Notice Period To Terminate Renewal'`
     * - `'Governing Law'`, `'Jurisdiction'`
     *
     * **Restrictions:**
     * - `'Anti-Assignment'`, `'Non-Compete'`, `'Exclusivity'`
     * - `'No-Solicitation of Employees'`, `'No-Solicitation of Customers'`
     * - `'Competitive Restriction Exception'`, `'Non-Disparagement'`
     *
     * **Termination:**
     * - `'Termination For Convenience'`, `'Rofr/Rofo/Rofn'`
     * - `'Change of Control'`
     *
     * **Liability & Risk:**
     * - `'Audit Rights'`, `'Uncapped Liability'`, `'Cap On Liability'`
     * - `'Liquidated Damages'`, `'Warranty Duration'`, `'Insurance'`
     * - `'Covenant Not To Sue'`, `'Third Party Beneficiary'`
     *
     * **Intellectual Property:**
     * - `'IP Ownership Assignment'`, `'Joint IP Ownership'`
     * - `'License Grant'`, `'Non-Transferable License'`
     * - `'Affiliate License'`, `'Unlimited/All-You-Can-Eat License'`
     * - `'Irrevocable Or Perpetual License'`, `'Source Code Escrow'`
     *
     * **Commercial Terms:**
     * - `'Post-Termination Services'`, `'Most Favored Nation'`
     * - `'Price Restrictions'`, `'Minimum Commitment'`
     * - `'Volume Restriction'`, `'Revenue/Profit Sharing'`
     */
    category: text("category").notNull(),

    /**
     * Additional CUAD categories applicable to this clause.
     *
     * Used when a clause covers multiple legal concepts.
     * For example, a comprehensive non-compete may also include
     * non-solicitation language: `['No-Solicitation of Employees']`
     */
    secondaryCategories: text("secondary_categories").array(),

    /**
     * The extracted clause text from the document.
     *
     * Contains the verbatim text identified as belonging to this
     * category. May include surrounding context for clarity.
     */
    clauseText: text("clause_text").notNull(),

    /**
     * Character offset where clause begins in source document.
     *
     * Used for document highlighting and navigation.
     * Zero-indexed from document start.
     */
    startPosition: integer("start_position"),

    /**
     * Character offset where clause ends in source document.
     *
     * Used for document highlighting and navigation.
     * Exclusive (points to character after last character of clause).
     */
    endPosition: integer("end_position"),

    /**
     * Classification confidence score from 0 to 1.
     *
     * Indicates the Classifier Agent's confidence that this text
     * belongs to the assigned category:
     * - 0.9+ : High confidence, clear category match
     * - 0.7-0.9: Moderate confidence, likely correct
     * - 0.5-0.7: Low confidence, may need human review
     * - <0.5: Uncertain, flagged for review
     */
    confidence: real("confidence").notNull(),

    /**
     * Risk level assessment for this specific clause.
     *
     * Valid values: `'low'` | `'medium'` | `'high'` | `'critical'`
     *
     * Determined by the Risk Scorer Agent based on:
     * - Deviation from market-standard language
     * - Potential legal/business exposure
     * - Missing protective provisions
     * - One-sided or unusual terms
     */
    riskLevel: text("risk_level").notNull(),

    /**
     * Human-readable explanation of the risk assessment.
     *
     * Generated by the Risk Scorer Agent to explain why this
     * clause received its risk level. Useful for:
     * - Legal team review
     * - Negotiation preparation
     * - Client communication
     *
     * @example "5-year non-compete is standard, but geographic scope
     *          is unusually broad (worldwide) which may be unenforceable
     *          in certain jurisdictions and limits business opportunities."
     */
    riskExplanation: text("risk_explanation"),

    /**
     * Supporting evidence for the classification and risk assessment.
     *
     * JSONB schema: {@link ClauseEvidence}
     *
     * Contains:
     * - `citations`: Specific text excerpts from the clause
     * - `comparisons`: References to similar CUAD training examples
     * - `cuadMatch`: Similarity score to closest CUAD example
     * - `reasoning`: LLM explanation of the assessment
     *
     * @see ClauseEvidence for full schema
     */
    evidence: jsonb("evidence"),

    /**
     * Additional metadata about the extraction process.
     *
     * JSONB schema: {@link ClauseMetadata}
     *
     * Contains:
     * - `extractionMethod`: How clause was identified
     * - `modelVersion`: Claude model version used
     * - `processingOrder`: Sequence in extraction batch
     * - `requiresReview`: Flag for human review queue
     * - `tags`: Custom filtering tags
     *
     * @default {}
     * @see ClauseMetadata for full schema
     */
    metadata: jsonb("metadata").default({}),

    /**
     * Automatic timestamp fields (createdAt, updatedAt).
     * @see {@link timestamps} helper from _columns.ts
     */
    ...timestamps,
  },
  (table) => [
    /**
     * Index for efficient analysis-scoped queries.
     * Used when retrieving all clauses for a specific analysis.
     */
    index("idx_clauses_analysis").on(table.analysisId),

    /**
     * Index for category-based filtering.
     * Enables efficient queries like "find all Non-Compete clauses".
     */
    index("idx_clauses_category").on(table.category),

    /**
     * Index for tenant-scoped queries.
     * Ensures RLS-filtered queries remain performant.
     */
    index("idx_clauses_tenant").on(table.tenantId),

    /**
     * Unique constraint for idempotent clause inserts.
     * Each chunk should produce at most one extraction per analysis.
     * Enables ON CONFLICT DO UPDATE for safe retries.
     */
    unique("clause_analysis_chunk").on(table.analysisId, table.chunkId),
  ]
)
