/**
 * @fileoverview Embedding Cache
 *
 * LRU cache for Voyage AI embeddings to avoid redundant API calls.
 * Uses content hash as cache key for deduplication.
 *
 * @module lib/cache/embedding-cache
 */

import { LRUCache } from "lru-cache"
import { createHash } from "crypto"

/**
 * Cached embedding entry.
 */
export interface CachedEmbedding {
  embedding: number[]
  tokens: number
  cachedAt: number
}

/**
 * Cache statistics.
 */
export interface EmbeddingCacheStats {
  hits: number
  misses: number
  size: number
  hitRate: number
}

/**
 * LRU cache for embeddings.
 * - Max 10,000 entries (~40MB at 1024 dimensions)
 * - 1-hour TTL
 */
const embeddingCache = new LRUCache<string, CachedEmbedding>({
  max: 10_000,
  ttl: 1000 * 60 * 60, // 1 hour
})

let cacheStats = { hits: 0, misses: 0 }

/**
 * Generate cache key from text content.
 * Normalizes whitespace and case for better hit rate.
 */
export function getCacheKey(text: string, inputType: "document" | "query"): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ")
  const hash = createHash("sha256").update(normalized).digest("hex").substring(0, 16)
  return `emb:${inputType}:${hash}`
}

/**
 * Get embedding from cache.
 */
export function getCachedEmbedding(
  text: string,
  inputType: "document" | "query"
): CachedEmbedding | null {
  const key = getCacheKey(text, inputType)
  const cached = embeddingCache.get(key)

  if (cached) {
    cacheStats.hits++
    return cached
  }

  cacheStats.misses++
  return null
}

/**
 * Store embedding in cache.
 */
export function setCachedEmbedding(
  text: string,
  inputType: "document" | "query",
  embedding: number[],
  tokens: number
): void {
  const key = getCacheKey(text, inputType)
  embeddingCache.set(key, {
    embedding,
    tokens,
    cachedAt: Date.now(),
  })
}

/**
 * Get multiple embeddings from cache.
 * Returns map of index -> cached embedding for hits.
 */
export function getCachedEmbeddings(
  texts: string[],
  inputType: "document" | "query"
): Map<number, CachedEmbedding> {
  const results = new Map<number, CachedEmbedding>()

  for (let i = 0; i < texts.length; i++) {
    const cached = getCachedEmbedding(texts[i], inputType)
    if (cached) {
      results.set(i, cached)
    }
  }

  return results
}

/**
 * Get cache statistics.
 */
export function getEmbeddingCacheStats(): EmbeddingCacheStats {
  const total = cacheStats.hits + cacheStats.misses
  return {
    ...cacheStats,
    size: embeddingCache.size,
    hitRate: total > 0 ? cacheStats.hits / total : 0,
  }
}

/**
 * Clear the cache and reset stats (for testing).
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear()
  cacheStats = { hits: 0, misses: 0 }
}
