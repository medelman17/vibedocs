import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
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
      vi.spyOn(global, "fetch").mockResolvedValue({
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
