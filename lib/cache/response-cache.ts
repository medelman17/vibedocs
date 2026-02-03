/**
 * Response Cache
 *
 * LRU cache for AI model responses to avoid redundant API calls.
 *
 * Configuration:
 * - TTL: 30 minutes
 * - Max entries: 1,000
 *
 * @status placeholder - implement when agent pipeline is built
 * @see docs/plans/2026-02-01-inngest-agents-foundation.md
 */

import { LRUCache } from "lru-cache"

export interface CachedResponse {
  content: string
  model: string
  cachedAt: number
}

// TODO: Implement response cache when agent pipeline is built
export const responseCache = new LRUCache<string, CachedResponse>({
  max: 1000,
  ttl: 1000 * 60 * 30, // 30 minutes
})

export function getResponseCacheKey(prompt: string, model: string): string {
  // TODO: Implement proper hashing
  return `${model}:${prompt.slice(0, 100)}`
}
