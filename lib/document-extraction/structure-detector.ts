/**
 * @fileoverview Legal document structure detection
 *
 * Detects document hierarchy using regex for obvious patterns (ARTICLE, Section)
 * and falls back to LLM for ambiguous documents.
 *
 * @module lib/document-extraction/structure-detector
 */

import { generateObject } from 'ai'
import { z } from 'zod'
import { gateway } from 'ai'
import type {
  DocumentStructure,
  DocumentSection,
  PositionedSection,
  SectionType,
} from './types'

// ============================================================================
// Constants and Patterns
// ============================================================================

/** Regex patterns for obvious legal document headings */
const OBVIOUS_HEADING_PATTERNS = [
  // ARTICLE I - DEFINITIONS, ARTICLE 2: CONFIDENTIALITY
  /^(ARTICLE\s+[IVX\d]+\s*[-–—:]?\s*)([A-Z][A-Z\s,]*)/im,
  // Section 1. Definitions, Section 2.1 Scope
  /^(Section\s+\d+(?:\.\d+)?\.?\s*)([A-Z]?[a-z].*)/im,
  // 1. DEFINITIONS, 2.1 SCOPE
  /^(\d+(?:\.\d+)?\.?\s+)([A-Z][A-Z\s]+)/m,
]

/** Patterns indicating signature blocks to exclude */
const SIGNATURE_PATTERNS = [
  /IN WITNESS WHEREOF/i,
  /EXECUTED as of/i,
  /By:\s*_+/,
  /Signature:/i,
  /Authorized Representative/i,
]

/** Patterns indicating exhibits/schedules to exclude */
const EXHIBIT_PATTERNS = [
  /^EXHIBIT\s+[A-Z\d]/im,
  /^SCHEDULE\s+[A-Z\d]/im,
  /^ATTACHMENT\s+[A-Z\d]/im,
  /^ANNEX\s+[A-Z\d]/im,
]

/** Patterns for redacted text */
const REDACTED_PATTERNS = [
  /\[REDACTED\]/i,
  /\[CONFIDENTIAL\]/i,
  /\*{5,}/, // Multiple asterisks often used for redaction
]

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detects document structure with position tracking.
 *
 * Uses regex for obvious headings (ARTICLE, Section), falls back to LLM
 * for ambiguous documents. Always computes character positions.
 *
 * Per CONTEXT.md: Signature blocks and exhibits are identified but excluded.
 */
export async function detectStructure(
  text: string
): Promise<DocumentStructure> {
  // Check for obvious structure
  const hasObviousHeadings = OBVIOUS_HEADING_PATTERNS.some((p) => p.test(text))

  let sections: DocumentSection[]
  let parties: { disclosing?: string; receiving?: string }

  if (hasObviousHeadings) {
    // Fast path: parse with regex
    const parsed = parseObviousStructure(text)
    sections = parsed.sections
    parties = extractPartiesFromText(text)
  } else {
    // Slow path: use LLM
    const llmResult = await detectStructureWithLlm(text)
    sections = llmResult.sections
    parties = llmResult.parties
  }

  // Compute positions for all sections
  const positionedSections = computePositions(text, sections)

  // Detect exclusions and redactions
  const hasExhibits = EXHIBIT_PATTERNS.some((p) => p.test(text))
  const hasSignatureBlock = SIGNATURE_PATTERNS.some((p) => p.test(text))
  const hasRedactedText = REDACTED_PATTERNS.some((p) => p.test(text))

  return {
    sections: positionedSections,
    parties,
    hasExhibits,
    hasSignatureBlock,
    hasRedactedText,
  }
}

// ============================================================================
// Regex-Based Parsing
// ============================================================================

/**
 * Parses document with obvious legal headings using regex.
 * Exported for testing and direct use when structure is known.
 */
export function parseObviousStructure(text: string): {
  sections: DocumentSection[]
} {
  const sections: DocumentSection[] = []
  const lines = text.split('\n')

  let currentSection: DocumentSection | null = null
  let contentBuffer: string[] = []

  for (const line of lines) {
    // Check for heading patterns
    let matchedHeading = false
    for (const pattern of OBVIOUS_HEADING_PATTERNS) {
      const match = line.match(pattern)
      if (match) {
        // Save previous section
        if (currentSection) {
          currentSection.content = contentBuffer.join('\n').trim()
          sections.push(currentSection)
        }

        // Determine level from pattern
        const level = detectHeadingLevel(match[0])
        const type = detectSectionType(match[0], match[2] || '')

        currentSection = {
          title: match[0].trim(),
          level,
          content: '',
          type,
        }
        contentBuffer = []
        matchedHeading = true
        break
      }
    }

    if (!matchedHeading && currentSection) {
      contentBuffer.push(line)
    }
  }

  // Don't forget last section
  if (currentSection) {
    currentSection.content = contentBuffer.join('\n').trim()
    sections.push(currentSection)
  }

  return { sections }
}

