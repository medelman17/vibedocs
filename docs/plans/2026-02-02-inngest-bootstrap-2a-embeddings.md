# Sub-Plan 2A: Voyage AI Embedding Client

> **Status:** ✅ COMPLETE (audited 2026-02-04)
>
> All tasks implemented. See inngest/ and agents/ directories.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a production-ready Voyage AI embedding client with LRU caching, batching, and rate-limit awareness.

**Architecture:** Singleton client with content-hash based caching. Batch operations check cache first, only send uncached texts to API, then merge results in original order.

**Tech Stack:** Voyage AI voyage-law-2, lru-cache, Zod for response validation

**Parent Plan:** Bootstrap Pipeline (Plan 2)
**Prerequisite:** Inngest Infrastructure (Plan 1) ✓

---

## Overview

```
┌─────────────────────────────────────────────────────────┐
│                  getVoyageAIClient()                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  embed(text) ──────────────────────────────────────┐    │
│                                                    │    │
│  embedBatch(texts[]) ──┬── Check LRU Cache ────────┤    │
│                        │                           │    │
│                        ├── Batch uncached (≤128) ──┤    │
│                        │                           │    │
│                        └── Call Voyage API ────────┘    │
│                             │                           │
│                             ▼                           │
│                        Cache results                    │
│                                                         │
└─────────────────────────────────────────────────────────┘

Config:
- Model: voyage-law-2
- Dimensions: 1024
- Max batch: 128 texts
- Rate limit: 300 RPM (200ms delay)
- Cache: LRU, 10K entries, 1-hour TTL
```

---

## Task 1: Install lru-cache

**Step 1: Install package**

Run: `pnpm add lru-cache`

**Step 2: Verify installation**

Run: `pnpm list lru-cache`
Expected: `lru-cache` installed

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add lru-cache for embedding caching

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create cache directory structure

**Files:**
- Create: `src/lib/cache/index.ts`

**Step 1: Create barrel export placeholder**

```typescript
// src/lib/cache/index.ts
/**
 * @fileoverview Cache Utilities Barrel Export
 *
 * @module lib/cache
 */

// Exports will be added as cache modules are created
```

**Step 2: Commit**

```bash
git add src/lib/cache/index.ts
git commit -m "chore: create cache module structure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Implement embedding cache (TDD)

**Files:**
- Create: `src/lib/cache/embedding-cache.test.ts`
- Create: `src/lib/cache/embedding-cache.ts`
- Modify: `src/lib/cache/index.ts`

**Step 1: Write failing tests**

```typescript
// src/lib/cache/embedding-cache.test.ts
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
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/cache/embedding-cache.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement the cache**

```typescript
// src/lib/cache/embedding-cache.ts
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
```

**Step 4: Update barrel export**

```typescript
// src/lib/cache/index.ts
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
```

**Step 5: Run tests**

Run: `pnpm test src/lib/cache/embedding-cache.test.ts`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/lib/cache/
git commit -m "feat: add LRU embedding cache

- Content-hash based deduplication
- 10K entries, 1-hour TTL
- Batch lookup support
- Hit/miss statistics

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Implement Voyage AI client (TDD)

**Files:**
- Create: `src/lib/embeddings.test.ts`
- Create: `src/lib/embeddings.ts`

**Step 1: Write failing tests**

