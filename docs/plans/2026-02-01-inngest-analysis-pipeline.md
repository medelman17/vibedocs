# Analysis Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the complete NDA analysis pipeline with four specialized agents: Parser Agent, Classifier Agent, Risk Scorer Agent, and Gap Analyst Agent, orchestrated via Inngest for durability.

**Architecture:** Each agent uses AI SDK 6 with BudgetTracker for token management. The pipeline flows: Parser → Classifier → Risk Scorer → Gap Analyst, with each stage persisting results to the database. Inngest provides retry and resume capabilities at each step. Caching reduces redundant API calls.

**Tech Stack:** Inngest 3.x, AI SDK 6, Voyage AI voyage-law-2, Drizzle ORM, pdf-parse, mammoth, LRU Cache

**Prerequisite Plans:**
- Plan 1: Inngest Infrastructure ✓
- Plan 2: Bootstrap Pipeline ✓
- Plan 3: Agent Foundation ✓ (provides AI SDK 6 config, BudgetTracker, test utilities)

**Dependent Plans:**
- Plan 5: Comparison & Generation (builds on this pipeline)

---

## Overview

The analysis pipeline processes uploaded NDAs through four stages:

```
Document → Parser → Classifier → Risk Scorer → Gap Analyst → Results
              ↓          ↓             ↓              ↓
           Chunks    Clauses    Risk Scores    Gap Analysis
              ↓          ↓             ↓              ↓
          [Cache]    [Cache]      [Cache]       [Persist]
              ↓          ↓             ↓              ↓
         Progress    Progress     Progress      Complete
```

**Key Features:**
- **Caching**: Embedding cache, vector search cache, Claude response cache
- **Progress Tracking**: Inngest events at each stage for real-time UI
- **Partial Persistence**: Results saved after each agent for resume capability
- **Budget Tracking**: Shared BudgetTracker across all agents (~212K limit)

**Risk Level Terminology (PRD-aligned):**
- `standard` - Clause language is typical/balanced
- `cautious` - Clause leans protective, worth noting
- `aggressive` - Clause significantly favors one party, potential red flag
- `unknown` - Cannot confidently classify

---

## Phase 1: Dependencies & Infrastructure

### Task 1: Install Document Parsing Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install pdf-parse and mammoth**

Run: `pnpm add pdf-parse mammoth`

**Step 2: Install types**

Run: `pnpm add -D @types/pdf-parse`

**Step 3: Verify installation**

Run: `pnpm list pdf-parse mammoth`
Expected: Both packages installed

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add document parsing dependencies

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Install Caching Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install lru-cache**

Run: `pnpm add lru-cache`

Note: Using lru-cache instead of Redis for MVP simplicity. Can upgrade to Redis post-MVP for distributed caching.

**Step 2: Verify installation**

Run: `pnpm list lru-cache`
Expected: lru-cache installed

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add lru-cache for embedding and response caching

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 3a: Create Document Processing Module

**Files:**
- Create: `src/lib/document-processing.ts`

**Step 1: Create document processing module**

```typescript
// src/lib/document-processing.ts
/**
 * @fileoverview Document Processing Utilities
 *
 * Functions for extracting text from PDF and DOCX files,
 * and chunking text into semantic segments for embedding.
 *
 * @module lib/document-processing
 */

import pdfParse from "pdf-parse"
import mammoth from "mammoth"
import { createHash } from "crypto"

/**
 * Supported document types.
 */
export type DocumentType = "pdf" | "docx"

/**
 * Extracted text with metadata.
 */
export interface ExtractedDocument {
  text: string
  pageCount?: number
  metadata: {
    type: DocumentType
    characterCount: number
    wordCount: number
  }
}

/**
 * Text chunk with position and context.
 */
export interface TextChunk {
  index: number
  content: string
  sectionPath: string[]
  tokenCount: number
  startPosition: number
  endPosition: number
}

/**
 * Chunking options.
 */
export interface ChunkingOptions {
  maxTokens?: number
  overlap?: number
}

const DEFAULT_CHUNKING_OPTIONS: Required<ChunkingOptions> = {
  maxTokens: 512,
  overlap: 50,
}

/**
 * Extract text from a document buffer.
 */
export async function extractText(
  buffer: ArrayBuffer,
  type: DocumentType
): Promise<ExtractedDocument> {
  if (type === "pdf") {
    return extractPdfText(buffer)
  } else if (type === "docx") {
    return extractDocxText(buffer)
  }
  throw new Error(`Unsupported document type: ${type}`)
}

async function extractPdfText(buffer: ArrayBuffer): Promise<ExtractedDocument> {
  const data = await pdfParse(Buffer.from(buffer))
  return {
    text: data.text,
    pageCount: data.numpages,
    metadata: {
      type: "pdf",
      characterCount: data.text.length,
      wordCount: countWords(data.text),
    },
  }
}

async function extractDocxText(buffer: ArrayBuffer): Promise<ExtractedDocument> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
  return {
    text: result.value,
    metadata: {
      type: "docx",
      characterCount: result.value.length,
      wordCount: countWords(result.value),
    },
  }
}

/**
 * Chunk text into semantic segments with legal-aware splitting.
 */
export function chunkText(text: string, options: ChunkingOptions = {}): TextChunk[] {
  const opts = { ...DEFAULT_CHUNKING_OPTIONS, ...options }
  const chunks: TextChunk[] = []
  const sections = detectSections(text)
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)

  let currentChunk = ""
  let currentSectionPath: string[] = []
  let chunkStartPos = 0
  let textPos = 0

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph)

    // Check if this paragraph starts a new section
    for (const section of sections) {
      if (paragraph.includes(section.name)) {
        currentSectionPath = section.path
        break
      }
    }

    if (estimateTokens(currentChunk) + paragraphTokens > opts.maxTokens && currentChunk.length > 0) {
      chunks.push({
        index: chunks.length,
        content: currentChunk.trim(),
        sectionPath: [...currentSectionPath],
        tokenCount: estimateTokens(currentChunk),
        startPosition: chunkStartPos,
        endPosition: textPos,
      })

      const overlapText = getOverlapText(currentChunk, opts.overlap)
      currentChunk = overlapText + paragraph
      chunkStartPos = textPos - overlapText.length
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph
    }

    textPos += paragraph.length + 2
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      index: chunks.length,
      content: currentChunk.trim(),
      sectionPath: [...currentSectionPath],
      tokenCount: estimateTokens(currentChunk),
      startPosition: chunkStartPos,
      endPosition: textPos,
    })
  }

  return chunks
}

function detectSections(text: string): Array<{ name: string; path: string[] }> {
  const sections: Array<{ name: string; path: string[] }> = []
  const lines = text.split("\n")
  let currentArticle = ""

  for (const line of lines) {
    const articleMatch = line.match(/^ARTICLE\s+([IVX\d]+)[.:]\s*(.+)/i)
    if (articleMatch) {
      currentArticle = `Article ${articleMatch[1]}: ${articleMatch[2].trim()}`
      sections.push({ name: articleMatch[0], path: [currentArticle] })
      continue
    }

    const sectionMatch = line.match(/^Section\s+(\d+(?:\.\d+)*)[.:]\s*(.+)/i)
    if (sectionMatch) {
      const currentSection = `Section ${sectionMatch[1]}: ${sectionMatch[2].trim()}`
      const path = currentArticle ? [currentArticle, currentSection] : [currentSection]
      sections.push({ name: sectionMatch[0], path })
    }
  }

  return sections
}

function getOverlapText(text: string, overlapTokens: number): string {
  const words = text.split(/\s+/)
  const overlapWords = Math.min(overlapTokens, words.length)
  return words.slice(-overlapWords).join(" ") + " "
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length
}

export function generateContentHash(text: string): string {
  const normalized = text.trim().toLowerCase()
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`
}

