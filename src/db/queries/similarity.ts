/**
 * @fileoverview Vector Similarity Search Layer for NDA Analysis
 *
 * This module provides the core vector similarity search functionality for the VibeDocs
 * application, enabling semantic search across document chunks and reference corpora using
 * pgvector's HNSW-indexed cosine distance operations.
 *
 * ## Embedding Model
 *
 * All embeddings are generated using Voyage AI's `voyage-law-2` model:
 * - **Dimensions**: 1024
 * - **Context Window**: 16,384 tokens
 * - **Optimized For**: Legal document understanding and semantic similarity
 *
 * ## Distance vs Similarity Conversion
 *
 * pgvector's `cosineDistance()` returns a **distance** value (0 = identical, 2 = opposite),
 * but semantic search typically uses **similarity** scores (1 = identical, 0 = orthogonal).
 *
 * Conversion formula: `similarity = 1 - cosineDistance`
 *
 * | Distance | Similarity | Interpretation                    |
 * |----------|------------|-----------------------------------|
 * | 0.0      | 1.0        | Identical vectors                 |
 * | 0.2      | 0.8        | Highly similar (strong match)     |
 * | 0.4      | 0.6        | Moderately similar (weak match)   |
 * | 1.0      | 0.0        | Orthogonal (no relationship)      |
 * | 2.0      | -1.0       | Opposite (contradictory)          |
 *
 * ## HNSW Index Optimization
 *
 * Tables using these queries have HNSW indexes for efficient approximate nearest neighbor search:
 *
 * ```sql
 * CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);
 * CREATE INDEX ON reference_embeddings USING hnsw (embedding vector_cosine_ops);
 * ```
 *
 * **Important**: HNSW indexes should be created AFTER bulk data loading for optimal
 * index structure. The index parameters (m=16, ef_construction=64 by default) provide
 * a good balance of recall and performance for our corpus size.
 *
 * ## Threshold Filtering Pattern
 *
 * All functions apply threshold filtering **after** the query returns results, rather than
 * in the WHERE clause. This is because:
 *
 * 1. pgvector HNSW indexes only accelerate ORDER BY operations, not WHERE filters on distance
 * 2. Adding a WHERE clause on computed similarity would force a sequential scan
 * 3. Post-query filtering on a small LIMIT'd result set is negligible overhead
 *
 * @module db/queries/similarity
 * @see {@link https://github.com/pgvector/pgvector} pgvector documentation
 * @see {@link https://docs.voyageai.com/docs/embeddings} Voyage AI embeddings
 */

import { cosineDistance, desc, eq, and, sql } from "drizzle-orm"
import { db } from "../client"
import { documentChunks } from "../schema/documents"
import { referenceEmbeddings } from "../schema/reference"

/**
 * Granularity levels for embeddings in the reference corpus.
 *
 * These levels represent the hierarchical structure of legal documents and
 * determine how embeddings are organized for different search use cases.
 *
 * @description
 * - **document**: Full document embedding (used for document-level similarity)
 * - **section**: Major sections like "Confidentiality Obligations", "Term and Termination"
 * - **clause**: Individual contractual clauses, mapped to CUAD 41-category taxonomy
 * - **span**: Sub-clause text spans for fine-grained evidence extraction
 * - **template**: Template sections for NDA generation and clause suggestion
 *
 * @example
 * ```typescript
 * // Classifier Agent uses clause-level for CUAD categorization
 * const categories = await findMatchingCategories(clauseEmbedding)
 *
 * // NDA Generator uses template-level for clause suggestions
 * const templates = await findSimilarTemplates(requirementEmbedding)
 * ```
 */
export type Granularity =
  | "document"
  | "section"
  | "clause"
  | "span"
  | "template"

