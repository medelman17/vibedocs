/**
 * @fileoverview Shared Reference Database Schema
 *
 * This module defines the database tables for the shared reference database tier.
 * These tables contain read-only legal corpora data that is shared across all tenants
 * without Row-Level Security (RLS) - any authenticated user can query this data.
 *
 * ## Two-Tier Database Architecture
 *
 * The application uses a two-tier database model:
 * - **Tier 1 (Shared Reference)**: Read-only legal corpora, public reads, no RLS
 * - **Tier 2 (Tenant-Scoped)**: User documents and analyses, RLS-enforced via `tenant_id`
 *
 * Current implementation uses a single Neon database with logical schema separation.
 * Tables in this file belong to Tier 1 and are accessed via `neon-http` driver
 * (Edge-compatible, read-only, no transactions).
 *
 * ## Legal Corpora Sources
 *
 * The shared reference database contains embeddings from five legal corpora:
 *
 * | Dataset          | Records                 | ~Vectors | Primary Use Case                          |
 * |------------------|-------------------------|----------|-------------------------------------------|
 * | CUAD             | 510 contracts, 13K ann. | ~15K     | Clause taxonomy (41 categories)           |
 * | ContractNLI      | 607 NDAs, 17 hypotheses | ~10K     | NLI-grounded evidence spans               |
 * | Bonterms         | 1 template              | ~50      | Enterprise NDA generation                 |
 * | CommonAccord     | 3-5 templates           | ~100     | Modular Prose Object templates            |
 * | Kleister-NDA     | 540 NDAs                | ~8K      | Evaluation and benchmarking               |
 *
 * **Total: ~33K vectors at 1024 dimensions (voyage-law-2)**
 *
 * ## Multi-Granularity Embedding Strategy
 *
 * Documents are embedded at multiple granularity levels to support different
 * retrieval use cases:
 *
 * | Granularity  | Source                     | Use Case                              |
 * |--------------|----------------------------|---------------------------------------|
 * | document     | Full contract text         | High-level document similarity        |
 * | section      | Contract paragraphs        | Broad contextual retrieval, gap analysis |
 * | clause       | CUAD annotations           | Precise matching, category classification |
 * | span         | ContractNLI evidence spans | NLI-grounded risk assessment          |
 * | template     | Bonterms/CommonAccord      | NDA generation clause selection       |
 *
 * ## Bootstrap Pipeline
 *
 * Reference data is ingested via the `nda/bootstrap.start` Inngest event. The pipeline:
 * 1. Downloads datasets from HuggingFace Datasets Server API
 * 2. Parses CUAD (Parquet), ContractNLI (JSON), and templates (Markdown)
 * 3. Generates embeddings via Voyage AI voyage-law-2 (batched, rate-limited)
 * 4. Bulk inserts to Neon (500 rows/batch) with idempotent `ON CONFLICT DO NOTHING`
 * 5. Creates HNSW indexes AFTER data load for optimal build performance
 *
 * @see {@link file://./../../docs/embedding-strategy.md} - Full embedding strategy documentation
 * @see {@link file://./../../docs/schema.md} - Database schema reference
 * @see {@link file://./../../docs/PRD.md#8-bootstrap-pipeline} - Bootstrap pipeline architecture
 *
 * @module db/schema/reference
 */

import {
  pgTable,
  text,
  uuid,
  serial,
  integer,
  real,
  boolean,
  timestamp,
  index,
  vector,
  jsonb,
} from "drizzle-orm/pg-core"

