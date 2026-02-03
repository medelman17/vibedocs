/**
 * @fileoverview Document Data Access Layer
 *
 * This module provides CRUD operations for documents and document chunks with
 * strict tenant isolation. All queries require a `tenantId` parameter to ensure
 * data separation between organizations in a multi-tenant environment.
 *
 * ## Tenant Isolation Pattern
 *
 * Every function in this module enforces tenant isolation by:
 * 1. Requiring `tenantId` as a mandatory parameter
 * 2. Including `tenantId` in all WHERE clauses
 * 3. Never exposing cross-tenant data, even in error states
 *
 * This pattern prevents data leakage between organizations and supports
 * future row-level security (RLS) migration.
 *
 * ## Soft Delete Handling
 *
 * Documents support soft deletion via the `deletedAt` timestamp. By default:
 * - Query functions (getDocumentsByTenant, getDocumentById) exclude soft-deleted records
 * - The softDeleteDocument function sets `deletedAt` rather than removing the row
 * - Hard deletion is not exposed to prevent accidental data loss
 *
 * ## Usage with DAL
 *
 * These functions are typically called from Server Components or API routes
 * after authentication via the Data Access Layer:
 *
 * ```typescript
 * import { withTenant } from "@/lib/dal"
 * import { getDocumentsByTenant } from "@/db/queries/documents"
 *
 * const { tenantId } = await withTenant()
 * const docs = await getDocumentsByTenant(tenantId)
 * ```
 *
 * @module db/queries/documents
 */

import { eq, and, desc, isNull } from "drizzle-orm"
import { db } from "../client"
import { documents, documentChunks } from "../schema/documents"

/**
 * Document processing status representing stages in the analysis pipeline.
 *
 * The document lifecycle follows this progression:
 *
 * ```
 * pending → parsing → embedding → analyzing → complete
 *                                           ↘ failed
 * ```
 *
 * Status descriptions:
 * - **pending**: Document uploaded, awaiting processing. Initial state after upload.
 * - **parsing**: Document text extraction in progress (PDF/DOCX → plain text).
 * - **embedding**: Generating vector embeddings for semantic search (Voyage AI voyage-law-2).
 * - **analyzing**: LLM agents extracting clauses, scoring risks, and identifying gaps.
 * - **complete**: All processing finished successfully. Document ready for queries.
 * - **failed**: Processing encountered an error. Check `errorMessage` field for details.
 *
 * @example
 * ```typescript
 * // Filter documents by status
 * const pendingDocs = await getDocumentsByTenant(tenantId, { status: "pending" })
 *
 * // Transition status during processing
 * await updateDocumentStatus(docId, tenantId, "parsing")
 * await updateDocumentStatus(docId, tenantId, "complete")
 *
 * // Handle failures with error message
 * await updateDocumentStatus(docId, tenantId, "failed", "PDF parsing error: corrupted file")
 * ```
 */
export type DocumentStatus =
  | "pending"
  | "parsing"
  | "embedding"
  | "analyzing"
  | "complete"
  | "failed"

/**
 * Retrieves a paginated list of documents for a specific tenant.
 *
 * @description
 * Fetches documents belonging to the specified tenant, ordered by creation date
 * (newest first). Automatically excludes soft-deleted documents. Supports optional
 * filtering by processing status and cursor-based pagination.
 *
 * This is the primary function for listing documents in dashboards and document
 * management interfaces.
 *
 * @param tenantId - The organization ID for tenant isolation. Required.
 * @param options - Optional query parameters.
 * @param options.status - Filter by document processing status (e.g., "pending", "complete").
 *   When omitted, returns documents in all statuses.
 * @param options.limit - Maximum number of documents to return. Defaults to 50.
 *   Maximum recommended value is 100 for performance.
 * @param options.offset - Number of documents to skip for pagination. Defaults to 0.
 *
 * @returns Promise resolving to an array of document records. Returns an empty
 *   array if no documents match the criteria.
 *
 * @example
 * ```typescript
 * // Get first page of all documents
 * const docs = await getDocumentsByTenant(tenantId)
 *
 * // Get pending documents only
 * const pending = await getDocumentsByTenant(tenantId, { status: "pending" })
 *
 * // Paginate through results
 * const page1 = await getDocumentsByTenant(tenantId, { limit: 20, offset: 0 })
 * const page2 = await getDocumentsByTenant(tenantId, { limit: 20, offset: 20 })
 *
 * // Combine filters
 * const recentComplete = await getDocumentsByTenant(tenantId, {
 *   status: "complete",
 *   limit: 10,
 * })
 * ```
 */
