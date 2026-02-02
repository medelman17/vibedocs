// src/db/schema/reference.ts
// Shared reference database tables for legal corpora (CUAD, ContractNLI, Bonterms, etc.)
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
 * Legal corpora documents (CUAD contracts, ContractNLI NDAs, templates)
 * Read-only reference data shared across all tenants
 */
export const referenceDocuments = pgTable(
  "reference_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // 'cuad' | 'contract_nli' | 'bonterms' | 'commonaccord' | 'kleister'
    sourceId: text("source_id"), // Original ID from dataset
    title: text("title").notNull(),
    rawText: text("raw_text"),
    metadata: jsonb("metadata").default({}), // Source-specific metadata
    contentHash: text("content_hash").unique(), // SHA-256 for idempotent ingestion
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ref_docs_source").on(table.source),
    index("idx_ref_docs_hash").on(table.contentHash),
  ]
)

/**
 * Multi-granularity embeddings for reference corpora
 * Supports hierarchical structure: document → section → clause → span
 */
export const referenceEmbeddings = pgTable(
  "reference_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => referenceDocuments.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"), // Self-reference for hierarchical structure (section → clause)
    granularity: text("granularity").notNull(), // 'document' | 'section' | 'clause' | 'span' | 'template'
    content: text("content").notNull(),
    sectionPath: text("section_path").array(), // e.g., ['Article 5', 'Section 5.2']
    category: text("category"), // CUAD category label (for clause-level)
    hypothesisId: integer("hypothesis_id"), // ContractNLI hypothesis ID (for span-level)
    nliLabel: text("nli_label"), // 'entailment' | 'contradiction' | 'not_mentioned'
    embedding: vector("embedding", { dimensions: 1024 }).notNull(), // voyage-law-2
    metadata: jsonb("metadata").default({}),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ref_embed_document").on(table.documentId),
    index("idx_ref_embed_granularity").on(table.granularity),
    index("idx_ref_embed_category").on(table.category),
    index("idx_ref_embed_parent").on(table.parentId),
    // Note: HNSW index created separately after bulk data load
    // CREATE INDEX idx_ref_embed_hnsw ON reference_embeddings
    //   USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
  ]
)

/**
 * CUAD category taxonomy (41 categories with descriptions)
 * Used for clause classification and risk assessment
 */
export const cuadCategories = pgTable(
  "cuad_categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    description: text("description"),
    riskWeight: real("risk_weight").default(1.0), // Relative importance for risk scoring
    isNdaRelevant: boolean("is_nda_relevant").default(true),
  },
  (table) => [index("idx_cuad_categories_name").on(table.name)]
)

/**
 * ContractNLI hypothesis definitions
 * Used for natural language inference verification of contract clauses
 */
export const contractNliHypotheses = pgTable(
  "contract_nli_hypotheses",
  {
    id: integer("id").primaryKey(), // Original ID from ContractNLI dataset
    text: text("text").notNull(),
    category: text("category"), // Grouping for related hypotheses
  },
  (table) => [index("idx_nli_hypotheses_category").on(table.category)]
)