/**
 * Find semantically similar chunks within tenant documents for RAG retrieval.
 *
 * @description
 * Searches the `document_chunks` table for chunks semantically similar to the
 * provided embedding vector. This is the primary RAG retrieval function used
 * by agents to find relevant context from uploaded NDAs.
 *
 * The search is always scoped to a specific tenant (organization) for data
 * isolation. Optionally, results can be further scoped to a specific document.
 *
 * Uses HNSW-indexed cosine distance for efficient approximate nearest neighbor
 * search, with post-query threshold filtering for precision.
 *
 * @param embedding - Query embedding vector from voyage-law-2 (must be 1024 dimensions)
 * @param tenantId - Organization ID for tenant isolation (from session.activeOrganizationId)
 * @param options - Search configuration options
 * @param options.limit - Maximum results to return before threshold filtering (default: 10)
 * @param options.threshold - Minimum similarity score (0-1) to include in results (default: 0.8)
 * @param options.documentId - Optional document ID to scope search to a single document
 *
 * @returns Promise resolving to array of similar chunks with similarity scores.
 * Results are sorted by similarity (descending) and filtered by threshold.
 * - `id`: Chunk UUID
 * - `documentId`: Parent document UUID
 * - `chunkIndex`: Position in document (0-indexed)
 * - `content`: Chunk text content
 * - `sectionPath`: Hierarchical section path (e.g., "Article 5 / Confidentiality")
 * - `similarity`: Computed similarity score (1.0 = identical, threshold = minimum)
 *
 * @example
 * ```typescript
 * import { embed } from "@/lib/voyage"
 * import { findSimilarChunks } from "@/db/queries/similarity"
 *
 * // Generate embedding for user's question
 * const queryEmbedding = await embed("What are the confidentiality obligations?")
 *
 * // Find relevant chunks from tenant's documents
 * const relevantChunks = await findSimilarChunks(
 *   queryEmbedding,
 *   session.activeOrganizationId,
 *   {
 *     limit: 5,
 *     threshold: 0.75,
 *     documentId: currentDocumentId // Optional: scope to current document
 *   }
 * )
 *
 * // Use chunks as RAG context for LLM
 * const context = relevantChunks.map(c => c.content).join("\n\n")
 * ```
 *
 * @see {@link documentChunks} Schema definition for document chunks table
 */
export async function findSimilarChunks(
  embedding: number[],
  tenantId: string,
  options: {
    limit?: number
    threshold?: number
    documentId?: string
  } = {}
) {
  const { limit = 10, threshold = 0.8, documentId } = options

  const similarity = sql<number>`1 - ${cosineDistance(documentChunks.embedding, embedding)}`

  const conditions = [eq(documentChunks.tenantId, tenantId)]
  if (documentId) {
    conditions.push(eq(documentChunks.documentId, documentId))
  }

  const results = await db
    .select({
      id: documentChunks.id,
      documentId: documentChunks.documentId,
      chunkIndex: documentChunks.chunkIndex,
      content: documentChunks.content,
      sectionPath: documentChunks.sectionPath,
      similarity,
    })
    .from(documentChunks)
    .where(and(...conditions))
    .orderBy(desc(similarity))
    .limit(limit)

  // Filter by threshold after query (cosineDistance returns distance, not similarity)
  // Post-query filtering is used because HNSW indexes only accelerate ORDER BY,
  // not WHERE clauses on computed distance values
  return results.filter((r) => r.similarity >= threshold)
}

/**
 * Find semantically similar embeddings in the shared reference corpus.
 *
 * @description
 * Searches the `reference_embeddings` table containing pre-computed embeddings
 * for reference materials including:
 *
 * - **CUAD Dataset**: 510 contracts with 41 clause categories for classification
 * - **ContractNLI**: Entailment/contradiction labeled spans for NLI tasks
 * - **NDA Templates**: Curated template clauses for generation
 *
 * Unlike `findSimilarChunks`, this searches across the shared corpus that is
 * not tenant-scoped, as reference materials are shared across all organizations.
 *
 * Results can be filtered by granularity level and/or category to narrow
 * the search space for specific use cases.
 *
 * @param embedding - Query embedding vector from voyage-law-2 (must be 1024 dimensions)
 * @param options - Search configuration options
 * @param options.granularity - Filter by embedding granularity level (document/section/clause/span/template)
 * @param options.category - Filter by CUAD category (e.g., "Confidentiality", "Termination for Convenience")
 * @param options.limit - Maximum results to return before threshold filtering (default: 10)
 * @param options.threshold - Minimum similarity score (0-1) to include in results (default: 0.7)
 *
 * @returns Promise resolving to array of similar reference embeddings with similarity scores.
 * Results are sorted by similarity (descending) and filtered by threshold.
 * - `id`: Reference embedding UUID
 * - `documentId`: Source reference document UUID
 * - `granularity`: Embedding granularity level
 * - `content`: Reference text content
 * - `sectionPath`: Hierarchical section path in source document
 * - `category`: CUAD category label (if applicable)
 * - `nliLabel`: ContractNLI entailment label (if applicable)
 * - `similarity`: Computed similarity score (1.0 = identical, threshold = minimum)
 *
 * @example
 * ```typescript
 * import { embed } from "@/lib/voyage"
 * import { findSimilarReferences } from "@/db/queries/similarity"
 *
 * // Find similar CUAD clause examples for a detected clause
 * const clauseEmbedding = await embed(extractedClauseText)
 *
 * const similarClauses = await findSimilarReferences(clauseEmbedding, {
 *   granularity: "clause",
 *   category: "Non-Compete", // Optional: search within specific category
 *   limit: 10,
 *   threshold: 0.65
 * })
 *
 * // Use similar clauses for few-shot examples or risk comparison
 * ```
 *
 * @see {@link referenceEmbeddings} Schema definition for reference embeddings table
 * @see {@link Granularity} Available granularity levels
 */
