/**
 * @fileoverview Document storage and chunking schema for NDA analysis pipeline.
 *
 * This module defines the core document storage tables for the VibeDocs application.
 * It handles both the raw uploaded documents and their processed chunks used for
 * vector similarity search and clause extraction.
 *
 * ## Architecture Overview
 *
 * The document processing pipeline follows these stages:
 * 1. **Upload**: User uploads NDA document -> stored in `documents` table
 * 2. **Processing**: Document text extracted -> stored in `rawText` field
 * 3. **Chunking**: Text split into semantic chunks -> stored in `documentChunks` table
 * 4. **Embedding**: Chunks embedded with Voyage AI voyage-law-2 -> stored in `embedding` field
 * 5. **Analysis**: Agents query chunks via vector similarity for clause extraction
 *
 * ## Multi-Tenancy
 *
 * Both tables include `tenantId` for Row-Level Security (RLS) enforcement.
 * All queries should be scoped to the active tenant via the DAL's `withTenant()`.
 *
 * ## Vector Search
 *
 * Uses pgvector extension with 1024-dimension embeddings from Voyage AI's voyage-law-2
 * model, optimized for legal document understanding. HNSW indexes should be created
 * AFTER bulk data ingestion for optimal performance.
 *
 * @module db/schema/documents
 * @see {@link ../../docs/schema.md} for complete schema documentation
 * @see {@link ../../docs/embedding-strategy.md} for vector embedding approach
 */

import {
  pgTable,
  text,
  uuid,
  integer,
  index,
  unique,
  vector,
  jsonb,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId, softDelete } from "../_columns"
import { users } from "./auth"

/**
 * Documents table storing uploaded NDA files and their processing state.
 *
 * This is the primary table for document management in the VibeDocs application.
 * Each record represents a single uploaded document (typically PDF or DOCX) and tracks
 * its journey through the analysis pipeline.
 *
 * @description Stores uploaded NDA documents with metadata, processing status, and extracted text.
 * Documents are tenant-scoped and support soft deletion for audit trails.
 *
 * ## Fields
 *
 * | Field | Type | Description |
 * |-------|------|-------------|
 * | `id` | UUID | Primary key (auto-generated) |
 * | `tenantId` | UUID | Organization ID for RLS enforcement |
 * | `uploadedBy` | UUID | Reference to the user who uploaded the document |
 * | `title` | text | Display name for the document (user-provided or derived from filename) |
 * | `fileName` | text | Original filename as uploaded |
 * | `fileType` | text | MIME type (e.g., 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') |
 * | `fileSize` | integer | File size in bytes |
 * | `fileUrl` | text | Vercel Blob storage URL for the original file |
 * | `contentHash` | text | SHA-256 hash of file content for deduplication |
 * | `rawText` | text | Extracted plain text content after processing |
 * | `status` | text | Processing pipeline status |
 * | `errorMessage` | text | Error details if processing failed |
 * | `metadata` | JSONB | Extensible metadata (page count, language, etc.) |
 * | `createdAt` | timestamp | Record creation time |
 * | `updatedAt` | timestamp | Last modification time |
 * | `deletedAt` | timestamp | Soft deletion timestamp (null if active) |
 *
 * ## Status Values
 *
 * The `status` field tracks document processing state:
 * - `'pending'` - Document uploaded, awaiting processing
 * - `'processing'` - Currently being processed (text extraction, chunking, embedding)
 * - `'ready'` - Processing complete, document ready for analysis
 * - `'error'` - Processing failed (see `errorMessage` for details)
 *
 * ## Idempotent Ingestion
 *
 * The `contentHash` field enables idempotent document ingestion. Before inserting,
 * compute SHA-256 of the file content and check for existing documents with the same
 * hash within the tenant. This prevents duplicate processing of the same document.
 *
 * ## Indexes
 *
 * - `idx_docs_tenant`: Composite index on (tenantId, createdAt) for tenant-scoped listing
 * - `idx_docs_status`: Composite index on (tenantId, status) for filtering by processing state
 *
 * @example
 * // Insert a new document
 * import { db } from '@/db/client'
 * import { documents } from '@/db/schema/documents'
 *
 * const [doc] = await db.insert(documents).values({
 *   tenantId: ctx.tenantId,
 *   uploadedBy: ctx.userId,
 *   title: 'Acme Corp NDA',
 *   fileName: 'acme-nda-2024.pdf',
 *   fileType: 'application/pdf',
 *   fileSize: 245789,
 *   fileUrl: 'https://blob.vercel-storage.com/...',
 *   contentHash: 'sha256:abc123...',
 *   status: 'pending',
 * }).returning()
 *
 * @example
 * // Query documents by status
 * import { db } from '@/db/client'
 * import { documents } from '@/db/schema/documents'
 * import { eq, and, isNull } from 'drizzle-orm'
 *
 * const pendingDocs = await db
 *   .select()
 *   .from(documents)
 *   .where(
 *     and(
 *       eq(documents.tenantId, ctx.tenantId),
 *       eq(documents.status, 'pending'),
 *       isNull(documents.deletedAt)
 *     )
 *   )
 *   .orderBy(documents.createdAt)
 *
 * @example
 * // Check for duplicate using contentHash (idempotent ingestion)
 * import { db } from '@/db/client'
 * import { documents } from '@/db/schema/documents'
 * import { eq, and } from 'drizzle-orm'
 *
 * const existing = await db
 *   .select({ id: documents.id })
 *   .from(documents)
 *   .where(
 *     and(
 *       eq(documents.tenantId, ctx.tenantId),
 *       eq(documents.contentHash, computedHash)
 *     )
 *   )
 *   .limit(1)
 *
 * if (existing.length > 0) {
 *   // Document already exists, skip processing
 *   return { duplicate: true, existingId: existing[0].id }
 * }
 *
 * @example
 * // Update document status after processing
 * import { db } from '@/db/client'
 * import { documents } from '@/db/schema/documents'
 * import { eq } from 'drizzle-orm'
 *
 * await db
 *   .update(documents)
 *   .set({
 *     status: 'ready',
 *     rawText: extractedText,
 *     metadata: { pageCount: 12, language: 'en' },
 *   })
 *   .where(eq(documents.id, documentId))
 */
