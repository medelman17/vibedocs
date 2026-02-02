/**
 * @fileoverview NDA Comparison Schema
 *
 * This module defines the database schema for side-by-side NDA comparisons.
 * The comparison feature enables users to select two documents (uploaded NDAs,
 * reference templates, or generated drafts) and view clause-level alignment
 * with highlighted differences and gap analysis.
 *
 * ## Feature Overview
 *
 * The comparison workflow:
 * 1. User selects two documents to compare (Document A and Document B)
 * 2. System embeds all clauses from both documents using voyage-law-2
 * 3. Computes pairwise cosine similarity matrix between clause embeddings
 * 4. Uses Hungarian algorithm or greedy matching (threshold > 0.7) for optimal clause alignment
 * 5. For aligned clause pairs, Claude describes substantive differences
 * 6. Unaligned clauses are flagged as gaps in the respective document
 * 7. Generates a summary of key differences with risk implications
 *
 * ## Related User Stories
 *
 * - **US-007:** As a user, I can select two NDAs to compare side-by-side
 * - **US-008:** As a user, I see clause-level alignment with differences highlighted
 *
 * @module db/schema/comparisons
 * @see {@link docs/PRD.md} F-004: NDA Comparison for full specification
 * @see {@link docs/schema.md} for SQL schema reference
 */

import { pgTable, text, uuid, jsonb, index } from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId } from "../_columns"
import { documents } from "./documents"

/**
 * Represents an aligned pair of clauses between two compared documents.
 *
 * @typedef {Object} ClauseAlignment
 * @property {string} clauseAId - UUID of the clause extraction from Document A
 * @property {string} clauseBId - UUID of the clause extraction from Document B
 * @property {number} similarityScore - Cosine similarity score between embeddings (0.0-1.0)
 * @property {string} categoryCode - CUAD category code (e.g., "confidentiality", "non_compete")
 * @property {string | null} differenceDescription - Claude-generated description of substantive differences
 * @property {('identical' | 'similar' | 'different' | 'missing_in_a' | 'missing_in_b')} matchType - Classification of the alignment
 */

/**
 * Represents a key difference identified between the two compared documents.
 *
 * @typedef {Object} KeyDifference
 * @property {string} categoryCode - CUAD category code for the differing clause type
 * @property {string} title - Human-readable title of the difference (e.g., "Confidentiality Period Mismatch")
 * @property {string} description - Detailed description of what differs and why it matters
 * @property {('low' | 'medium' | 'high')} riskImplication - Risk level of this difference for negotiation
 * @property {string | null} clauseAExcerpt - Relevant text excerpt from Document A
 * @property {string | null} clauseBExcerpt - Relevant text excerpt from Document B
 * @property {string | null} recommendation - Suggested action or negotiation point
 */

/**
 * Schema for the `clause_alignments` JSONB column.
 *
 * Stores the results of clause-level semantic matching between two documents.
 * Each entry represents either a matched pair of clauses or an unmatched clause
 * present in only one document.
 *
 * @example
 * // Example clauseAlignments structure
 * const clauseAlignments = {
 *   alignments: [
 *     {
 *       clauseAId: "550e8400-e29b-41d4-a716-446655440001",
 *       clauseBId: "550e8400-e29b-41d4-a716-446655440002",
 *       similarityScore: 0.89,
 *       categoryCode: "confidentiality",
 *       matchType: "similar",
 *       differenceDescription: "Document A specifies a 3-year confidentiality period while Document B specifies 5 years"
 *     },
 *     {
 *       clauseAId: "550e8400-e29b-41d4-a716-446655440003",
 *       clauseBId: null,
 *       similarityScore: null,
 *       categoryCode: "non_compete",
 *       matchType: "missing_in_b",
 *       differenceDescription: "Document A contains a non-compete clause not present in Document B"
 *     }
 *   ],
 *   metadata: {
 *     algorithmUsed: "hungarian",
 *     matchingThreshold: 0.7,
 *     totalClausesA: 15,
 *     totalClausesB: 12,
 *     matchedPairs: 10,
 *     unmatchedA: 5,
 *     unmatchedB: 2
 *   }
 * }
 */