/**
 * Legal corpora documents table.
 *
 * Stores the source documents from various legal corpora (CUAD contracts,
 * ContractNLI NDAs, Bonterms/CommonAccord templates, Kleister-NDA documents).
 * This is the parent table for reference embeddings.
 *
 * ## Source Field Values
 *
 * | Source         | Description                                                       |
 * |----------------|-------------------------------------------------------------------|
 * | `cuad`         | Contract Understanding Atticus Dataset - 510 commercial contracts |
 * |                | with 13K+ clause annotations across 41 legal categories           |
 * | `contract_nli` | ContractNLI dataset - 607 NDAs with NLI hypothesis annotations    |
 * |                | for entailment/contradiction/not_mentioned classification         |
 * | `bonterms`     | Bonterms Mutual NDA - Enterprise-grade, professionally drafted    |
 * |                | NDA template (CC BY 4.0 license)                                  |
 * | `commonaccord` | CommonAccord NDA templates - Modular Prose Object templates       |
 * |                | (NW-NDA, CooleyGo-NDA, Agt-NDA-CmA) under CC0 public domain       |
 * | `kleister`     | Kleister-NDA - 540 real-world NDAs (254 train/83 dev/203 test)    |
 * |                | with structured metadata annotations (parties, dates, terms)      |
 *
 * ## Idempotent Bulk Ingestion
 *
 * The `contentHash` field enables idempotent bulk ingestion during the bootstrap
 * pipeline. Each document is assigned a SHA-256 hash of its normalized text content.
 * The unique constraint allows `ON CONFLICT (content_hash) DO NOTHING` during
 * bulk inserts, preventing duplicate documents on re-runs of the bootstrap pipeline.
 *
 * Combined with Inngest's step memoization, this ensures the bootstrap pipeline
 * is fully idempotent and can be safely re-triggered when datasets are updated.
 *
 * @example
 * ```typescript
 * // Querying documents by source
 * const cuadDocs = await sharedDb
 *   .select()
 *   .from(referenceDocuments)
 *   .where(eq(referenceDocuments.source, 'cuad'))
 *   .limit(10)
 *
 * // Idempotent insertion with conflict handling
 * await sharedDb
 *   .insert(referenceDocuments)
 *   .values({
 *     source: 'cuad',
 *     sourceId: 'Contract123',
 *     title: 'Software License Agreement',
 *     rawText: fullContractText,
 *     contentHash: sha256(normalizeText(fullContractText)),
 *   })
 *   .onConflictDoNothing({ target: referenceDocuments.contentHash })
 * ```
 */
export const referenceDocuments = pgTable(
  "reference_documents",
  {
    /** UUID primary key, auto-generated */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Source corpus identifier.
     * One of: 'cuad' | 'contract_nli' | 'bonterms' | 'commonaccord' | 'kleister'
     */
    source: text("source").notNull(),

    /**
     * Original identifier from the source dataset.
     * Format varies by source:
     * - CUAD: `ContractName__CategoryName__Index`
     * - ContractNLI: Document ID from dataset
     * - Templates: Section/clause identifier
     */
    sourceId: text("source_id"),

    /** Human-readable document title */
    title: text("title").notNull(),

    /** Full document text content (may be null for large documents stored externally) */
    rawText: text("raw_text"),

    /**
     * Source-specific metadata as JSONB.
     * Contents vary by source:
     * - CUAD: `{ categories: string[], answerable: boolean }`
     * - ContractNLI: `{ hypotheses: number[], annotationSets: object }`
     * - Templates: `{ version: string, license: string }`
     * - Kleister: `{ parties: string[], effectiveDate: string, term: string }`
     */
    metadata: jsonb("metadata").default({}),

    /**
     * SHA-256 hash of normalized document content.
     * Used for idempotent bulk ingestion with `ON CONFLICT DO NOTHING`.
     * Unique constraint prevents duplicate documents.
     */
    contentHash: text("content_hash").unique(),

    /** Timestamp when document was ingested */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** Index for filtering by source corpus */
    index("idx_ref_docs_source").on(table.source),
    /** Index for idempotent lookup by content hash */
    index("idx_ref_docs_hash").on(table.contentHash),
  ]
)