export function getDocumentType(mimeType: string): DocumentType | null {
  if (mimeType === "application/pdf") return "pdf"
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx"
  return null
}
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/document-processing.ts
git commit -m "feat: add document processing module

- PDF and DOCX text extraction
- Legal-aware text chunking with section detection

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 3b: Write Document Processing Tests

**Files:**
- Create: `src/lib/document-processing.test.ts`

**Step 1: Write tests**

```typescript
// src/lib/document-processing.test.ts
import { describe, it, expect } from "vitest"
import {
  chunkText,
  estimateTokens,
  generateContentHash,
  getDocumentType,
} from "./document-processing"

describe("chunkText", () => {
  it("should split text into chunks", () => {
    const text = `ARTICLE I: DEFINITIONS

The following terms shall have the meanings set forth below.

"Confidential Information" means any information disclosed.

ARTICLE II: OBLIGATIONS

Section 2.1: Non-Disclosure
The Receiving Party shall not disclose.`

    const chunks = chunkText(text, { maxTokens: 100 })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].sectionPath.length).toBeGreaterThan(0)
  })

  it("should handle empty text", () => {
    expect(chunkText("")).toHaveLength(0)
  })

  it("should include position information", () => {
    const chunks = chunkText("First paragraph.\n\nSecond paragraph.", { maxTokens: 10 })
    expect(chunks[0].startPosition).toBe(0)
    expect(chunks[0].endPosition).toBeGreaterThan(0)
  })
})

describe("estimateTokens", () => {
  it("should estimate token count", () => {
    const tokens = estimateTokens("This is a test sentence with some words.")
    expect(tokens).toBeGreaterThan(5)
    expect(tokens).toBeLessThan(20)
  })
})

describe("generateContentHash", () => {
  it("should generate consistent hash", () => {
    const hash1 = generateContentHash("Test content")
    const hash2 = generateContentHash("Test content")
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it("should normalize whitespace and case", () => {
    expect(generateContentHash("Test Content")).toBe(generateContentHash("  test content  "))
  })
})

describe("getDocumentType", () => {
  it("should identify PDF", () => {
    expect(getDocumentType("application/pdf")).toBe("pdf")
  })

  it("should identify DOCX", () => {
    expect(getDocumentType("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx")
  })

  it("should return null for unknown types", () => {
    expect(getDocumentType("text/plain")).toBeNull()
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/lib/document-processing.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/lib/document-processing.test.ts
git commit -m "test: add document processing tests

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 4a: Create Voyage AI Embeddings Client

**Files:**
- Create: `src/lib/embeddings.ts`

**Step 1: Create embeddings client**

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

export const VOYAGE_CONFIG = {
  model: "voyage-law-2",
  dimensions: 1024,
  maxInputTokens: 16_000,
  batchLimit: 128,
} as const

export type VoyageInputType = "document" | "query"

export interface EmbeddingResult {
  embeddings: number[][]
  totalTokens: number
  cacheHits: number
}

export interface SingleEmbeddingResult {
  embedding: number[]
  tokens: number
  fromCache: boolean
}

export class VoyageAIClient {
  private apiKey: string
  private baseUrl = "https://api.voyageai.com/v1"

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.VOYAGE_API_KEY ?? ""
    if (!this.apiKey) {
      throw new Error("VOYAGE_API_KEY is required")
    }
  }

  async embed(text: string, inputType: VoyageInputType = "document"): Promise<SingleEmbeddingResult> {
    const result = await this.embedBatch([text], inputType)
    return {
      embedding: result.embeddings[0],
      tokens: result.totalTokens,
      fromCache: result.cacheHits > 0,
    }
  }

  async embedBatch(texts: string[], inputType: VoyageInputType = "document"): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], totalTokens: 0, cacheHits: 0 }
    }

    if (texts.length > VOYAGE_CONFIG.batchLimit) {
      throw new Error(`Batch size ${texts.length} exceeds limit ${VOYAGE_CONFIG.batchLimit}`)
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: VOYAGE_CONFIG.model,
        input: texts,
        input_type: inputType,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Voyage AI API error: ${response.status} - ${error}`)
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>
      usage: { total_tokens: number }
    }

    return {
      embeddings: data.data.map((d) => d.embedding),
      totalTokens: data.usage.total_tokens,
      cacheHits: 0,
    }
  }
}

let voyageClient: VoyageAIClient | null = null

export function getVoyageAIClient(): VoyageAIClient {
  if (!voyageClient) {
    voyageClient = new VoyageAIClient()
  }
  return voyageClient
}

export function resetVoyageAIClient(): void {
  voyageClient = null
}
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/embeddings.ts
git commit -m "feat: add Voyage AI embeddings client

- voyage-law-2 model (1024 dimensions)
- Batch embedding support

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 4b: Write Embeddings Client Tests

**Files:**
- Create: `src/lib/embeddings.test.ts`

**Step 1: Write tests**

```typescript
// src/lib/embeddings.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { VoyageAIClient, VOYAGE_CONFIG, resetVoyageAIClient } from "./embeddings"

describe("VoyageAIClient", () => {
  beforeEach(() => {
    resetVoyageAIClient()
    vi.stubEnv("VOYAGE_API_KEY", "test-key")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("should use environment variable if no key provided", () => {
    expect(() => new VoyageAIClient()).not.toThrow()
  })

  it("should throw if no API key available", () => {
    vi.stubEnv("VOYAGE_API_KEY", "")
    expect(() => new VoyageAIClient("")).toThrow("VOYAGE_API_KEY is required")
  })

  it("should return empty for empty input", async () => {
    const client = new VoyageAIClient("test-key")
    const result = await client.embedBatch([])
    expect(result.embeddings).toHaveLength(0)
  })

  it("should reject oversized batches", async () => {
    const client = new VoyageAIClient("test-key")
    const oversized = Array(VOYAGE_CONFIG.batchLimit + 1).fill("text")
    await expect(client.embedBatch(oversized)).rejects.toThrow("exceeds limit")
  })
})

describe("VOYAGE_CONFIG", () => {
  it("should have correct model settings", () => {
    expect(VOYAGE_CONFIG.model).toBe("voyage-law-2")
    expect(VOYAGE_CONFIG.dimensions).toBe(1024)
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/lib/embeddings.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/lib/embeddings.test.ts
git commit -m "test: add embeddings client tests

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 5: Create Embedding Cache Layer

**Files:**
- Create: `src/lib/cache/embedding-cache.ts`
- Create: `src/lib/cache/index.ts`

**Step 1: Create embedding cache**

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

export interface CachedEmbedding {
  embedding: number[]
  tokens: number
  cachedAt: number
}

export interface EmbeddingCacheStats {
  hits: number
  misses: number
  size: number
  hitRate: number
}

/**
 * LRU cache for embeddings with 1-hour TTL.
 * Max 10,000 entries (~40MB at 1024 dimensions).
 */
const embeddingCache = new LRUCache<string, CachedEmbedding>({
  max: 10_000,
  ttl: 1000 * 60 * 60, // 1 hour
})

let cacheStats = { hits: 0, misses: 0 }

/**
 * Generate cache key from text content.
 */
export function getCacheKey(text: string, inputType: "document" | "query"): string {
  const normalized = text.trim().toLowerCase()
  const hash = createHash("sha256").update(normalized).digest("hex").substring(0, 16)
  return `emb:${inputType}:${hash}`
}

/**
 * Get embedding from cache.
 */
export function getCachedEmbedding(text: string, inputType: "document" | "query"): CachedEmbedding | null {
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
 * Store multiple embeddings in cache.
 */
export function setCachedEmbeddings(
  texts: string[],
  inputType: "document" | "query",
  embeddings: number[][],
  tokensPerText: number[]
): void {
  for (let i = 0; i < texts.length; i++) {
    setCachedEmbedding(texts[i], inputType, embeddings[i], tokensPerText[i])
  }
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
 * Clear the cache (for testing).
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear()
  cacheStats = { hits: 0, misses: 0 }
}
```

