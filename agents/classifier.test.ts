import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runClassifierAgent, type ClassifierInput } from './classifier'
import { SAMPLE_GOVERNING_LAW_CLAUSE } from './testing/fixtures'
import { BudgetTracker } from '@/lib/ai/budget'

// Mock AI SDK generateObject
vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      category: 'Governing Law',
      secondaryCategories: [],
      confidence: 0.95,
      reasoning: 'Explicit jurisdiction designation.',
    },
    usage: { inputTokens: 500, outputTokens: 100 },
  }),
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
      content: 'The validity and interpretation of this Agreement shall be governed by Delaware law.',
      category: 'Governing Law',
      similarity: 0.89,
      source: 'Mock CUAD Document',
    },
  ]),
}))

// Mock AI config
vi.mock('@/lib/ai/config', () => ({
  getAgentModel: vi.fn().mockReturnValue({
    // Mock model - not actually used since we mock generateObject
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
            embedding: [0.1, 0.2, 0.3],
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
            embedding: [],
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

  it('skips low-confidence Unknown classifications', async () => {
    // Override mock to return low-confidence Unknown
    const { generateObject } = await import('ai')
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        category: 'Unknown',
        secondaryCategories: [],
        confidence: 0.3,
        reasoning: 'Unable to classify',
      },
      usage: { inputTokens: 500, outputTokens: 100 },
    } as unknown as Awaited<ReturnType<typeof generateObject>>)

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
            embedding: [],
          },
        ],
      },
      budgetTracker,
    }

    const result = await runClassifierAgent(input)

    // Should filter out low-confidence Unknown
    expect(result.clauses.length).toBe(0)
  })

  it('processes multiple chunks and preserves positions', async () => {
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
            embedding: [0.1],
          },
          {
            id: 'chunk-1',
            index: 1,
            content: 'Clause 2 text.',
            sectionPath: ['Section 2'],
            tokenCount: 5,
            startPosition: 15,
            endPosition: 29,
            embedding: [0.2],
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
})