export async function findSimilarReferences(
  embedding: number[],
  options: {
    granularity?: Granularity
    category?: string
    limit?: number
    threshold?: number
  } = {}
) {
  const { granularity, category, limit = 10, threshold = 0.7 } = options

  const similarity = sql<number>`1 - ${cosineDistance(referenceEmbeddings.embedding, embedding)}`

  const conditions = []
  if (granularity) {
    conditions.push(eq(referenceEmbeddings.granularity, granularity))
  }
  if (category) {
    conditions.push(eq(referenceEmbeddings.category, category))
  }

  const query = db
    .select({
      id: referenceEmbeddings.id,
      documentId: referenceEmbeddings.documentId,
      granularity: referenceEmbeddings.granularity,
      content: referenceEmbeddings.content,
      sectionPath: referenceEmbeddings.sectionPath,
      category: referenceEmbeddings.category,
      nliLabel: referenceEmbeddings.nliLabel,
      similarity,
    })
    .from(referenceEmbeddings)
    .orderBy(desc(similarity))
    .limit(limit)

  const results =
    conditions.length > 0
      ? await query.where(and(...conditions))
      : await query

  return results.filter((r) => r.similarity >= threshold)
}

/**
 * Find the best matching CUAD categories for a clause embedding.
 *
 * @description
 * Specialized search function for the Classifier Agent to determine which
 * of the 41 CUAD categories best match an extracted clause. This is a
 * convenience wrapper around `findSimilarReferences` that:
 *
 * 1. Restricts search to clause-level embeddings only
 * 2. Uses a lower default threshold (0.6) for broader category matching
 * 3. Returns fewer results (5) for top-k category voting
 *
 * The Classifier Agent uses similarity scores from multiple returned matches
 * to make category assignments, often using the category with the highest
 * aggregate similarity across matches.
 *
 * ## CUAD 41-Category Taxonomy
 *
 * Categories include: Anti-Assignment, Audit Rights, Cap on Liability,
 * Change of Control, Competitive Restriction, Confidentiality, Covenant Not
 * to Sue, Effective Date, Exclusivity, Expiration Date, Governing Law,
 * Indemnification, Insurance, IP Ownership, Irrevocable or Perpetual License,
 * Joint IP Ownership, License Grant, Limitation of Liability, Liquidated
 * Damages, Minimum Commitment, Most Favored Nation, No-Solicit, Non-Compete,
 * Non-Disparagement, Non-Transferable License, Notice Period, Post-Termination
 * Services, Price Restriction, Renewal Term, Revenue/Profit Sharing, Rofr/Rofo,
 * Source Code Escrow, Termination for Convenience, Third Party Beneficiary,
 * Uncapped Liability, Unlimited/All-You-Can-Eat License, Volume Restriction,
 * Warranty Duration, and more.
 *
 * @param embedding - Query embedding vector from voyage-law-2 (must be 1024 dimensions).
 *                    Should be the embedding of an extracted clause from the Parser Agent.
 * @param options - Search configuration options
 * @param options.limit - Maximum category matches to return (default: 5)
 * @param options.threshold - Minimum similarity for category consideration (default: 0.6)
 *
 * @returns Promise resolving to array of matching reference clauses with their
 * categories and similarity scores. Use the `category` field to determine
 * classification and `similarity` for confidence scoring.
 *
 * @example
 * ```typescript
 * import { embed } from "@/lib/voyage"
 * import { findMatchingCategories } from "@/db/queries/similarity"
 *
 * // In Classifier Agent: classify an extracted clause
 * const clauseText = "Either party may terminate this Agreement for convenience upon 30 days written notice."
 * const clauseEmbedding = await embed(clauseText)
 *
 * const matches = await findMatchingCategories(clauseEmbedding, {
 *   limit: 5,
 *   threshold: 0.55
 * })
 *
 * // Aggregate scores by category for voting
 * const categoryScores = matches.reduce((acc, m) => {
 *   acc[m.category] = (acc[m.category] || 0) + m.similarity
 *   return acc
 * }, {} as Record<string, number>)
 *
 * // Best category: "Termination for Convenience" with highest aggregate score
 * const bestCategory = Object.entries(categoryScores)
 *   .sort(([,a], [,b]) => b - a)[0][0]
 * ```
 *
 * @see {@link findSimilarReferences} Underlying search function
 * @see {@link https://www.atticusprojectai.org/cuad} CUAD dataset documentation
 */
