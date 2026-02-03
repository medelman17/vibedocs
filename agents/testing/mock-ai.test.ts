import { describe, it, expect, vi } from 'vitest'
import { mockGenerateObject, mockGenerateText, mockVectorSearch, resetAgentMocks } from './mock-ai'

describe('mockGenerateObject', () => {
  it('returns mock function with expected response', async () => {
    const mockFn = mockGenerateObject({ category: 'Governing Law', confidence: 0.95 })
    const result = await mockFn()
    expect(result.object).toEqual({ category: 'Governing Law', confidence: 0.95 })
    expect(result.usage.promptTokens).toBe(100)
    expect(result.finishReason).toBe('stop')
  })

  it('allows custom token usage', async () => {
    const mockFn = mockGenerateObject({}, { promptTokens: 500, completionTokens: 200 })
    const result = await mockFn()
    expect(result.usage.promptTokens).toBe(500)
    expect(result.usage.completionTokens).toBe(200)
  })
})

describe('mockGenerateText', () => {
  it('returns mock function with expected text', async () => {
    const mockFn = mockGenerateText('This is a legal clause.')
    const result = await mockFn()
    expect(result.text).toBe('This is a legal clause.')
    expect(result.finishReason).toBe('stop')
  })
})

describe('mockVectorSearch', () => {
  it('returns mock function with search results', async () => {
    const mockFn = mockVectorSearch([
      { content: 'Delaware law', category: 'Governing Law', similarity: 0.92 },
    ])
    const result = await mockFn()
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Delaware law')
    expect(result[0].source).toBe('Mock CUAD Document')
  })
})

describe('resetAgentMocks', () => {
  it('clears all mocks without throwing', () => {
    // Create a mock to verify it gets reset
    const mockFn = vi.fn()
    mockFn('test')
    expect(mockFn).toHaveBeenCalled()

    // Reset should clear mock state
    resetAgentMocks()
    expect(mockFn).not.toHaveBeenCalled()
  })
})
