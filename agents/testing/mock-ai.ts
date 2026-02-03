import { vi } from 'vitest'

/** Mock generateObject response */
export function mockGenerateObject<T>(
  response: T,
  usage?: { promptTokens?: number; completionTokens?: number }
) {
  return vi.fn().mockResolvedValue({
    object: response,
    usage: {
      promptTokens: usage?.promptTokens ?? 100,
      completionTokens: usage?.completionTokens ?? 50,
    },
    finishReason: 'stop',
  })
}

/** Mock generateText response */
export function mockGenerateText(
  text: string,
  usage?: { promptTokens?: number; completionTokens?: number }
) {
  return vi.fn().mockResolvedValue({
    text,
    usage: {
      promptTokens: usage?.promptTokens ?? 100,
      completionTokens: usage?.completionTokens ?? 50,
    },
    finishReason: 'stop',
  })
}

/** Mock vector search results */
export function mockVectorSearch(
  results: Array<{
    content: string
    category: string
    similarity: number
  }>
) {
  return vi.fn().mockResolvedValue(
    results.map((r, i) => ({
      id: `ref-${i}`,
      content: r.content,
      category: r.category,
      similarity: r.similarity,
      source: 'Mock CUAD Document',
    }))
  )
}

/** Reset all mocks */
export function resetAgentMocks() {
  vi.resetAllMocks()
}
