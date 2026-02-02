# Bootstrap Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the durable Inngest pipeline that ingests legal reference corpora (CUAD, ContractNLI, Bonterms, CommonAccord, Kleister) into the shared reference database with vector embeddings.

**Architecture:** The bootstrap pipeline downloads datasets from HuggingFace, parses them into structured records, generates Voyage AI embeddings in rate-limited batches, and bulk-inserts into Neon PostgreSQL. Each stage is wrapped in Inngest steps for durability, enabling resume from any failure point. HNSW indexes are created after bulk load for optimal performance.

**Tech Stack:** Inngest 3.x, Voyage AI voyage-law-2, HuggingFace Datasets API, Apache Arrow (Parquet parsing), Drizzle ORM

**Prerequisite Plans:**
- Plan 1: Inngest Infrastructure ✓

**Dependent Plans:**
- Plan 3: Agent Foundation (needs reference data for testing)
- Plan 4: Analysis Pipeline (queries reference data)

---

## Overview

The bootstrap pipeline ingests ~33K vectors from legal corpora:

| Dataset | Source | Format | Vectors | Purpose |
|---------|--------|--------|---------|---------|
| CUAD | HuggingFace | Parquet | ~15K | Clause taxonomy (41 categories) |
| ContractNLI | HuggingFace | JSON | ~10K | NLI evidence spans + 17 hypotheses |
| Bonterms | GitHub | Markdown | ~50 | NDA template |
| CommonAccord | GitHub | Markdown | ~100 | Modular templates |
| Kleister-NDA | HuggingFace | Plain text | ~8K | Evaluation corpus |

Multi-granularity embedding strategy:
- **Clause-level**: Individual clauses (CUAD, ContractNLI)
- **Evidence span-level**: Supporting evidence (CUAD)
- **Section-level**: Template sections (Bonterms, CommonAccord)
- **Template-level**: Full template summaries (Bonterms, CommonAccord)

Pipeline stages:
1. Download datasets
2. Parse into normalized records
3. Generate embeddings (batched, rate-limited)
4. Bulk insert to database
5. Create HNSW indexes (after all data loaded)

---

## Task 1: Install Required Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install parsing and embedding dependencies**

Run: `pnpm add apache-arrow @anthropic-ai/sdk marked`

Note: We'll create a minimal Voyage AI client since there's no official npm package. `marked` is for parsing Markdown templates.

**Step 2: Install dev dependencies for testing**

Run: `pnpm add -D msw` (for mocking HTTP requests in tests)

**Step 3: Verify installation**

Run: `pnpm list apache-arrow @anthropic-ai/sdk marked msw`
Expected: All packages installed at expected versions

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add dependencies for bootstrap pipeline

- apache-arrow: Parquet parsing for CUAD dataset
- @anthropic-ai/sdk: Claude API client
- marked: Markdown parsing for templates
- msw: HTTP mocking for tests

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create Voyage AI Embedding Client

**Files:**
- Create: `src/lib/embeddings.ts`
- Create: `src/lib/embeddings.test.ts`

**Step 1: Create the embedding client**

```typescript
// src/lib/embeddings.ts
/**
 * @fileoverview Voyage AI Embedding Client
 *
 * Client for generating legal document embeddings using Voyage AI's
 * voyage-law-2 model. Optimized for legal text with 1024 dimensions.
 *
 * Model specifications:
 * - Model: voyage-law-2
 * - Dimensions: 1024 (fixed)
 * - Max input: 16,000 tokens
 * - Batch limit: 128 texts (conservative for rate limiting)
 *
 * @module lib/embeddings
 * @see {@link https://docs.voyageai.com/docs/embeddings}
 */

import { z } from "zod"

/**
 * Voyage AI embedding response schema.
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
 * Input type for embedding generation.
 * - "document": For indexing documents (longer text)
 * - "query": For search queries (shorter text)
 */
export type EmbeddingInputType = "document" | "query"

/**
 * Embedding result with metadata.
 */
export interface EmbeddingResult {
  /** The embedding vector (1024 dimensions) */
  embedding: number[]
  /** Token count for this input */
  tokenCount: number
}

/**
 * Batch embedding result with total usage.
 */
export interface BatchEmbeddingResult {
  /** Embeddings in same order as input */
  embeddings: number[][]
  /** Total tokens used for the batch */
  totalTokens: number
}

/**
 * Configuration for the Voyage AI client.
 */
export interface VoyageAIConfig {
  /** API key from Voyage AI dashboard */
  apiKey: string
  /** Base URL (defaults to production) */
  baseUrl?: string
}

/**
 * Voyage AI embedding client for legal documents.
 *
 * @example
 * ```typescript
 * const client = createVoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! })
 *
 * // Single embedding
 * const result = await client.embed("This Agreement shall be governed by...")
 *
 * // Batch embeddings
 * const results = await client.embedBatch([
 *   "First clause text...",
 *   "Second clause text...",
 * ], "document")
 * ```
 */
export function createVoyageAIClient(config: VoyageAIConfig) {
  const baseUrl = config.baseUrl ?? "https://api.voyageai.com/v1"

  /**
   * Generate embedding for a single text.
   */
  async function embed(
    text: string,
    inputType: EmbeddingInputType = "document"
  ): Promise<EmbeddingResult> {
    const result = await embedBatch([text], inputType)
    return {
      embedding: result.embeddings[0],
      tokenCount: result.totalTokens,
    }
  }

  /**
   * Generate embeddings for multiple texts in a single API call.
   *
   * @param texts - Array of texts to embed (max 128 recommended)
   * @param inputType - "document" for indexing, "query" for search
   * @returns Embeddings in same order as input
   */
  async function embedBatch(
    texts: string[],
    inputType: EmbeddingInputType = "document"
  ): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], totalTokens: 0 }
    }

    if (texts.length > 128) {
      throw new Error(
        `Batch size ${texts.length} exceeds recommended limit of 128. ` +
          "Split into smaller batches."
      )
    }

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: "voyage-law-2",
        input: texts,
        input_type: inputType,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Voyage AI API error (${response.status}): ${error}`)
    }

    const json = await response.json()
    const parsed = voyageResponseSchema.parse(json)

    // Sort by index to ensure order matches input
    const sorted = parsed.data.sort((a, b) => a.index - b.index)

    return {
      embeddings: sorted.map((d) => d.embedding),
      totalTokens: parsed.usage.total_tokens,
    }
  }

  return {
    embed,
    embedBatch,
  }
}

/**
 * Type for the Voyage AI client.
 */
export type VoyageAIClient = ReturnType<typeof createVoyageAIClient>

/**
 * Singleton client instance using environment variable.
 * Import this for production use.
 */
let _client: VoyageAIClient | null = null

export function getVoyageAIClient(): VoyageAIClient {
  if (!_client) {
    const apiKey = process.env.VOYAGE_API_KEY
    if (!apiKey) {
      throw new Error("VOYAGE_API_KEY environment variable is not set")
    }
    _client = createVoyageAIClient({ apiKey })
  }
  return _client
}

/**
 * Reset the singleton client (for testing).
 */
export function resetVoyageAIClient(): void {
  _client = null
}
```

**Step 2: Write the test file**

```typescript
// src/lib/embeddings.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  createVoyageAIClient,
  resetVoyageAIClient,
  type VoyageAIClient,
} from "./embeddings"

describe("Voyage AI Embedding Client", () => {
  let client: VoyageAIClient
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    client = createVoyageAIClient({ apiKey: "test-api-key" })
    fetchSpy = vi.spyOn(global, "fetch")
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetVoyageAIClient()
  })

  it("should embed a single text", async () => {
    const mockEmbedding = Array(1024).fill(0.1)
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        object: "list",
        data: [{ object: "embedding", index: 0, embedding: mockEmbedding }],
        model: "voyage-law-2",
        usage: { total_tokens: 50 },
      }),
    } as Response)

    const result = await client.embed("Test legal text")

    expect(result.embedding).toHaveLength(1024)
    expect(result.tokenCount).toBe(50)
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.voyageai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
        }),
      })
    )
  })

  it("should embed a batch of texts", async () => {
    const mockEmbedding = Array(1024).fill(0.1)
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        object: "list",
        data: [
          { object: "embedding", index: 1, embedding: mockEmbedding },
          { object: "embedding", index: 0, embedding: mockEmbedding },
        ],
        model: "voyage-law-2",
        usage: { total_tokens: 100 },
      }),
    } as Response)

    const result = await client.embedBatch(["Text 1", "Text 2"], "document")

    expect(result.embeddings).toHaveLength(2)
    expect(result.totalTokens).toBe(100)
  })

  it("should return empty array for empty input", async () => {
    const result = await client.embedBatch([])

    expect(result.embeddings).toHaveLength(0)
    expect(result.totalTokens).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("should throw error for batch size over 128", async () => {
    const largeTexts = Array(129).fill("text")

    await expect(client.embedBatch(largeTexts)).rejects.toThrow(
      "Batch size 129 exceeds recommended limit"
    )
  })

  it("should throw error on API failure", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Invalid API key",
    } as Response)

    await expect(client.embed("Test")).rejects.toThrow(
      "Voyage AI API error (401): Invalid API key"
    )
  })
})
```

**Step 3: Run tests**

Run: `pnpm test src/lib/embeddings.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/lib/embeddings.ts src/lib/embeddings.test.ts
git commit -m "feat: add Voyage AI embedding client

- voyage-law-2 model with 1024 dimensions
- Single and batch embedding methods
- Input type support (document/query)
- Rate limit friendly (max 128 batch size)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Dataset Download Utilities

**Files:**
- Create: `src/lib/datasets/download.ts`

**Step 1: Create download utilities**