**Step 2: Create cache barrel export**

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
  setCachedEmbeddings,
  getEmbeddingCacheStats,
  clearEmbeddingCache,
  getCacheKey,
  type CachedEmbedding,
  type EmbeddingCacheStats,
} from "./embedding-cache"
```

**Step 3: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/cache/
git commit -m "feat: add embedding cache layer

- LRU cache with 1-hour TTL
- Content hash based deduplication
- Cache statistics for monitoring

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 6: Create Claude Response Cache

**Files:**
- Create: `src/lib/cache/response-cache.ts`
- Modify: `src/lib/cache/index.ts`

**Step 1: Create response cache**

```typescript
// src/lib/cache/response-cache.ts
/**
 * @fileoverview Claude Response Cache
 *
 * LRU cache for deterministic Claude responses (temperature=0).
 * Caches structured output by prompt hash.
 *
 * @module lib/cache/response-cache
 */

import { LRUCache } from "lru-cache"
import { createHash } from "crypto"

export interface CachedResponse<T = unknown> {
  response: T
  inputTokens: number
  outputTokens: number
  cachedAt: number
}

export interface ResponseCacheStats {
  hits: number
  misses: number
  size: number
  hitRate: number
}

/**
 * LRU cache for Claude responses with 30-minute TTL.
 * Max 1,000 entries.
 */
const responseCache = new LRUCache<string, CachedResponse>({
  max: 1_000,
  ttl: 1000 * 60 * 30, // 30 minutes
})

let cacheStats = { hits: 0, misses: 0 }

/**
 * Generate cache key from prompt content.
 */
export function getResponseCacheKey(
  systemPrompt: string,
  userPrompt: string,
  schemaName: string
): string {
  const content = `${systemPrompt}|${userPrompt}|${schemaName}`
  const hash = createHash("sha256").update(content).digest("hex").substring(0, 16)
  return `resp:${hash}`
}

/**
 * Get cached response.
 */
export function getCachedResponse<T>(
  systemPrompt: string,
  userPrompt: string,
  schemaName: string
): CachedResponse<T> | null {
  const key = getResponseCacheKey(systemPrompt, userPrompt, schemaName)
  const cached = responseCache.get(key) as CachedResponse<T> | undefined

  if (cached) {
    cacheStats.hits++
    return cached
  }

  cacheStats.misses++
  return null
}

/**
 * Store response in cache.
 */
export function setCachedResponse<T>(
  systemPrompt: string,
  userPrompt: string,
  schemaName: string,
  response: T,
  inputTokens: number,
  outputTokens: number
): void {
  const key = getResponseCacheKey(systemPrompt, userPrompt, schemaName)
  responseCache.set(key, {
    response,
    inputTokens,
    outputTokens,
    cachedAt: Date.now(),
  })
}

/**
 * Get cache statistics.
 */
export function getResponseCacheStats(): ResponseCacheStats {
  const total = cacheStats.hits + cacheStats.misses
  return {
    ...cacheStats,
    size: responseCache.size,
    hitRate: total > 0 ? cacheStats.hits / total : 0,
  }
}

/**
 * Clear the cache (for testing).
 */
export function clearResponseCache(): void {
  responseCache.clear()
  cacheStats = { hits: 0, misses: 0 }
}
```

**Step 2: Update cache barrel export**

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
  setCachedEmbeddings,
  getEmbeddingCacheStats,
  clearEmbeddingCache,
  getCacheKey,
  type CachedEmbedding,
  type EmbeddingCacheStats,
} from "./embedding-cache"

export {
  getCachedResponse,
  setCachedResponse,
  getResponseCacheStats,
  clearResponseCache,
  getResponseCacheKey,
  type CachedResponse,
  type ResponseCacheStats,
} from "./response-cache"
```

**Step 3: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/cache/
git commit -m "feat: add Claude response cache

- LRU cache with 30-minute TTL for deterministic prompts
- Prompt hash based deduplication
- Separate from embedding cache

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 7: Create Vector Search Tool

**Files:**
- Create: `src/agents/tools/vector-search.ts`
- Create: `src/agents/tools/index.ts`

**Step 1: Create vector search with caching**

