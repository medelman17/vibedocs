// src/db/queries/similarity.ts
// Vector similarity search helpers using cosineDistance
import { cosineDistance, desc, eq, and, sql } from "drizzle-orm"
import { db } from "../client"
import { documentChunks } from "../schema/documents"
import { referenceEmbeddings } from "../schema/reference"

export type Granularity =
  | "document"
  | "section"
  | "clause"
  | "span"
  | "template"

/**
 * Find similar chunks within tenant documents
 * Uses cosineDistance for voyage-law-2 embeddings (1024 dims)
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
  return results.filter((r) => r.similarity >= threshold)
}

/**
 * Find similar reference embeddings (CUAD clauses, templates, etc.)
 * Searches across the shared reference corpus
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
 * Find the best matching CUAD category for a clause embedding
 * Returns clause-level reference embeddings sorted by similarity
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
 * Find similar template sections for NDA generation
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
