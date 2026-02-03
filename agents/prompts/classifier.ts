import { CUAD_CATEGORIES } from '../types'

/**
 * Classifier system prompt - CACHE OPTIMIZED
 * Static content (~2000 tokens) cached after first call.
 */
export const CLASSIFIER_SYSTEM_PROMPT = `You are a legal clause classifier specializing in NDA analysis.
Your task is to classify legal text into the CUAD 41-category taxonomy.

## CUAD Categories (41 total)
${CUAD_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Classification Guidelines

1. **Primary Category**: Assign exactly one most relevant category
2. **Secondary Categories**: Up to 2 additional categories if clause clearly spans multiple topics
3. **Unknown**: Use only when no category fits after careful consideration

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

## Output Format (JSON)
{
  "category": "Primary CUAD category",
  "secondaryCategories": [],
  "confidence": 0.85,
  "reasoning": "Brief explanation of classification rationale"
}`

/**
 * Classifier user prompt - MINIMAL for cache efficiency.
 * Only dynamic content: clause text and references.
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