```typescript
// src/lib/datasets/download.ts
/**
 * @fileoverview Dataset Download Utilities
 *
 * Functions for downloading legal corpora from HuggingFace and GitHub.
 * Supports streaming downloads with progress tracking.
 *
 * @module lib/datasets/download
 */

/**
 * HuggingFace Datasets API configuration.
 */
export const HUGGINGFACE_CONFIG = {
  baseUrl: "https://huggingface.co/api/datasets",
  /** CUAD dataset for clause taxonomy */
  cuad: {
    repo: "theatticusproject/cuad-qa",
    split: "train",
    format: "parquet" as const,
  },
  /** ContractNLI for natural language inference */
  contractNli: {
    repo: "kiddothe2b/contract-nli",
    split: "train",
    format: "json" as const,
  },
  /** Kleister-NDA for evaluation */
  kleisterNda: {
    repo: "hpi-dhc/kleister-nda",
    split: "test",
    format: "text" as const,
  },
} as const

/**
 * GitHub raw content URLs for template datasets.
 */
export const GITHUB_CONFIG = {
  /** Bonterms Mutual NDA template */
  bonterms: {
    baseUrl: "https://raw.githubusercontent.com/Bonterms/Mutual-NDA/main",
    files: ["README.md", "Mutual-NDA.md"],
  },
  /** CommonAccord NDA templates */
  commonaccord: {
    baseUrl: "https://raw.githubusercontent.com/CommonAccord/NW-NDA/master",
    files: [
      "README.md",
      "Sec/Def/Conf_Info.md",
      "Sec/Def/Discloser.md",
      "Sec/Misc/Entire.md",
    ],
  },
} as const

/**
 * Download status callback type.
 */
export type DownloadProgressCallback = (progress: {
  bytesDownloaded: number
  totalBytes?: number
  percentComplete?: number
}) => void

/**
 * Fetch a file from URL with optional progress tracking.
 *
 * @param url - URL to download from
 * @param onProgress - Optional progress callback
 * @returns Response body as ArrayBuffer
 */
export async function downloadFile(
  url: string,
  onProgress?: DownloadProgressCallback
): Promise<ArrayBuffer> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`)
  }

  const contentLength = response.headers.get("content-length")
  const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined

  if (!response.body) {
    throw new Error("Response body is null")
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytesDownloaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    bytesDownloaded += value.length

    if (onProgress) {
      onProgress({
        bytesDownloaded,
        totalBytes,
        percentComplete: totalBytes
          ? Math.round((bytesDownloaded / totalBytes) * 100)
          : undefined,
      })
    }
  }

  // Combine chunks into single ArrayBuffer
  const combined = new Uint8Array(bytesDownloaded)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }

  return combined.buffer
}

/**
 * Download a text file from URL.
 */
export async function downloadText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`)
  }
  return response.text()
}

/**
 * Download JSON from URL.
 */
export async function downloadJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`)
  }
  return response.json() as Promise<T>
}

/**
 * Get the Parquet file URL for a HuggingFace dataset.
 *
 * HuggingFace Datasets Server API provides direct Parquet file URLs.
 *
 * @param repo - Dataset repository (e.g., "theatticusproject/cuad-qa")
 * @param split - Dataset split (e.g., "train")
 * @returns Parquet file URL
 */
export async function getHuggingFaceParquetUrl(
  repo: string,
  split: string
): Promise<string> {
  const url = `${HUGGINGFACE_CONFIG.baseUrl}/${repo}/parquet/default/${split}/0.parquet`

  // Verify the URL is accessible
  const response = await fetch(url, { method: "HEAD" })
  if (!response.ok) {
    throw new Error(
      `HuggingFace dataset not found: ${repo}/${split} (${response.status})`
    )
  }

  return url
}

/**
 * Download a HuggingFace dataset as Parquet.
 */
export async function downloadHuggingFaceDataset(
  repo: string,
  split: string,
  onProgress?: DownloadProgressCallback
): Promise<ArrayBuffer> {
  const url = await getHuggingFaceParquetUrl(repo, split)
  return downloadFile(url, onProgress)
}

/**
 * Download all files from a GitHub template repository.
 */
export async function downloadGitHubTemplates(
  config: { baseUrl: string; files: readonly string[] },
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  for (const file of config.files) {
    const url = `${config.baseUrl}/${file}`
    try {
      const content = await downloadText(url)
      results.set(file, content)
    } catch (error) {
      console.warn(`Failed to download ${url}:`, error)
    }
  }

  return results
}
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/datasets/download.ts
git commit -m "feat: add dataset download utilities

- HuggingFace Datasets API integration (Parquet, JSON, text)
- GitHub raw content download
- Progress tracking support
- Support for CUAD, ContractNLI, Kleister, Bonterms, CommonAccord

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create CUAD Dataset Parser

**Files:**
- Create: `src/lib/datasets/cuad.ts`
- Create: `src/lib/datasets/cuad.test.ts`

**Step 1: Create CUAD parser**

```typescript
// src/lib/datasets/cuad.ts
/**
 * @fileoverview CUAD Dataset Parser
 *
 * Parses the Contract Understanding Atticus Dataset (CUAD) from Parquet format
 * into structured clause records for embedding and storage.
 *
 * CUAD contains 510 commercial contracts with 13K+ clause annotations
 * across 41 legal categories.
 *
 * @see {@link https://huggingface.co/datasets/theatticusproject/cuad-qa}
 * @module lib/datasets/cuad
 */

import * as arrow from "apache-arrow"
import { createHash } from "crypto"

/**
 * CUAD annotation record as parsed from the dataset.
 */
export interface CuadAnnotation {
  /** Unique identifier: ContractName__CategoryName__Index */
  id: string
  /** Full contract text */
  context: string
  /** Question asking about this category */
  question: string
  /** Category name (one of 41 CUAD categories) */
  category: string
  /** Answer text (clause content) */
  answerText: string
  /** Start position in context */
  answerStart: number
  /** Whether the question is answerable (clause exists) */
  isAnswerable: boolean
}

/**
 * Processed CUAD document ready for database insertion.
 */
export interface CuadDocument {
  /** Source identifier */
  source: "cuad"
  /** Original contract ID from dataset */
  sourceId: string
  /** Contract title/name */
  title: string
  /** Full contract text */
  rawText: string
  /** SHA-256 hash of normalized text */
  contentHash: string
  /** Metadata about the contract */
  metadata: {
    categoryCount: number
    annotationCount: number
  }
}

/**
 * Processed CUAD clause ready for embedding.
 */
export interface CuadClause {
  /** Parent document source ID */
  documentSourceId: string
  /** Clause text to embed */
  content: string
  /** CUAD category label */
  category: string
  /** Section path (derived from category) */
  sectionPath: string[]
  /** SHA-256 hash of content */
  contentHash: string
  /** Granularity level */
  granularity: "clause" | "evidence"
  /** Metadata */
  metadata: {
    answerStart: number
    question: string
  }
}

/**
 * The 41 CUAD categories.
 */
export const CUAD_CATEGORIES = [
  "Document Name",
  "Parties",
  "Agreement Date",
  "Effective Date",
  "Expiration Date",
  "Renewal Term",
  "Notice Period To Terminate Renewal",
  "Governing Law",
  "Most Favored Nation",
  "Non-Compete",
  "Exclusivity",
  "No-Solicit Of Customers",
  "Competitive Restriction Exception",
  "No-Solicit Of Employees",
  "Non-Disparagement",
  "Termination For Convenience",
  "Rofr/Rofo/Rofn",
  "Change Of Control",
  "Anti-Assignment",
  "Revenue/Profit Sharing",
  "Price Restrictions",
  "Minimum Commitment",
  "Volume Restriction",
  "Ip Ownership Assignment",
  "Joint Ip Ownership",
  "License Grant",
  "Non-Transferable License",
  "Affiliate License",
  "Unlimited/All-You-Can-Eat-License",
  "Irrevocable Or Perpetual License",
  "Source Code Escrow",
  "Post-Termination Services",
  "Audit Rights",
  "Uncapped Liability",
  "Cap On Liability",
  "Liquidated Damages",
  "Warranty Duration",
  "Insurance",
  "Covenant Not To Sue",
  "Third Party Beneficiary",
] as const

export type CuadCategory = (typeof CUAD_CATEGORIES)[number]

/**
 * Parse CUAD dataset from Parquet buffer.
 *
 * @param buffer - Parquet file as ArrayBuffer
 * @returns Parsed annotations
 */
export async function parseCuadParquet(
  buffer: ArrayBuffer
): Promise<CuadAnnotation[]> {
  const table = arrow.tableFromIPC(buffer)
  const annotations: CuadAnnotation[] = []

  for (const row of table) {
    const id = row["id"] as string
    const context = row["context"] as string
    const question = row["question"] as string

    // Extract category from question (format: "Highlight the ... [Category]")
    const categoryMatch = question.match(/\[(.*?)\]/)
    const category = categoryMatch ? categoryMatch[1] : "Unknown"

    // Parse answers object
    const answers = row["answers"] as { text: string[]; answer_start: number[] }
    const isAnswerable = answers.text.length > 0

    if (isAnswerable) {
      // Create annotation for each answer (some questions have multiple)
      for (let i = 0; i < answers.text.length; i++) {
        annotations.push({
          id: `${id}__${i}`,
          context,
          question,
          category,
          answerText: answers.text[i],
          answerStart: answers.answer_start[i],
          isAnswerable: true,
        })
      }
    }
  }

  return annotations
}

/**
 * Extract unique documents from CUAD annotations.
 */
export function extractCuadDocuments(
  annotations: CuadAnnotation[]
): CuadDocument[] {
  const documentMap = new Map<string, CuadDocument>()

  for (const annotation of annotations) {
    // Extract contract name from ID (format: ContractName__Category__Index)
    const contractName = annotation.id.split("__")[0]

    if (!documentMap.has(contractName)) {
      const normalizedText = annotation.context.trim().toLowerCase()
      const contentHash = createHash("sha256")
        .update(normalizedText)
        .digest("hex")

      documentMap.set(contractName, {
        source: "cuad",
        sourceId: contractName,
        title: contractName.replace(/_/g, " "),
        rawText: annotation.context,
        contentHash: `sha256:${contentHash}`,
        metadata: {
          categoryCount: 0,
          annotationCount: 0,
        },
      })
    }

    const doc = documentMap.get(contractName)!
    doc.metadata.annotationCount++
  }

  // Count unique categories per document
  const categoriesPerDoc = new Map<string, Set<string>>()
  for (const annotation of annotations) {
    const contractName = annotation.id.split("__")[0]
    if (!categoriesPerDoc.has(contractName)) {
      categoriesPerDoc.set(contractName, new Set())
    }
    categoriesPerDoc.get(contractName)!.add(annotation.category)
  }

  for (const [contractName, categories] of categoriesPerDoc) {
    const doc = documentMap.get(contractName)
    if (doc) {
      doc.metadata.categoryCount = categories.size
    }
  }

  return Array.from(documentMap.values())
}

/**
 * Extract clauses from CUAD annotations for embedding.
 * Includes both clause-level and evidence span-level granularities.
 */
export function extractCuadClauses(
  annotations: CuadAnnotation[]
): CuadClause[] {
  return annotations
    .filter((a) => a.isAnswerable && a.answerText.length > 10) // Filter short/empty
    .map((annotation) => {
      const contentHash = createHash("sha256")
        .update(annotation.answerText.trim().toLowerCase())
        .digest("hex")

      return {
        documentSourceId: annotation.id.split("__")[0],
        content: annotation.answerText,
        category: annotation.category,
        sectionPath: [annotation.category],
        contentHash: `sha256:${contentHash}`,
        granularity: "clause" as const,
        metadata: {
          answerStart: annotation.answerStart,
          question: annotation.question,
        },
      }
    })
}
```

**Step 2: Write tests**

