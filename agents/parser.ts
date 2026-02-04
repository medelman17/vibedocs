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

import {
  extractText,
  chunkDocument,
  type DocumentChunk,
} from '@/lib/document-processing'
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
  }
  tokenUsage: {
    embeddingTokens: number
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

  if (source === 'web' || source === 'web-upload') {
    // Fetch document from database to get blob URL
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    })

    if (!doc?.fileUrl) {
      throw new NotFoundError(`Document ${documentId} not found or has no file URL`)
    }

    // Download from Vercel Blob URL directly
    const response = await fetch(doc.fileUrl)
    if (!response.ok) {
      throw new InternalError(`Failed to download document: ${response.statusText}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType = response.headers.get('content-type') ?? 'application/pdf'
    const extracted = await extractText(buffer, contentType)

    rawText = extracted.text
    title = doc.title ?? 'Untitled'
  } else {
    // Word Add-in: use provided content
    if (!content) {
      throw new ValidationError('Word Add-in source requires content')
    }
    rawText = content.rawText
    title = metadata?.title ?? 'Untitled'
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
    },
    tokenUsage: {
      embeddingTokens: embeddingResult.totalTokens,
    },
  }
}
