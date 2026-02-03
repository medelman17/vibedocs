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
