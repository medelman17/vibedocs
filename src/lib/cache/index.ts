/**
 * @fileoverview Cache Utilities Barrel Export
 *
 * @module lib/cache
 */

export {
  getCachedEmbedding,
  setCachedEmbedding,
  getCachedEmbeddings,
  getEmbeddingCacheStats,
  clearEmbeddingCache,
  getCacheKey,
  type CachedEmbedding,
  type EmbeddingCacheStats,
} from "./embedding-cache"