export const documents = pgTable(
  "documents",
  {
    /**
     * Unique identifier for the document (UUID v4, auto-generated).
     * @type {string}
     */
    ...primaryId,

    /**
     * Organization/tenant identifier for Row-Level Security.
     * All queries must be scoped to the active tenant.
     * @type {string}
     */
    ...tenantId,

    /**
     * Reference to the user who uploaded this document.
     * May be null for system-imported documents.
     * @type {string | null}
     */
    uploadedBy: uuid("uploaded_by").references(() => users.id),

    /**
     * Display title for the document.
     * User-provided or derived from the original filename.
     * @type {string}
     */
    title: text("title").notNull(),

    /**
     * Original filename as uploaded by the user.
     * Preserved for download and reference purposes.
     * @type {string}
     */
    fileName: text("file_name").notNull(),

    /**
     * MIME type of the uploaded file.
     * Common values: 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
     * @type {string}
     */
    fileType: text("file_type").notNull(),

    /**
     * File size in bytes.
     * Used for upload validation and storage quota tracking.
     * @type {number | null}
     */
    fileSize: integer("file_size"),

    /**
     * URL to the file in Vercel Blob storage.
     * Used for downloading the original document.
     * @type {string | null}
     */
    fileUrl: text("file_url"),

    /**
     * SHA-256 hash of the file content for deduplication.
     * Enables idempotent ingestion by detecting duplicate uploads.
     * Format: 'sha256:' followed by hex-encoded hash.
     * @type {string | null}
     */
    contentHash: text("content_hash"),

    /**
     * Extracted plain text content from the document.
     * Populated during the processing stage after text extraction.
     * @type {string | null}
     */
    rawText: text("raw_text"),

    /**
     * Current processing pipeline status.
     * @type {'pending' | 'processing' | 'ready' | 'error'}
     * @default 'pending'
     *
     * Status transitions:
     * - pending -> processing (when pipeline starts)
     * - processing -> ready (on success)
     * - processing -> error (on failure)
     */
    status: text("status").notNull().default("pending"),

    /**
     * Error message if processing failed.
     * Contains details about the failure for debugging and user feedback.
     * @type {string | null}
     */
    errorMessage: text("error_message"),

    /**
     * Extensible JSONB metadata field.
     * Commonly includes: pageCount, language, extractionMethod, etc.
     * @type {Record<string, unknown>}
     * @default {}
     */
    metadata: jsonb("metadata").default({}),

    /**
     * Timestamp fields: createdAt, updatedAt.
     * updatedAt auto-updates on record modification.
     */
    ...timestamps,

    /**
     * Soft deletion timestamp.
     * Null indicates active record; non-null indicates deleted.
     */
    ...softDelete,
  },
  (table) => [
    /**
     * Composite index for efficient tenant-scoped document listing.
     * Optimizes queries like "get all documents for tenant X ordered by creation date".
     */
    index("idx_docs_tenant").on(table.tenantId, table.createdAt),

    /**
     * Composite index for filtering documents by status within a tenant.
     * Optimizes queries like "get all pending documents for tenant X".
     */
    index("idx_docs_status").on(table.tenantId, table.status),
  ]
)