/**
 * Schema for the `key_differences` JSONB column.
 *
 * Stores a summarized list of the most significant differences between
 * the compared documents, with risk implications for negotiation.
 *
 * @example
 * // Example keyDifferences structure
 * const keyDifferences = {
 *   differences: [
 *     {
 *       categoryCode: "term_of_agreement",
 *       title: "Agreement Duration Mismatch",
 *       description: "Document A proposes a 2-year term while Document B proposes perpetual",
 *       riskImplication: "high",
 *       clauseAExcerpt: "This Agreement shall remain in effect for two (2) years",
 *       clauseBExcerpt: "This Agreement shall remain in effect in perpetuity",
 *       recommendation: "Negotiate a finite term with renewal options"
 *     },
 *     {
 *       categoryCode: "governing_law",
 *       title: "Jurisdiction Difference",
 *       description: "Different governing law jurisdictions specified",
 *       riskImplication: "medium",
 *       clauseAExcerpt: "governed by the laws of Delaware",
 *       clauseBExcerpt: "governed by the laws of California",
 *       recommendation: "Consider neutral jurisdiction or your preferred venue"
 *     }
 *   ],
 *   summary: {
 *     totalDifferences: 8,
 *     highRiskCount: 2,
 *     mediumRiskCount: 3,
 *     lowRiskCount: 3,
 *     overallAssessment: "Significant differences in term and liability require negotiation"
 *   }
 * }
 */

/**
 * NDA Comparison table for storing side-by-side document comparison results.
 *
 * This table stores snapshots of comparison analyses between two NDA documents.
 * Each comparison record captures the clause-level alignment, key differences,
 * and a summary generated by the comparison pipeline.
 *
 * ## Document Reference Pattern
 *
 * The table uses two foreign keys (`documentAId` and `documentBId`) referencing
 * the `documents` table. The comparison is inherently bidirectional - comparing
 * A vs B is semantically equivalent to B vs A. By convention:
 * - `documentAId` is typically the "baseline" or "your" document
 * - `documentBId` is typically the "incoming" or "their" document
 *
 * However, the application layer should handle both orderings gracefully.
 *
 * ## Processing Pipeline
 *
 * Comparisons are processed asynchronously via Inngest:
 * 1. Record created with status='pending'
 * 2. Embedding job retrieves/generates clause embeddings for both docs
 * 3. Similarity matrix computed and alignment algorithm runs
 * 4. Claude generates difference descriptions for aligned pairs
 * 5. Key differences summarized and status='completed'
 *
 * ## Multi-Tenancy
 *
 * This table is tenant-scoped via `tenantId` with Row-Level Security (RLS)
 * enforced at the database level. All queries must include tenant context.
 *
 * @description Stores NDA side-by-side comparison results including clause alignment
 * and key differences between Document A and Document B.
 *
 * @example
 * // Create a new comparison request
 * import { db } from "@/db"
 * import { comparisons } from "@/db/schema"
 * import { eq, and } from "drizzle-orm"
 *
 * const newComparison = await db.insert(comparisons).values({
 *   tenantId: "tenant-uuid",
 *   documentAId: "doc-a-uuid",
 *   documentBId: "doc-b-uuid",
 *   status: "pending"
 * }).returning()
 *
 * @example
 * // Query comparison with full results
 * const result = await db.query.comparisons.findFirst({
 *   where: eq(comparisons.id, comparisonId),
 *   with: {
 *     documentA: true,
 *     documentB: true
 *   }
 * })
 *
 * @example
 * // Find all comparisons involving a specific document
 * const relatedComparisons = await db
 *   .select()
 *   .from(comparisons)
 *   .where(
 *     and(
 *       eq(comparisons.tenantId, tenantId),
 *       or(
 *         eq(comparisons.documentAId, documentId),
 *         eq(comparisons.documentBId, documentId)
 *       )
 *     )
 *   )
 *
 * @example
 * // Update comparison with results after processing
 * await db
 *   .update(comparisons)
 *   .set({
 *     status: "completed",
 *     summary: "Documents are substantially similar with 3 key differences...",
 *     clauseAlignments: alignmentResults,
 *     keyDifferences: differencesSummary
 *   })
 *   .where(eq(comparisons.id, comparisonId))
 */