```typescript
// src/agents/tools/vector-search.ts
/**
 * @fileoverview Vector Search Tool
 *
 * Performs similarity search against the shared reference database
 * with result caching for repeated queries.
 *
 * @module agents/tools/vector-search
 */

import { LRUCache } from "lru-cache"
import { createHash } from "crypto"
import { db } from "@/db/client"
import { referenceEmbeddings, referenceDocuments } from "@/db/schema/reference"
import { cosineDistance, sql, eq, and, lt, desc } from "drizzle-orm"
import { getVoyageAIClient } from "@/lib/embeddings"
import { getCachedEmbedding, setCachedEmbedding } from "@/lib/cache"
import type { CuadCategory, ReferenceClause } from "../types"

export interface VectorSearchOptions {
  limit?: number
  similarityThreshold?: number
  category?: CuadCategory
  granularity?: "clause" | "span" | "section" | "template"
  source?: "cuad" | "contract_nli" | "bonterms" | "commonaccord"
}

const DEFAULT_OPTIONS = {
  limit: 5,
  similarityThreshold: 0.5,
}

/**
 * Vector search result cache (5-minute TTL).
 */
const searchCache = new LRUCache<string, ReferenceClause[]>({
  max: 500,
  ttl: 1000 * 60 * 5, // 5 minutes
})

function getSearchCacheKey(queryText: string, options: VectorSearchOptions): string {
  const normalized = queryText.trim().toLowerCase().substring(0, 100)
  const optStr = JSON.stringify(options)
  const hash = createHash("sha256").update(`${normalized}|${optStr}`).digest("hex").substring(0, 16)
  return `search:${hash}`
}

/**
 * Find similar reference clauses with caching.
 */
export async function findSimilarReferenceClauses(
  queryText: string,
  options: VectorSearchOptions = {}
): Promise<ReferenceClause[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Check search cache first
  const cacheKey = getSearchCacheKey(queryText, opts)
  const cached = searchCache.get(cacheKey)
  if (cached) {
    return cached
  }

  // Check embedding cache
  let embedding: number[]
  const cachedEmb = getCachedEmbedding(queryText, "query")

  if (cachedEmb) {
    embedding = cachedEmb.embedding
  } else {
    const voyage = getVoyageAIClient()
    const result = await voyage.embed(queryText, "query")
    embedding = result.embedding
    setCachedEmbedding(queryText, "query", embedding, result.tokens)
  }

  // Build query conditions
  const conditions = [
    lt(cosineDistance(referenceEmbeddings.embedding, embedding), 1 - opts.similarityThreshold),
  ]

  if (opts.category) {
    conditions.push(eq(referenceEmbeddings.category, opts.category))
  }

  if (opts.granularity) {
    conditions.push(eq(referenceEmbeddings.granularity, opts.granularity))
  }

  // Execute similarity search
  const results = await db
    .select({
      id: referenceEmbeddings.id,
      documentId: referenceEmbeddings.documentId,
      content: referenceEmbeddings.content,
      category: referenceEmbeddings.category,
      granularity: referenceEmbeddings.granularity,
      sectionPath: referenceEmbeddings.sectionPath,
      hypothesisId: referenceEmbeddings.hypothesisId,
      nliLabel: referenceEmbeddings.nliLabel,
      metadata: referenceEmbeddings.metadata,
      similarity: sql<number>`1 - ${cosineDistance(referenceEmbeddings.embedding, embedding)}`,
      documentTitle: referenceDocuments.title,
      documentSource: referenceDocuments.source,
    })
    .from(referenceEmbeddings)
    .innerJoin(referenceDocuments, eq(referenceEmbeddings.documentId, referenceDocuments.id))
    .where(and(...conditions))
    .orderBy(desc(sql`1 - ${cosineDistance(referenceEmbeddings.embedding, embedding)}`))
    .limit(opts.limit)

  let filteredResults = results
  if (opts.source) {
    filteredResults = results.filter((r) => r.documentSource === opts.source)
  }

  const mappedResults: ReferenceClause[] = filteredResults.map((r) => ({
    id: r.id,
    documentId: r.documentId,
    documentTitle: r.documentTitle,
    source: r.documentSource as ReferenceClause["source"],
    content: r.content,
    category: r.category as CuadCategory | null,
    granularity: r.granularity as ReferenceClause["granularity"],
    sectionPath: r.sectionPath ?? [],
    hypothesisId: r.hypothesisId ?? undefined,
    nliLabel: r.nliLabel as ReferenceClause["nliLabel"],
    similarity: r.similarity,
    metadata: r.metadata as Record<string, unknown>,
  }))

  // Cache results
  searchCache.set(cacheKey, mappedResults)

  return mappedResults
}

/**
 * Find ContractNLI evidence spans.
 */
export async function findContractNLIEvidence(
  queryText: string,
  hypothesisId: number,
  options: Omit<VectorSearchOptions, "category" | "granularity" | "source"> = {}
): Promise<ReferenceClause[]> {
  const results = await findSimilarReferenceClauses(queryText, {
    ...options,
    granularity: "span",
    source: "contract_nli",
  })
  return results.filter((r) => r.hypothesisId === hypothesisId)
}

/**
 * Find template sections.
 */
export async function findTemplateSections(
  queryText: string,
  options: Omit<VectorSearchOptions, "granularity"> = {}
): Promise<ReferenceClause[]> {
  return findSimilarReferenceClauses(queryText, {
    ...options,
    granularity: "template",
  })
}

/**
 * Clear search cache (for testing).
 */
export function clearVectorSearchCache(): void {
  searchCache.clear()
}
```

**Step 2: Create tools barrel export**

```typescript
// src/agents/tools/index.ts
/**
 * @fileoverview Agent Tools Barrel Export
 *
 * @module agents/tools
 */

export {
  findSimilarReferenceClauses,
  findContractNLIEvidence,
  findTemplateSections,
  clearVectorSearchCache,
  type VectorSearchOptions,
} from "./vector-search"
```

**Step 3: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/agents/tools/
git commit -m "feat(agents): add vector search tool with caching

- LRU cache for search results (5-min TTL)
- Embedding cache integration
- findSimilarReferenceClauses, findContractNLIEvidence, findTemplateSections

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 8: Create Progress Event Types

**Files:**
- Create: `src/inngest/events/analysis.ts`
- Modify: `src/inngest/events/index.ts`

**Step 1: Create analysis event types**

```typescript
// src/inngest/events/analysis.ts
/**
 * @fileoverview Analysis Pipeline Event Types
 *
 * Inngest events for the NDA analysis pipeline with progress tracking.
 *
 * @module inngest/events/analysis
 */

export type AnalysisStage =
  | "queued"
  | "parsing"
  | "classifying"
  | "scoring"
  | "analyzing_gaps"
  | "persisting"
  | "completed"
  | "failed"

export interface AnalysisRequestedEvent {
  name: "nda/analysis.requested"
  data: {
    documentId: string
    tenantId: string
    userId?: string
  }
}

export interface AnalysisProgressEvent {
  name: "nda/analysis.progress"
  data: {
    documentId: string
    analysisId: string
    tenantId: string
    stage: AnalysisStage
    progress: number // 0-100
    message: string
    metadata?: {
      chunksProcessed?: number
      totalChunks?: number
      clausesClassified?: number
      tokensUsed?: number
    }
  }
}

export interface AnalysisCompletedEvent {
  name: "nda/analysis.completed"
  data: {
    documentId: string
    analysisId: string
    tenantId: string
    overallRiskScore: number
    overallRiskLevel: string
    clauseCount: number
    gapScore: number
    tokensUsed: number
    processingTimeMs: number
  }
}

export interface AnalysisFailedEvent {
  name: "nda/analysis.failed"
  data: {
    documentId: string
    analysisId: string
    tenantId: string
    error: string
    stage: AnalysisStage
    processingTimeMs: number
  }
}

export type AnalysisEvent =
  | AnalysisRequestedEvent
  | AnalysisProgressEvent
  | AnalysisCompletedEvent
  | AnalysisFailedEvent
```

**Step 2: Update events barrel export**

```typescript
// src/inngest/events/index.ts
/**
 * @fileoverview Inngest Events Barrel Export
 *
 * @module inngest/events
 */

export * from "./analysis"
```

**Step 3: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/inngest/events/
git commit -m "feat(inngest): add analysis progress event types

- AnalysisStage enum for pipeline stages
- Progress, completed, failed events
- Metadata for real-time UI updates

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: Agent Prompts

### Task 9a: Create Classifier Prompts

**Files:**
- Create: `src/agents/prompts/classifier.ts`

**Step 1: Create classifier prompts**