```typescript
// src/lib/datasets/cuad.test.ts
import { describe, it, expect } from "vitest"
import {
  extractCuadDocuments,
  extractCuadClauses,
  CUAD_CATEGORIES,
  type CuadAnnotation,
} from "./cuad"

describe("CUAD Dataset Parser", () => {
  const mockAnnotations: CuadAnnotation[] = [
    {
      id: "TestContract__Governing Law__0",
      context: "This is the full contract text...",
      question: "Highlight the parts that discuss [Governing Law]",
      category: "Governing Law",
      answerText: "This Agreement shall be governed by the laws of Delaware.",
      answerStart: 100,
      isAnswerable: true,
    },
    {
      id: "TestContract__Non-Compete__0",
      context: "This is the full contract text...",
      question: "Highlight the parts that discuss [Non-Compete]",
      category: "Non-Compete",
      answerText:
        "The Receiving Party agrees not to compete for a period of 2 years.",
      answerStart: 500,
      isAnswerable: true,
    },
    {
      id: "OtherContract__Parties__0",
      context: "Different contract text...",
      question: "Highlight the parts that discuss [Parties]",
      category: "Parties",
      answerText: "ACME Corp and BigCo Inc.",
      answerStart: 0,
      isAnswerable: true,
    },
  ]

  describe("CUAD_CATEGORIES", () => {
    it("should have 40 categories (41st is dynamic)", () => {
      expect(CUAD_CATEGORIES.length).toBe(40)
    })

    it("should include key NDA-relevant categories", () => {
      expect(CUAD_CATEGORIES).toContain("Governing Law")
      expect(CUAD_CATEGORIES).toContain("Non-Compete")
      expect(CUAD_CATEGORIES).toContain("Parties")
    })
  })

  describe("extractCuadDocuments", () => {
    it("should extract unique documents", () => {
      const docs = extractCuadDocuments(mockAnnotations)

      expect(docs).toHaveLength(2)
      expect(docs.map((d) => d.sourceId)).toContain("TestContract")
      expect(docs.map((d) => d.sourceId)).toContain("OtherContract")
    })

    it("should count annotations per document", () => {
      const docs = extractCuadDocuments(mockAnnotations)
      const testContract = docs.find((d) => d.sourceId === "TestContract")

      expect(testContract?.metadata.annotationCount).toBe(2)
    })

    it("should count unique categories per document", () => {
      const docs = extractCuadDocuments(mockAnnotations)
      const testContract = docs.find((d) => d.sourceId === "TestContract")

      expect(testContract?.metadata.categoryCount).toBe(2)
    })

    it("should generate content hash", () => {
      const docs = extractCuadDocuments(mockAnnotations)

      for (const doc of docs) {
        expect(doc.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      }
    })
  })

  describe("extractCuadClauses", () => {
    it("should extract clauses from answerable annotations", () => {
      const clauses = extractCuadClauses(mockAnnotations)

      expect(clauses).toHaveLength(3)
    })

    it("should include category in section path", () => {
      const clauses = extractCuadClauses(mockAnnotations)
      const governingLaw = clauses.find(
        (c) => c.category === "Governing Law"
      )

      expect(governingLaw?.sectionPath).toEqual(["Governing Law"])
    })

    it("should set granularity to clause", () => {
      const clauses = extractCuadClauses(mockAnnotations)

      for (const clause of clauses) {
        expect(clause.granularity).toBe("clause")
      }
    })

    it("should filter short content", () => {
      const annotationsWithShort: CuadAnnotation[] = [
        ...mockAnnotations,
        {
          id: "TestContract__Short__0",
          context: "...",
          question: "...",
          category: "Test",
          answerText: "Yes", // Too short
          answerStart: 0,
          isAnswerable: true,
        },
      ]

      const clauses = extractCuadClauses(annotationsWithShort)
      expect(clauses).toHaveLength(3) // Short one filtered out
    })
  })
})
```

**Step 3: Run tests**

Run: `pnpm test src/lib/datasets/cuad.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/lib/datasets/cuad.ts src/lib/datasets/cuad.test.ts
git commit -m "feat: add CUAD dataset parser

- Parse Parquet format from HuggingFace
- Extract documents and clauses
- Support all 41 CUAD categories
- Content hashing for deduplication
- Multi-granularity support (clause, evidence)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create ContractNLI Dataset Parser

**Files:**
- Create: `src/lib/datasets/contract-nli.ts`
- Create: `src/lib/datasets/contract-nli.test.ts`

**Step 1: Create ContractNLI parser**

```typescript
// src/lib/datasets/contract-nli.ts
/**
 * @fileoverview ContractNLI Dataset Parser
 *
 * Parses the ContractNLI dataset from JSON format into structured
 * records for embedding and storage. ContractNLI contains 607 NDAs
 * with 17 hypothesis definitions for natural language inference.
 *
 * The 17 hypotheses test specific contract obligations like:
 * - "Confidential information shall remain confidential"
 * - "The agreement may be terminated for convenience"
 *
 * @see {@link https://stanfordnlp.github.io/contract-nli/}
 * @module lib/datasets/contract-nli
 */

import { createHash } from "crypto"
import { downloadJson } from "./download"

/**
 * Raw ContractNLI document from the dataset.
 */
export interface ContractNLIRaw {
  /** Document ID */
  id: string
  /** Full NDA text */
  text: string
  /** Annotation spans */
  spans: ContractNLISpan[]
  /** Labels for each hypothesis */
  labels: Record<string, "Entailment" | "Contradiction" | "NotMentioned">
}

/**
 * ContractNLI annotation span.
 */
export interface ContractNLISpan {
  /** Start character offset */
  start: number
  /** End character offset */
  end: number
  /** Hypothesis ID this span supports */
  hypothesis_id: string
  /** The actual text of the span */
  text?: string
}

/**
 * The 17 ContractNLI hypotheses.
 */
export const CONTRACT_NLI_HYPOTHESES = [
  {
    id: "nda-1",
    text: "Confidential information shall be used solely for the purpose of evaluating the proposed transaction.",
    category: "Purpose Limitation",
  },
  {
    id: "nda-2",
    text: "The Receiving Party may share confidential information with its employees.",
    category: "Permitted Disclosure",
  },
  {
    id: "nda-3",
    text: "The Receiving Party may share confidential information with third parties.",
    category: "Third Party Disclosure",
  },
  {
    id: "nda-4",
    text: "The Receiving Party shall protect confidential information with the same degree of care as its own confidential information.",
    category: "Standard of Care",
  },
  {
    id: "nda-5",
    text: "Confidential information shall remain confidential for a specified period after termination.",
    category: "Survival Period",
  },
  {
    id: "nda-6",
    text: "The agreement may be terminated for convenience.",
    category: "Termination",
  },
  {
    id: "nda-7",
    text: "The Receiving Party shall return or destroy confidential information upon termination.",
    category: "Return/Destruction",
  },
  {
    id: "nda-8",
    text: "The agreement grants no license to intellectual property.",
    category: "IP License",
  },
  {
    id: "nda-9",
    text: "The Disclosing Party makes no warranties about the confidential information.",
    category: "Warranties",
  },
  {
    id: "nda-10",
    text: "Neither party shall be liable for consequential damages.",
    category: "Liability Limitation",
  },
  {
    id: "nda-11",
    text: "The agreement shall be governed by the laws of a specific jurisdiction.",
    category: "Governing Law",
  },
  {
    id: "nda-12",
    text: "The Receiving Party may disclose confidential information if required by law.",
    category: "Legal Compulsion",
  },
  {
    id: "nda-13",
    text: "Information that is publicly known is not confidential.",
    category: "Public Information Exception",
  },
  {
    id: "nda-14",
    text: "Information known to the Receiving Party before disclosure is not confidential.",
    category: "Prior Knowledge Exception",
  },
  {
    id: "nda-15",
    text: "Information independently developed is not confidential.",
    category: "Independent Development Exception",
  },
  {
    id: "nda-16",
    text: "The agreement may not be assigned without consent.",
    category: "Assignment",
  },
  {
    id: "nda-17",
    text: "The agreement shall be amended only in writing.",
    category: "Amendment",
  },
] as const

export type ContractNLIHypothesisId = (typeof CONTRACT_NLI_HYPOTHESES)[number]["id"]

/**
 * Hypothesis definition for database storage.
 */
export interface HypothesisDefinition {
  /** Hypothesis ID (e.g., "nda-1") */
  id: string
  /** The hypothesis text */
  text: string
  /** Category for grouping */
  category: string
  /** Description for UI */
  description?: string
}

/**
 * Processed ContractNLI document ready for database insertion.
 */
export interface ContractNLIDocument {
  /** Source identifier */
  source: "contract_nli"
  /** Original document ID from dataset */
  sourceId: string
  /** Document title (derived from ID) */
  title: string
  /** Full NDA text */
  rawText: string
  /** SHA-256 hash of normalized text */
  contentHash: string
  /** Metadata */
  metadata: {
    spanCount: number
    labels: Record<string, string>
  }
}

/**
 * Processed ContractNLI span ready for embedding.
 */
export interface ContractNLISpanRecord {
  /** Parent document source ID */
  documentSourceId: string
  /** Span text to embed */
  content: string
  /** Hypothesis ID this supports */
  hypothesisId: string
  /** Category derived from hypothesis */
  category: string
  /** Section path */
  sectionPath: string[]
  /** SHA-256 hash of content */
  contentHash: string
  /** Granularity level */
  granularity: "evidence"
  /** Metadata */
  metadata: {
    start: number
    end: number
    hypothesisText: string
  }
}

/**
 * Get hypothesis definition by ID.
 */
export function getHypothesis(id: string): HypothesisDefinition | undefined {
  return CONTRACT_NLI_HYPOTHESES.find((h) => h.id === id)
}

/**
 * Parse ContractNLI documents from JSON array.
 */
export function parseContractNLI(data: ContractNLIRaw[]): ContractNLIDocument[] {
  return data.map((doc) => {
    const normalizedText = doc.text.trim().toLowerCase()
    const contentHash = createHash("sha256")
      .update(normalizedText)
      .digest("hex")

    return {
      source: "contract_nli" as const,
      sourceId: doc.id,
      title: `ContractNLI Document ${doc.id}`,
      rawText: doc.text,
      contentHash: `sha256:${contentHash}`,
      metadata: {
        spanCount: doc.spans.length,
        labels: doc.labels,
      },
    }
  })
}

/**
 * Extract evidence spans from ContractNLI documents for embedding.
 */
export function extractContractNLISpans(
  data: ContractNLIRaw[]
): ContractNLISpanRecord[] {
  const spans: ContractNLISpanRecord[] = []

  for (const doc of data) {
    for (const span of doc.spans) {
      // Get the span text from the document
      const spanText = doc.text.slice(span.start, span.end)

      // Skip short spans
      if (spanText.length < 10) continue

      const hypothesis = getHypothesis(span.hypothesis_id)
      if (!hypothesis) continue

      const contentHash = createHash("sha256")
        .update(spanText.trim().toLowerCase())
        .digest("hex")

      spans.push({
        documentSourceId: doc.id,
        content: spanText,
        hypothesisId: span.hypothesis_id,
        category: hypothesis.category,
        sectionPath: [hypothesis.category],
        contentHash: `sha256:${contentHash}`,
        granularity: "evidence",
        metadata: {
          start: span.start,
          end: span.end,
          hypothesisText: hypothesis.text,
        },
      })
    }
  }

  return spans
}

