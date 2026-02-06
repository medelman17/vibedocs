import { CUAD_CATEGORIES } from '../types'

/**
 * Classifier system prompt - CACHE OPTIMIZED
 * Static content (~2000 tokens) cached after first call.
 *
 * Updated for batch classification with neighbor context and
 * Uncategorized support for chunks matching no CUAD category.
 */
export const CLASSIFIER_SYSTEM_PROMPT = `You are a legal clause classifier specializing in NDA analysis.
Your task is to classify legal text chunks into the CUAD 41-category taxonomy.
You process chunks in batches, classifying each independently but using surrounding context when available.

## CUAD Categories (41 total)
${CUAD_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Classification Guidelines

1. **Primary Category**: Assign exactly one most relevant category per chunk
2. **Secondary Categories**: Up to 2 additional categories if a chunk clearly spans multiple topics
3. **Uncategorized**: Use when no CUAD category fits after careful consideration (e.g., boilerplate, recitals, signature blocks, definitions without substantive obligations)
4. **Batch Processing**: Each chunk in the batch is classified independently. Use neighbor context (preceding/following text) to understand clause boundaries but classify only the chunk content itself.

## Confidence Scoring

- 0.9-1.0: Unambiguous match, clear legal language
- 0.7-0.9: Strong match with minor ambiguity
- 0.5-0.7: Moderate confidence, recommend human review
- <0.5: Low confidence, uncertain classification

## Important Notes

- Focus on legal substance, not just keywords
- "Term" could be Renewal Term OR Expiration Date - read carefully
- NDA-specific clauses may map to multiple categories
- Compare against provided reference examples
- Use surrounding context to resolve ambiguous clause boundaries
- Chunks below 0.3 confidence should use "Uncategorized"

## Output Format (JSON)

Return one entry per chunk. The chunkIndex must match the document-wide index shown in each chunk header.
{
  "classifications": [
    {
      "chunkIndex": 5,
      "primary": {
        "category": "Primary CUAD category or Uncategorized",
        "confidence": 0.85,
        "rationale": "Brief 1-2 sentence explanation"
      },
      "secondary": [
        { "category": "Secondary CUAD category", "confidence": 0.6 }
      ]
    }
  ]
}`

/**
 * Classifier user prompt - MINIMAL for cache efficiency.
 * Only dynamic content: clause text and references.
 *
 * @deprecated Use createBatchClassifierPrompt for batch classification (Plan 06-02+).
 * Kept for backward compatibility until Plan 03 rewires the pipeline.
 */
export function createClassifierPrompt(
  clauseText: string,
  references: Array<{ content: string; category: string; similarity: number }>
): string {
  const refBlock = references.length > 0
    ? references
        .map((r, i) => `[${i + 1}] ${r.category} (${Math.round(r.similarity * 100)}%): ${r.content.slice(0, 200)}...`)
        .join('\n')
    : 'No similar references found.'

  return `## Clause to Classify
${clauseText}

## Similar Reference Clauses
${refBlock}

Classify this clause. Return JSON only.`
}

/**
 * Batch classifier user prompt with neighbor context and candidate categories.
 *
 * Builds a prompt for classifying 3-5 chunks in a single LLM call.
 * Includes:
 * - Candidate categories narrowed by vector search
 * - Reference examples from CUAD/ContractNLI corpus
 * - Each chunk with optional preceding/following context
 *
 * @param chunks - Array of chunks with content, section path, and neighbor context
 * @param references - Reference examples from vector search (deduplicated across batch)
 * @param candidateCategories - Categories narrowed by two-stage RAG
 * @returns Formatted prompt string for batch classification
 */
export function createBatchClassifierPrompt(
  chunks: Array<{
    index: number
    content: string
    sectionPath?: string[] | null
    prevContext?: string
    nextContext?: string
  }>,
  references: Array<{ content: string; category: string; similarity: number; source: string }>,
  candidateCategories: string[]
): string {
  // Section 1: Candidate categories from vector search
  const candidateBlock = candidateCategories.length > 0
    ? candidateCategories.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : 'No candidate categories identified.'

  // Section 2: Reference examples
  const refBlock = references.length > 0
    ? references
        .map((r, i) =>
          `[${i + 1}] ${r.category} (${r.source}, ${Math.round(r.similarity * 100)}%): ${r.content.slice(0, 200)}...`
        )
        .join('\n')
    : 'No similar references found.'

  // Section 3: Chunks with context
  const chunksBlock = chunks
    .map((chunk) => {
      const parts: string[] = []

      // Header — use document-wide index only (no batch-local index)
      parts.push(`### Chunk ${chunk.index}`)

      // Section path
      if (chunk.sectionPath && chunk.sectionPath.length > 0) {
        parts.push(`[Section: ${chunk.sectionPath.join(' > ')}]`)
      }

      // Preceding context
      if (chunk.prevContext) {
        parts.push(`[PRECEDING CONTEXT]: ...${chunk.prevContext}`)
      }

      // Main content
      parts.push(chunk.content)

      // Following context
      if (chunk.nextContext) {
        parts.push(`[FOLLOWING CONTEXT]: ${chunk.nextContext}...`)
      }

      return parts.join('\n')
    })
    .join('\n\n')

  return `## Candidate Categories (from reference corpus)
${candidateBlock}

Note: You may also assign categories NOT in this list if the text clearly belongs elsewhere. Use "Uncategorized" only if no CUAD category fits at all.

## Reference Examples
${refBlock}

## Chunks to Classify (${chunks.length} chunks)

${chunksBlock}

Classify each chunk. Return JSON with classifications array containing one entry per chunk.`
}
