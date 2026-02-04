/**
 * @fileoverview Parser Agent
 *
 * First stage of the NDA analysis pipeline. Extracts text from documents,
 * chunks the content with section detection, and generates embeddings.
 *
 * Supports two source types:
 * - `web`: Downloads document from Vercel Blob storage
 * - `word-addin`: Uses text content provided directly from Word Add-in
 *
 * @module agents/parser
 */

import { chunkDocument, type DocumentChunk } from '@/lib/document-processing'
import {
  extractDocument,
  detectStructure,
  type DocumentStructure,
} from '@/lib/document-extraction'
import { getVoyageAIClient } from '@/lib/embeddings'
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
  source: 'web' | 'web-upload' | 'word-addin'
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
}

export interface ParsedChunk extends DocumentChunk {
  embedding: number[]
}

export interface ParserOutput {
  document: {
    documentId: string
    title: string
    rawText: string
    chunks: ParsedChunk[]
    structure: DocumentStructure
  }
  tokenUsage: {
    embeddingTokens: number
  }
  quality: {
    charCount: number
    wordCount: number
    pageCount: number
    confidence: number
    warnings: string[]
  }
}

// ============================================================================
// Parser Agent
// ============================================================================

/**
 * Runs the parser agent to extract and chunk document content.
 *
 * For web sources, downloads from Vercel Blob and extracts text.
 * For word-addin sources, uses the provided content directly.
 *
 * @param input - Parser input configuration
 * @returns Parsed document with embedded chunks
 */
export async function runParserAgent(input: ParserInput): Promise<ParserOutput> {
  const { documentId, source, content, metadata } = input

  let rawText: string
  let title: string
  let structure: DocumentStructure
  let quality: ParserOutput['quality']

  if (source === 'web' || source === 'web-upload') {
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

  // Chunk with section detection and position tracking
  const baseChunks = chunkDocument(rawText, { maxTokens: 500, overlap: 50 })

  // Generate embeddings in batches
  const voyageClient = getVoyageAIClient()
  const texts = baseChunks.map((c) => c.content)
  const embeddingResult = await voyageClient.embedBatch(texts, 'document')

  // Combine chunks with embeddings
  const chunks: ParsedChunk[] = baseChunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddingResult.embeddings[i],
  }))

  return {
    document: {
      documentId,
      title,
      rawText,
      chunks,
      structure,
    },
    tokenUsage: {
      embeddingTokens: embeddingResult.totalTokens,
    },
    quality,
  }
}