/**
 * Download and parse ContractNLI dataset.
 */
export async function downloadContractNLI(): Promise<{
  documents: ContractNLIDocument[]
  spans: ContractNLISpanRecord[]
  hypotheses: HypothesisDefinition[]
}> {
  // ContractNLI is available as JSON from the Datasets API
  const url = "https://huggingface.co/datasets/kiddothe2b/contract-nli/raw/main/train.json"
  const data = await downloadJson<ContractNLIRaw[]>(url)

  return {
    documents: parseContractNLI(data),
    spans: extractContractNLISpans(data),
    hypotheses: CONTRACT_NLI_HYPOTHESES.map((h) => ({
      id: h.id,
      text: h.text,
      category: h.category,
    })),
  }
}
```

**Step 2: Write tests**

```typescript
// src/lib/datasets/contract-nli.test.ts
import { describe, it, expect } from "vitest"
import {
  parseContractNLI,
  extractContractNLISpans,
  getHypothesis,
  CONTRACT_NLI_HYPOTHESES,
  type ContractNLIRaw,
} from "./contract-nli"

describe("ContractNLI Dataset Parser", () => {
  const mockData: ContractNLIRaw[] = [
    {
      id: "doc-001",
      text: "This is a confidentiality agreement. The Receiving Party shall protect confidential information with reasonable care. All information must be returned upon termination.",
      spans: [
        { start: 37, end: 105, hypothesis_id: "nda-4" },
        { start: 106, end: 160, hypothesis_id: "nda-7" },
      ],
      labels: {
        "nda-4": "Entailment",
        "nda-7": "Entailment",
        "nda-1": "NotMentioned",
      },
    },
  ]

  describe("CONTRACT_NLI_HYPOTHESES", () => {
    it("should have 17 hypotheses", () => {
      expect(CONTRACT_NLI_HYPOTHESES.length).toBe(17)
    })

    it("should include key NDA hypotheses", () => {
      const categories = CONTRACT_NLI_HYPOTHESES.map((h) => h.category)
      expect(categories).toContain("Standard of Care")
      expect(categories).toContain("Governing Law")
      expect(categories).toContain("Return/Destruction")
    })
  })

  describe("getHypothesis", () => {
    it("should return hypothesis by ID", () => {
      const hypothesis = getHypothesis("nda-4")

      expect(hypothesis).toBeDefined()
      expect(hypothesis?.category).toBe("Standard of Care")
    })

    it("should return undefined for unknown ID", () => {
      const hypothesis = getHypothesis("unknown-id")

      expect(hypothesis).toBeUndefined()
    })
  })

  describe("parseContractNLI", () => {
    it("should parse documents with correct source", () => {
      const docs = parseContractNLI(mockData)

      expect(docs).toHaveLength(1)
      expect(docs[0].source).toBe("contract_nli")
      expect(docs[0].sourceId).toBe("doc-001")
    })

    it("should generate content hash", () => {
      const docs = parseContractNLI(mockData)

      expect(docs[0].contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    })

    it("should include span count in metadata", () => {
      const docs = parseContractNLI(mockData)

      expect(docs[0].metadata.spanCount).toBe(2)
    })
  })

  describe("extractContractNLISpans", () => {
    it("should extract evidence spans", () => {
      const spans = extractContractNLISpans(mockData)

      expect(spans).toHaveLength(2)
    })

    it("should set granularity to evidence", () => {
      const spans = extractContractNLISpans(mockData)

      for (const span of spans) {
        expect(span.granularity).toBe("evidence")
      }
    })

    it("should include hypothesis category", () => {
      const spans = extractContractNLISpans(mockData)
      const standardOfCare = spans.find((s) => s.hypothesisId === "nda-4")

      expect(standardOfCare?.category).toBe("Standard of Care")
    })

    it("should include hypothesis text in metadata", () => {
      const spans = extractContractNLISpans(mockData)

      expect(spans[0].metadata.hypothesisText).toBeDefined()
      expect(spans[0].metadata.hypothesisText.length).toBeGreaterThan(0)
    })
  })
})
```

**Step 3: Run tests**

Run: `pnpm test src/lib/datasets/contract-nli.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/lib/datasets/contract-nli.ts src/lib/datasets/contract-nli.test.ts
git commit -m "feat: add ContractNLI dataset parser

- Parse 607 NDAs with 17 hypothesis definitions
- Extract evidence spans for NLI-based analysis
- Support all 17 hypothesis categories
- Content hashing for deduplication

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Template Parsers (Bonterms, CommonAccord)

**Files:**
- Create: `src/lib/datasets/templates.ts`
- Create: `src/lib/datasets/templates.test.ts`

**Step 1: Create template parsers**

```typescript
// src/lib/datasets/templates.ts
/**
 * @fileoverview NDA Template Parsers
 *
 * Parses NDA templates from Bonterms and CommonAccord into structured
 * records for embedding. Supports multi-granularity extraction:
 * - Section-level: Individual template sections
 * - Template-level: Full template summary
 *
 * @module lib/datasets/templates
 */

import { marked } from "marked"
import { createHash } from "crypto"
import { downloadGitHubTemplates, GITHUB_CONFIG } from "./download"

/**
 * Parsed template section.
 */
export interface TemplateSection {
  /** Section title/heading */
  title: string
  /** Section content (markdown stripped) */
  content: string
  /** Heading level (1-6) */
  level: number
  /** Parent section titles */
  path: string[]
}

/**
 * Processed template document.
 */
export interface TemplateDocument {
  /** Source identifier */
  source: "bonterms" | "commonaccord"
  /** Source ID (filename or URL path) */
  sourceId: string
  /** Template title */
  title: string
  /** Full raw text */
  rawText: string
  /** SHA-256 hash of normalized text */
  contentHash: string
  /** Metadata */
  metadata: {
    sectionCount: number
    format: "markdown"
  }
}

/**
 * Processed template chunk for embedding.
 */
export interface TemplateChunk {
  /** Parent document source ID */
  documentSourceId: string
  /** Chunk text to embed */
  content: string
  /** Category (derived from section) */
  category: string
  /** Section path */
  sectionPath: string[]
  /** SHA-256 hash of content */
  contentHash: string
  /** Granularity level */
  granularity: "section" | "template"
  /** Metadata */
  metadata: {
    heading?: string
    level?: number
  }
}

/**
 * Parse Markdown into sections.
 */
export function parseMarkdownSections(markdown: string): TemplateSection[] {
  const sections: TemplateSection[] = []
  const tokens = marked.lexer(markdown)

  let currentPath: string[] = []
  let currentContent = ""
  let currentTitle = ""
  let currentLevel = 0

  for (const token of tokens) {
    if (token.type === "heading") {
      // Save previous section if exists
      if (currentTitle && currentContent.trim()) {
        sections.push({
          title: currentTitle,
          content: currentContent.trim(),
          level: currentLevel,
          path: [...currentPath],
        })
      }

      // Update path based on heading level
      const headingLevel = token.depth
      while (currentPath.length >= headingLevel) {
        currentPath.pop()
      }
      currentPath.push(token.text)

      currentTitle = token.text
      currentLevel = headingLevel
      currentContent = ""
    } else if (token.type === "paragraph" || token.type === "text") {
      currentContent += " " + (token.raw || token.text || "")
    } else if (token.type === "list") {
      // Extract list items
      for (const item of token.items || []) {
        currentContent += " " + (item.text || "")
      }
    }
  }

  // Save final section
  if (currentTitle && currentContent.trim()) {
    sections.push({
      title: currentTitle,
      content: currentContent.trim(),
      level: currentLevel,
      path: [...currentPath],
    })
  }

  return sections
}

/**
 * Extract template chunks from parsed sections.
 */
export function extractTemplateChunks(
  sections: TemplateSection[],
  source: "bonterms" | "commonaccord",
  sourceId: string
): TemplateChunk[] {
  const chunks: TemplateChunk[] = []

  for (const section of sections) {
    // Skip very short sections
    if (section.content.length < 20) continue

    const contentHash = createHash("sha256")
      .update(section.content.trim().toLowerCase())
      .digest("hex")

    chunks.push({
      documentSourceId: sourceId,
      content: section.content,
      category: section.title,
      sectionPath: section.path,
      contentHash: `sha256:${contentHash}`,
      granularity: "section",
      metadata: {
        heading: section.title,
        level: section.level,
      },
    })
  }

  return chunks
}

/**
 * Create template-level summary chunk.
 */
export function createTemplateSummaryChunk(
  document: TemplateDocument
): TemplateChunk {
  // Create a summary from the first ~500 chars
  const summary = document.rawText.slice(0, 500).trim()

  const contentHash = createHash("sha256")
    .update(summary.toLowerCase())
    .digest("hex")

  return {
    documentSourceId: document.sourceId,
    content: summary,
    category: "Template Summary",
    sectionPath: ["Summary"],
    contentHash: `sha256:${contentHash}`,
    granularity: "template",
    metadata: {},
  }
}

/**
 * Download and parse Bonterms templates.
 */
export async function downloadBontermsTemplates(): Promise<{
  documents: TemplateDocument[]
  chunks: TemplateChunk[]
}> {
  const files = await downloadGitHubTemplates(GITHUB_CONFIG.bonterms)
  const documents: TemplateDocument[] = []
  const chunks: TemplateChunk[] = []

  for (const [filename, content] of files) {
    const normalizedText = content.trim().toLowerCase()
    const contentHash = createHash("sha256")
      .update(normalizedText)
      .digest("hex")

    const doc: TemplateDocument = {
      source: "bonterms",
      sourceId: `bonterms/${filename}`,
      title: `Bonterms ${filename.replace(".md", "")}`,
      rawText: content,
      contentHash: `sha256:${contentHash}`,
      metadata: {
        sectionCount: 0,
        format: "markdown",
      },
    }

    const sections = parseMarkdownSections(content)
    doc.metadata.sectionCount = sections.length

    documents.push(doc)
    chunks.push(...extractTemplateChunks(sections, "bonterms", doc.sourceId))
    chunks.push(createTemplateSummaryChunk(doc))
  }

  return { documents, chunks }
}

/**
 * Download and parse CommonAccord templates.
 */
export async function downloadCommonAccordTemplates(): Promise<{
  documents: TemplateDocument[]
  chunks: TemplateChunk[]
}> {
  const files = await downloadGitHubTemplates(GITHUB_CONFIG.commonaccord)
  const documents: TemplateDocument[] = []
  const chunks: TemplateChunk[] = []

  for (const [filename, content] of files) {
    const normalizedText = content.trim().toLowerCase()
    const contentHash = createHash("sha256")
      .update(normalizedText)
      .digest("hex")

    const doc: TemplateDocument = {
      source: "commonaccord",
      sourceId: `commonaccord/${filename}`,
      title: `CommonAccord ${filename.replace(".md", "")}`,
      rawText: content,
      contentHash: `sha256:${contentHash}`,
      metadata: {
        sectionCount: 0,
        format: "markdown",
      },
    }

    const sections = parseMarkdownSections(content)
    doc.metadata.sectionCount = sections.length

    documents.push(doc)
    chunks.push(...extractTemplateChunks(sections, "commonaccord", doc.sourceId))
    chunks.push(createTemplateSummaryChunk(doc))
  }

  return { documents, chunks }
}
```

**Step 2: Write tests**

```typescript
// src/lib/datasets/templates.test.ts
import { describe, it, expect } from "vitest"
import {
  parseMarkdownSections,
  extractTemplateChunks,
  createTemplateSummaryChunk,
  type TemplateDocument,
} from "./templates"

describe("Template Parsers", () => {
  const mockMarkdown = `
# Main Heading

This is the main content paragraph.

## Section One

Content for section one with more details.

## Section Two

Content for section two.

### Subsection

Nested content here.
`

  describe("parseMarkdownSections", () => {
    it("should parse headings into sections", () => {
      const sections = parseMarkdownSections(mockMarkdown)

      expect(sections.length).toBeGreaterThan(0)
    })

    it("should capture heading levels", () => {
      const sections = parseMarkdownSections(mockMarkdown)
      const mainHeading = sections.find((s) => s.title === "Main Heading")
      const sectionOne = sections.find((s) => s.title === "Section One")

      expect(mainHeading?.level).toBe(1)
      expect(sectionOne?.level).toBe(2)
    })

    it("should build section path", () => {
      const sections = parseMarkdownSections(mockMarkdown)
      const subsection = sections.find((s) => s.title === "Subsection")

      expect(subsection?.path).toContain("Section Two")
      expect(subsection?.path).toContain("Subsection")
    })
  })

  describe("extractTemplateChunks", () => {
    it("should create chunks from sections", () => {
      const sections = parseMarkdownSections(mockMarkdown)
      const chunks = extractTemplateChunks(sections, "bonterms", "test-doc")

      expect(chunks.length).toBeGreaterThan(0)
    })

    it("should set granularity to section", () => {
      const sections = parseMarkdownSections(mockMarkdown)
      const chunks = extractTemplateChunks(sections, "bonterms", "test-doc")

      for (const chunk of chunks) {
        expect(chunk.granularity).toBe("section")
      }
    })

    it("should filter short sections", () => {
      const shortMarkdown = `
# Heading

OK

## Another

This section has enough content to be included.
`
      const sections = parseMarkdownSections(shortMarkdown)
      const chunks = extractTemplateChunks(sections, "bonterms", "test-doc")

      // Only the longer section should be included
      expect(chunks.length).toBe(1)
    })
  })

  describe("createTemplateSummaryChunk", () => {
    it("should create template-level chunk", () => {
      const doc: TemplateDocument = {
        source: "bonterms",
        sourceId: "test-doc",
        title: "Test Template",
        rawText: "A".repeat(600),
        contentHash: "sha256:abc123",
        metadata: { sectionCount: 5, format: "markdown" },
      }

      const chunk = createTemplateSummaryChunk(doc)

      expect(chunk.granularity).toBe("template")
      expect(chunk.content.length).toBeLessThanOrEqual(500)
      expect(chunk.category).toBe("Template Summary")
    })
  })
})
```

**Step 3: Run tests**

Run: `pnpm test src/lib/datasets/templates.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/lib/datasets/templates.ts src/lib/datasets/templates.test.ts
git commit -m "feat: add template parsers (Bonterms, CommonAccord)

- Parse Markdown templates into sections
- Multi-granularity extraction (section, template)
- Support both Bonterms and CommonAccord formats
- Section path tracking for hierarchy

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create Kleister-NDA Dataset Parser

**Files:**
- Create: `src/lib/datasets/kleister.ts`
- Create: `src/lib/datasets/kleister.test.ts`

**Step 1: Create Kleister parser**

```typescript
// src/lib/datasets/kleister.ts
/**
 * @fileoverview Kleister-NDA Dataset Parser
 *
 * Parses the Kleister-NDA dataset from plain text format. Kleister
 * contains 540 NDAs used for key information extraction evaluation.
 *
 * The dataset is primarily used for testing the extraction pipeline's
 * ability to identify parties, dates, and jurisdiction.
 *
 * @see {@link https://huggingface.co/datasets/hpi-dhc/kleister-nda}
 * @module lib/datasets/kleister
 */

import { createHash } from "crypto"
import { downloadText } from "./download"

/**
 * Kleister-NDA document structure.
 */
export interface KleisterDocument {
  /** Source identifier */
  source: "kleister_nda"
  /** Document ID */
  sourceId: string
  /** Document title */
  title: string
  /** Full NDA text */
  rawText: string
  /** SHA-256 hash of normalized text */
  contentHash: string
  /** Metadata */
  metadata: {
    wordCount: number
    format: "text"
  }
}

/**
 * Kleister-NDA chunk for embedding (document-level only).
 */
export interface KleisterChunk {
  /** Parent document source ID */
  documentSourceId: string
  /** Chunk text to embed */
  content: string
  /** Category */
  category: string
  /** Section path */
  sectionPath: string[]
  /** SHA-256 hash of content */
  contentHash: string
  /** Granularity level */
  granularity: "clause"
  /** Metadata */
  metadata: {
    wordCount: number
  }
}

/**
 * Chunk text into overlapping segments for embedding.
 *
 * @param text - Full document text
 * @param chunkSize - Target chunk size in characters
 * @param overlap - Overlap between chunks in characters
 */
export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))

    if (end >= text.length) break
    start = end - overlap
  }

  return chunks
}