/**
 * Multi-granularity embeddings for reference corpora.
 *
 * Stores vector embeddings at multiple granularity levels to support different
 * retrieval use cases. Uses a hierarchical self-referential structure where
 * child embeddings (clauses, spans) reference their parent (section, document).
 *
 * ## Hierarchical Structure
 *
 * ```
 * Document (granularity: 'document')
 *   └── Section (granularity: 'section', parentId → document)
 *         └── Clause (granularity: 'clause', parentId → section)
 *               └── Span (granularity: 'span', parentId → clause)
 * ```
 *
 * The `parentId` field creates a tree structure allowing navigation from
 * specific text spans up to their containing document context.
 *
 * ## Granularity Levels
 *
 * | Level    | Typical Size   | Primary Source       | Use Case                         |
 * |----------|----------------|----------------------|----------------------------------|
 * | document | Full contract  | All sources          | Document-level similarity        |
 * | section  | 1-5 paragraphs | Contract sections    | Contextual retrieval, gap analysis |
 * | clause   | 1-3 sentences  | CUAD annotations     | Category classification, matching |
 * | span     | 1-2 sentences  | ContractNLI evidence | NLI verification, risk grounding |
 * | template | Variable       | Bonterms/CommonAccord| NDA generation clause selection  |
 *
 * ## ContractNLI Integration
 *
 * For span-level embeddings from ContractNLI, additional fields provide NLI context:
 *
 * - `hypothesisId`: References the hypothesis being evaluated (1-17)
 * - `nliLabel`: The annotated label for this span relative to the hypothesis
 *   - `entailment`: Span confirms the hypothesis is true
 *   - `contradiction`: Span confirms the hypothesis is false
 *   - `not_mentioned`: Hypothesis is not addressed in the document
 *
 * This enables NLI-grounded risk assessment where the system can cite specific
 * evidence spans that support or contradict contractual obligations.
 *
 * ## HNSW Index Creation
 *
 * **IMPORTANT**: The HNSW vector index is created AFTER bulk data load, not
 * in this schema definition. This avoids index maintenance overhead during
 * the bootstrap pipeline's bulk insert operations.
 *
 * After bootstrap completes, create the index manually:
 * ```sql
 * CREATE INDEX idx_ref_embed_hnsw ON reference_embeddings
 *   USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
 * ```
 *
 * Index parameters:
 * - `m = 16`: Maximum connections per layer (good recall/speed for ~33K vectors)
 * - `ef_construction = 64`: Build-time quality factor
 * - `vector_cosine_ops`: Cosine distance for normalized text embeddings
 *
 * @example
 * ```typescript
 * // Vector similarity search for clause-level embeddings
 * const similarClauses = await sharedDb
 *   .select({
 *     content: referenceEmbeddings.content,
 *     category: referenceEmbeddings.category,
 *     distance: cosineDistance(referenceEmbeddings.embedding, queryVec),
 *   })
 *   .from(referenceEmbeddings)
 *   .where(
 *     and(
 *       eq(referenceEmbeddings.granularity, 'clause'),
 *       lt(cosineDistance(referenceEmbeddings.embedding, queryVec), 0.3)
 *     )
 *   )
 *   .orderBy(cosineDistance(referenceEmbeddings.embedding, queryVec))
 *   .limit(5)
 *
 * // Query ContractNLI spans for a specific hypothesis
 * const nliEvidence = await sharedDb
 *   .select()
 *   .from(referenceEmbeddings)
 *   .where(
 *     and(
 *       eq(referenceEmbeddings.granularity, 'span'),
 *       eq(referenceEmbeddings.hypothesisId, 4), // "Use restricted to stated purpose"
 *       eq(referenceEmbeddings.nliLabel, 'entailment')
 *     )
 *   )
 *   .limit(10)
 * ```
 */