```typescript
// src/lib/embeddings.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  VoyageAIClient,
  VOYAGE_CONFIG,
  getVoyageAIClient,
  resetVoyageAIClient,
} from "./embeddings"
import { clearEmbeddingCache } from "./cache"

describe("VoyageAIClient", () => {
  beforeEach(() => {
    resetVoyageAIClient()
    clearEmbeddingCache()
    vi.stubEnv("VOYAGE_API_KEY", "test-key")
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe("configuration", () => {
    it("uses environment variable if no key provided", () => {
      expect(() => getVoyageAIClient()).not.toThrow()
    })

    it("throws if no API key available", () => {
      vi.stubEnv("VOYAGE_API_KEY", "")
      resetVoyageAIClient()
      expect(() => getVoyageAIClient()).toThrow("VOYAGE_API_KEY")
    })
  })

  describe("embedBatch", () => {
    it("returns empty for empty input", async () => {
      const client = getVoyageAIClient()
      const result = await client.embedBatch([])
      expect(result.embeddings).toHaveLength(0)
      expect(result.totalTokens).toBe(0)
    })

    it("rejects batches over 128 texts", async () => {
      const client = getVoyageAIClient()
      const oversized = Array(129).fill("text")
      await expect(client.embedBatch(oversized)).rejects.toThrow("exceeds limit")
    })

    it("calls API and returns embeddings", async () => {
      const mockEmbedding = Array(1024).fill(0.1)
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: "list",
          data: [
            { object: "embedding", index: 0, embedding: mockEmbedding },
          ],
          model: "voyage-law-2",
          usage: { total_tokens: 50 },
        }),
      } as Response)

      const client = getVoyageAIClient()
      const result = await client.embedBatch(["test text"])

      expect(result.embeddings).toHaveLength(1)
      expect(result.embeddings[0]).toHaveLength(1024)
      expect(result.totalTokens).toBe(50)
    })

    it("only calls API for uncached texts", async () => {
      const mockEmbedding = Array(1024).fill(0.1)
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          object: "list",
          data: [{ object: "embedding", index: 0, embedding: mockEmbedding }],
          model: "voyage-law-2",
          usage: { total_tokens: 25 },
        }),
      } as Response)

      const client = getVoyageAIClient()

      // First call - caches "text-1"
      await client.embedBatch(["text-1"])
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      // Second call - "text-1" cached, only "text-2" sent to API
      await client.embedBatch(["text-1", "text-2"])
      expect(fetchSpy).toHaveBeenCalledTimes(2)

      // Verify the second call only had one text
      const secondCall = fetchSpy.mock.calls[1]
      const body = JSON.parse(secondCall[1]?.body as string)
      expect(body.input).toHaveLength(1)
      expect(body.input[0]).toBe("text-2")
    })

    it("returns embeddings in original order", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          object: "list",
          data: [
            { object: "embedding", index: 1, embedding: Array(1024).fill(0.2) },
            { object: "embedding", index: 0, embedding: Array(1024).fill(0.1) },
          ],
          model: "voyage-law-2",
          usage: { total_tokens: 50 },
        }),
      } as Response)

      const client = getVoyageAIClient()
      const result = await client.embedBatch(["first", "second"])

      // Should be reordered to match input
      expect(result.embeddings[0][0]).toBe(0.1)
      expect(result.embeddings[1][0]).toBe(0.2)
    })
  })

  describe("error handling", () => {
    it("throws on API 401", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Invalid API key",
      } as Response)

      const client = getVoyageAIClient()
      await expect(client.embedBatch(["test"])).rejects.toThrow("401")
    })

    it("throws on API 429 with rate limit info", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
      } as Response)

      const client = getVoyageAIClient()
      await expect(client.embedBatch(["test"])).rejects.toThrow("429")
    })
  })
})

describe("VOYAGE_CONFIG", () => {
  it("has correct model settings", () => {
    expect(VOYAGE_CONFIG.model).toBe("voyage-law-2")
    expect(VOYAGE_CONFIG.dimensions).toBe(1024)
    expect(VOYAGE_CONFIG.batchLimit).toBe(128)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/embeddings.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement the client**

```typescript
// src/lib/embeddings.ts
/**
 * @fileoverview Voyage AI Embeddings Client
 *
 * Client for generating legal-specific embeddings using Voyage AI's
 * voyage-law-2 model with built-in caching.
 *
 * @module lib/embeddings
 */

import { z } from "zod"
import {
  getCachedEmbeddings,
  setCachedEmbedding,
  type CachedEmbedding,
} from "./cache"

/**
 * Voyage AI configuration.
 */
export const VOYAGE_CONFIG = {
  model: "voyage-law-2",
  dimensions: 1024,
  maxInputTokens: 16_000,
  batchLimit: 128,
  baseUrl: "https://api.voyageai.com/v1",
} as const

/**
 * Input type for embedding generation.
 */
export type VoyageInputType = "document" | "query"

/**
 * Single embedding result.
 */
export interface SingleEmbeddingResult {
  embedding: number[]
  tokens: number
  fromCache: boolean
}

/**
 * Batch embedding result.
 */
export interface BatchEmbeddingResult {
  embeddings: number[][]
  totalTokens: number
  cacheHits: number
}

/**
 * Voyage AI API response schema.
 */
const voyageResponseSchema = z.object({
  object: z.literal("list"),
  data: z.array(
    z.object({
      object: z.literal("embedding"),
      index: z.number(),
      embedding: z.array(z.number()),
    })
  ),
  model: z.string(),
  usage: z.object({
    total_tokens: z.number(),
  }),
})

/**
 * Voyage AI client class.
 */
