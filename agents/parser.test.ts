import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runParserAgent, type ParserInput } from './parser'

// Mock document processing (chunking only, extraction is now separate)
vi.mock('@/lib/document-processing', () => ({
  chunkDocument: vi.fn().mockReturnValue([
    {
      id: 'chunk-0',
      index: 0,
      content: 'Sample NDA text with confidentiality provisions.',
      sectionPath: [],
      tokenCount: 10,
      startPosition: 0,
      endPosition: 47,
    },
  ]),
}))

// Mock new document extraction infrastructure
vi.mock('@/lib/document-extraction', () => ({
  extractDocument: vi.fn().mockResolvedValue({
    text: 'Sample NDA text with confidentiality provisions.',
    quality: {
      charCount: 48,
      wordCount: 7,
      warnings: [],
      confidence: 0.95,
      requiresOcr: false,
    },
    pageCount: 1,
    metadata: { title: 'Extracted Title' },
  }),
  detectStructure: vi.fn().mockResolvedValue({
    sections: [],
    parties: {},
    hasExhibits: false,
    hasSignatureBlock: false,
    hasRedactedText: false,
  }),
}))

// Mock embeddings client
vi.mock('@/lib/embeddings', () => ({
  getVoyageAIClient: () => ({
    embedBatch: vi.fn().mockResolvedValue({
      embeddings: [[0.1, 0.2, 0.3]],
      totalTokens: 100,
      cacheHits: 0,
    }),
  }),
}))

// Mock global fetch for blob downloads
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  headers: new Headers({ 'content-type': 'application/pdf' }),
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
})
vi.stubGlobal('fetch', mockFetch)

// Mock database
vi.mock('@/db/client', () => ({
  db: {
    query: {
      documents: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'doc-123',
          fileUrl: 'https://blob.vercel-storage.com/test.pdf',
          title: 'Test NDA',
        }),
      },
    },
  },
}))

describe('Parser Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses web source by downloading from blob', async () => {
    const input: ParserInput = {
      documentId: 'doc-123',
      tenantId: 'tenant-456',
      source: 'web',
    }

    const result = await runParserAgent(input)

    expect(result.document.documentId).toBe('doc-123')
    expect(result.document.chunks.length).toBeGreaterThan(0)
    expect(result.document.chunks[0].embedding).toBeDefined()
    expect(result.document.chunks[0].embedding.length).toBe(3) // Mock returns 3 elements
    // New fields from extraction infrastructure
    expect(result.document.structure).toBeDefined()
    expect(result.quality).toBeDefined()
    expect(result.quality.confidence).toBeGreaterThan(0)
  })

  it('parses word-addin source with structured paragraphs', async () => {
    const input: ParserInput = {
      documentId: 'doc-789',
      tenantId: 'tenant-456',
      source: 'word-addin',
      content: {
        rawText: 'ARTICLE I - DEFINITIONS\n1.1 Terms defined herein.',
        paragraphs: [
          { text: 'ARTICLE I - DEFINITIONS', style: 'Heading1', isHeading: true },
          { text: '1.1 Terms defined herein.', style: 'Normal', isHeading: false },
        ],
      },
      metadata: { title: 'Sample NDA' },
    }

    const result = await runParserAgent(input)

    expect(result.document.title).toBe('Sample NDA')
    expect(result.document.rawText).toContain('ARTICLE I')
    expect(result.document.chunks.length).toBeGreaterThan(0)
    // Word Add-in also gets structure detection
    expect(result.document.structure).toBeDefined()
    expect(result.quality.confidence).toBe(1.0) // Word provides clean text
  })

  it('preserves position information through parsing', async () => {
    // The mock already returns position information - verify it passes through
    const input: ParserInput = {
      documentId: 'doc-pos',
      tenantId: 'tenant-456',
      source: 'word-addin',
      content: { rawText: 'First clause. Second clause.', paragraphs: [] },
      metadata: { title: 'Test' },
    }

    const result = await runParserAgent(input)

    // Verify positions are present and make sense
    expect(result.document.chunks[0].startPosition).toBeDefined()
    expect(result.document.chunks[0].endPosition).toBeDefined()
    expect(result.document.chunks[0].endPosition).toBeGreaterThan(
      result.document.chunks[0].startPosition
    )
  })

  it('returns token usage from embedding generation', async () => {
    const input: ParserInput = {
      documentId: 'doc-123',
      tenantId: 'tenant-456',
      source: 'web',
    }

    const result = await runParserAgent(input)

    expect(result.tokenUsage).toBeDefined()
    expect(result.tokenUsage.embeddingTokens).toBeGreaterThan(0)
  })
})
