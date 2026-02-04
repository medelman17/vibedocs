import { describe, it, expect } from 'vitest'
import { truncateToTokenBudget } from './truncation'
import type { DocumentChunk } from '@/lib/document-processing'
import { estimateTokens } from './estimation'

// Helper to create test chunks with realistic token counts
function createChunk(
  index: number,
  content: string,
  sectionPath: string[] = []
): DocumentChunk {
  return {
    id: `chunk-${index}`,
    index,
    content,
    tokenCount: estimateTokens(content),
    sectionPath,
    startPosition: index * 100,
    endPosition: index * 100 + content.length,
  }
}

// Helper to create text large enough to trigger truncation
function makeLargeText(wordCount: number): string {
  return 'word '.repeat(wordCount)
}

describe('truncateToTokenBudget', () => {
  it('returns original when within budget', () => {
    const text = 'Hello world'
    const chunks = [createChunk(0, text)]

    const result = truncateToTokenBudget(text, chunks, 1000)

    expect(result.truncated).toBe(false)
    expect(result.text).toBe(text)
    expect(result.chunks).toEqual(chunks)
    expect(result.removedSections).toHaveLength(0)
  })

  it('truncates when original tokens exceed budget', () => {
    // Create text that exceeds budget
    const largeText = makeLargeText(500) // ~500 tokens
    const chunks = [
      createChunk(0, makeLargeText(100), ['Section 1']),
      createChunk(1, makeLargeText(100), ['Section 2']),
      createChunk(2, makeLargeText(100), ['Section 3']),
    ]

    // Budget smaller than original text
    const result = truncateToTokenBudget(largeText, chunks, 100)

    expect(result.truncated).toBe(true)
    expect(result.originalTokens).toBeGreaterThan(100)
  })

  it('includes chunks up to budget limit', () => {
    const largeText = makeLargeText(500) // Exceeds budget
    const chunks = [
      createChunk(0, makeLargeText(50), ['Section 1']),
      createChunk(1, makeLargeText(50), ['Section 2']),
      createChunk(2, makeLargeText(200), ['Section 3']),
    ]

    // Budget allows first two chunks but not third
    const result = truncateToTokenBudget(largeText, chunks, 150)

    expect(result.truncated).toBe(true)
    // First two chunks (~100 tokens) fit, third (~200 tokens) doesn't
    expect(result.chunks.length).toBeLessThanOrEqual(2)
    expect(result.removedSections).toContain('Section 3')
  })

  it('includes at least first chunk even if over budget', () => {
    const largeText = makeLargeText(500) // Large document
    const chunks = [createChunk(0, makeLargeText(200), ['Section 1'])]

    // Budget smaller than first chunk
    const result = truncateToTokenBudget(largeText, chunks, 50)

    expect(result.truncated).toBe(true)
    expect(result.chunks).toHaveLength(1)
  })

  it('handles empty chunks array', () => {
    const largeText = makeLargeText(500)
    const result = truncateToTokenBudget(largeText, [], 100)

    expect(result.truncated).toBe(true)
    expect(result.chunks).toHaveLength(0)
    expect(result.text).toBe('')
    expect(result.truncatedTokens).toBe(0)
  })

  it('deduplicates removed section names', () => {
    const largeText = makeLargeText(500)
    const chunks = [
      createChunk(0, makeLargeText(30), ['Section 1']),
      createChunk(1, makeLargeText(30), ['Section 2']),
      createChunk(2, makeLargeText(30), ['Section 2']), // Same section as chunk 1
      createChunk(3, makeLargeText(30), ['Section 3']),
    ]

    // Budget allows first chunk only
    const result = truncateToTokenBudget(largeText, chunks, 40)

    // Section 2 should appear only once despite being in two removed chunks
    const section2Count = result.removedSections.filter(
      (s) => s === 'Section 2'
    ).length
    expect(section2Count).toBe(1)
  })

  it('builds truncated text from included chunk contents', () => {
    const largeText = makeLargeText(500)
    const chunks = [
      createChunk(0, 'Alpha content'),
      createChunk(1, 'Beta content'),
      createChunk(2, makeLargeText(200)),
    ]

    // Budget allows first two chunks
    const result = truncateToTokenBudget(largeText, chunks, 100)

    // Text should be joined from included chunks
    expect(result.text).toContain('Alpha content')
    expect(result.text).toContain('Beta content')
  })

  it('tracks original and truncated token counts', () => {
    const largeText = makeLargeText(500)
    const chunks = [
      createChunk(0, makeLargeText(50)),
      createChunk(1, makeLargeText(300)),
    ]

    const result = truncateToTokenBudget(largeText, chunks, 100)

    expect(result.originalTokens).toBeGreaterThan(0)
    expect(result.truncatedTokens).toBeLessThanOrEqual(result.originalTokens)
    expect(result.truncated).toBe(true)
  })
})