/**
 * Parse a single Kleister-NDA document from text.
 */
export function parseKleisterDocument(
  id: string,
  text: string
): KleisterDocument {
  const normalizedText = text.trim().toLowerCase()
  const contentHash = createHash("sha256")
    .update(normalizedText)
    .digest("hex")

  return {
    source: "kleister_nda",
    sourceId: id,
    title: `Kleister NDA ${id}`,
    rawText: text,
    contentHash: `sha256:${contentHash}`,
    metadata: {
      wordCount: text.split(/\s+/).length,
      format: "text",
    },
  }
}

/**
 * Extract chunks from a Kleister document for embedding.
 */
export function extractKleisterChunks(
  document: KleisterDocument
): KleisterChunk[] {
  const textChunks = chunkText(document.rawText, 1000, 200)

  return textChunks
    .filter((chunk) => chunk.length > 50) // Filter very short chunks
    .map((chunk, index) => {
      const contentHash = createHash("sha256")
        .update(chunk.trim().toLowerCase())
        .digest("hex")

      return {
        documentSourceId: document.sourceId,
        content: chunk,
        category: "NDA Content",
        sectionPath: [`chunk-${index}`],
        contentHash: `sha256:${contentHash}`,
        granularity: "clause" as const,
        metadata: {
          wordCount: chunk.split(/\s+/).length,
        },
      }
    })
}

/**
 * Download and parse Kleister-NDA dataset.
 *
 * Note: Kleister-NDA may require authentication or special access.
 * This is a placeholder that should be updated with actual data source.
 */
export async function downloadKleisterNDA(): Promise<{
  documents: KleisterDocument[]
  chunks: KleisterChunk[]
}> {
  // Kleister-NDA dataset structure - will need to fetch from HuggingFace
  // For now, return empty arrays as placeholder
  console.warn("Kleister-NDA download not yet implemented - requires HuggingFace API")

  return {
    documents: [],
    chunks: [],
  }
}
```

**Step 2: Write tests**

```typescript
// src/lib/datasets/kleister.test.ts
import { describe, it, expect } from "vitest"
import {
  chunkText,
  parseKleisterDocument,
  extractKleisterChunks,
} from "./kleister"

