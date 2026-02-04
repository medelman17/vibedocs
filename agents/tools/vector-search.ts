/**
 * Vector Search Tool
 *
 * AI SDK tool for semantic similarity search across reference documents.
 * Uses Voyage AI voyage-law-2 embeddings with pgvector.
 *
 * @module agents/tools/vector-search
 */

import { tool } from 'ai'
import { z } from 'zod'
import { createHash } from 'crypto'
import { db } from '@/db/client'
import { referenceEmbeddings, referenceDocuments } from '@/db/schema/reference'
import { cosineDistance, lt, eq, and, sql } from 'drizzle-orm'
import { getVoyageAIClient } from '@/lib/embeddings'
import { LRUCache } from 'lru-cache'
import type { CuadCategory } from '../types'

/** Search result from vector query */
export interface VectorSearchResult {
  id: string
  content: string
  category: string
  similarity: number
  source: string
}

/** Cache for search results (5 min TTL, 500 entries) */
const searchCache = new LRUCache<string, VectorSearchResult[]>({
  max: 500,
  ttl: 1000 * 60 * 5,
})

/** Input schema for vector search */
export const vectorSearchInputSchema = z.object({
  query: z.string().describe('Clause text to find similar examples for'),
  category: z.string().optional().describe('Filter by CUAD category'),
  limit: z.number().min(1).max(10).default(5).describe('Max results (1-10)'),
})

type VectorSearchInput = z.infer<typeof vectorSearchInputSchema>

/**
 * Core vector search implementation.
 * Used by both the AI SDK tool and direct function calls.
 */
async function executeVectorSearch({
  query,
  category,
  limit,
}: VectorSearchInput): Promise<VectorSearchResult[]> {
  // Check cache (use hash to avoid collisions from truncation)
  const queryHash = createHash('sha256').update(query).digest('hex').slice(0, 16)
  const cacheKey = `${queryHash}:${category ?? 'all'}:${limit}`
  const cached = searchCache.get(cacheKey)
  if (cached) return cached

  // Generate query embedding
  const voyageClient = getVoyageAIClient()
  const { embedding } = await voyageClient.embed(query, 'query')

  // Search with cosine distance
  const distanceThreshold = 0.3 // similarity > 0.7

  const whereConditions = [
    lt(cosineDistance(referenceEmbeddings.embedding, embedding), distanceThreshold),
  ]
  if (category) {
    whereConditions.push(eq(referenceEmbeddings.category, category))
  }

  const results = await db
    .select({
      id: referenceEmbeddings.id,
      content: referenceEmbeddings.content,
      category: referenceEmbeddings.category,
      distance: cosineDistance(referenceEmbeddings.embedding, embedding),
      documentId: referenceEmbeddings.documentId,
    })
    .from(referenceEmbeddings)
    .where(and(...whereConditions))
    .orderBy(cosineDistance(referenceEmbeddings.embedding, embedding))
    .limit(limit)

  // Fetch source document titles
  const docIds = [...new Set(results.map(r => r.documentId))]
  const docs = docIds.length > 0
    ? await db
        .select({ id: referenceDocuments.id, title: referenceDocuments.title })
        .from(referenceDocuments)
        .where(sql`${referenceDocuments.id} IN (${sql.join(docIds.map(id => sql`${id}`), sql`, `)})`)
    : []

  const docMap = new Map(docs.map(d => [d.id, d.title]))

  const searchResults: VectorSearchResult[] = results.map(r => ({
    id: r.id,
    content: r.content.slice(0, 500),
    category: r.category ?? 'Unknown',
    similarity: Math.round((1 - (r.distance as number)) * 100) / 100,
    source: docMap.get(r.documentId) ?? 'Unknown',
  }))

  // Cache results
  searchCache.set(cacheKey, searchResults)

  return searchResults
}

/**
 * AI SDK tool for agents to search reference corpus.
 * Finds similar clauses from CUAD/ContractNLI embeddings.
 */
export const vectorSearchTool = tool({
  description:
    'Search the CUAD legal reference corpus for similar clauses. ' +
    'Use to find examples of standard clause language for comparison.',
  inputSchema: vectorSearchInputSchema,
  execute: async (input) => {
    try {
      return await executeVectorSearch(input)
    } catch (error) {
      console.error('[vector-search] Tool execution failed:', error)
      // Return empty results with error info instead of throwing
      return [{
        id: 'error',
        content: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        category: 'Error',
        similarity: 0,
        source: 'System',
      }]
    }
  },
})

/**
 * Direct function for non-agent use (e.g., batch processing).
 */
export async function findSimilarClauses(
  query: string,
  options: { category?: CuadCategory; limit?: number } = {}
): Promise<VectorSearchResult[]> {
  const input = vectorSearchInputSchema.parse({
    query,
    category: options.category,
    limit: options.limit ?? 5,
  })
  return executeVectorSearch(input)
}

/** Clear search cache (for testing) */
export function clearSearchCache(): void {
  searchCache.clear()
}
