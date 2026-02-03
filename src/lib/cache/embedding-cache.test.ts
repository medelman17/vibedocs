import { describe, it, expect, beforeEach } from "vitest"
import {
  getCacheKey,
  getCachedEmbedding,
  setCachedEmbedding,
  getCachedEmbeddings,
  getEmbeddingCacheStats,
  clearEmbeddingCache,
} from "./embedding-cache"

describe("embedding-cache", () => {
  beforeEach(() => {
    clearEmbeddingCache()
  })

  describe("getCacheKey", () => {
    it("generates consistent keys for same text", () => {
      const key1 = getCacheKey("test text", "document")
      const key2 = getCacheKey("test text", "document")
      expect(key1).toBe(key2)
    })

    it("generates different keys for different input types", () => {
      const docKey = getCacheKey("test text", "document")
      const queryKey = getCacheKey("test text", "query")
      expect(docKey).not.toBe(queryKey)
    })

    it("normalizes whitespace and case", () => {
      const key1 = getCacheKey("Test Text", "document")
      const key2 = getCacheKey("  test  text  ", "document")
      expect(key1).toBe(key2)
    })
  })

  describe("single item operations", () => {
    it("returns null for cache miss", () => {
      const result = getCachedEmbedding("uncached text", "document")
      expect(result).toBeNull()
    })

    it("returns cached embedding for cache hit", () => {
      const embedding = Array(1024).fill(0.1)
      setCachedEmbedding("test text", "document", embedding, 10)

      const result = getCachedEmbedding("test text", "document")
      expect(result).not.toBeNull()
      expect(result!.embedding).toEqual(embedding)
      expect(result!.tokens).toBe(10)
    })

    it("tracks hit/miss statistics", () => {
      setCachedEmbedding("cached", "document", Array(1024).fill(0), 5)

      getCachedEmbedding("cached", "document") // hit
      getCachedEmbedding("uncached", "document") // miss

      const stats = getEmbeddingCacheStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBe(0.5)
    })
  })

  describe("batch operations", () => {
    it("returns empty map for empty input", () => {
      const result = getCachedEmbeddings([], "document")
      expect(result.size).toBe(0)
    })

    it("returns map of cached indices", () => {
      setCachedEmbedding("text-0", "document", Array(1024).fill(0), 5)
      setCachedEmbedding("text-2", "document", Array(1024).fill(0), 5)

      const texts = ["text-0", "text-1", "text-2"]
      const result = getCachedEmbeddings(texts, "document")

      expect(result.has(0)).toBe(true)
      expect(result.has(1)).toBe(false)
      expect(result.has(2)).toBe(true)
    })
  })

  describe("utilities", () => {
    it("clearEmbeddingCache resets state", () => {
      setCachedEmbedding("test", "document", Array(1024).fill(0), 5)
      getCachedEmbedding("test", "document")

      clearEmbeddingCache()

      expect(getCachedEmbedding("test", "document")).toBeNull()
      expect(getEmbeddingCacheStats().hits).toBe(0)
    })
  })
})