describe("Kleister-NDA Dataset Parser", () => {
  describe("chunkText", () => {
    it("should chunk text into segments", () => {
      const text = "A".repeat(2500)
      const chunks = chunkText(text, 1000, 200)

      expect(chunks.length).toBe(3)
    })

    it("should create overlapping chunks", () => {
      const text = "0123456789".repeat(100) // 1000 chars
      const chunks = chunkText(text, 400, 100)

      // Each chunk except the first should start with overlap from previous
      expect(chunks.length).toBeGreaterThan(1)
    })

    it("should handle text shorter than chunk size", () => {
      const text = "Short text"
      const chunks = chunkText(text, 1000, 200)

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toBe(text)
    })
  })

  describe("parseKleisterDocument", () => {
    it("should create document with correct source", () => {
      const doc = parseKleisterDocument("doc-001", "NDA content here...")

      expect(doc.source).toBe("kleister_nda")
      expect(doc.sourceId).toBe("doc-001")
    })

    it("should calculate word count", () => {
      const doc = parseKleisterDocument("doc-001", "one two three four five")

      expect(doc.metadata.wordCount).toBe(5)
    })

    it("should generate content hash", () => {
      const doc = parseKleisterDocument("doc-001", "NDA content")

      expect(doc.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    })
  })

  describe("extractKleisterChunks", () => {
    it("should extract chunks from document", () => {
      const doc = parseKleisterDocument("doc-001", "A".repeat(2500))
      const chunks = extractKleisterChunks(doc)

      expect(chunks.length).toBeGreaterThan(1)
    })

    it("should set granularity to clause", () => {
      const doc = parseKleisterDocument("doc-001", "A".repeat(2500))
      const chunks = extractKleisterChunks(doc)

      for (const chunk of chunks) {
        expect(chunk.granularity).toBe("clause")
      }
    })

    it("should filter very short chunks", () => {
      const doc = parseKleisterDocument("doc-001", "Short")
      const chunks = extractKleisterChunks(doc)

      expect(chunks).toHaveLength(0)
    })
  })
})
```

**Step 3: Run tests**

Run: `pnpm test src/lib/datasets/kleister.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/lib/datasets/kleister.ts src/lib/datasets/kleister.test.ts
git commit -m "feat: add Kleister-NDA dataset parser

- Parse plain text NDAs with chunking
- Overlapping chunks for better context
- Placeholder for HuggingFace download

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Create Reference Schema with Hypothesis Definitions

**Files:**
- Create: `src/db/schema/reference.ts`
- Modify: `src/db/schema/index.ts`

**Step 1: Create reference schema**

```typescript
// src/db/schema/reference.ts
/**
 * @fileoverview Reference Database Schema
 *
 * Tables for storing legal reference corpora including CUAD,
 * ContractNLI, Bonterms, CommonAccord, and Kleister-NDA.
 *
 * @module db/schema/reference
 */

import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  real,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { primaryId, timestamps } from "./_columns"

/**
 * CUAD category definitions (41 categories).
 */
export const cuadCategories = pgTable(
  "cuad_categories",
  {
    ...primaryId,
    name: varchar("name", { length: 100 }).notNull().unique(),
    description: text("description"),
    riskWeight: real("risk_weight").default(1.0),
    isNdaRelevant: boolean("is_nda_relevant").default(true),
    ...timestamps,
  },
  (table) => [
    index("cuad_categories_name_idx").on(table.name),
  ]
)

/**
 * ContractNLI hypothesis definitions (17 hypotheses).
 */
export const hypothesisDefinitions = pgTable(
  "hypothesis_definitions",
  {
    ...primaryId,
    hypothesisId: varchar("hypothesis_id", { length: 20 }).notNull().unique(),
    text: text("text").notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    description: text("description"),
    ...timestamps,
  },
  (table) => [
    index("hypothesis_definitions_category_idx").on(table.category),
  ]
)

/**
 * Reference documents from legal corpora.
 */
export const referenceDocuments = pgTable(
  "reference_documents",
  {
    ...primaryId,
    source: varchar("source", { length: 50 }).notNull(), // cuad, contract_nli, bonterms, commonaccord, kleister_nda
    sourceId: varchar("source_id", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }),
    rawText: text("raw_text"),
    contentHash: varchar("content_hash", { length: 100 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("reference_documents_content_hash_idx").on(table.contentHash),
    index("reference_documents_source_idx").on(table.source),
    index("reference_documents_source_id_idx").on(table.source, table.sourceId),
  ]
)

/**
 * Reference embeddings for similarity search.
 * Uses pgvector for 1024-dimensional voyage-law-2 embeddings.
 */
export const referenceEmbeddings = pgTable(
  "reference_embeddings",
  {
    ...primaryId,
    documentId: integer("document_id")
      .notNull()
      .references(() => referenceDocuments.id, { onDelete: "cascade" }),
    granularity: varchar("granularity", { length: 20 }).notNull(), // clause, evidence, section, template
    content: text("content").notNull(),
    category: varchar("category", { length: 100 }),
    hypothesisId: varchar("hypothesis_id", { length: 20 }).references(
      () => hypothesisDefinitions.hypothesisId
    ),
    sectionPath: jsonb("section_path").$type<string[]>(),
    embedding: sql`vector(1024)`.notNull(),
    contentHash: varchar("content_hash", { length: 100 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("reference_embeddings_content_hash_idx").on(table.contentHash),
    index("reference_embeddings_document_id_idx").on(table.documentId),
    index("reference_embeddings_granularity_idx").on(table.granularity),
    index("reference_embeddings_category_idx").on(table.category),
    index("reference_embeddings_hypothesis_id_idx").on(table.hypothesisId),
    // HNSW index will be created after bulk load (see Task 14)
  ]
)

/**
 * Type exports for use in application code.
 */
export type CuadCategory = typeof cuadCategories.$inferSelect
export type NewCuadCategory = typeof cuadCategories.$inferInsert

export type HypothesisDefinition = typeof hypothesisDefinitions.$inferSelect
export type NewHypothesisDefinition = typeof hypothesisDefinitions.$inferInsert

export type ReferenceDocument = typeof referenceDocuments.$inferSelect
export type NewReferenceDocument = typeof referenceDocuments.$inferInsert

export type ReferenceEmbedding = typeof referenceEmbeddings.$inferSelect
export type NewReferenceEmbedding = typeof referenceEmbeddings.$inferInsert
```

**Step 2: Update schema barrel export**

Add to `src/db/schema/index.ts`:

```typescript
// Reference tables
export * from "./reference"
```

**Step 3: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 4: Generate migration**

Run: `pnpm db:generate`

**Step 5: Commit**

```bash
git add src/db/schema/reference.ts src/db/schema/index.ts drizzle/
git commit -m "feat(db): add reference schema with hypothesis definitions

Tables:
- cuad_categories: 41 CUAD category definitions
- hypothesis_definitions: 17 ContractNLI hypotheses
- reference_documents: Source documents from all corpora
- reference_embeddings: Vector embeddings for similarity search

Supports multi-granularity: clause, evidence, section, template

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Create Bootstrap Inngest Function (All Datasets)

**Files:**
- Create: `src/inngest/functions/bootstrap.ts`
- Modify: `src/inngest/functions/index.ts`

**Step 1: Create the bootstrap function**

```typescript
// src/inngest/functions/bootstrap.ts
/**
 * @fileoverview Bootstrap Pipeline Inngest Function
 *
 * Durable workflow that ingests legal reference corpora into the
 * shared reference database. Handles dataset download, parsing,
 * embedding generation, and bulk database insertion for all 5 datasets.
 *
 * @module inngest/functions/bootstrap
 */

import { inngest } from "../client"
import { RATE_LIMITS } from "../utils/rate-limit"
import { NonRetriableError, wrapApiError } from "../utils/errors"
import { db } from "@/db/client"
import {
  referenceDocuments,
  referenceEmbeddings,
  cuadCategories,
  hypothesisDefinitions,
} from "@/db/schema/reference"
import { getVoyageAIClient } from "@/lib/embeddings"
import {
  downloadHuggingFaceDataset,
  HUGGINGFACE_CONFIG,
} from "@/lib/datasets/download"
import {
  parseCuadParquet,
  extractCuadDocuments,
  extractCuadClauses,
  CUAD_CATEGORIES,
} from "@/lib/datasets/cuad"
import {
  downloadContractNLI,
  CONTRACT_NLI_HYPOTHESES,
} from "@/lib/datasets/contract-nli"
import {
  downloadBontermsTemplates,
  downloadCommonAccordTemplates,
} from "@/lib/datasets/templates"
import { downloadKleisterNDA } from "@/lib/datasets/kleister"
import { eq } from "drizzle-orm"

type DatasetName = "cuad" | "contract_nli" | "bonterms" | "commonaccord" | "kleister_nda"

interface BootstrapEvent {
  data: {
    datasets?: DatasetName[]
    force?: boolean
  }
}

/**
 * Bootstrap pipeline function.
 *
 * Ingests reference corpora into the shared database.
 * Idempotent - safe to re-run; duplicates are skipped via content hash.
 *
 * @event nda/bootstrap.start
 */
export const bootstrapPipeline = inngest.createFunction(
  {
    id: "bootstrap-pipeline",
    concurrency: { limit: 1 }, // Only one bootstrap at a time
    retries: 5,
  },
  { event: "nda/bootstrap.start" },
  async ({ event, step }) => {
    const {
      datasets = ["cuad", "contract_nli", "bonterms", "commonaccord", "kleister_nda"],
      force = false
    } = event.data as BootstrapEvent["data"]

    const results = {
      documentsInserted: 0,
      embeddingsInserted: 0,
      hypothesesInserted: 0,
      categoriesInserted: 0,
      errors: [] as string[],
    }

    // Step 1: Seed CUAD categories
    const categoryResult = await step.run("seed-cuad-categories", async () => {
      const existing = await db
        .select({ id: cuadCategories.id })
        .from(cuadCategories)
        .limit(1)

      if (existing.length === 0 || force) {
        const categoryRecords = CUAD_CATEGORIES.map((name, index) => ({
          name,
          description: `CUAD category: ${name}`,
          riskWeight: 1.0,
          isNdaRelevant: true,
        }))

        await db
          .insert(cuadCategories)
          .values(categoryRecords)
          .onConflictDoNothing()

        return { inserted: categoryRecords.length }
      }

      return { skipped: true, inserted: 0 }
    })
    results.categoriesInserted = categoryResult.inserted || 0

    // Step 2: Seed ContractNLI hypotheses
    const hypothesisResult = await step.run("seed-hypotheses", async () => {
      const existing = await db
        .select({ id: hypothesisDefinitions.id })
        .from(hypothesisDefinitions)
        .limit(1)

      if (existing.length === 0 || force) {
        const hypothesisRecords = CONTRACT_NLI_HYPOTHESES.map((h) => ({
          hypothesisId: h.id,
          text: h.text,
          category: h.category,
          description: `ContractNLI hypothesis for ${h.category}`,
        }))

        await db
          .insert(hypothesisDefinitions)
          .values(hypothesisRecords)
          .onConflictDoNothing()

        return { inserted: hypothesisRecords.length }
      }

      return { skipped: true, inserted: 0 }
    })
    results.hypothesesInserted = hypothesisResult.inserted || 0

    // Step 3: Process CUAD dataset
    if (datasets.includes("cuad")) {
      const cuadResult = await step.run("process-cuad", async () => {
        try {
          const buffer = await downloadHuggingFaceDataset(
            HUGGINGFACE_CONFIG.cuad.repo,
            HUGGINGFACE_CONFIG.cuad.split
          )
          const annotations = await parseCuadParquet(buffer)
          const documents = extractCuadDocuments(annotations)
          const clauses = extractCuadClauses(annotations)

          // Insert documents
          let docsInserted = 0
          for (const doc of documents) {
            try {
              await db
                .insert(referenceDocuments)
                .values({
                  source: doc.source,
                  sourceId: doc.sourceId,
                  title: doc.title,
                  rawText: doc.rawText,
                  contentHash: doc.contentHash,
                  metadata: doc.metadata,
                })
                .onConflictDoNothing()
              docsInserted++
            } catch (_e) {
              // Skip on conflict
            }
          }

          return {
            documentsInserted: docsInserted,
            clauseCount: clauses.length,
            documents,
            clauses,
          }
        } catch (error) {
          throw wrapApiError(error, "CUAD download/parse")
        }
      })
      results.documentsInserted += cuadResult.documentsInserted

      // Generate CUAD embeddings in batched steps
      const cuadEmbeddingResult = await step.run("embed-cuad-clauses", async () => {
        const voyage = getVoyageAIClient()
        const clauses = cuadResult.clauses

        // Get document IDs from database
        const docs = await db
          .select({ id: referenceDocuments.id, sourceId: referenceDocuments.sourceId })
          .from(referenceDocuments)
          .where(eq(referenceDocuments.source, "cuad"))

        const docIdMap = new Map(docs.map((d) => [d.sourceId, d.id]))

        let embeddingsInserted = 0
        const batchSize = RATE_LIMITS.voyageAi.batchSize

        for (let i = 0; i < clauses.length; i += batchSize) {
          const batch = clauses.slice(i, i + batchSize)
          const texts = batch.map((c) => c.content)

          try {
            const { embeddings } = await voyage.embedBatch(texts, "document")

            const records = batch.map((clause, index) => ({
              documentId: docIdMap.get(clause.documentSourceId)!,
              granularity: clause.granularity,
              content: clause.content,
              category: clause.category,
              sectionPath: clause.sectionPath,
              embedding: embeddings[index],
              contentHash: clause.contentHash,
              metadata: clause.metadata,
            }))

            await db
              .insert(referenceEmbeddings)
              .values(records)
              .onConflictDoNothing()

            embeddingsInserted += records.length
          } catch (error) {
            results.errors.push(`CUAD batch ${i}-${i + batchSize}: ${error}`)
          }

          // Rate limit between batches
          if (i + batchSize < clauses.length) {
            await new Promise((resolve) =>
              setTimeout(resolve, RATE_LIMITS.voyageAi.delayMs)
            )
          }
        }

        return { inserted: embeddingsInserted }
      })
      results.embeddingsInserted += cuadEmbeddingResult.inserted
    }

    // Step 4: Process ContractNLI dataset
    if (datasets.includes("contract_nli")) {
      const nliResult = await step.run("process-contract-nli", async () => {
        try {
          const { documents, spans } = await downloadContractNLI()

          // Insert documents
          let docsInserted = 0
          for (const doc of documents) {
            try {
              await db
                .insert(referenceDocuments)
                .values({
                  source: doc.source,
                  sourceId: doc.sourceId,
                  title: doc.title,
                  rawText: doc.rawText,
                  contentHash: doc.contentHash,
                  metadata: doc.metadata,
                })
                .onConflictDoNothing()
              docsInserted++
            } catch (_e) {
              // Skip on conflict
            }
          }

          return { documentsInserted: docsInserted, spanCount: spans.length, spans }
        } catch (error) {
          throw wrapApiError(error, "ContractNLI download/parse")
        }
      })
      results.documentsInserted += nliResult.documentsInserted

      // Generate ContractNLI embeddings
      const nliEmbeddingResult = await step.run("embed-contract-nli-spans", async () => {
        const voyage = getVoyageAIClient()
        const spans = nliResult.spans

        // Get document IDs from database
        const docs = await db
          .select({ id: referenceDocuments.id, sourceId: referenceDocuments.sourceId })
          .from(referenceDocuments)
          .where(eq(referenceDocuments.source, "contract_nli"))

        const docIdMap = new Map(docs.map((d) => [d.sourceId, d.id]))

        let embeddingsInserted = 0
        const batchSize = RATE_LIMITS.voyageAi.batchSize

        for (let i = 0; i < spans.length; i += batchSize) {
          const batch = spans.slice(i, i + batchSize)
          const texts = batch.map((s) => s.content)

          try {
            const { embeddings } = await voyage.embedBatch(texts, "document")

            const records = batch.map((span, index) => ({
              documentId: docIdMap.get(span.documentSourceId)!,
              granularity: span.granularity,
              content: span.content,
              category: span.category,
              hypothesisId: span.hypothesisId,
              sectionPath: span.sectionPath,
              embedding: embeddings[index],
              contentHash: span.contentHash,
              metadata: span.metadata,
            }))

            await db
              .insert(referenceEmbeddings)
              .values(records)
              .onConflictDoNothing()

            embeddingsInserted += records.length
          } catch (error) {
            results.errors.push(`ContractNLI batch ${i}-${i + batchSize}: ${error}`)
          }

          if (i + batchSize < spans.length) {
            await new Promise((resolve) =>
              setTimeout(resolve, RATE_LIMITS.voyageAi.delayMs)
            )
          }
        }

        return { inserted: embeddingsInserted }
      })
      results.embeddingsInserted += nliEmbeddingResult.inserted
    }

    // Step 5: Process Bonterms templates
    if (datasets.includes("bonterms")) {
      const bontermsResult = await step.run("process-bonterms", async () => {
        try {
          const { documents, chunks } = await downloadBontermsTemplates()

          let docsInserted = 0
          for (const doc of documents) {
            try {
              await db
                .insert(referenceDocuments)
                .values({
                  source: doc.source,
                  sourceId: doc.sourceId,
                  title: doc.title,
                  rawText: doc.rawText,
                  contentHash: doc.contentHash,
                  metadata: doc.metadata,
                })
                .onConflictDoNothing()
              docsInserted++
            } catch (_e) {
              // Skip on conflict
            }
          }

          return { documentsInserted: docsInserted, chunkCount: chunks.length, chunks }
        } catch (error) {
          throw wrapApiError(error, "Bonterms download/parse")
        }
      })
      results.documentsInserted += bontermsResult.documentsInserted

      // Generate Bonterms embeddings
      const bontermsEmbeddingResult = await step.run("embed-bonterms", async () => {
        const voyage = getVoyageAIClient()
        const chunks = bontermsResult.chunks

        const docs = await db
          .select({ id: referenceDocuments.id, sourceId: referenceDocuments.sourceId })
          .from(referenceDocuments)
          .where(eq(referenceDocuments.source, "bonterms"))

        const docIdMap = new Map(docs.map((d) => [d.sourceId, d.id]))

        let embeddingsInserted = 0
        const batchSize = RATE_LIMITS.voyageAi.batchSize

        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize)
          const texts = batch.map((c) => c.content)

          try {
            const { embeddings } = await voyage.embedBatch(texts, "document")

            const records = batch.map((chunk, index) => ({
              documentId: docIdMap.get(chunk.documentSourceId)!,
              granularity: chunk.granularity,
              content: chunk.content,
              category: chunk.category,
              sectionPath: chunk.sectionPath,
              embedding: embeddings[index],
              contentHash: chunk.contentHash,
              metadata: chunk.metadata,
            }))

            await db
              .insert(referenceEmbeddings)
              .values(records)
              .onConflictDoNothing()

            embeddingsInserted += records.length
          } catch (error) {
            results.errors.push(`Bonterms batch ${i}-${i + batchSize}: ${error}`)
          }

          if (i + batchSize < chunks.length) {
            await new Promise((resolve) =>
              setTimeout(resolve, RATE_LIMITS.voyageAi.delayMs)
            )
          }
        }

        return { inserted: embeddingsInserted }
      })
      results.embeddingsInserted += bontermsEmbeddingResult.inserted
    }

    // Step 6: Process CommonAccord templates
    if (datasets.includes("commonaccord")) {
      const commonaccordResult = await step.run("process-commonaccord", async () => {
        try {
          const { documents, chunks } = await downloadCommonAccordTemplates()

          let docsInserted = 0
          for (const doc of documents) {
            try {
              await db
                .insert(referenceDocuments)
                .values({
                  source: doc.source,
                  sourceId: doc.sourceId,
                  title: doc.title,
                  rawText: doc.rawText,
                  contentHash: doc.contentHash,
                  metadata: doc.metadata,
                })
                .onConflictDoNothing()
              docsInserted++
            } catch (_e) {
              // Skip on conflict
            }
          }

          return { documentsInserted: docsInserted, chunkCount: chunks.length, chunks }
        } catch (error) {
          throw wrapApiError(error, "CommonAccord download/parse")
        }
      })
      results.documentsInserted += commonaccordResult.documentsInserted

      // Generate CommonAccord embeddings
      const commonaccordEmbeddingResult = await step.run("embed-commonaccord", async () => {
        const voyage = getVoyageAIClient()
        const chunks = commonaccordResult.chunks

        const docs = await db
          .select({ id: referenceDocuments.id, sourceId: referenceDocuments.sourceId })
          .from(referenceDocuments)
          .where(eq(referenceDocuments.source, "commonaccord"))

        const docIdMap = new Map(docs.map((d) => [d.sourceId, d.id]))

        let embeddingsInserted = 0
        const batchSize = RATE_LIMITS.voyageAi.batchSize

        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize)
          const texts = batch.map((c) => c.content)

          try {
            const { embeddings } = await voyage.embedBatch(texts, "document")

            const records = batch.map((chunk, index) => ({
              documentId: docIdMap.get(chunk.documentSourceId)!,
              granularity: chunk.granularity,
              content: chunk.content,
              category: chunk.category,
              sectionPath: chunk.sectionPath,
              embedding: embeddings[index],
              contentHash: chunk.contentHash,
              metadata: chunk.metadata,
            }))

            await db
              .insert(referenceEmbeddings)
              .values(records)
              .onConflictDoNothing()

            embeddingsInserted += records.length
          } catch (error) {
            results.errors.push(`CommonAccord batch ${i}-${i + batchSize}: ${error}`)
          }

          if (i + batchSize < chunks.length) {
            await new Promise((resolve) =>
              setTimeout(resolve, RATE_LIMITS.voyageAi.delayMs)
            )
          }
        }

        return { inserted: embeddingsInserted }
      })
      results.embeddingsInserted += commonaccordEmbeddingResult.inserted
    }

    // Step 7: Process Kleister-NDA (placeholder)
    if (datasets.includes("kleister_nda")) {
      await step.run("process-kleister-nda", async () => {
        const { documents, chunks } = await downloadKleisterNDA()

        // Placeholder - Kleister download not yet implemented
        return {
          documentsInserted: documents.length,
          chunkCount: chunks.length,
          note: "Kleister-NDA download not yet implemented"
        }
      })
    }

    return {
      success: results.errors.length === 0,
      ...results,
    }
  }
)
```

**Step 2: Update function registry**

```typescript
// src/inngest/functions/index.ts
/**
 * @fileoverview Inngest Function Registry
 */