/**
 * Document chunks table for semantic text segments with vector embeddings.
 *
 * Documents are split into chunks for effective vector similarity search and
 * context-aware analysis. Each chunk represents a semantic unit of the document
 * (typically 512-1024 tokens) with its corresponding embedding vector.
 *
 * @description Stores document text chunks with vector embeddings for similarity search.
 * Uses pgvector with 1024-dimension embeddings from Voyage AI's voyage-law-2 model.
 *
 * ## Fields
 *
 * | Field | Type | Description |
 * |-------|------|-------------|
 * | `id` | UUID | Primary key (auto-generated) |
 * | `tenantId` | UUID | Organization ID for RLS enforcement |
 * | `documentId` | UUID | Reference to parent document (cascading delete) |
 * | `chunkIndex` | integer | Sequential position within the document (0-based) |
 * | `content` | text | The actual text content of this chunk |
 * | `sectionPath` | text[] | Hierarchical path for document structure (e.g., ['Article 1', 'Section 1.1']) |
 * | `embedding` | vector(1024) | Voyage AI voyage-law-2 embedding vector |
 * | `tokenCount` | integer | Number of tokens in this chunk |
 * | `metadata` | JSONB | Additional chunk metadata (page number, etc.) |
 * | `createdAt` | timestamp | Record creation time |
 * | `updatedAt` | timestamp | Last modification time |
 *
 * ## Vector Embeddings
 *
 * Embeddings are generated using Voyage AI's voyage-law-2 model, which produces
 * 1024-dimensional vectors optimized for legal document understanding. The model
 * has a 16K token context window.
 *
 * **Important**: Create HNSW indexes AFTER bulk data ingestion for optimal performance:
 * ```sql
 * CREATE INDEX idx_chunks_embedding ON document_chunks
 *   USING hnsw (embedding vector_cosine_ops)
 *   WITH (m = 16, ef_construction = 64);
 * ```
 *
 * ## Chunking Strategy
 *
 * Chunks are created using semantic boundaries (paragraphs, sections) with overlap
 * to preserve context. The `sectionPath` array tracks document structure for
 * reconstructing context during retrieval.
 *
 * ## Constraints
 *
 * - `chunk_doc_index`: Unique constraint on (documentId, chunkIndex) ensures no duplicate chunks
 * - Cascading delete: Chunks are automatically deleted when parent document is deleted
 *
 * ## Indexes
 *
 * - `idx_chunks_document`: Composite index for ordered chunk retrieval by document
 * - `idx_chunks_tenant`: Index for tenant-scoped queries
 * - Consider adding HNSW index on `embedding` after bulk data load
 *
 * @example
 * // Insert document chunks with embeddings
 * import { db } from '@/db/client'
 * import { documentChunks } from '@/db/schema/documents'
 *
 * const chunks = textChunks.map((chunk, index) => ({
 *   tenantId: ctx.tenantId,
 *   documentId: document.id,
 *   chunkIndex: index,
 *   content: chunk.text,
 *   sectionPath: chunk.sections,
 *   embedding: chunk.embedding, // 1024-dim vector from Voyage AI
 *   tokenCount: chunk.tokens,
 *   metadata: { pageNumber: chunk.page },
 * }))
 *
 * await db.insert(documentChunks).values(chunks)
 *
 * @example
 * // Vector similarity search using cosineDistance
 * import { db } from '@/db/client'
 * import { documentChunks } from '@/db/schema/documents'
 * import { cosineDistance, sql, and, eq } from 'drizzle-orm'
 *
 * const queryEmbedding = await voyageAI.embed(query)
 *
 * const similarChunks = await db
 *   .select({
 *     id: documentChunks.id,
 *     content: documentChunks.content,
 *     sectionPath: documentChunks.sectionPath,
 *     distance: cosineDistance(documentChunks.embedding, queryEmbedding),
 *   })
 *   .from(documentChunks)
 *   .where(
 *     and(
 *       eq(documentChunks.tenantId, ctx.tenantId),
 *       eq(documentChunks.documentId, targetDocumentId)
 *     )
 *   )
 *   .orderBy(cosineDistance(documentChunks.embedding, queryEmbedding))
 *   .limit(10)
 *
 * @example
 * // Retrieve all chunks for a document in order
 * import { db } from '@/db/client'
 * import { documentChunks } from '@/db/schema/documents'
 * import { eq } from 'drizzle-orm'
 *
 * const orderedChunks = await db
 *   .select({
 *     content: documentChunks.content,
 *     sectionPath: documentChunks.sectionPath,
 *     tokenCount: documentChunks.tokenCount,
 *   })
 *   .from(documentChunks)
 *   .where(eq(documentChunks.documentId, documentId))
 *   .orderBy(documentChunks.chunkIndex)
 *
 * @example
 * // Cross-document similarity search within tenant
 * import { db } from '@/db/client'
 * import { documentChunks, documents } from '@/db/schema/documents'
 * import { cosineDistance, eq, and, isNull } from 'drizzle-orm'
 *
 * const queryEmbedding = await voyageAI.embed('confidentiality obligations')
 *
 * const results = await db
 *   .select({
 *     documentId: documentChunks.documentId,
 *     documentTitle: documents.title,
 *     chunkContent: documentChunks.content,
 *     similarity: sql`1 - ${cosineDistance(documentChunks.embedding, queryEmbedding)}`,
 *   })
 *   .from(documentChunks)
 *   .innerJoin(documents, eq(documents.id, documentChunks.documentId))
 *   .where(
 *     and(
 *       eq(documentChunks.tenantId, ctx.tenantId),
 *       isNull(documents.deletedAt)
 *     )
 *   )
 *   .orderBy(cosineDistance(documentChunks.embedding, queryEmbedding))
 *   .limit(20)
 */
