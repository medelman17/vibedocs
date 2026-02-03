import { vi } from 'vitest'

/** Usage options - accepts both AI SDK naming and common aliases */
interface UsageOptions {
  promptTokens?: number
  completionTokens?: number
  // Aliases for convenience
  inputTokens?: number
  outputTokens?: number
}

function normalizeUsage(usage?: UsageOptions) {
  return {
    promptTokens: usage?.promptTokens ?? usage?.inputTokens ?? 100,
    completionTokens: usage?.completionTokens ?? usage?.outputTokens ?? 50,
  }
}

/** Mock generateObject response */
export function mockGenerateObject<T>(
  response: T,
  usage?: UsageOptions
) {
  return vi.fn().mockResolvedValue({
    object: response,
    usage: normalizeUsage(usage),
    finishReason: 'stop',
  })
}

/** Mock generateText response */
export function mockGenerateText(
  text: string,
  usage?: UsageOptions
) {
  return vi.fn().mockResolvedValue({
    text,
    usage: normalizeUsage(usage),
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