export const referenceEmbeddings = pgTable(
  "reference_embeddings",
  {
    /** UUID primary key, auto-generated */
    id: uuid("id").primaryKey().defaultRandom(),

    /** Foreign key to the parent document */
    documentId: uuid("document_id")
      .notNull()
      .references(() => referenceDocuments.id, { onDelete: "cascade" }),

    /**
     * Self-reference for hierarchical structure.
     * - Document-level: null (root)
     * - Section-level: references document embedding
     * - Clause-level: references section embedding
     * - Span-level: references clause or section embedding
     */
    parentId: uuid("parent_id"),

    /**
     * Embedding granularity level.
     * One of: 'document' | 'section' | 'clause' | 'span' | 'template'
     */
    granularity: text("granularity").notNull(),

    /** The text content that was embedded */
    content: text("content").notNull(),

    /**
     * Hierarchical path to this content within the document.
     * Preserves document structure for contextual retrieval.
     * @example ['Article 5', 'Section 5.2', 'Clause (b)']
     */
    sectionPath: text("section_path").array(),

    /**
     * CUAD category label for clause-level embeddings.
     * One of the 41 CUAD taxonomy categories.
     * @see cuadCategories table for category definitions
     */
    category: text("category"),

    /**
     * ContractNLI hypothesis ID for span-level embeddings.
     * Integer 1-17 referencing the hypothesis being evaluated.
     * @see contractNliHypotheses table for hypothesis definitions
     */
    hypothesisId: integer("hypothesis_id"),

    /**
     * NLI label for ContractNLI span-level embeddings.
     * One of: 'entailment' | 'contradiction' | 'not_mentioned'
     *
     * - `entailment`: Span confirms the hypothesis is true
     * - `contradiction`: Span confirms the hypothesis is false
     * - `not_mentioned`: Hypothesis is not addressed
     */
    nliLabel: text("nli_label"),

    /**
     * Voyage AI voyage-law-2 embedding vector.
     * Fixed 1024 dimensions, optimized for legal text.
     *
     * Model configuration:
     * - Model: voyage-law-2
     * - Dimensions: 1024 (fixed)
     * - Max input: 16,000 tokens
     * - inputType for indexing: "document"
     * - inputType for search: "query"
     */
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),

    /**
     * Additional metadata as JSONB.
     * Contents vary by granularity and source:
     * - Character positions: `{ startPos: number, endPos: number }`
     * - Token count: `{ tokenCount: number }`
     * - Source-specific: varies by corpus
     */
    metadata: jsonb("metadata").default({}),

    /**
     * SHA-256 hash of content for deduplication.
     * Prevents duplicate embeddings for identical content.
     * Unique constraint enables ON CONFLICT DO NOTHING for idempotent inserts.
     */
    contentHash: text("content_hash").unique(),

    /** Timestamp when embedding was created */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** Index for joining with documents */
    index("idx_ref_embed_document").on(table.documentId),
    /** Index for filtering by granularity level */
    index("idx_ref_embed_granularity").on(table.granularity),
    /** Index for filtering by CUAD category */
    index("idx_ref_embed_category").on(table.category),
    /** Index for hierarchical traversal */
    index("idx_ref_embed_parent").on(table.parentId),
    // Note: HNSW index created separately after bulk data load
    // CREATE INDEX idx_ref_embed_hnsw ON reference_embeddings
    //   USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
  ]
)