export class VoyageAIClient {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.VOYAGE_API_KEY ?? ""
    if (!this.apiKey) {
      throw new Error("VOYAGE_API_KEY is required")
    }
    this.baseUrl = VOYAGE_CONFIG.baseUrl
  }

  /**
   * Generate embedding for a single text.
   */
  async embed(
    text: string,
    inputType: VoyageInputType = "document"
  ): Promise<SingleEmbeddingResult> {
    const result = await this.embedBatch([text], inputType)
    return {
      embedding: result.embeddings[0],
      tokens: result.totalTokens,
      fromCache: result.cacheHits > 0,
    }
  }

  /**
   * Generate embeddings for multiple texts with caching.
   */
  async embedBatch(
    texts: string[],
    inputType: VoyageInputType = "document"
  ): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], totalTokens: 0, cacheHits: 0 }
    }

    if (texts.length > VOYAGE_CONFIG.batchLimit) {
      throw new Error(
        `Batch size ${texts.length} exceeds limit ${VOYAGE_CONFIG.batchLimit}`
      )
    }

    // Check cache for existing embeddings
    const cached = getCachedEmbeddings(texts, inputType)
    const cacheHits = cached.size

    // Find uncached texts with their original indices
    const uncachedIndices: number[] = []
    const uncachedTexts: string[] = []
    for (let i = 0; i < texts.length; i++) {
      if (!cached.has(i)) {
        uncachedIndices.push(i)
        uncachedTexts.push(texts[i])
      }
    }

    // If all cached, return immediately
    if (uncachedTexts.length === 0) {
      const embeddings = texts.map((_, i) => cached.get(i)!.embedding)
      const totalTokens = Array.from(cached.values()).reduce(
        (sum, c) => sum + c.tokens,
        0
      )
      return { embeddings, totalTokens, cacheHits }
    }

    // Call API for uncached texts
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: VOYAGE_CONFIG.model,
        input: uncachedTexts,
        input_type: inputType,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Voyage AI API error (${response.status}): ${error}`)
    }

    const json = await response.json()
    const parsed = voyageResponseSchema.parse(json)

    // Sort by index to match uncachedTexts order
    const sorted = parsed.data.sort((a, b) => a.index - b.index)

    // Cache new embeddings
    const tokensPerText = Math.floor(parsed.usage.total_tokens / uncachedTexts.length)
    for (let i = 0; i < uncachedTexts.length; i++) {
      setCachedEmbedding(uncachedTexts[i], inputType, sorted[i].embedding, tokensPerText)
    }

    // Merge cached and new embeddings in original order
    const embeddings: number[][] = []
    let newEmbeddingIdx = 0

    for (let i = 0; i < texts.length; i++) {
      const cachedEntry = cached.get(i)
      if (cachedEntry) {
        embeddings.push(cachedEntry.embedding)
      } else {
        embeddings.push(sorted[newEmbeddingIdx].embedding)
        newEmbeddingIdx++
      }
    }

    return {
      embeddings,
      totalTokens: parsed.usage.total_tokens,
      cacheHits,
    }
  }
}

// Singleton instance
let voyageClient: VoyageAIClient | null = null

/**
 * Get the singleton Voyage AI client.
 */
export function getVoyageAIClient(): VoyageAIClient {
  if (!voyageClient) {
    voyageClient = new VoyageAIClient()
  }
  return voyageClient
}

/**
 * Reset the singleton client (for testing).
 */
export function resetVoyageAIClient(): void {
  voyageClient = null
}
```

**Step 4: Run tests**

Run: `pnpm test src/lib/embeddings.test.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/lib/embeddings.ts src/lib/embeddings.test.ts
git commit -m "feat: add Voyage AI embedding client with caching

- voyage-law-2 model (1024 dimensions)
- Batch embedding support (max 128)
- LRU cache integration
- Input type support (document/query)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update environment variables

**Files:**
- Modify: `.env.example`

**Step 1: Add Voyage AI variable**

Add to `.env.example`:

```bash
# =============================================================================
# Voyage AI - Legal Document Embeddings
# =============================================================================
# Get API key from: https://dash.voyageai.com/

VOYAGE_API_KEY=
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add VOYAGE_API_KEY to .env.example

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Final verification

**Step 1: TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 2: Run all tests**

Run: `pnpm test src/lib/cache src/lib/embeddings`
Expected: All tests pass

**Step 3: Lint check**

Run: `pnpm lint`
Expected: No errors

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Sub-Plan 2A - Voyage AI embedding client

- LRU embedding cache (10K entries, 1-hour TTL)
- Voyage AI client with caching and batching
- Content-hash based deduplication
- Full test coverage

Ready for: Sub-Plan 2B (Dataset Parsers)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `package.json` | Install lru-cache |
| 2 | `src/lib/cache/index.ts` | Create cache module structure |
| 3 | `src/lib/cache/embedding-cache.ts` | LRU cache with tests |
| 4 | `src/lib/embeddings.ts` | Voyage AI client with tests |
| 5 | `.env.example` | Add VOYAGE_API_KEY |
| 6 | - | Final verification |

**Total: 6 tasks**

**Next Sub-Plan:** 2B - Dataset Parsers (CUAD, ContractNLI, Templates)