export const comparisons = pgTable(
  "comparisons",
  {
    /**
     * Primary key - auto-generated UUID.
     * @see {@link primaryId} from _columns.ts
     */
    ...primaryId,

    /**
     * Tenant/organization ID for multi-tenancy isolation.
     * References the organization that owns this comparison.
     * Used for Row-Level Security (RLS) enforcement.
     * @see {@link tenantId} from _columns.ts
     */
    ...tenantId,

    /**
     * Reference to the first document in the comparison (Document A).
     *
     * By convention, this is typically the "baseline" document - often
     * the user's preferred template or the document they're evaluating against.
     *
     * @type {string} UUID referencing documents.id
     * @required
     * @see {@link documents} table
     */
    documentAId: uuid("document_a_id")
      .notNull()
      .references(() => documents.id),

    /**
     * Reference to the second document in the comparison (Document B).
     *
     * By convention, this is typically the "incoming" document - often
     * a counterparty's draft or a document being reviewed against the baseline.
     *
     * @type {string} UUID referencing documents.id
     * @required
     * @see {@link documents} table
     */
    documentBId: uuid("document_b_id")
      .notNull()
      .references(() => documents.id),

    /**
     * Current processing status of the comparison.
     *
     * @type {('pending' | 'processing' | 'completed' | 'error')}
     * @default 'pending'
     *
     * Status transitions:
     * - `pending` - Initial state, comparison request created but not yet processed
     * - `processing` - Actively running: embedding retrieval, alignment, or Claude analysis
     * - `completed` - Successfully finished with results populated
     * - `error` - Processing failed; check application logs for details
     *
     * @example
     * // Filter for completed comparisons only
     * const completedComparisons = await db
     *   .select()
     *   .from(comparisons)
     *   .where(eq(comparisons.status, "completed"))
     */
    status: text("status").notNull().default("pending"),

    /**
     * Human-readable summary of the comparison results.
     *
     * Generated by Claude after analysis is complete. Provides a high-level
     * overview of how the two documents compare, highlighting the most
     * significant similarities and differences.
     *
     * @type {string | null}
     * @nullable - Null until processing completes
     *
     * @example
     * // "These NDAs are substantially similar with 3 key differences:
     * // 1) Document B has a longer confidentiality period (5 years vs 3 years)
     * // 2) Document A includes a non-compete clause absent from Document B
     * // 3) Different governing law jurisdictions (Delaware vs California)"
     */
    summary: text("summary"),

    /**
     * JSONB object containing clause-level alignment results.
     *
     * Stores the output of the semantic matching algorithm (Hungarian or greedy)
     * that pairs clauses between the two documents based on embedding similarity.
     *
     * Structure:
     * - `alignments`: Array of {@link ClauseAlignment} objects
     * - `metadata`: Algorithm configuration and statistics
     *
     * @type {ClauseAlignmentsSchema | null}
     * @nullable - Null until processing completes
     * @see ClauseAlignment typedef for alignment entry structure
     */
    clauseAlignments: jsonb("clause_alignments"),

    /**
     * JSONB object containing summarized key differences with risk implications.
     *
     * Stores the most significant differences between the compared documents,
     * prioritized by risk level and relevance for negotiation.
     *
     * Structure:
     * - `differences`: Array of {@link KeyDifference} objects
     * - `summary`: Overall statistics and assessment
     *
     * @type {KeyDifferencesSchema | null}
     * @nullable - Null until processing completes
     * @see KeyDifference typedef for difference entry structure
     */
    keyDifferences: jsonb("key_differences"),

    /**
     * Timestamp columns for record lifecycle tracking.
     * - `createdAt`: When the comparison request was created
     * - `updatedAt`: When the record was last modified (auto-updated)
     * @see {@link timestamps} from _columns.ts
     */
    ...timestamps,
  },
  (table) => [
    /**
     * Index for tenant-scoped queries.
     * Supports efficient filtering by organization for RLS and list views.
     */
    index("idx_comparisons_tenant").on(table.tenantId),

    /**
     * Composite index for document pair lookups.
     * Optimizes queries that filter by either document in the comparison.
     * Note: For bidirectional lookups, also query with documents reversed.
     */
    index("idx_comparisons_docs").on(table.documentAId, table.documentBId),
  ]
)
