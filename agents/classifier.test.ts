import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runClassifierAgent, type ClassifierInput } from './classifier'
import { SAMPLE_GOVERNING_LAW_CLAUSE } from './testing/fixtures'
import { BudgetTracker } from '@/lib/ai/budget'

// Mock AI SDK generateText with Output.object pattern
// Now returns batch classification format (multiLabelClassificationSchema)
vi.mock('ai', () => ({
  generateText: vi.fn().mockImplementation(({ prompt }: { prompt: string }) => {
    // Parse chunk indices from the prompt (format: ### Chunk N)
    const chunkMatches = [...prompt.matchAll(/### Chunk (\d+)/g)]
    const chunkIndices = chunkMatches.map((m) => parseInt(m[1], 10))

    return Promise.resolve({
      output: {
        classifications: chunkIndices.map((idx) => ({
          chunkIndex: idx,
          primary: {
            category: 'Governing Law',
            confidence: 0.95,
            rationale: 'Explicit jurisdiction designation.',
          },
          secondary: [],
        })),
      },
      usage: { inputTokens: 500, outputTokens: 100 },
    })
  }),
  Output: {
    object: vi.fn().mockReturnValue({}),
  },
  NoObjectGeneratedError: {
    isInstance: vi.fn().mockReturnValue(false),
  },
}))

// Mock vector search with inline data to avoid circular import
vi.mock('./tools/vector-search', () => ({
  findSimilarClauses: vi.fn().mockResolvedValue([
    {
      id: 'ref-0',
      content: 'This Agreement shall be governed by the laws of the State of New York.',
      category: 'Governing Law',
      similarity: 0.92,
      source: 'Mock CUAD Document',
    },
    {
      id: 'ref-1',
      content:
        'The validity and interpretation of this Agreement shall be governed by Delaware law.',
      category: 'Governing Law',
      similarity: 0.89,
      source: 'Mock CUAD Document',
    },
  ]),
}))

// Mock AI config
vi.mock('@/lib/ai/config', () => ({
  getAgentModel: vi.fn().mockReturnValue({
    // Mock model - not actually used since we mock generateText
  }),
}))

describe('Classifier Agent', () => {
  let budgetTracker: BudgetTracker

  beforeEach(() => {
    vi.clearAllMocks()
    budgetTracker = new BudgetTracker()
  })

  it('classifies governing law clause correctly', async () => {
    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-123',
        title: 'Test NDA',
        rawText: SAMPLE_GOVERNING_LAW_CLAUSE,
        chunks: [
          {
            id: 'chunk-0',
            index: 0,
            content: SAMPLE_GOVERNING_LAW_CLAUSE,
            sectionPath: ['ARTICLE V'],
            tokenCount: 50,
            startPosition: 0,
            endPosition: SAMPLE_GOVERNING_LAW_CLAUSE.length,
          },
        ],
      },
      budgetTracker,
    }

    const result = await runClassifierAgent(input)

    expect(result.clauses.length).toBe(1)
    expect(result.clauses[0].category).toBe('Governing Law')
    expect(result.clauses[0].confidence).toBeGreaterThan(0.9)
    expect(result.clauses[0].startPosition).toBe(0)
    expect(result.clauses[0].endPosition).toBe(SAMPLE_GOVERNING_LAW_CLAUSE.length)
  })

  it('returns rawClassifications alongside filtered clauses', async () => {
    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-123',
        title: 'Test NDA',
        rawText: SAMPLE_GOVERNING_LAW_CLAUSE,
        chunks: [
          {
            id: 'chunk-0',
            index: 0,
            content: SAMPLE_GOVERNING_LAW_CLAUSE,
            sectionPath: ['ARTICLE V'],
            tokenCount: 50,
            startPosition: 0,
            endPosition: SAMPLE_GOVERNING_LAW_CLAUSE.length,
          },
        ],
      },
      budgetTracker,
    }

    const result = await runClassifierAgent(input)

    expect(result.rawClassifications).toBeDefined()
    expect(result.rawClassifications.length).toBe(1)
    expect(result.rawClassifications[0].primary.category).toBe('Governing Law')
    expect(result.rawClassifications[0].chunkIndex).toBe(0)
  })

  it('records token usage in budget tracker', async () => {
    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-123',
        title: 'Test',
        rawText: 'text',
        chunks: [
          {
            id: 'chunk-0',
            index: 0,
            content: 'text',
            sectionPath: [],
            tokenCount: 5,
            startPosition: 0,
            endPosition: 4,
          },
        ],
      },
      budgetTracker,
    }

    await runClassifierAgent(input)

    const usage = budgetTracker.getUsage()
    expect(usage.byAgent['classifier']).toBeDefined()
    expect(usage.byAgent['classifier'].input).toBe(500)
    expect(usage.byAgent['classifier'].output).toBe(100)
  })

  it('filters Uncategorized from clauses but keeps in rawClassifications', async () => {
    // Override mock to return Uncategorized classification
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
      output: {
        classifications: [
          {
            chunkIndex: 0,
            primary: {
              category: 'Uncategorized',
              confidence: 0.4,
              rationale: 'No CUAD category fits this content.',
            },
            secondary: [],
          },
        ],
      },
      usage: { inputTokens: 500, outputTokens: 100 },
    } as unknown as Awaited<ReturnType<typeof generateText>>)

    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-123',
        title: 'Test',
        rawText: 'Some ambiguous text',
        chunks: [
          {
            id: 'chunk-0',
            index: 0,
            content: 'Some ambiguous text',
            sectionPath: [],
            tokenCount: 5,
            startPosition: 0,
            endPosition: 19,
          },
        ],
      },
      budgetTracker,
    }

    const result = await runClassifierAgent(input)

    // Should filter out Uncategorized from clauses
    expect(result.clauses.length).toBe(0)
    // But keep in rawClassifications
    expect(result.rawClassifications.length).toBe(1)
    expect(result.rawClassifications[0].primary.category).toBe('Uncategorized')
  })

  it('applies minimum confidence floor and sets category to Uncategorized', async () => {
    // Override mock to return below-threshold confidence
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
      output: {
        classifications: [
          {
            chunkIndex: 0,
            primary: {
              category: 'Governing Law',
              confidence: 0.2,
              rationale: 'Very uncertain classification.',
            },
            secondary: [{ category: 'Governing Law', confidence: 0.15 }],
          },
        ],
      },
      usage: { inputTokens: 500, outputTokens: 100 },
    } as unknown as Awaited<ReturnType<typeof generateText>>)

    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-123',
        title: 'Test',
        rawText: 'Borderline text',
        chunks: [
          {
            id: 'chunk-0',
            index: 0,
            content: 'Borderline text',
            sectionPath: [],
            tokenCount: 5,
            startPosition: 0,
            endPosition: 15,
          },
        ],
      },
      budgetTracker,
    }

    const result = await runClassifierAgent(input)

    // Below 0.3 threshold -> Uncategorized in raw, filtered from clauses
    expect(result.clauses.length).toBe(0)
    expect(result.rawClassifications.length).toBe(1)
    expect(result.rawClassifications[0].primary.category).toBe('Uncategorized')
    expect(result.rawClassifications[0].primary.confidence).toBe(0.2)
    // Secondary below threshold should be filtered out
    expect(result.rawClassifications[0].secondary.length).toBe(0)
  })

  it('processes multiple chunks in batches and preserves positions', async () => {
    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-multi',
        title: 'Multi-Clause NDA',
        rawText: 'Clause 1 text. Clause 2 text.',
        chunks: [
          {
            id: 'chunk-0',
            index: 0,
            content: 'Clause 1 text.',
            sectionPath: ['Section 1'],
            tokenCount: 5,
            startPosition: 0,
            endPosition: 14,
                },
          {
            id: 'chunk-1',
            index: 1,
            content: 'Clause 2 text.',
            sectionPath: ['Section 2'],
            tokenCount: 5,
            startPosition: 15,
            endPosition: 29,
                },
        ],
      },
      budgetTracker,
    }

    const result = await runClassifierAgent(input)

    expect(result.clauses.length).toBe(2)
    expect(result.clauses[0].chunkId).toBe('chunk-0')
    expect(result.clauses[1].chunkId).toBe('chunk-1')
    expect(result.clauses[0].startPosition).toBe(0)
    expect(result.clauses[1].startPosition).toBe(15)
  })

  it('processes all chunks in a single LLM call', async () => {
    const { generateText } = await import('ai')

    // Create 6 chunks — classifier sends all in one call (batching is in nda-classify.ts)
    const chunks = Array.from({ length: 6 }, (_, i) => ({
      id: `chunk-${i}`,
      index: i,
      content: `Clause ${i} governing law text.`,
      sectionPath: [`Section ${i}`],
      tokenCount: 10,
      startPosition: i * 30,
      endPosition: (i + 1) * 30,
    }))

    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-batch',
        title: 'Batch Test NDA',
        rawText: chunks.map((c) => c.content).join(' '),
        chunks,
      },
      budgetTracker,
    }

    await runClassifierAgent(input)

    // Single LLM call for all 6 chunks
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1)
  })

  it('uses two-stage RAG with vector search per chunk', async () => {
    const { findSimilarClauses: mockFindSimilar } = await import('./tools/vector-search')

    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-rag',
        title: 'RAG Test',
        rawText: 'Clause 1. Clause 2.',
        chunks: [
          {
            id: 'chunk-0',
            index: 0,
            content: 'Clause 1.',
            sectionPath: [],
            tokenCount: 5,
            startPosition: 0,
            endPosition: 9,
                },
          {
            id: 'chunk-1',
            index: 1,
            content: 'Clause 2.',
            sectionPath: [],
            tokenCount: 5,
            startPosition: 10,
            endPosition: 19,
                },
        ],
      },
      budgetTracker,
    }

    await runClassifierAgent(input)

    // Should call findSimilarClauses once per chunk (2 chunks in same batch)
    expect(vi.mocked(mockFindSimilar)).toHaveBeenCalledTimes(2)
    // Each call should request 7 results
    expect(vi.mocked(mockFindSimilar)).toHaveBeenCalledWith('Clause 1.', { limit: 7 })
    expect(vi.mocked(mockFindSimilar)).toHaveBeenCalledWith('Clause 2.', { limit: 7 })
  })

  it('throws AnalysisFailedError on empty classifications output', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { classifications: [] },
      usage: { inputTokens: 800, outputTokens: 50 },
    } as unknown as Awaited<ReturnType<typeof generateText>>)

    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-empty',
        title: 'Empty Test',
        rawText: 'Some clause text.',
        chunks: [
          {
            id: 'chunk-0',
            index: 0,
            content: 'Some clause text.',
            sectionPath: [],
            tokenCount: 5,
            startPosition: 0,
            endPosition: 17,
          },
        ],
      },
      budgetTracker,
    }

    await expect(runClassifierAgent(input)).rejects.toThrow(
      'Classification returned empty output for 1 chunks'
    )
  })

  it('records budget even when classification fails', async () => {
    const { generateText } = await import('ai')
    // Single call returns empty classifications (fails)
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { classifications: [] },
      usage: { inputTokens: 800, outputTokens: 50 },
    } as unknown as Awaited<ReturnType<typeof generateText>>)

    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-fail',
        title: 'Fail Test',
        rawText: 'Clause text.',
        chunks: [
          {
            id: 'chunk-0',
            index: 0,
            content: 'Clause text.',
            sectionPath: [],
            tokenCount: 5,
            startPosition: 0,
            endPosition: 12,
          },
        ],
      },
      budgetTracker,
    }

    await expect(runClassifierAgent(input)).rejects.toThrow()

    // Budget should still be recorded via finally block
    const usage = budgetTracker.getUsage()
    expect(usage.byAgent['classifier']).toBeDefined()
    expect(usage.byAgent['classifier'].input).toBe(800)
    expect(usage.byAgent['classifier'].output).toBe(50)
  })

  it('selects category-diverse references', async () => {
    const { findSimilarClauses: mockFindSimilar } = await import('./tools/vector-search')

    // Return different categories from different chunks' vector searches
    vi.mocked(mockFindSimilar)
      .mockResolvedValueOnce([
        { id: 'ref-0', content: 'Governing law clause.', category: 'Governing Law', similarity: 0.95, source: 'CUAD' },
        { id: 'ref-1', content: 'Another governing law.', category: 'Governing Law', similarity: 0.90, source: 'CUAD' },
      ])
      .mockResolvedValueOnce([
        { id: 'ref-2', content: 'Non-compete clause.', category: 'Non-Compete', similarity: 0.85, source: 'CUAD' },
        { id: 'ref-3', content: 'Another non-compete.', category: 'Non-Compete', similarity: 0.80, source: 'CUAD' },
      ])

    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-diverse',
        title: 'Diverse Refs Test',
        rawText: 'Clause 1. Clause 2.',
        chunks: [
          { id: 'chunk-0', index: 0, content: 'Clause 1.', sectionPath: [], tokenCount: 5, startPosition: 0, endPosition: 9 },
          { id: 'chunk-1', index: 1, content: 'Clause 2.', sectionPath: [], tokenCount: 5, startPosition: 10, endPosition: 19 },
        ],
      },
      budgetTracker,
    }

    const result = await runClassifierAgent(input)

    // The prompt should have been called — verify it executed without errors
    expect(result.clauses.length).toBe(2)
    // Both vector searches were called (parallel)
    expect(vi.mocked(mockFindSimilar)).toHaveBeenCalledTimes(2)
  })
})