export async function getDocumentsByTenant(
  tenantId: string,
  options: {
    status?: DocumentStatus
    limit?: number
    offset?: number
  } = {}
) {
  const { status, limit = 50, offset = 0 } = options

  const conditions = [
    eq(documents.tenantId, tenantId),
    isNull(documents.deletedAt),
  ]
  if (status) {
    conditions.push(eq(documents.status, status))
  }

  return db
    .select()
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt))
    .limit(limit)
    .offset(offset)
}

/**
 * Retrieves a single document by its ID with tenant isolation.
 *
 * @description
 * Fetches a specific document ensuring it belongs to the specified tenant.
 * Returns null if the document doesn't exist, belongs to a different tenant,
 * or has been soft-deleted. This is the primary function for loading document
 * details in view/edit pages.
 *
 * The tenant check prevents unauthorized access even if an attacker guesses
 * or obtains a valid document ID from another organization.
 *
 * @param documentId - The unique document identifier (UUID).
 * @param tenantId - The organization ID for tenant isolation. Required.
 *
 * @returns Promise resolving to the document record if found and accessible,
 *   or `null` if:
 *   - Document ID doesn't exist
 *   - Document belongs to a different tenant
 *   - Document has been soft-deleted
 *
 * @example
 * ```typescript
 * // Load document for display
 * const doc = await getDocumentById(params.id, tenantId)
 * if (!doc) {
 *   notFound() // Next.js 404
 * }
 *
 * // Check document status before processing
 * const doc = await getDocumentById(documentId, tenantId)
 * if (doc?.status !== "pending") {
 *   throw new Error("Document already processed")
 * }
 * ```
 */
export async function getDocumentById(documentId: string, tenantId: string) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.tenantId, tenantId),
        isNull(documents.deletedAt)
      )
    )
    .limit(1)

  return doc ?? null
}

/**
 * Retrieves a document along with all its associated chunks.
 *
 * @description
 * Fetches a document and its text chunks in a single operation. Chunks are
 * ordered by `chunkIndex` to maintain document structure. This is used when
 * displaying full document content or performing operations that need both
 * the document metadata and its chunked content.
 *
 * Chunks are created during the parsing phase and contain:
 * - Extracted text segments
 * - Section path (for hierarchical navigation)
 * - Vector embeddings (after embedding phase)
 * - Token counts and metadata
 *
 * @param documentId - The unique document identifier (UUID).
 * @param tenantId - The organization ID for tenant isolation. Required.
 *
 * @returns Promise resolving to the document record with a `chunks` array property,
 *   or `null` if the document doesn't exist or is inaccessible. The chunks array
 *   may be empty if parsing hasn't completed yet.
 *
 * @example
 * ```typescript
 * // Load document with chunks for full-text display
 * const docWithChunks = await getDocumentWithChunks(documentId, tenantId)
 * if (!docWithChunks) {
 *   return notFound()
 * }
 *
 * // Access chunk content
 * const fullText = docWithChunks.chunks
 *   .sort((a, b) => a.chunkIndex - b.chunkIndex)
 *   .map(c => c.content)
 *   .join("\n\n")
 *
 * // Check embedding status
 * const embeddedChunks = docWithChunks.chunks.filter(c => c.embedding !== null)
 * console.log(`${embeddedChunks.length}/${docWithChunks.chunks.length} chunks embedded`)
 * ```
 */
export async function getDocumentWithChunks(
  documentId: string,
  tenantId: string
) {
  const doc = await getDocumentById(documentId, tenantId)
  if (!doc) return null

  const chunks = await db
    .select()
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.documentId, documentId),
        eq(documentChunks.tenantId, tenantId)
      )
    )
    .orderBy(documentChunks.chunkIndex)

  return { ...doc, chunks }
}