```typescript
// src/agents/prompts/classifier.ts
/**
 * @fileoverview Classifier Agent Prompts
 *
 * @module agents/prompts/classifier
 */

import { CUAD_CATEGORIES, type ReferenceClause } from "../types"

export const CLASSIFIER_SYSTEM_PROMPT = `You are a legal document classifier specializing in NDA analysis.

Classify contract clauses into the CUAD (Contract Understanding Atticus Dataset) taxonomy.

## CUAD Categories (41 total)
${CUAD_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## Guidelines

1. **Primary Category**: Assign the single best-matching category. Use "Unknown" only if not a contract clause.
2. **Secondary Categories**: Include if clause covers multiple topics.
3. **Confidence Score**: 0.0-1.0 (0.9+ = clear match, 0.7-0.9 = strong, 0.5-0.7 = moderate)

Respond with structured JSON.`

export function createClassifierPrompt(
  chunkText: string,
  references: ReferenceClause[]
): string {
  const refSection = references.length > 0
    ? `## Reference Examples\n${references.map((r, i) =>
        `### Example ${i + 1} (${r.category}, ${(r.similarity * 100).toFixed(1)}%)\n"${r.content.substring(0, 300)}..."`
      ).join("\n\n")}`
    : "No reference examples available."

  return `## Clause to Classify

"${chunkText}"

${refSection}

Classify this clause into the CUAD taxonomy.`
}
```

**Step 2: Commit**

```bash
git add src/agents/prompts/classifier.ts
git commit -m "feat(agents): add classifier prompts

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 9b: Create Risk Scorer Prompts

**Files:**
- Create: `src/agents/prompts/risk-scorer.ts`

**Step 1: Create risk scorer prompts**

```typescript
// src/agents/prompts/risk-scorer.ts
/**
 * @fileoverview Risk Scorer Agent Prompts
 *
 * PRD-aligned risk levels: standard/cautious/aggressive/unknown
 *
 * @module agents/prompts/risk-scorer
 */

import type { ClassifiedClause, ReferenceClause, RiskLevel } from "../types"

export const RISK_LEVELS: Record<RiskLevel, string> = {
  standard: "Typical and balanced between parties",
  cautious: "Leans protective, worth noting but not alarming",
  aggressive: "Significantly favors one party, potential red flag",
  unknown: "Cannot confidently assess",
}

export const RISK_SCORER_SYSTEM_PROMPT = `You are a legal risk analyst specializing in NDA review.

## Risk Levels (PRD-aligned)
- **standard**: Typical, balanced (score 0-25)
- **cautious**: Slightly one-sided (score 26-50)
- **aggressive**: Significantly one-sided (score 51-100)
- **unknown**: Cannot assess

## Guidelines
1. Ground assessment in reference clause comparisons
2. Cite specific phrases supporting your assessment
3. Note differences from typical clauses

Respond with structured JSON.`

export function createRiskScorerPrompt(
  clause: ClassifiedClause,
  references: ReferenceClause[]
): string {
  const refSection = references.length > 0
    ? `## Reference Clauses (${clause.category})\n${references.map((r, i) =>
        `### Reference ${i + 1} (${(r.similarity * 100).toFixed(1)}%)\n"${r.content.substring(0, 400)}..."`
      ).join("\n\n")}`
    : "No reference clauses available."

  return `## Clause to Assess

**Category**: ${clause.category}
**Confidence**: ${(clause.confidence * 100).toFixed(1)}%

"${clause.clauseText}"

${refSection}

Assess the risk level compared to standard ${clause.category} clauses.`
}
```

**Step 2: Commit**

```bash
git add src/agents/prompts/risk-scorer.ts
git commit -m "feat(agents): add risk scorer prompts with PRD-aligned levels

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 9c: Create Gap Analyst Prompts

**Files:**
- Create: `src/agents/prompts/gap-analyst.ts`

**Step 1: Create gap analyst prompts with ContractNLI**

```typescript
// src/agents/prompts/gap-analyst.ts
/**
 * @fileoverview Gap Analyst Agent Prompts
 *
 * Integrates ContractNLI 17 hypotheses for comprehensive coverage.
 *
 * @module agents/prompts/gap-analyst
 */

import { CUAD_CATEGORIES, CONTRACT_NLI_CATEGORIES, type CuadCategory, type ContractNLICategory } from "../types"

export const CRITICAL_NDA_CATEGORIES: CuadCategory[] = [
  "Parties", "Agreement Date", "Governing Law", "Expiration Date",
]

export const IMPORTANT_NDA_CATEGORIES: CuadCategory[] = [
  "Non-Compete", "No-Solicit Of Employees", "No-Solicit Of Customers",
  "Anti-Assignment", "Termination For Convenience", "Cap On Liability", "Audit Rights",
]

export const CONTRACT_NLI_HYPOTHESES: Array<{
  id: number
  category: ContractNLICategory
  hypothesis: string
  importance: "critical" | "important" | "optional"
}> = [
  { id: 1, category: "Purpose Limitation", hypothesis: "Confidential information is explicitly identified", importance: "critical" },
  { id: 2, category: "Purpose Limitation", hypothesis: "Standard definition of confidential information", importance: "important" },
  { id: 3, category: "Standard of Care", hypothesis: "Receiving party must protect confidential information", importance: "critical" },
  { id: 4, category: "Purpose Limitation", hypothesis: "Use restricted to stated purpose", importance: "critical" },
  { id: 5, category: "Third Party Disclosure", hypothesis: "Third party sharing prohibited", importance: "critical" },
  { id: 6, category: "Permitted Disclosure", hypothesis: "Sharing with employees under similar obligations permitted", importance: "important" },
  { id: 7, category: "Legal Compulsion", hypothesis: "Notice required if disclosure compelled by law", importance: "important" },
  { id: 8, category: "Return/Destruction", hypothesis: "Information must be returned/destroyed on request", importance: "important" },
  { id: 9, category: "Prior Knowledge Exception", hypothesis: "No non-competition obligation", importance: "optional" },
  { id: 10, category: "Prior Knowledge Exception", hypothesis: "No solicitation restriction", importance: "optional" },
  { id: 11, category: "Survival Period", hypothesis: "Obligations survive after termination", importance: "critical" },
  { id: 12, category: "Independent Development Exception", hypothesis: "Independent development permitted", importance: "important" },
  { id: 13, category: "Warranties", hypothesis: "No warranties about information", importance: "optional" },
  { id: 14, category: "Permitted Disclosure", hypothesis: "No obligation to disclose", importance: "optional" },
  { id: 15, category: "Liability Limitation", hypothesis: "Equitable relief available for breach", importance: "important" },
  { id: 16, category: "IP License", hypothesis: "No agency/partnership created", importance: "optional" },
  { id: 17, category: "Governing Law", hypothesis: "Governing law specified", importance: "critical" },
]

export const GAP_ANALYST_SYSTEM_PROMPT = `You are a legal gap analyst specializing in NDA completeness review.

Compare extracted categories against:
1. CUAD 41-category taxonomy
2. ContractNLI 17 hypotheses

## Importance Levels
- **critical**: Must be present (missing = serious gap)
- **important**: Strongly recommended (missing = potential risk)
- **optional**: Nice to have (missing = minor gap)

## Output
- Missing categories with importance
- Weak categories with issues
- ContractNLI hypothesis coverage
- Gap score (0=complete, 100=major gaps)

Respond with structured JSON.`