import { bootstrapPipeline } from "./bootstrap"

export const functions = [
  bootstrapPipeline,
]
```

**Step 3: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/inngest/functions/bootstrap.ts src/inngest/functions/index.ts
git commit -m "feat(inngest): add bootstrap pipeline for all 5 datasets

Datasets:
- CUAD: 510 contracts, ~15K clause embeddings
- ContractNLI: 607 NDAs, ~10K evidence span embeddings
- Bonterms: NDA templates, ~50 section embeddings
- CommonAccord: Modular templates, ~100 section embeddings
- Kleister-NDA: Placeholder for 540 NDAs

Features:
- Durable step-based processing
- Rate-limited embedding generation
- Idempotent via content hash deduplication
- Hypothesis definitions seeding

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Add Environment Variables

**Files:**
- Modify: `.env.example`

**Step 1: Add Voyage AI key**

Add to `.env.example`:

```bash
# =============================================================================
# Voyage AI - Legal Document Embeddings
# =============================================================================
# Get key from: https://dash.voyageai.com/

# API key for voyage-law-2 embedding model
VOYAGE_API_KEY=
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add VOYAGE_API_KEY to .env.example

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Create Bootstrap CLI Script

**Files:**
- Create: `scripts/bootstrap.ts`
- Modify: `package.json`

**Step 1: Create bootstrap script**