/**
 * CUAD (Contract Understanding Atticus Dataset) category taxonomy.
 *
 * The CUAD dataset defines 41 categories for classifying contract clauses.
 * This table stores the category definitions with metadata for risk scoring
 * and NDA-relevance filtering.
 *
 * ## The 41 CUAD Categories
 *
 * 1. Document Name
 * 2. Parties
 * 3. Agreement Date
 * 4. Effective Date
 * 5. Expiration Date
 * 6. Renewal Term
 * 7. Notice Period to Terminate Renewal
 * 8. Governing Law
 * 9. Most Favored Nation
 * 10. Non-Compete
 * 11. Exclusivity
 * 12. No-Solicit of Customers
 * 13. Competitive Restriction Exception
 * 14. No-Solicit of Employees
 * 15. Non-Disparagement
 * 16. Termination for Convenience
 * 17. ROFR/ROFO/ROFN (Right of First Refusal/Offer/Negotiation)
 * 18. Change of Control
 * 19. Anti-Assignment
 * 20. Revenue/Profit Sharing
 * 21. Price Restrictions
 * 22. Minimum Commitment
 * 23. Volume Restriction
 * 24. IP Ownership Assignment
 * 25. Joint IP Ownership
 * 26. License Grant
 * 27. Non-Transferable License
 * 28. Affiliate License
 * 29. Unlimited/All-You-Can-Eat License
 * 30. Irrevocable or Perpetual License
 * 31. Source Code Escrow
 * 32. Post-Termination Services
 * 33. Audit Rights
 * 34. Uncapped Liability
 * 35. Cap on Liability
 * 36. Liquidated Damages
 * 37. Warranty Duration
 * 38. Insurance
 * 39. Covenant Not to Sue
 * 40. Third Party Beneficiary
 * 41. Undefined
 *
 * @see {@link https://huggingface.co/datasets/theatticusproject/cuad-qa} - CUAD dataset
 * @see {@link file://./../../docs/PRD.md#appendix-a-cuad-41-category-taxonomy} - Full taxonomy reference
 *
 * ## Risk Weight for Composite Scoring
 *
 * The `riskWeight` field assigns relative importance to each category for
 * computing composite risk scores. Categories with higher risk weights
 * contribute more to the overall document risk assessment.
 *
 * Default weight is 1.0. Categories like "Uncapped Liability" or "Non-Compete"
 * may have higher weights (e.g., 1.5-2.0) due to their significant legal impact.
 *
 * Composite risk score formula:
 * ```
 * overallRisk = sum(clauseRisk[i] * riskWeight[category[i]]) / sum(riskWeight[category[i]])
 * ```
 *
 * ## NDA-Relevance Filtering
 *
 * The `isNdaRelevant` field indicates whether a category is applicable to NDAs.
 * While CUAD covers all commercial contracts, not all 41 categories are relevant
 * for NDA analysis. For example:
 *
 * - Relevant: Confidentiality, Non-Compete, Non-Solicit, Governing Law
 * - Less Relevant: Revenue Sharing, Volume Restriction, Audit Rights
 *
 * Gap analysis uses this flag to avoid flagging missing clauses that aren't
 * expected in NDAs.
 *
 * @example
 * ```typescript
 * // Get NDA-relevant categories for gap analysis
 * const ndaCategories = await sharedDb
 *   .select()
 *   .from(cuadCategories)
 *   .where(eq(cuadCategories.isNdaRelevant, true))
 *   .orderBy(desc(cuadCategories.riskWeight))
 *
 * // Calculate weighted risk score
 * const categoryWeights = await sharedDb
 *   .select({
 *     name: cuadCategories.name,
 *     weight: cuadCategories.riskWeight,
 *   })
 *   .from(cuadCategories)
 *   .where(inArray(cuadCategories.name, extractedCategoryNames))
 * ```
 */
export const cuadCategories = pgTable(
  "cuad_categories",
  {
    /** Auto-incrementing primary key */
    id: serial("id").primaryKey(),

    /** Category name (unique), e.g., "Non-Compete", "Governing Law" */
    name: text("name").notNull().unique(),

    /** Human-readable description of what this category covers */
    description: text("description"),

    /**
     * Relative importance weight for composite risk scoring.
     * Default 1.0. Higher values (e.g., 1.5-2.0) indicate more significant
     * legal impact. Used in weighted average risk calculations.
     */
    riskWeight: real("risk_weight").default(1.0),

    /**
     * Whether this category is relevant for NDA analysis.
     * True for NDA-specific categories, false for general contract categories.
     * Used to filter gap analysis results.
     */
    isNdaRelevant: boolean("is_nda_relevant").default(true),
  },
  (table) => [
    /** Index for category lookup by name */
    index("idx_cuad_categories_name").on(table.name),
  ]
)