/**
 * Updates a document's processing status and optional error message.
 *
 * @description
 * Transitions a document to a new processing status. This is called by the
 * Inngest pipeline agents as they progress through document analysis stages.
 * The function also updates the `updatedAt` timestamp.
 *
 * When transitioning to "failed" status, provide an `errorMessage` to help
 * with debugging. The error message is cleared (set to null) when transitioning
 * to any other status.
 *
 * Status transitions should follow the expected pipeline order, though this
 * function does not enforce transition rules (handled by the pipeline logic).
 *
 * @param documentId - The unique document identifier (UUID).
 * @param tenantId - The organization ID for tenant isolation. Required.
 * @param status - The new processing status to set.
 * @param errorMessage - Optional error description when status is "failed".
 *   Automatically cleared (null) for non-failed statuses.
 *
 * @returns Promise resolving to the updated document record, or `null` if the
 *   document doesn't exist or belongs to a different tenant.
 *
 * @example
 * ```typescript
 * // Progress through pipeline stages
 * await updateDocumentStatus(docId, tenantId, "parsing")
 * // ... parsing work ...
 * await updateDocumentStatus(docId, tenantId, "embedding")
 * // ... embedding work ...
 * await updateDocumentStatus(docId, tenantId, "complete")
 *
 * // Handle processing failure
 * try {
 *   await parseDocument(doc)
 * } catch (error) {
 *   await updateDocumentStatus(
 *     docId,
 *     tenantId,
 *     "failed",
 *     `Parsing failed: ${error.message}`
 *   )
 * }
 *
 * // Retry a failed document
 * await updateDocumentStatus(docId, tenantId, "pending") // Clears errorMessage
 * ```
 */
export async function updateDocumentStatus(
  documentId: string,
  tenantId: string,
  status: DocumentStatus,
  errorMessage?: string
) {
  const [updated] = await db
    .update(documents)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.id, documentId), eq(documents.tenantId, tenantId))
    )
    .returning()

  return updated ?? null
}

/**
 * Soft deletes a document by setting its deletedAt timestamp.
 *
 * @description
 * Marks a document as deleted without removing it from the database. The
 * document will be excluded from all subsequent queries via the standard
 * `isNull(deletedAt)` filter. This pattern:
 *
 * - Prevents accidental permanent data loss
 * - Supports audit trails and compliance requirements
 * - Allows future "undelete" functionality
 * - Maintains referential integrity with related chunks
 *
 * Associated document chunks are NOT automatically deleted. They remain in
 * the database but become orphaned (no longer queryable through document APIs).
 *
 * @param documentId - The unique document identifier (UUID).
 * @param tenantId - The organization ID for tenant isolation. Required.
 *
 * @returns Promise resolving to the deleted document record (with deletedAt set),
 *   or `null` if the document doesn't exist or belongs to a different tenant.
 *
 * @example
 * ```typescript
 * // Soft delete from a delete action
 * export async function deleteDocumentAction(documentId: string) {
 *   const { tenantId } = await withTenant()
 *   const deleted = await softDeleteDocument(documentId, tenantId)
 *
 *   if (!deleted) {
 *     throw new Error("Document not found")
 *   }
 *
 *   revalidatePath("/documents")
 *   return { success: true }
 * }
 *
 * // Verify deletion
 * const deleted = await softDeleteDocument(docId, tenantId)
 * console.log(`Deleted at: ${deleted?.deletedAt}`)
 *
 * // Subsequent queries won't return this document
 * const doc = await getDocumentById(docId, tenantId) // Returns null
 * ```
 */
export async function softDeleteDocument(documentId: string, tenantId: string) {
  const [deleted] = await db
    .update(documents)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.id, documentId), eq(documents.tenantId, tenantId))
    )
    .returning()

  return deleted ?? null
}

