import { RISK_LEVELS, type Perspective } from '../types'
import type { VectorSearchResult } from '../tools/vector-search'

/**
 * Creates a perspective-aware system prompt for the risk scorer agent.
 *
 * The system prompt includes risk level definitions, perspective-specific
 * assessment instructions, explanation style requirements, and evidence
 * format expectations matching the enhancedRiskAssessmentSchema.
 */
export function createRiskScorerSystemPrompt(
  perspective: Perspective
): string {
  const perspectiveDescriptions: Record<Perspective, string> = {
    receiving:
      'You are assessing risk FROM THE PERSPECTIVE OF THE RECEIVING PARTY (the party receiving confidential information). Clauses that favor the disclosing party or restrict the receiving party increase risk.',
    disclosing:
      'You are assessing risk FROM THE PERSPECTIVE OF THE DISCLOSING PARTY (the party sharing confidential information). Clauses that insufficiently protect disclosed information or give the receiving party too much latitude increase risk.',
    balanced:
      'You are assessing risk FROM A BALANCED/NEUTRAL PERSPECTIVE. Evaluate whether the clause is fair to both parties. One-sided clauses in either direction increase risk.',
  }

  return `You are a legal risk assessment expert specializing in NDA analysis.
${perspectiveDescriptions[perspective]}

## Risk Levels

${RISK_LEVELS.map((level) => {
  const descriptions: Record<string, string> = {
    standard:
      'Normal, market-friendly terms found in most NDAs. Balanced obligations.',
    cautious:
      'Slightly one-sided but generally acceptable. Minor negotiation may be warranted.',
    aggressive:
      'Clearly one-sided or unusual provisions. Significant exposure, negotiate.',
    unknown:
      'Cannot determine risk level due to ambiguous or unclear language.',
  }
  return `- **${level}**: ${descriptions[level]}`
}).join('\n')}

## Assessment Approach

Compare the clause against Bonterms/standard NDA baselines. Deviation from market standard determines risk level.

## Explanation Requirements

1. Lead with the risk implication (risk-first pattern)
2. Explain why in plain language (VP of Sales audience -- professional, accessible, no legalese)
3. For non-standard clauses, include a concrete negotiation suggestion (e.g., "Consider negotiating a 2-year cap on non-compete period")
4. Flag atypical language even when substance is standard -- unusual wording may introduce ambiguity
5. 2-3 sentences maximum per explanation

## Evidence Requirements (MANDATORY)

1. Quote specific text from the clause being assessed (citations)
2. Reference similar clauses from the reference corpus with source labels (references). Use the sourceId values provided in the context.
3. Compare to template baseline when a template match is available (baselineComparison)
4. When no reference match exists, note: "No reference corpus match -- assessment based on legal analysis only"

## Output Format

Return a JSON object matching this structure:
{
  "riskLevel": "standard|cautious|aggressive|unknown",
  "confidence": 0.85,
  "explanation": "Risk-first plain-language explanation (2-3 sentences)",
  "negotiationSuggestion": "Concrete suggestion for non-standard clauses (optional)",
  "atypicalLanguage": false,
  "atypicalLanguageNote": "Note about unusual wording (optional)",
  "evidence": {
    "citations": [{ "text": "quoted clause text", "sourceType": "clause|reference|template" }],
    "references": [{ "sourceId": "id", "source": "cuad|contract_nli|bonterms|commonaccord", "section": "optional", "similarity": 0.85, "summary": "brief summary" }],
    "baselineComparison": "Comparison to template baseline (optional)"
  }
}

IMPORTANT: Only use sourceId values that appear in the provided reference context. Do not invent or guess sourceId values.`
}

/**
 * Backward-compatible alias for the balanced perspective system prompt.
 */
export const RISK_SCORER_SYSTEM_PROMPT =
  createRiskScorerSystemPrompt('balanced')

/**
 * Creates an enhanced user prompt with multi-source evidence context.
 *
 * Formats clause text alongside CUAD references, template baselines,
 * and NLI evidence spans for the risk scorer LLM call.
 */
export function createEnhancedRiskScorerPrompt(
  clauseText: string,
  category: string,
  references: VectorSearchResult[],
  templates: VectorSearchResult[],
  nliSpans: VectorSearchResult[],
  perspective: Perspective
): string {
  const refBlock =
    references.length > 0
      ? references
          .map(
            (r, i) =>
              `[REF-${i + 1}] Source: ${r.source} | Category: ${r.category} | ID: ${r.id} | Similarity: ${Math.round(r.similarity * 100)}%\n${r.content.slice(0, 300)}`
          )
          .join('\n\n')
      : 'No reference corpus matches found.'

  const templateBlock =
    templates.length > 0
      ? templates
          .map(
            (t, i) =>
              `[TPL-${i + 1}] Source: ${t.source} | ID: ${t.id} | Similarity: ${Math.round(t.similarity * 100)}%\n${t.content.slice(0, 300)}`
          )
          .join('\n\n')
      : 'No template baselines available.'

  const nliBlock =
    nliSpans.length > 0
      ? nliSpans
          .map(
            (n, i) =>
              `[NLI-${i + 1}] Source: ContractNLI | Category: ${n.category} | ID: ${n.id}\n${n.content.slice(0, 200)}`
          )
          .join('\n\n')
      : 'No NLI evidence available.'

  return `## Clause to Assess
Category: ${category}
Perspective: ${perspective}

${clauseText}

## Reference Clauses (from CUAD corpus)
${refBlock}

## Template Baselines (from Bonterms/CommonAccord)
${templateBlock}

## NLI Evidence Spans
${nliBlock}

Assess the risk level from the ${perspective} perspective. Return JSON only.`
}

/**
 * Legacy user prompt for backward compatibility.
 * @deprecated Use createEnhancedRiskScorerPrompt for multi-source evidence.
 */
export function createRiskScorerPrompt(
  clauseText: string,
  category: string,
  references: Array<{ content: string; category: string; similarity: number }>
): string {
  const refBlock =
    references.length > 0
      ? references
          .map(
            (r, i) =>
              `[${i + 1}] (${Math.round(r.similarity * 100)}% similar): ${r.content.slice(0, 200)}...`
          )
          .join('\n')
      : 'No references available.'

  return `## Clause to Assess
Category: ${category}

${clauseText}

## Reference Clauses for Comparison
${refBlock}

Assess the risk level. Return JSON only.`
}
