// src/db/queries/documents.ts
// Document CRUD operations with tenant isolation
import { eq, and, desc, isNull } from "drizzle-orm"
import { db } from "../client"
import { documents, documentChunks } from "../schema/documents"

export type DocumentStatus =
  | "pending"
  | "parsing"
  | "embedding"
  | "analyzing"
  | "complete"
  | "failed"

/**
 * Get all documents for a tenant (excludes soft-deleted)
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
 * Get a single document by ID with tenant isolation
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
 * Get document with all its chunks
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
 * Update document status (and optionally error message)
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
 * Soft delete a document
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
 * Create document chunks in batch
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
 * Update chunk embeddings (after async embedding generation)
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