/**
 * Creates document chunks in a batch insert operation.
 *
 * @description
 * Inserts multiple document chunks in a single database transaction. This is
 * called during the parsing phase after the document text has been extracted
 * and split into semantic chunks.
 *
 * Chunks represent segments of document text optimized for:
 * - Vector embedding (fitting within model context windows)
 * - Semantic coherence (keeping related content together)
 * - Citation accuracy (mapping back to source sections)
 *
 * The function handles empty arrays gracefully, returning an empty array
 * without executing any database operations.
 *
 * @param tenantId - The organization ID for tenant isolation. Required.
 * @param documentId - The parent document's unique identifier (UUID).
 * @param chunks - Array of chunk data to insert.
 * @param chunks[].content - The text content of the chunk. Required.
 * @param chunks[].chunkIndex - Zero-based position in document order. Required.
 *   Used to reconstruct document structure.
 * @param chunks[].sectionPath - Hierarchical path for navigation (e.g., ["Section 1", "Definitions"]).
 *   Optional, defaults to null.
 * @param chunks[].embedding - Pre-computed vector embedding (1024 dimensions for voyage-law-2).
 *   Optional, typically set later via updateChunkEmbedding.
 * @param chunks[].tokenCount - Number of tokens in the chunk (for context window tracking).
 *   Optional, defaults to null.
 * @param chunks[].metadata - Additional chunk metadata as JSON.
 *   Optional, defaults to empty object {}.
 *
 * @returns Promise resolving to an array of the created chunk records with
 *   generated IDs and timestamps. Returns empty array if input is empty.
 *
 * @example
 * ```typescript
 * // Create chunks after parsing
 * const parsedChunks = await parseDocument(pdfBuffer)
 * const chunks = await createDocumentChunks(tenantId, documentId, parsedChunks.map(
 *   (chunk, index) => ({
 *     content: chunk.text,
 *     chunkIndex: index,
 *     sectionPath: chunk.headers,
 *     tokenCount: chunk.tokenCount,
 *     metadata: { pageNumbers: chunk.pages },
 *   })
 * ))
 *
 * // Create chunks with pre-computed embeddings
 * const chunksWithEmbeddings = await createDocumentChunks(tenantId, documentId, [
 *   {
 *     content: "This Agreement shall...",
 *     chunkIndex: 0,
 *     embedding: await generateEmbedding("This Agreement shall..."),
 *   },
 * ])
 *
 * // Handle empty case
 * const noChunks = await createDocumentChunks(tenantId, documentId, [])
 * console.log(noChunks) // []
 * ```
 */
export async function createDocumentChunks(
  tenantId: string,
  documentId: string,
  chunks: Array<{
    content: string
    chunkIndex: number
    sectionPath?: string[]
    embedding?: number[]
    tokenCount?: number
    metadata?: Record<string, unknown>
  }>
) {
  if (chunks.length === 0) return []

  const values = chunks.map((chunk) => ({
    tenantId,
    documentId,
    content: chunk.content,
    chunkIndex: chunk.chunkIndex,
    sectionPath: chunk.sectionPath ?? null,
    embedding: chunk.embedding ?? null,
    tokenCount: chunk.tokenCount ?? null,
    metadata: chunk.metadata ?? {},
  }))

  return db.insert(documentChunks).values(values).returning()
}

/**
 * Updates a chunk's vector embedding after asynchronous generation.
 *
 * @description
 * Sets the vector embedding for a specific document chunk. This is called
 * during the embedding phase when embeddings are generated asynchronously
 * (e.g., via Inngest background jobs with rate limiting).
 *
 * The embedding vector should be generated using the configured embedding
 * model (voyage-law-2 with 1024 dimensions). Embeddings enable:
 * - Semantic similarity search across documents
 * - Clause matching against the CUAD taxonomy
 * - Contract comparison features
 *
 * The function also updates the `updatedAt` timestamp to track when the
 * embedding was added.
 *
 * @param chunkId - The unique chunk identifier (UUID).
 * @param tenantId - The organization ID for tenant isolation. Required.
 * @param embedding - The vector embedding array. Should match the configured
 *   model dimensions (1024 for voyage-law-2).
 *
 * @returns Promise resolving to the updated chunk record, or `null` if the
 *   chunk doesn't exist or belongs to a different tenant.
 *
 * @example
 * ```typescript
 * // Update embedding after generation
 * const embedding = await voyageClient.embed({
 *   input: chunk.content,
 *   model: "voyage-law-2",
 * })
 * await updateChunkEmbedding(chunk.id, tenantId, embedding.data[0].embedding)
 *
 * // Batch embedding updates in Inngest
 * await step.run("embed-chunks", async () => {
 *   for (const chunk of chunks) {
 *     const embedding = await generateEmbedding(chunk.content)
 *     await updateChunkEmbedding(chunk.id, tenantId, embedding)
 *     await step.sleep("rate-limit", "200ms") // Respect Voyage rate limits
 *   }
 * })
 *
 * // Verify embedding was set
 * const updated = await updateChunkEmbedding(chunkId, tenantId, embedding)
 * if (updated?.embedding?.length === 1024) {
 *   console.log("Embedding stored successfully")
 * }
 * ```
 */
export async function updateChunkEmbedding(
  chunkId: string,
  tenantId: string,
  embedding: number[]
) {
  const [updated] = await db
    .update(documentChunks)
    .set({ embedding, updatedAt: new Date() })
    .where(
      and(eq(documentChunks.id, chunkId), eq(documentChunks.tenantId, tenantId))
    )
    .returning()

  return updated ?? null
}