function detectHeadingLevel(heading: string): 1 | 2 | 3 | 4 {
  if (/^ARTICLE/i.test(heading)) return 1
  if (/^Section\s+\d+\./i.test(heading)) return 2
  if (/^Section\s+\d+\.\d+/i.test(heading)) return 3
  if (/^\d+\.\d+\.\d+/i.test(heading)) return 4
  return 2
}

function detectSectionType(heading: string, title: string): SectionType {
  const combined = (heading + ' ' + title).toLowerCase()

  if (/defin/i.test(combined)) return 'definitions'
  if (/exhibit|schedule|attachment|annex/i.test(combined)) return 'exhibit'
  if (/signature|witness|executed/i.test(combined)) return 'signature'
  if (/amendment/i.test(combined)) return 'amendment'
  if (/^article|^section/i.test(heading)) return 'heading'

  return 'clause'
}

// ============================================================================
// LLM-Based Detection
// ============================================================================

const LlmStructureSchema = z.object({
  sections: z.array(
    z.object({
      title: z.string(),
      level: z.number().min(1).max(4),
      content: z.string(),
      type: z.enum([
        'heading',
        'definitions',
        'clause',
        'signature',
        'exhibit',
        'schedule',
        'amendment',
        'cover_letter',
        'other',
      ]),
    })
  ),
  parties: z.object({
    disclosing: z.string().optional(),
    receiving: z.string().optional(),
  }),
})

/**
 * Uses LLM to detect structure when regex patterns don't match.
 * Limited to first 50K chars to avoid token overflow.
 */
async function detectStructureWithLlm(text: string): Promise<{
  sections: DocumentSection[]
  parties: { disclosing?: string; receiving?: string }
}> {
  const truncatedText = text.slice(0, 50_000)

  const result = await generateObject({
    model: gateway('anthropic/claude-sonnet-4'),
    schema: LlmStructureSchema,
    prompt: `Analyze this legal document and extract its structure.

Document:
${truncatedText}

Identify:
1. Document sections with hierarchy levels (1=main article, 2=section, 3=subsection, 4=paragraph)
2. Party names (disclosing party, receiving party) if this is an NDA
3. Mark exhibits, schedules, and signature sections (to exclude from analysis)
4. Mark cover letters or transmittal text (to exclude)

For each section:
- title: The heading text
- level: 1-4 hierarchy depth
- content: The text content of that section
- type: One of heading, definitions, clause, signature, exhibit, schedule, amendment, cover_letter, other

Focus on the main agreement body. Exclude standard boilerplate like "This Agreement is entered into..."`,
    temperature: 0,
  })

  return {
    sections: result.object.sections as DocumentSection[],
    parties: result.object.parties,
  }
}

// ============================================================================
// Position Computation
// ============================================================================

/**
 * Computes character positions for each section in the original text.
 * Per CONTEXT.md: Track start/end character positions for UI highlighting.
 */
function computePositions(
  fullText: string,
  sections: DocumentSection[]
): PositionedSection[] {
  const positioned: PositionedSection[] = []
  let currentOffset = 0
  const sectionPath: string[] = []

  for (const section of sections) {
    // Update section path based on level
    while (sectionPath.length >= section.level) {
      sectionPath.pop()
    }
    sectionPath.push(section.title)

    // Find section in text (search from current position)
    const searchText = section.title.trim()
    const foundAt = fullText.indexOf(searchText, currentOffset)

    if (foundAt >= 0) {
      // Find end of section content
      const contentStart = foundAt + searchText.length
      const contentEnd = section.content
        ? fullText.indexOf(section.content.trim(), contentStart) +
          section.content.trim().length
        : contentStart

      positioned.push({
        ...section,
        startOffset: foundAt,
        endOffset: Math.max(contentEnd, foundAt + searchText.length),
        sectionPath: [...sectionPath],
      })

      currentOffset = positioned[positioned.length - 1].endOffset
    } else {
      // Section not found at expected position - use estimate
      positioned.push({
        ...section,
        startOffset: currentOffset,
        endOffset: currentOffset + section.title.length + section.content.length,
        sectionPath: [...sectionPath],
      })
      currentOffset = positioned[positioned.length - 1].endOffset
    }
  }

  return positioned
}

// ============================================================================
// Party Extraction
// ============================================================================

/**
 * Extracts party names from text using common NDA patterns.
 */
function extractPartiesFromText(text: string): {
  disclosing?: string
  receiving?: string
} {
  const parties: { disclosing?: string; receiving?: string } = {}

  // Common patterns: "ABC Company (the "Disclosing Party")"
  const disclosingMatch = text.match(
    /([A-Z][A-Za-z\s,\.]+(?:Inc|LLC|Corp|Ltd|Company|Corporation)?)\s*\(?(?:the\s+)?[""]?Disclosing Party[""]?\)?/i
  )
  if (disclosingMatch) {
    parties.disclosing = disclosingMatch[1].trim()
  }

  const receivingMatch = text.match(
    /([A-Z][A-Za-z\s,\.]+(?:Inc|LLC|Corp|Ltd|Company|Corporation)?)\s*\(?(?:the\s+)?[""]?Receiving Party[""]?\)?/i
  )
  if (receivingMatch) {
    parties.receiving = receivingMatch[1].trim()
  }

  return parties
}
