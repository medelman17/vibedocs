import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runParserAgent, type ParserInput } from './parser'

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
    expect(result.document.rawText).toBeDefined()
    expect(result.document.structure).toBeDefined()
    expect(result.quality).toBeDefined()
    expect(result.quality.confidence).toBeGreaterThan(0)
    // Parser no longer produces chunks or embeddings
    expect('chunks' in result.document).toBe(false)
    expect('tokenUsage' in result).toBe(false)
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
    expect(result.document.structure).toBeDefined()
    expect(result.quality.confidence).toBe(1.0) // Word provides clean text
  })

  it('returns quality metrics from extraction', async () => {
    const input: ParserInput = {
      documentId: 'doc-123',
      tenantId: 'tenant-456',
      source: 'web',
    }

    const result = await runParserAgent(input)

    expect(result.quality).toBeDefined()
    expect(result.quality.charCount).toBeGreaterThan(0)
    expect(result.quality.wordCount).toBeGreaterThan(0)
    expect(result.quality.confidence).toBeGreaterThan(0)
  })

  it('sets isOcr flag for OCR source', async () => {
    const input: ParserInput = {
      documentId: 'doc-ocr',
      tenantId: 'tenant-456',
      source: 'ocr',
      ocrText: 'OCR extracted text from scanned document.',
      ocrConfidence: 75,
    }

    const result = await runParserAgent(input)

    expect(result.quality.isOcr).toBe(true)
    expect(result.quality.confidence).toBe(75)
    expect(result.quality.warnings.length).toBeGreaterThan(0)
  })
})