export function createGapAnalystPrompt(
  presentCategories: CuadCategory[],
  documentSummary: string
): string {
  const missingCritical = CRITICAL_NDA_CATEGORIES.filter(c => !presentCategories.includes(c))
  const missingImportant = IMPORTANT_NDA_CATEGORIES.filter(c => !presentCategories.includes(c))

  return `## Document Summary
${documentSummary}

## Categories Found (${presentCategories.length}/${CUAD_CATEGORIES.length})
${presentCategories.join(", ") || "None"}

## Critical Missing (${missingCritical.length})
${missingCritical.join(", ") || "None"}

## Important Missing (${missingImportant.length})
${missingImportant.join(", ") || "None"}

## ContractNLI Hypotheses to Check
${CONTRACT_NLI_HYPOTHESES.filter(h => h.importance === "critical")
  .map(h => `- [${h.category}] ${h.hypothesis}`).join("\n")}

Analyze for gaps and weak protections.`
}
```

**Step 2: Commit**

```bash
git add src/agents/prompts/gap-analyst.ts
git commit -m "feat(agents): add gap analyst prompts with ContractNLI

- 17 ContractNLI hypotheses
- Critical/important/optional importance levels

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 9d: Create Prompts Barrel Export

**Files:**
- Create: `src/agents/prompts/index.ts`

**Step 1: Create barrel export**

```typescript
// src/agents/prompts/index.ts
/**
 * @fileoverview Agent Prompts Barrel Export
 *
 * @module agents/prompts
 */

export { CLASSIFIER_SYSTEM_PROMPT, createClassifierPrompt } from "./classifier"
export { RISK_SCORER_SYSTEM_PROMPT, RISK_LEVELS, createRiskScorerPrompt } from "./risk-scorer"
export {
  GAP_ANALYST_SYSTEM_PROMPT,
  CRITICAL_NDA_CATEGORIES,
  IMPORTANT_NDA_CATEGORIES,
  CONTRACT_NLI_HYPOTHESES,
  createGapAnalystPrompt,
} from "./gap-analyst"
```

**Step 2: Commit**

```bash
git add src/agents/prompts/index.ts
git commit -m "feat(agents): add prompts barrel export

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: Agents (TDD Pattern)

### Task 10a: Parser Agent - Write Failing Test

**Files:**
- Create: `src/agents/parser.test.ts`

**Step 1: Write failing test**

```typescript
// src/agents/parser.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runParserAgent, type ParserInput } from "./parser"
import { SAMPLE_NDA_TEXT } from "./testing/fixtures"

// Mocks will be set up in Task 10b
vi.mock("@/db/client")
vi.mock("@/lib/embeddings")