export const documentChunks = pgTable(
  "document_chunks",
  {
    /**
     * Unique identifier for the chunk (UUID v4, auto-generated).
     * @type {string}
     */
    ...primaryId,

    /**
     * Organization/tenant identifier for Row-Level Security.
     * Denormalized from parent document for efficient tenant-scoped queries.
     * @type {string}
     */
    ...tenantId,

    /**
     * Reference to the parent document.
     * Cascading delete ensures chunks are removed when document is deleted.
     * @type {string}
     */
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    /**
     * Zero-based sequential index of this chunk within the document.
     * Used for ordering chunks when reconstructing document context.
     * Unique per document (enforced by chunk_doc_index constraint).
     * @type {number}
     */
    chunkIndex: integer("chunk_index").notNull(),

    /**
     * The actual text content of this chunk.
     * Typically 512-1024 tokens with semantic boundaries.
     * @type {string}
     */
    content: text("content").notNull(),

    /**
     * Hierarchical section path for document structure.
     * Tracks the document outline position (e.g., ['Article 1', 'Section 1.1', 'Subsection a']).
     * Used for context reconstruction and citation generation.
     * @type {string[] | null}
     */
    sectionPath: text("section_path").array(),

    /**
     * Vector embedding for semantic similarity search.
     * Generated by Voyage AI's voyage-law-2 model (1024 dimensions).
     *
     * **Note**: Use cosineDistance() for similarity queries:
     * ```typescript
     * import { cosineDistance } from 'drizzle-orm'
     * .orderBy(cosineDistance(documentChunks.embedding, queryVector))
     * ```
     *
     * @type {number[] | null}
     * @see https://docs.voyageai.com/docs/embeddings for voyage-law-2 specifications
     */
    embedding: vector("embedding", { dimensions: 1024 }),

    /**
     * Number of tokens in this chunk.
     * Used for context window management when building prompts.
     * @type {number | null}
     */
    tokenCount: integer("token_count"),

    /**
     * Character offset where chunk starts in original extracted text.
     * Used for document viewer highlighting (Phase 11).
     * @type {number | null}
     */
    startPosition: integer("start_position"),

    /**
     * Character offset where chunk ends in original extracted text (exclusive).
     * Used for document viewer highlighting (Phase 11).
     * @type {number | null}
     */
    endPosition: integer("end_position"),

    /**
     * Type discriminator for this chunk.
     * One of: 'definition', 'clause', 'sub-clause', 'recital', 'boilerplate',
     * 'exhibit', 'merged', 'split', 'fallback'.
     * @type {string | null}
     */
    chunkType: text("chunk_type"),

    /**
     * Reference to the analysis run that produced this chunk.
     * Stored as a plain UUID column without foreign key reference to avoid
     * circular imports (analyses.ts already imports from documents.ts).
     * The application layer enforces this relationship.
     * Re-analysis creates new chunks, so chunks are per-analysis.
     * @type {string | null}
     */
    analysisId: uuid("analysis_id"),

    /**
     * Number of overlap tokens prepended from the previous chunk.
     * Zero when this chunk has no overlap.
     * @type {number}
     * @default 0
     */
    overlapTokens: integer("overlap_tokens").default(0),

    /**
     * Extensible JSONB metadata field.
     * Commonly includes: pageNumber, boundingBox, chunkingMethod, etc.
     * @type {Record<string, unknown>}
     * @default {}
     */
    metadata: jsonb("metadata").default({}),

    /**
     * Timestamp fields: createdAt, updatedAt.
     * updatedAt auto-updates on record modification.
     */
    ...timestamps,
  },
  (table) => [
    /**
     * Unique constraint ensuring no duplicate chunk indexes per document per analysis.
     * Re-analysis creates new chunks, so analysisId is part of the constraint.
     * Enables idempotent chunk insertion with ON CONFLICT handling.
     */
    unique("chunk_doc_analysis_index").on(
      table.documentId,
      table.analysisId,
      table.chunkIndex
    ),

    /**
     * Composite index for efficient ordered retrieval of document chunks.
     * Optimizes queries like "get all chunks for document X in order".
     */
    index("idx_chunks_document").on(table.documentId, table.chunkIndex),

    /**
     * Index for tenant-scoped chunk queries.
     * Supports RLS enforcement and cross-document similarity searches.
     */
    index("idx_chunks_tenant").on(table.tenantId),

    /**
     * Index for efficient analysis-scoped chunk queries.
     * Optimizes queries like "get all chunks for analysis Y".
     */
    index("idx_chunks_analysis").on(table.analysisId),
  ]
)