/**
 * ContractNLI hypothesis definitions.
 *
 * The ContractNLI dataset defines 17 hypotheses that represent common
 * contractual obligations and restrictions. Each hypothesis is a natural
 * language statement that can be verified against NDA text using Natural
 * Language Inference (NLI).
 *
 * ## The 17 ContractNLI Hypotheses
 *
 * 1. Explicit identification of confidential information
 * 2. Standard definition of confidential information
 * 3. Obligation to protect confidential information
 * 4. Use of confidential information restricted to stated purpose
 * 5. Prohibition on sharing confidential information with third parties
 * 6. Sharing with employees or agents under similar obligations
 * 7. Notice of compelled disclosure
 * 8. Return or destruction of confidential information
 * 9. No non-competition obligation
 * 10. No solicitation restriction
 * 11. Survival of obligations after termination
 * 12. Permissible independent development
 * 13. Receiving party acknowledges no warranty
 * 14. No obligation to disclose
 * 15. Remedies for breach include equitable relief
 * 16. No implied agency or partnership
 * 17. Governing law specified
 *
 * @see {@link https://huggingface.co/datasets/kiddothe2b/contract-nli} - ContractNLI dataset
 * @see {@link file://./../../docs/PRD.md#appendix-b-contractnli-17-hypotheses} - Full hypothesis reference
 *
 * ## NLI Verification Workflow
 *
 * The NLI verification workflow uses these hypotheses to provide evidence-based
 * risk assessments:
 *
 * 1. **Embedding Retrieval**: Query `referenceEmbeddings` for spans with
 *    matching `hypothesisId` and high similarity to user's NDA text
 *
 * 2. **Label Lookup**: Check the `nliLabel` of retrieved spans:
 *    - `entailment`: User's NDA likely includes this protection
 *    - `contradiction`: User's NDA may explicitly exclude this
 *    - `not_mentioned`: No evidence either way
 *
 * 3. **Evidence Citation**: Include the retrieved span text as supporting
 *    evidence in the risk assessment output
 *
 * 4. **Risk Scoring**: Hypotheses marked as `contradiction` or `not_mentioned`
 *    for critical obligations contribute to higher risk scores
 *
 * ## Category Grouping
 *
 * The `category` field groups related hypotheses for organized display:
 * - Confidentiality: Hypotheses 1-8 (definition, protection, handling)
 * - Restrictions: Hypotheses 9-10 (non-compete, non-solicit)
 * - Duration: Hypothesis 11 (survival)
 * - Development: Hypothesis 12 (independent development)
 * - Warranties: Hypotheses 13-14 (disclaimers)
 * - Legal: Hypotheses 15-17 (remedies, relationship, governing law)
 *
 * @example
 * ```typescript
 * // Load hypotheses for verification
 * const hypotheses = await sharedDb
 *   .select()
 *   .from(contractNliHypotheses)
 *   .orderBy(contractNliHypotheses.id)
 *
 * // Find evidence spans for a specific hypothesis
 * const evidenceSpans = await sharedDb
 *   .select({
 *     content: referenceEmbeddings.content,
 *     label: referenceEmbeddings.nliLabel,
 *     distance: cosineDistance(referenceEmbeddings.embedding, queryVec),
 *   })
 *   .from(referenceEmbeddings)
 *   .where(
 *     and(
 *       eq(referenceEmbeddings.hypothesisId, hypothesis.id),
 *       lt(cosineDistance(referenceEmbeddings.embedding, queryVec), 0.25)
 *     )
 *   )
 *   .orderBy(cosineDistance(referenceEmbeddings.embedding, queryVec))
 *   .limit(3)
 * ```
 */
export const contractNliHypotheses = pgTable(
  "contract_nli_hypotheses",
  {
    /**
     * Hypothesis ID from the ContractNLI dataset.
     * Integer 1-17, used as foreign key in referenceEmbeddings.hypothesisId
     */
    id: integer("id").primaryKey(),

    /** The hypothesis text as a natural language statement */
    text: text("text").notNull(),

    /**
     * Category grouping for related hypotheses.
     * Examples: 'confidentiality', 'restrictions', 'legal', 'warranties'
     */
    category: text("category"),
  },
  (table) => [
    /** Index for filtering hypotheses by category group */
    index("idx_nli_hypotheses_category").on(table.category),
  ]
)