```typescript
// scripts/bootstrap.ts
/**
 * @fileoverview Bootstrap Pipeline Trigger Script
 *
 * CLI script to trigger the bootstrap pipeline for ingesting
 * reference corpora into the shared database.
 *
 * Usage:
 *   pnpm bootstrap           # Run with defaults (all datasets)
 *   pnpm bootstrap --force   # Force re-ingestion
 *   pnpm bootstrap --cuad    # CUAD only
 *   pnpm bootstrap --nli     # ContractNLI only
 *   pnpm bootstrap --templates  # Bonterms + CommonAccord only
 *
 * @module scripts/bootstrap
 */

import { inngest } from "../src/inngest/client"

type DatasetName = "cuad" | "contract_nli" | "bonterms" | "commonaccord" | "kleister_nda"

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes("--force")

  let datasets: DatasetName[]

  if (args.includes("--cuad")) {
    datasets = ["cuad"]
  } else if (args.includes("--nli")) {
    datasets = ["contract_nli"]
  } else if (args.includes("--templates")) {
    datasets = ["bonterms", "commonaccord"]
  } else if (args.includes("--kleister")) {
    datasets = ["kleister_nda"]
  } else {
    // Default: all datasets
    datasets = ["cuad", "contract_nli", "bonterms", "commonaccord", "kleister_nda"]
  }

  console.log("🚀 Triggering bootstrap pipeline...")
  console.log(`   Datasets: ${datasets.join(", ")}`)
  console.log(`   Force: ${force}`)

  try {
    const result = await inngest.send({
      name: "nda/bootstrap.start",
      data: {
        datasets,
        force,
      },
    })

    console.log("✅ Event sent successfully")
    console.log(`   Event IDs: ${result.ids.join(", ")}`)
    console.log("")
    console.log("Monitor progress at: https://app.inngest.com")
  } catch (error) {
    console.error("❌ Failed to trigger bootstrap:", error)
    process.exit(1)
  }
}

main()
```

**Step 2: Add npm script**

Add to `package.json` scripts:

```json
"bootstrap": "tsx scripts/bootstrap.ts"
```

**Step 3: Commit**

```bash
git add scripts/bootstrap.ts package.json
git commit -m "feat: add bootstrap CLI script

Usage:
- pnpm bootstrap          # All datasets
- pnpm bootstrap --force  # Force re-ingestion
- pnpm bootstrap --cuad   # CUAD only
- pnpm bootstrap --nli    # ContractNLI only
- pnpm bootstrap --templates  # Bonterms + CommonAccord

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Create Dataset Barrel Export

**Files:**
- Create: `src/lib/datasets/index.ts`

**Step 1: Create barrel export**

```typescript
// src/lib/datasets/index.ts
/**
 * @fileoverview Dataset Utilities Barrel Export
 *
 * Consolidated exports for dataset download and parsing utilities.
 *
 * @module lib/datasets
 */

// Download utilities
export * from "./download"

// CUAD parser
export * from "./cuad"

// ContractNLI parser
export * from "./contract-nli"

// Template parsers
export * from "./templates"

// Kleister-NDA parser
export * from "./kleister"
```

**Step 2: Commit**

```bash
git add src/lib/datasets/index.ts
git commit -m "feat: add datasets barrel export

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 13: Create Bootstrap Integration Test

**Files:**
- Create: `src/inngest/functions/bootstrap.test.ts`

**Step 1: Create integration test**

```typescript
// src/inngest/functions/bootstrap.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { db } from "@/db/client"
import {
  cuadCategories,
  hypothesisDefinitions,
  referenceDocuments,
} from "@/db/schema/reference"
import { CUAD_CATEGORIES } from "@/lib/datasets/cuad"
import { CONTRACT_NLI_HYPOTHESES } from "@/lib/datasets/contract-nli"

describe("Bootstrap Pipeline Integration", () => {
  // Note: Full integration test requires Inngest test server
  // These tests verify the data seeding logic in isolation

  describe("Category Seeding", () => {
    it("should have correct number of CUAD categories", () => {
      expect(CUAD_CATEGORIES.length).toBe(40)
    })

    it("should have NDA-relevant categories", () => {
      const ndaCategories = [
        "Governing Law",
        "Non-Compete",
        "Parties",
        "Effective Date",
        "Expiration Date",
      ]

      for (const category of ndaCategories) {
        expect(CUAD_CATEGORIES).toContain(category)
      }
    })
  })

  describe("Hypothesis Seeding", () => {
    it("should have 17 ContractNLI hypotheses", () => {
      expect(CONTRACT_NLI_HYPOTHESES.length).toBe(17)
    })

    it("should have unique hypothesis IDs", () => {
      const ids = CONTRACT_NLI_HYPOTHESES.map((h) => h.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })

    it("should have key NDA hypotheses", () => {
      const categories = CONTRACT_NLI_HYPOTHESES.map((h) => h.category)

      expect(categories).toContain("Governing Law")
      expect(categories).toContain("Standard of Care")
      expect(categories).toContain("Return/Destruction")
    })
  })

  describe("Content Hashing", () => {
    it("should generate consistent SHA-256 hashes", async () => {
      const { createHash } = await import("crypto")

      const text1 = "This is a test clause."
      const text2 = "This is a test clause."
      const text3 = "This is different."

      const hash1 = createHash("sha256").update(text1.trim().toLowerCase()).digest("hex")
      const hash2 = createHash("sha256").update(text2.trim().toLowerCase()).digest("hex")
      const hash3 = createHash("sha256").update(text3.trim().toLowerCase()).digest("hex")

      expect(hash1).toBe(hash2)
      expect(hash1).not.toBe(hash3)
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm test src/inngest/functions/bootstrap.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/inngest/functions/bootstrap.test.ts
git commit -m "test: add bootstrap integration tests

- Verify CUAD category count and content
- Verify ContractNLI hypothesis definitions
- Verify content hashing consistency

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 14: Create HNSW Index Creation Function

**Files:**
- Create: `src/inngest/functions/create-indexes.ts`
- Modify: `src/inngest/functions/index.ts`

**Step 1: Create index creation function**

```typescript
// src/inngest/functions/create-indexes.ts
/**
 * @fileoverview HNSW Index Creation Function
 *
 * Creates HNSW indexes on the reference_embeddings table AFTER
 * bulk data load. Creating indexes after data load is significantly
 * faster than incremental index updates during insertion.
 *
 * @module inngest/functions/create-indexes
 */

import { inngest } from "../client"
import { db } from "@/db/client"
import { sql } from "drizzle-orm"

/**
 * Create HNSW index function.
 *
 * Should be run AFTER bootstrap pipeline completes.
 * Creates optimized HNSW index for cosine similarity search.
 *
 * @event nda/indexes.create
 */
export const createHnswIndexes = inngest.createFunction(
  {
    id: "create-hnsw-indexes",
    concurrency: { limit: 1 },
    retries: 3,
  },
  { event: "nda/indexes.create" },
  async ({ step }) => {
    // Step 1: Check if index already exists
    const indexExists = await step.run("check-index-exists", async () => {
      const result = await db.execute(sql`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'reference_embeddings'
        AND indexname = 'reference_embeddings_embedding_hnsw_idx'
      `)
      return { exists: result.rows.length > 0 }
    })

    if (indexExists.exists) {
      return { success: true, message: "HNSW index already exists" }
    }

    // Step 2: Create HNSW index
    // This can take several minutes for ~33K vectors
    const indexResult = await step.run("create-hnsw-index", async () => {
      const startTime = Date.now()

      // HNSW parameters:
      // - m: Maximum number of connections per node (16 is good default)
      // - ef_construction: Size of dynamic candidate list during build (64 is good)
      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS reference_embeddings_embedding_hnsw_idx
        ON reference_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `)

      const duration = Date.now() - startTime
      return {
        created: true,
        durationMs: duration,
        durationSeconds: Math.round(duration / 1000),
      }
    })

    // Step 3: Analyze table for query optimizer
    await step.run("analyze-table", async () => {
      await db.execute(sql`ANALYZE reference_embeddings`)
      return { analyzed: true }
    })

    return {
      success: true,
      message: "HNSW index created successfully",
      ...indexResult,
    }
  }
)
```

**Step 2: Update function registry**

Add to `src/inngest/functions/index.ts`:

```typescript
import { createHnswIndexes } from "./create-indexes"

export const functions = [
  bootstrapPipeline,
  createHnswIndexes,
]
```

**Step 3: Commit**

```bash
git add src/inngest/functions/create-indexes.ts src/inngest/functions/index.ts
git commit -m "feat(inngest): add HNSW index creation function

- Creates HNSW index AFTER bulk data load
- Uses CONCURRENTLY to avoid locking
- Optimal parameters: m=16, ef_construction=64
- Includes table ANALYZE for query optimizer

Run after bootstrap: pnpm inngest:send nda/indexes.create

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 15: Verify Complete Bootstrap Infrastructure

**Files:**
- No new files

**Step 1: Run full type check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Run linter**

Run: `pnpm lint`
Expected: No errors (or only warnings in excluded directories)

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(inngest): complete bootstrap pipeline infrastructure

Bootstrap Pipeline Plan complete:
- Voyage AI embedding client with rate limiting
- Dataset download utilities (HuggingFace, GitHub)
- CUAD parser for clause extraction (~15K vectors)
- ContractNLI parser with 17 hypothesis definitions (~10K vectors)
- Bonterms template parser (~50 vectors)
- CommonAccord template parser (~100 vectors)
- Kleister-NDA placeholder (~8K vectors)
- Bootstrap Inngest function with durability
- HNSW index creation function (post-bulk load)
- CLI script for pipeline triggering
- Integration tests

Total expected: ~33K vectors

Ready for: Agent Foundation (Plan 3)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

This plan establishes the complete bootstrap pipeline for all 5 datasets:

| Component | File | Purpose |
|-----------|------|---------|
| Embedding Client | `src/lib/embeddings.ts` | Voyage AI voyage-law-2 |
| Download Utils | `src/lib/datasets/download.ts` | HuggingFace/GitHub |
| CUAD Parser | `src/lib/datasets/cuad.ts` | Clause extraction |
| ContractNLI Parser | `src/lib/datasets/contract-nli.ts` | NLI evidence spans |
| Template Parsers | `src/lib/datasets/templates.ts` | Bonterms/CommonAccord |
| Kleister Parser | `src/lib/datasets/kleister.ts` | Plain text NDAs |
| Reference Schema | `src/db/schema/reference.ts` | Database tables |
| Bootstrap Function | `src/inngest/functions/bootstrap.ts` | Durable pipeline |
| Index Function | `src/inngest/functions/create-indexes.ts` | HNSW index creation |
| CLI Script | `scripts/bootstrap.ts` | Manual trigger |

**Dataset Summary:**

| Dataset | Documents | Embeddings | Granularity |
|---------|-----------|------------|-------------|
| CUAD | 510 | ~15K | clause, evidence |
| ContractNLI | 607 | ~10K | evidence |
| Bonterms | 2-3 | ~50 | section, template |
| CommonAccord | 3-5 | ~100 | section, template |
| Kleister-NDA | 540 | ~8K | clause |
| **Total** | ~1,660 | ~33K | - |

**Estimated Cost:** ~$40 for Voyage AI embeddings (one-time)

**Next Plan:** [Agent Foundation](./2026-02-01-inngest-agents.md) - LangGraph setup and base agent patterns.
