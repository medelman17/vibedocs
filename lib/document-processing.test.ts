import { describe, it, expect, vi } from 'vitest'
import { extractText, chunkDocument } from './document-processing'
import type { ExtractionResult } from '@/lib/document-extraction'

// Note: Testing PDF/DOCX extraction requires actual files or mocking the extractors.
// Mock the new extraction module that document-processing.ts uses.

vi.mock('@/lib/document-extraction', () => ({
  extractPdf: vi.fn().mockResolvedValue({
    text: 'CONFIDENTIALITY AGREEMENT\n\nThis Agreement is entered into...',
    pageCount: 2,
    quality: {
      charCount: 60,
      wordCount: 8,
      pageCount: 2,
      confidence: 0.9,
      warnings: [],
      requiresOcr: false,
    },
    metadata: {},
  } satisfies ExtractionResult),
  extractDocx: vi.fn().mockResolvedValue({
    text: 'Agreement between parties for confidential information exchange.',
    pageCount: 1,
    quality: {
      charCount: 65,
      wordCount: 8,
      pageCount: 1,
      confidence: 0.85,
      warnings: [],
      requiresOcr: false,
    },
    metadata: {},
  } satisfies ExtractionResult),
}))

describe('extractText', () => {
  it('extracts text from PDF buffer', async () => {
    const pdfBuffer = Buffer.from('mock pdf content')
    const result = await extractText(pdfBuffer, 'application/pdf')

    expect(result.text).toContain('CONFIDENTIALITY AGREEMENT')
    expect(result.pageCount).toBeGreaterThan(0)
  })

  it('extracts text from DOCX buffer', async () => {
    const docxBuffer = Buffer.from('mock docx content')
    const result = await extractText(
      docxBuffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

    expect(result.text).toContain('Agreement')
  })

  it('passes through plain text', async () => {
    const textBuffer = Buffer.from('This is plain text content')
    const result = await extractText(textBuffer, 'text/plain')

    expect(result.text).toBe('This is plain text content')
    expect(result.pageCount).toBe(1)
  })
})

describe('chunkDocument', () => {
  it('chunks document with section detection', () => {
    const text = `ARTICLE I - DEFINITIONS
1.1 "Confidential Information" means any information disclosed by one party to another that is designated as confidential or that reasonably should be understood to be confidential.

ARTICLE II - OBLIGATIONS
2.1 The Receiving Party shall hold all Confidential Information in strict confidence and shall not disclose such information to any third party without prior written consent.
2.2 The Receiving Party shall not use the Confidential Information for any purpose other than the Purpose set forth herein.`

    // Use a low token limit to force multiple chunks
    const chunks = chunkDocument(text, { maxTokens: 50 })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].sectionPath).toContain('ARTICLE I - DEFINITIONS')
    expect(chunks[0].startPosition).toBe(0)
    expect(chunks[0].endPosition).toBeGreaterThan(chunks[0].startPosition)
  })

  it('preserves position information for Word Add-in', () => {
    const text = 'First clause. Second clause. Third clause.'
    const chunks = chunkDocument(text, { maxTokens: 50 })

    // Positions should be continuous and non-overlapping
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startPosition).toBeGreaterThanOrEqual(
        chunks[i - 1].endPosition
      )
    }

    // Positions should map back to original text
    chunks.forEach((chunk) => {
      expect(text.slice(chunk.startPosition, chunk.endPosition)).toBe(
        chunk.content
      )
    })
  })

  it('handles single paragraph under token limit', () => {
    const text = 'A short paragraph.'
    const chunks = chunkDocument(text, { maxTokens: 500 })

    expect(chunks.length).toBe(1)
    expect(chunks[0].content).toBe('A short paragraph.')
    expect(chunks[0].startPosition).toBe(0)
    expect(chunks[0].endPosition).toBe(text.length)
  })

  it('includes section path from headers', () => {
    const text = `Section 1. Definitions
The following terms shall have the meanings set forth below.

Section 2. Obligations
The Receiving Party agrees to maintain confidentiality.`

    const chunks = chunkDocument(text, { maxTokens: 100 })

    // Should detect section headers
    const hasSection1 = chunks.some((c) =>
      c.sectionPath.some((s) => s.includes('Section 1'))
    )
    const hasSection2 = chunks.some((c) =>
      c.sectionPath.some((s) => s.includes('Section 2'))
    )

    expect(hasSection1 || hasSection2).toBe(true)
  })
})
