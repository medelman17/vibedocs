import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

// Hoist the mock data so it's available during vi.mock hoisting
const { mockDbResult, mockDocsResult, mockEmbedding, callCount } = vi.hoisted(() => ({
  mockDbResult: [
    {
      id: 'emb-1',
      content: 'This Agreement shall be governed by Delaware law.',
      category: 'Governing Law',
      distance: 0.15,
      documentId: 'doc-1',
    },
  ],
  mockDocsResult: [
    { id: 'doc-1', title: 'Sample NDA' },
  ],
  mockEmbedding: new Array(1024).fill(0.1),
  callCount: { value: 0 },
}))

// Mock the database with a chainable interface that tracks calls
vi.mock('@/db/client', () => {
  const createChainable = () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.from = vi.fn().mockReturnValue(chain)
    chain.where = vi.fn().mockImplementation(() => {
      // Second query (document titles) doesn't use orderBy/limit
      // so return docs result here if already got embeddings
      if (callCount.value > 0) {
        return Promise.resolve(mockDocsResult)
      }
      return chain
    })
    chain.orderBy = vi.fn().mockReturnValue(chain)
    chain.limit = vi.fn().mockImplementation(() => {
      callCount.value++
      return Promise.resolve(mockDbResult)
    })
    return chain
  }
  return { db: createChainable() }
})

// Mock drizzle-orm functions
vi.mock('drizzle-orm', () => ({
  cosineDistance: vi.fn().mockReturnValue('cosine_distance_expr'),
  lt: vi.fn().mockReturnValue('lt_expr'),
  eq: vi.fn().mockReturnValue('eq_expr'),
  and: vi.fn().mockReturnValue('and_expr'),
  sql: Object.assign(vi.fn().mockReturnValue('sql_expr'), {
    join: vi.fn().mockReturnValue('sql_join_expr'),
  }),
}))

// Mock schema
vi.mock('@/db/schema/reference', () => ({
  referenceEmbeddings: {
    id: 'id',
    content: 'content',
    category: 'category',
    embedding: 'embedding',
    documentId: 'documentId',
  },
  referenceDocuments: {
    id: 'id',
    title: 'title',
  },
}))

vi.mock('@/lib/embeddings', () => ({
  getVoyageAIClient: vi.fn().mockReturnValue({
    embed: vi.fn().mockResolvedValue({
      embedding: mockEmbedding,
      tokens: 50,
      fromCache: false,
    }),
  }),
}))

// Import after mocks
import { vectorSearchTool, findSimilarClauses, clearSearchCache } from './vector-search'

describe('vectorSearchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSearchCache()
    callCount.value = 0
  })

  it('has correct description', () => {
    expect(vectorSearchTool.description).toContain('CUAD')
    expect(vectorSearchTool.description).toContain('reference corpus')
  })

  it('defines query, category, and limit in input schema', () => {
    const schema = vectorSearchTool.inputSchema as z.ZodObject<{
      query: z.ZodString
      category: z.ZodOptional<z.ZodString>
      limit: z.ZodDefault<z.ZodNumber>
    }>
    expect(schema.shape.query).toBeDefined()
    expect(schema.shape.category).toBeDefined()
    expect(schema.shape.limit).toBeDefined()
  })
})

describe('findSimilarClauses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSearchCache()
    callCount.value = 0
  })

  it('returns search results', async () => {
    const results = await findSimilarClauses('governing law clause')
    expect(results).toHaveLength(1)
    expect(results[0].category).toBe('Governing Law')
  })

  it('accepts optional category filter', async () => {
    const results = await findSimilarClauses('test query', { category: 'Non-Compete' })
    expect(results).toBeDefined()
  })

  it('accepts optional limit', async () => {
    const results = await findSimilarClauses('test query', { limit: 3 })
    expect(results).toBeDefined()
  })
})