describe("Parser Agent", () => {
  it("should parse a document and return chunks", async () => {
    const input: ParserInput = {
      documentId: "doc-123",
      tenantId: "tenant-456",
    }

    const result = await runParserAgent(input)

    expect(result.document.documentId).toBe("doc-123")
    expect(result.document.chunks.length).toBeGreaterThan(0)
    expect(result.tokenUsage.embeddingTokens).toBeGreaterThan(0)
  })

  it("should reject documents from wrong tenant", async () => {
    const input: ParserInput = {
      documentId: "doc-123",
      tenantId: "wrong-tenant",
    }

    await expect(runParserAgent(input)).rejects.toThrow("does not belong to tenant")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/agents/parser.test.ts`
Expected: FAIL (module not found)

**Step 3: Commit**

```bash
git add src/agents/parser.test.ts
git commit -m "test(agents): add failing Parser Agent test

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 10b: Parser Agent - Implement

**Files:**
- Create: `src/agents/parser.ts`

**Step 1: Implement Parser Agent**

```typescript
// src/agents/parser.ts
/**
 * @fileoverview Parser Agent
 *
 * First stage: Extract text, chunk, and generate embeddings.
 *
 * @module agents/parser
 */

import { db } from "@/db/client"
import { documents, documentChunks } from "@/db/schema/documents"
import { eq } from "drizzle-orm"
import { extractText, chunkText, getDocumentType, type TextChunk } from "@/lib/document-processing"
import { getVoyageAIClient, VOYAGE_CONFIG } from "@/lib/embeddings"
import { getCachedEmbeddings, setCachedEmbeddings } from "@/lib/cache"
import type { ParsedDocument } from "./types"

export interface ParserInput {
  documentId: string
  tenantId: string
}

export interface ParserOutput {
  document: ParsedDocument
  tokenUsage: { embeddingTokens: number }
}

export async function runParserAgent(input: ParserInput): Promise<ParserOutput> {
  const { documentId, tenantId } = input

  // Fetch document
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)

  if (!doc) throw new Error(`Document not found: ${documentId}`)
  if (doc.tenantId !== tenantId) {
    throw new Error(`Document ${documentId} does not belong to tenant ${tenantId}`)
  }

  // Update status
  await db.update(documents).set({ status: "processing" }).where(eq(documents.id, documentId))

  // Extract text
  const docType = getDocumentType(doc.fileType)
  if (!docType) throw new Error(`Unsupported file type: ${doc.fileType}`)

  let rawText: string
  let pageCount: number | undefined

  if (doc.rawText) {
    rawText = doc.rawText
  } else if (doc.fileUrl) {
    const response = await fetch(doc.fileUrl)
    if (!response.ok) throw new Error(`Failed to download: ${response.status}`)

    const buffer = await response.arrayBuffer()
    const extracted = await extractText(buffer, docType)
    rawText = extracted.text
    pageCount = extracted.pageCount

    await db.update(documents).set({
      rawText,
      metadata: { ...((doc.metadata as object) || {}), pageCount },
    }).where(eq(documents.id, documentId))
  } else {
    throw new Error(`Document ${documentId} has no file URL or raw text`)
  }

  // Chunk text
  const textChunks = chunkText(rawText, { maxTokens: 512, overlap: 50 })

  // Generate embeddings with caching
  const voyage = getVoyageAIClient()
  const batchSize = VOYAGE_CONFIG.batchLimit
  let totalEmbeddingTokens = 0
  const chunksWithEmbeddings: Array<TextChunk & { embedding: number[] }> = []

  for (let i = 0; i < textChunks.length; i += batchSize) {
    const batch = textChunks.slice(i, i + batchSize)
    const texts = batch.map(c => c.content)

    // Check cache
    const cached = getCachedEmbeddings(texts, "document")
    const uncachedIndices: number[] = []
    const uncachedTexts: string[] = []

    for (let j = 0; j < texts.length; j++) {
      if (!cached.has(j)) {
        uncachedIndices.push(j)
        uncachedTexts.push(texts[j])
      }
    }

    // Fetch uncached embeddings
    let newEmbeddings: number[][] = []
    let newTokens = 0

    if (uncachedTexts.length > 0) {
      const result = await voyage.embedBatch(uncachedTexts, "document")
      newEmbeddings = result.embeddings
      newTokens = result.totalTokens
      totalEmbeddingTokens += newTokens

      // Cache new embeddings
      const tokensPerText = uncachedTexts.map(() => Math.floor(newTokens / uncachedTexts.length))
      setCachedEmbeddings(uncachedTexts, "document", newEmbeddings, tokensPerText)
    }

    // Combine cached and new embeddings
    let newEmbIdx = 0
    for (let j = 0; j < batch.length; j++) {
      const cachedEmb = cached.get(j)
      chunksWithEmbeddings.push({
        ...batch[j],
        embedding: cachedEmb ? cachedEmb.embedding : newEmbeddings[newEmbIdx++],
      })
    }
  }

  // Store chunks
  const chunkRecords = chunksWithEmbeddings.map(chunk => ({
    tenantId,
    documentId,
    chunkIndex: chunk.index,
    content: chunk.content,
    sectionPath: chunk.sectionPath,
    embedding: chunk.embedding,
    tokenCount: chunk.tokenCount,
    metadata: { startPosition: chunk.startPosition, endPosition: chunk.endPosition },
  }))

  await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId))
  if (chunkRecords.length > 0) {
    await db.insert(documentChunks).values(chunkRecords)
  }

  // Fetch chunk IDs
  const insertedChunks = await db
    .select({ id: documentChunks.id, chunkIndex: documentChunks.chunkIndex })
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))

  const chunkIdMap = new Map(insertedChunks.map(c => [c.chunkIndex, c.id]))

  const parsedDocument: ParsedDocument = {
    documentId,
    title: doc.title,
    rawText,
    chunks: chunksWithEmbeddings.map(c => ({
      id: chunkIdMap.get(c.index) ?? "",
      index: c.index,
      content: c.content,
      sectionPath: c.sectionPath,
      tokenCount: c.tokenCount,
      embedding: c.embedding,
    })),
    sections: [],
    metadata: { tokenCount: totalEmbeddingTokens, chunkCount: chunksWithEmbeddings.length, pageCount },
  }

  return { document: parsedDocument, tokenUsage: { embeddingTokens: totalEmbeddingTokens } }
}
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agents/parser.ts
git commit -m "feat(agents): implement Parser Agent with caching

- Embedding cache integration
- Batch processing

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 10c: Parser Agent - Verify and Commit

**Step 1: Update test mocks**

Update `src/agents/parser.test.ts` with proper mocks (add mock implementations).

**Step 2: Run tests**

Run: `pnpm test src/agents/parser.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/agents/parser.test.ts
git commit -m "test(agents): Parser Agent tests passing

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Tasks 11a-c, 12a-c, 13a-c: Classifier, Risk Scorer, Gap Analyst Agents

Follow the same TDD pattern:
- **a**: Write failing test
- **b**: Implement agent with AI SDK 6, BudgetTracker, caching
- **c**: Verify tests pass and commit

(Detailed code similar to previous plan version, with caching and progress event additions)

---

## Phase 4: Pipeline Orchestration

### Task 14: Create Analysis Inngest Function with Progress & Partial Persistence

**Files:**
- Create: `src/inngest/functions/analyze-nda.ts`

**Step 1: Create the analysis function**

```typescript
// src/inngest/functions/analyze-nda.ts
/**
 * @fileoverview NDA Analysis Pipeline with Progress Tracking
 *
 * Features:
 * - Progress events at each stage
 * - Partial result persistence (resume on failure)
 * - Shared BudgetTracker
 * - Response caching
 *
 * @module inngest/functions/analyze-nda
 */

import { inngest } from "../client"
import { CONCURRENCY, getRateLimitDelay } from "../utils/concurrency"
import { db } from "@/db/client"
import { documents, analyses, clauseExtractions } from "@/db/schema"
import { eq } from "drizzle-orm"
import { BudgetTracker, DEFAULT_DOCUMENT_BUDGET } from "@/lib/ai/base-agent"
import { runParserAgent } from "@/agents/parser"
import { runClassifierAgent } from "@/agents/classifier"
import { runRiskScorerAgent } from "@/agents/risk-scorer"
import { runGapAnalystAgent, generateDocumentSummary } from "@/agents/gap-analyst"
import type { AnalysisStage } from "../events/analysis"

async function emitProgress(
  inngestSend: typeof inngest.send,
  data: {
    documentId: string
    analysisId: string
    tenantId: string
    stage: AnalysisStage
    progress: number
    message: string
    metadata?: Record<string, unknown>
  }
) {
  await inngestSend({
    name: "nda/analysis.progress",
    data,
  })
}

export const analyzeNda = inngest.createFunction(
  {
    id: "analyze-nda",
    concurrency: CONCURRENCY.analysis,
    retries: 5,
  },
  { event: "nda/analysis.requested" },
  async ({ event, step }) => {
    const { documentId, tenantId } = event.data
    const startTime = Date.now()
    const budgetTracker = new BudgetTracker(DEFAULT_DOCUMENT_BUDGET)

    // Create analysis record
    const analysisId = await step.run("create-analysis-record", async () => {
      const [analysis] = await db
        .insert(analyses)
        .values({ tenantId, documentId, status: "processing", inngestRunId: event.id })
        .returning({ id: analyses.id })
      return analysis.id
    })

    try {
      // Progress: Queued
      await step.run("emit-progress-queued", async () => {
        await emitProgress(inngest.send, {
          documentId, analysisId, tenantId,
          stage: "queued", progress: 0, message: "Analysis queued",
        })
      })

      // Step 1: Parse document
      await step.run("emit-progress-parsing", async () => {
        await emitProgress(inngest.send, {
          documentId, analysisId, tenantId,
          stage: "parsing", progress: 10, message: "Extracting text and chunking...",
        })
      })

      const parserResult = await step.run("parser-agent", () =>
        runParserAgent({ documentId, tenantId })
      )

      // Persist partial: parser complete
      await step.run("persist-parser-result", async () => {
        await db.update(analyses).set({
          metadata: { parserComplete: true, chunkCount: parserResult.document.chunks.length },
        }).where(eq(analyses.id, analysisId))
      })

      await step.sleep("rate-limit-1", getRateLimitDelay("claude"))

      // Step 2: Classify
      await step.run("emit-progress-classifying", async () => {
        await emitProgress(inngest.send, {
          documentId, analysisId, tenantId,
          stage: "classifying", progress: 30,
          message: `Classifying ${parserResult.document.chunks.length} chunks...`,
          metadata: { totalChunks: parserResult.document.chunks.length },
        })
      })

      const classifierResult = await step.run("classifier-agent", () =>
        runClassifierAgent({ parsedDocument: parserResult.document, budgetTracker })
      )

      // Persist partial: classifier complete
      await step.run("persist-classifier-result", async () => {
        await db.update(analyses).set({
          metadata: {
            parserComplete: true,
            classifierComplete: true,
            clauseCount: classifierResult.clauses.length,
          },
        }).where(eq(analyses.id, analysisId))
      })

      await step.sleep("rate-limit-2", getRateLimitDelay("claude"))

      // Step 3: Score risks
      await step.run("emit-progress-scoring", async () => {
        await emitProgress(inngest.send, {
          documentId, analysisId, tenantId,
          stage: "scoring", progress: 55,
          message: `Scoring ${classifierResult.clauses.length} clauses...`,
          metadata: { clausesClassified: classifierResult.clauses.length },
        })
      })

      const riskScorerResult = await step.run("risk-scorer-agent", () =>
        runRiskScorerAgent({ clauses: classifierResult.clauses, budgetTracker })
      )

      // Persist partial: risk scorer complete
      await step.run("persist-risk-result", async () => {
        await db.update(analyses).set({
          overallRiskScore: riskScorerResult.overallRiskScore,
          overallRiskLevel: riskScorerResult.overallRiskLevel,
          metadata: { parserComplete: true, classifierComplete: true, riskScorerComplete: true },
        }).where(eq(analyses.id, analysisId))
      })

      await step.sleep("rate-limit-3", getRateLimitDelay("claude"))

      // Step 4: Gap analysis
      await step.run("emit-progress-gaps", async () => {
        await emitProgress(inngest.send, {
          documentId, analysisId, tenantId,
          stage: "analyzing_gaps", progress: 75,
          message: "Analyzing gaps and generating recommendations...",
        })
      })

      const gapAnalystResult = await step.run("gap-analyst-agent", async () => {
        const summary = generateDocumentSummary(classifierResult.clauses, riskScorerResult.overallRiskLevel)
        return runGapAnalystAgent({
          clauses: classifierResult.clauses,
          assessments: riskScorerResult.assessments,
          documentSummary: summary,
          budgetTracker,
        })
      })

      // Step 5: Persist final results
      await step.run("emit-progress-persisting", async () => {
        await emitProgress(inngest.send, {
          documentId, analysisId, tenantId,
          stage: "persisting", progress: 90,
          message: "Saving results...",
        })
      })

      await step.run("persist-final-results", async () => {
        // Insert clause extractions
        const clauseRecords = riskScorerResult.assessments.map(a => ({
          tenantId, analysisId, documentId,
          chunkId: a.clause.chunkId,
          category: a.clause.category,
          secondaryCategories: a.clause.secondaryCategories,
          clauseText: a.clause.clauseText,
          confidence: a.clause.confidence,
          riskLevel: a.riskLevel,
          riskExplanation: a.explanation,
          evidence: a.evidence,
          metadata: {},
        }))

        if (clauseRecords.length > 0) {
          await db.insert(clauseExtractions).values(clauseRecords)
        }

        // Update analysis record
        await db.update(analyses).set({
          status: "completed",
          overallRiskScore: riskScorerResult.overallRiskScore,
          overallRiskLevel: riskScorerResult.overallRiskLevel,
          gapAnalysis: gapAnalystResult.gapAnalysis,
          hypothesisCoverage: gapAnalystResult.hypothesisCoverage,
          tokenUsage: {
            parser: parserResult.tokenUsage.embeddingTokens,
            classifier: classifierResult.tokenUsage.totalTokens,
            riskScorer: riskScorerResult.tokenUsage.totalTokens,
            gapAnalyst: gapAnalystResult.tokenUsage.totalTokens,
            total: budgetTracker.getTotalUsed(),
          },
          processingTimeMs: Date.now() - startTime,
          completedAt: new Date(),
        }).where(eq(analyses.id, analysisId))

        await db.update(documents).set({ status: "ready" }).where(eq(documents.id, documentId))
      })

      // Emit completion
      await step.run("emit-completed", async () => {
        await inngest.send({
          name: "nda/analysis.completed",
          data: {
            documentId, analysisId, tenantId,
            overallRiskScore: riskScorerResult.overallRiskScore,
            overallRiskLevel: riskScorerResult.overallRiskLevel,
            clauseCount: classifierResult.clauses.length,
            gapScore: gapAnalystResult.gapAnalysis.gapScore,
            tokensUsed: budgetTracker.getTotalUsed(),
            processingTimeMs: Date.now() - startTime,
          },
        })
      })

      return {
        success: true,
        analysisId,
        overallRiskScore: riskScorerResult.overallRiskScore,
        clauseCount: classifierResult.clauses.length,
        gapScore: gapAnalystResult.gapAnalysis.gapScore,
        tokensUsed: budgetTracker.getTotalUsed(),
        processingTimeMs: Date.now() - startTime,
      }
    } catch (error) {
      // Emit failure
      await step.run("handle-error", async () => {
        await db.update(analyses).set({
          status: "failed",
          processingTimeMs: Date.now() - startTime,
        }).where(eq(analyses.id, analysisId))

        await db.update(documents).set({
          status: "error",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        }).where(eq(documents.id, documentId))

        await inngest.send({
          name: "nda/analysis.failed",
          data: {
            documentId, analysisId, tenantId,
            error: error instanceof Error ? error.message : "Unknown error",
            stage: "failed" as AnalysisStage,
            processingTimeMs: Date.now() - startTime,
          },
        })
      })

      throw error
    }
  }
)
```

**Step 2: Update function registry**

**Step 3: Commit**

```bash
git add src/inngest/functions/
git commit -m "feat(inngest): implement analysis pipeline with progress & persistence

- Progress events at each stage (10%, 30%, 55%, 75%, 90%, 100%)
- Partial result persistence after each agent
- Shared BudgetTracker
- Completion and failure events

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 5: Verification

### Task 15: Run All Tests

Run: `pnpm test`
Expected: All tests pass

### Task 16: Run Type Check

Run: `pnpm tsc --noEmit`
Expected: No errors

### Task 17: Run Linter

Run: `pnpm lint`
Expected: No errors

### Task 18: Final Commit

```bash
git add -A
git commit -m "feat(inngest): complete analysis pipeline v2

Features:
- Parser → Classifier → Risk Scorer → Gap Analyst
- AI SDK 6 with structured output
- PRD-aligned risk levels (standard/cautious/aggressive)
- ContractNLI 17 hypotheses integration
- Embedding cache (LRU, 1-hour TTL)
- Claude response cache (LRU, 30-min TTL)
- Vector search cache (LRU, 5-min TTL)
- Progress events for real-time UI
- Partial result persistence for resume

Token budget: ~212K per document (~$1.10)
Processing time: ~60-90 seconds

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

**Total Tasks: 25** (expanded from 16)

| Phase | Tasks | Purpose |
|-------|-------|---------|
| 1: Infrastructure | 1-8 | Dependencies, caching, tools, events |
| 2: Prompts | 9a-d | Classifier, Risk Scorer, Gap Analyst |
| 3: Agents | 10-13 | TDD pattern (test → implement → verify) |
| 4: Orchestration | 14 | Inngest function with progress |
| 5: Verification | 15-18 | Tests, types, lint, commit |

**Key Improvements:**
- **3 Cache Layers**: Embedding (1hr), Response (30min), Search (5min)
- **Progress Events**: Real-time UI updates at 10%, 30%, 55%, 75%, 90%, 100%
- **Partial Persistence**: Resume capability if agent fails mid-pipeline
- **TDD Pattern**: Each agent has test → implement → verify steps
- **Fine Granularity**: Most tasks are 2-5 minutes

**Next Plan:** [Comparison & Generation Pipelines](./2026-02-01-inngest-comparison-generation.md)
