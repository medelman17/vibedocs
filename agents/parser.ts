/**
 * @fileoverview Parser Agent
 *
 * First stage of the NDA analysis pipeline. Extracts text from documents
 * and detects document structure. Chunking and embedding are handled as
 * separate Inngest steps downstream.
 *
 * Supports three source types:
 * - `web`: Downloads document from Vercel Blob storage
 * - `word-addin`: Uses text content provided directly from Word Add-in
 * - `ocr`: Uses text that was extracted via OCR processing
 *
 * @module agents/parser
 */

import {
  extractDocument,
  detectStructure,
  type DocumentStructure,
} from '@/lib/document-extraction'
import { db } from '@/db/client'
import { documents } from '@/db/schema/documents'
import { eq } from 'drizzle-orm'
import { NotFoundError, ValidationError, InternalError } from '@/lib/errors'

// ============================================================================
// Types
// ============================================================================

export interface ParserInput {
  documentId: string
  tenantId: string
  source: 'web' | 'web-upload' | 'word-addin' | 'ocr'
  content?: {
    rawText: string
    paragraphs: Array<{
      text: string
      style: string
      isHeading: boolean
    }>
  }
  metadata?: {
    title: string
    author?: string
  }
  /** OCR-extracted text (required when source='ocr') */
  ocrText?: string
  /** OCR confidence score 0-100 (optional, for quality tracking) */
  ocrConfidence?: number
}

export interface ParserOutput {
  document: {
    documentId: string
    title: string
    rawText: string
    structure: DocumentStructure
  }
  quality: {
    charCount: number
    wordCount: number
    pageCount: number
    confidence: number
    warnings: string[]
    isOcr?: boolean
  }
}

// ============================================================================
// Parser Agent
// ============================================================================

/**
 * Runs the parser agent to extract document content and detect structure.
 *
 * For web sources, downloads from Vercel Blob and extracts text.
 * For word-addin sources, uses the provided content directly.
 * For ocr sources, uses text that was extracted via OCR processing.
 *
 * Chunking and embedding are handled as separate Inngest steps downstream.
 *
 * @param input - Parser input configuration
 * @returns Parsed document with structure and quality metrics
 */
export async function runParserAgent(input: ParserInput): Promise<ParserOutput> {
  const { documentId, source, content, metadata, ocrText, ocrConfidence } = input

  let rawText: string
  let title: string
  let structure: DocumentStructure
  let quality: ParserOutput['quality']

  if (source === 'ocr') {
    // OCR: use provided OCR text directly
    if (!ocrText) {
      throw new ValidationError('OCR source requires ocrText')
    }
    rawText = ocrText.normalize('NFC')

    // Get document title from database
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    })
    title = doc?.title ?? metadata?.title ?? 'Untitled'

    // Run structure detection on OCR text
    structure = await detectStructure(rawText)

    // Safely access metadata.pageCount (JSONB type is Record<string, unknown>)
    const docMetadata = doc?.metadata as Record<string, unknown> | undefined
    const pageCount = typeof docMetadata?.pageCount === 'number' ? docMetadata.pageCount : 1

    quality = {
      charCount: rawText.length,
      wordCount: rawText.split(/\s+/).filter(Boolean).length,
      pageCount,
      confidence: ocrConfidence ?? 0.7, // Default to 70% if not provided
      warnings: ocrConfidence && ocrConfidence < 85
        ? ['Document was processed via OCR. Accuracy may vary.']
        : [],
      isOcr: true,
    }
  } else if (source === 'web' || source === 'web-upload') {
    // Fetch document from database to get blob URL
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    })

    if (!doc?.fileUrl) {
      throw new NotFoundError(`Document ${documentId} not found or has no file URL`)
    }

    // Download from Vercel Blob URL
    const response = await fetch(doc.fileUrl)
    if (!response.ok) {
      throw new InternalError(`Failed to download document: ${response.statusText}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType = response.headers.get('content-type') ?? 'application/pdf'

    // Use new extraction with quality metrics
    const extraction = await extractDocument(buffer, contentType, {
      fileSize: doc.fileSize ?? undefined,
    })

    rawText = extraction.text
    title = doc.title ?? extraction.metadata.title ?? 'Untitled'

    // Run structure detection on extracted text
    structure = await detectStructure(rawText)

    quality = {
      charCount: extraction.quality.charCount,
      wordCount: extraction.quality.wordCount,
      pageCount: extraction.pageCount,
      confidence: extraction.quality.confidence,
      warnings: extraction.quality.warnings.map((w) => w.message),
    }
  } else {
    // Word Add-in: use provided content
    if (!content) {
      throw new ValidationError('Word Add-in source requires content')
    }
    rawText = content.rawText.normalize('NFC')
    title = metadata?.title ?? 'Untitled'

    // Still run structure detection on Word Add-in content
    structure = await detectStructure(rawText)

    quality = {
      charCount: rawText.length,
      wordCount: rawText.split(/\s+/).filter(Boolean).length,
      pageCount: 1,
      confidence: 1.0, // Word provides clean text
      warnings: [],
    }
  }

  return {
    document: {
      documentId,
      title,
      rawText,
      structure,
    },
    quality,
  }
}