export async function findMatchingCategories(
  embedding: number[],
  options: {
    limit?: number
    threshold?: number
  } = {}
) {
  const { limit = 5, threshold = 0.6 } = options

  return findSimilarReferences(embedding, {
    granularity: "clause",
    limit,
    threshold,
  })
}

/**
 * Find similar template sections for NDA generation.
 *
 * @description
 * Specialized search function for the NDA Generator to retrieve relevant
 * template clauses based on user requirements or existing clause content.
 * This is a convenience wrapper around `findSimilarReferences` that:
 *
 * 1. Restricts search to template-level embeddings only
 * 2. Uses a moderate threshold (0.65) balancing relevance and variety
 * 3. Returns focused results (5) for template selection
 *
 * The template corpus contains curated NDA clause templates organized by:
 * - **Clause Type**: Matching CUAD categories (Confidentiality, Non-Compete, etc.)
 * - **Tone/Style**: Mutual, one-sided (disclosing), one-sided (receiving)
 * - **Jurisdiction**: Common law, civil law variations
 * - **Industry**: Tech, healthcare, finance-specific language
 *
 * ## Usage in NDA Generation Pipeline
 *
 * 1. User specifies requirements (e.g., "strong confidentiality, 2-year term")
 * 2. Requirements are embedded with voyage-law-2
 * 3. `findSimilarTemplates` retrieves matching template clauses
 * 4. LLM synthesizes final NDA using templates as guidance/examples
 *
 * @param embedding - Query embedding vector from voyage-law-2 (must be 1024 dimensions).
 *                    Can be requirement text embedding or existing clause embedding
 *                    for finding alternative phrasings.
 * @param options - Search configuration options
 * @param options.limit - Maximum templates to return (default: 5)
 * @param options.threshold - Minimum similarity for template relevance (default: 0.65)
 *
 * @returns Promise resolving to array of matching template embeddings with
 * similarity scores. The `content` field contains the template clause text
 * and `sectionPath` indicates the clause type/category.
 *
 * @example
 * ```typescript
 * import { embed } from "@/lib/voyage"
 * import { findSimilarTemplates } from "@/db/queries/similarity"
 *
 * // In NDA Generator: find templates for user's requirements
 * const requirements = "I need a mutual confidentiality clause with carve-outs for publicly available information"
 * const reqEmbedding = await embed(requirements)
 *
 * const templates = await findSimilarTemplates(reqEmbedding, {
 *   limit: 3,
 *   threshold: 0.6
 * })
 *
 * // Use templates as examples for LLM generation
 * const templateExamples = templates
 *   .map(t => `### ${t.sectionPath}\n${t.content}`)
 *   .join("\n\n")
 *
 * // Pass to Claude with structured output for final NDA clause
 * const generatedClause = await generateClause({
 *   requirements,
 *   templateExamples,
 *   // ... other context
 * })
 * ```
 *
 * @see {@link findSimilarReferences} Underlying search function
 */
export async function findSimilarTemplates(
  embedding: number[],
  options: {
    limit?: number
    threshold?: number
  } = {}
) {
  const { limit = 5, threshold = 0.65 } = options

  return findSimilarReferences(embedding, {
    granularity: "template",
    limit,
    threshold,
  })
}
