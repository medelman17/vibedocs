import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { encode } from 'gpt-tokenizer'
import { ValidationError } from '@/lib/errors'

// ============================================================================
// Types
// ============================================================================

export interface ExtractionResult {
  text: string
  pageCount: number
}

export interface DocumentChunk {
  id: string
  index: number
  content: string
  sectionPath: string[]
  tokenCount: number
  startPosition: number
  endPosition: number
}

export interface ChunkOptions {
  maxTokens?: number
  overlap?: number
}

// ============================================================================
// Text Extraction
// ============================================================================

/**
 * Extracts text from a document buffer based on MIME type.
 * Supports PDF, DOCX, and plain text.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  switch (mimeType) {
    case 'application/pdf': {
      try {
        const pdfParser = new PDFParse({ data: buffer })
        const textResult = await pdfParser.getText()
        return { text: textResult.text, pageCount: textResult.pages.length }
      } catch (error) {
        throw new ValidationError(
          `Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      try {
        const result = await mammoth.extractRawText({ buffer })
        return { text: result.value, pageCount: 1 }
      } catch (error) {
        throw new ValidationError(
          `Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }
    case 'text/plain':
    default:
      return { text: buffer.toString('utf-8'), pageCount: 1 }
  }
}

// ============================================================================
// Document Chunking
// ============================================================================

const SECTION_PATTERNS = [
  /^(ARTICLE\s+[IVX\d]+\s*[-–—]?\s*[A-Z][A-Z\s]*)/im,
  /^(Section\s+\d+(?:\.\d+)?\.?\s*[A-Z]?[a-z]*)/im,
  /^(\d+\.\s+[A-Z])/m,
]

/**
 * Chunks a document into smaller pieces with section detection and position tracking.
 * Positions are preserved for Word Add-in content control insertion.
 */
export function chunkDocument(
  text: string,
  options: ChunkOptions = {}
): DocumentChunk[] {
  const { maxTokens = 500, overlap = 50 } = options
  const chunks: DocumentChunk[] = []
  let currentSection: string[] = []
  let chunkSection: string[] = [] // Section for the current chunk being built
  let chunkIndex = 0

  // Split into paragraphs while tracking positions
  const paragraphs = splitWithPositions(text)

  if (paragraphs.length === 0) {
    return []
  }

  let currentChunk = ''
  let chunkStart = -1

  for (const { text: para, start } of paragraphs) {
    // Check for section headers BEFORE processing the paragraph
    let foundSection: string | null = null
    for (const pattern of SECTION_PATTERNS) {
      const match = para.match(pattern)
      if (match) {
        foundSection = match[1].trim()
        break
      }
    }

    const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + para
    const tokens = encode(potentialChunk).length

    if (tokens > maxTokens && currentChunk) {
      // Save current chunk with its section (before updating to new section)
      chunks.push({
        id: `chunk-${chunkIndex}`,
        index: chunkIndex,
        content: currentChunk,
        sectionPath: [...chunkSection],
        tokenCount: encode(currentChunk).length,
        startPosition: chunkStart,
        endPosition: chunkStart + currentChunk.length,
      })
      chunkIndex++

      // Update section for next chunk if we found a new section header
      if (foundSection) {
        currentSection = [foundSection]
      }

      // Start new chunk with optional overlap for context continuity
      const overlapText = overlap > 0 ? getOverlapText(currentChunk, overlap) : ''
      currentChunk = overlapText + para
      // Note: startPosition tracks the NEW content position, not the overlap
      chunkStart = start
      chunkSection = [...currentSection]
    } else {
      // First paragraph in chunk sets the section
      if (chunkStart === -1) {
        chunkStart = start
        // If this paragraph has a section header, use it
        if (foundSection) {
          currentSection = [foundSection]
        }
        chunkSection = [...currentSection]
      } else if (foundSection) {
        // Update current section for future chunks
        currentSection = [foundSection]
      }
      currentChunk = potentialChunk
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      id: `chunk-${chunkIndex}`,
      index: chunkIndex,
      content: currentChunk,
      sectionPath: [...chunkSection],
      tokenCount: encode(currentChunk).length,
      startPosition: chunkStart,
      endPosition: chunkStart + currentChunk.length,
    })
  }

  return chunks
}

/**
 * Splits text into paragraphs while tracking their positions in the original text.
 *
 * Uses regex to identify paragraph boundaries (single or multiple newlines with content).
 * Preserves the start and end positions of each paragraph for Word Add-in content control insertion.
 *
 * @param text - The full document text to split
 * @returns Array of paragraphs with their text content and position offsets
 */
function splitWithPositions(
  text: string
): Array<{ text: string; start: number; end: number }> {
  const result: Array<{ text: string; start: number; end: number }> = []

  // Split by double newlines (paragraph boundaries)
  const regex = /[^\n]+(\n[^\n]+)*/g
  let match

  while ((match = regex.exec(text)) !== null) {
    const para = match[0].trim()
    if (para) {
      // Find the actual position in the original text
      const start = match.index
      const end = start + match[0].length
      result.push({ text: para, start, end })
    }
  }

  return result
}

/**
 * Gets overlap text from the end of a chunk for context continuity.
 *
 * Extracts approximately N tokens from the end of the previous chunk to prepend
 * to the next chunk. This maintains semantic context across chunk boundaries,
 * which is important for accurate classification of clauses that span multiple chunks.
 *
 * Note: Uses word-based approximation rather than exact token counting for performance.
 * This may result in slightly more or fewer tokens than requested.
 *
 * @param text - The chunk text to extract overlap from
 * @param overlapTokens - Target number of tokens to include (approximate)
 * @returns The overlap text with trailing space, or empty string if overlapTokens is 0
 */
function getOverlapText(text: string, overlapTokens: number): string {
  if (overlapTokens === 0) return ''

  const words = text.split(/\s+/)
  const overlapWords: string[] = []
  let tokens = 0

  for (let i = words.length - 1; i >= 0 && tokens < overlapTokens; i--) {
    overlapWords.unshift(words[i])
    tokens = encode(overlapWords.join(' ')).length
  }

  return overlapWords.join(' ') + ' '
}
