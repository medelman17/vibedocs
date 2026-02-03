/** Categories critical for NDAs */
export const CRITICAL_CATEGORIES = [
  'Parties',
  'Effective Date',
  'Governing Law',
] as const

/** Categories important for NDAs */
export const IMPORTANT_CATEGORIES = [
  'Expiration Date',
  'Non-Compete',
  'No-Solicit Of Employees',
  'No-Solicit Of Customers',
  'Cap On Liability',
  'Termination For Convenience',
] as const

/** ContractNLI hypotheses for NDA gap analysis */
export const CONTRACT_NLI_HYPOTHESES = [
  { id: 'nli-1', category: 'Purpose Limitation', importance: 'critical' as const,
    hypothesis: 'Confidential information shall be used solely for evaluating the proposed transaction.' },
  { id: 'nli-2', category: 'Permitted Disclosure', importance: 'important' as const,
    hypothesis: 'The Receiving Party may share confidential information with its employees.' },
  { id: 'nli-3', category: 'Standard of Care', importance: 'critical' as const,
    hypothesis: 'The Receiving Party shall protect confidential information with the same degree of care as its own.' },
  { id: 'nli-4', category: 'Survival Period', importance: 'important' as const,
    hypothesis: 'Confidentiality obligations survive termination for a specified period.' },
  { id: 'nli-5', category: 'Return/Destruction', importance: 'important' as const,
    hypothesis: 'Confidential information shall be returned or destroyed upon termination.' },
  { id: 'nli-6', category: 'Legal Compulsion', importance: 'critical' as const,
    hypothesis: 'Disclosure is permitted if required by law.' },
  { id: 'nli-7', category: 'Public Information Exception', importance: 'critical' as const,
    hypothesis: 'Publicly known information is excluded from confidentiality.' },
  { id: 'nli-8', category: 'Prior Knowledge Exception', importance: 'important' as const,
    hypothesis: 'Information known before disclosure is excluded.' },
  { id: 'nli-9', category: 'Independent Development Exception', importance: 'important' as const,
    hypothesis: 'Independently developed information is excluded.' },
  { id: 'nli-10', category: 'Governing Law', importance: 'critical' as const,
    hypothesis: 'The agreement specifies governing jurisdiction.' },
] as const

/**
 * Gap Analyst system prompt - CACHE OPTIMIZED
 */
export const GAP_ANALYST_SYSTEM_PROMPT = `You are an NDA completeness analyst.
Identify missing clauses, weak protections, and coverage gaps.

## Category Importance for NDAs

### Critical (Must Have)
${CRITICAL_CATEGORIES.map(c => `- ${c}`).join('\n')}

### Important (Should Have)
${IMPORTANT_CATEGORIES.map(c => `- ${c}`).join('\n')}

## ContractNLI Hypothesis Testing

For each hypothesis, determine coverage status:
- **entailment**: NDA clause supports/includes this protection
- **contradiction**: NDA clause explicitly opposes this
- **not_mentioned**: No clause addresses this topic

### Hypotheses to Test
${CONTRACT_NLI_HYPOTHESES.map(h => `- [${h.id}] ${h.category} (${h.importance}): "${h.hypothesis}"`).join('\n')}

## Gap Score Calculation

- Missing critical category: +15 points
- Missing important category: +8 points
- Weak critical clause: +10 points
- Weak important clause: +5 points
- Critical hypothesis not mentioned: +10 points
- Hypothesis contradicted: +15 points

Cap total at 100. Lower score = more complete NDA.

## Output Format (JSON)
{
  "presentCategories": ["list of CUAD categories found"],
  "missingCategories": [
    { "category": "...", "importance": "critical|important|optional", "explanation": "..." }
  ],
  "weakClauses": [
    { "clauseId": "...", "category": "...", "issue": "...", "recommendation": "..." }
  ],
  "hypothesisCoverage": [
    { "hypothesisId": "nli-1", "category": "...", "status": "entailment|contradiction|not_mentioned", "explanation": "..." }
  ],
  "gapScore": 25
}`

/**
 * Gap Analyst user prompt - MINIMAL for cache efficiency.
 */
export function createGapAnalystPrompt(
  documentSummary: string,
  presentCategories: string[],
  classifiedClauses: Array<{ id: string; category: string; text: string }>
): string {
  const clauseBlock = classifiedClauses
    .map(c => `[${c.id}] ${c.category}: ${c.text.slice(0, 150)}...`)
    .join('\n')

  return `## Document Summary
${documentSummary}

## Categories Found (${presentCategories.length})
${presentCategories.join(', ') || 'None identified'}

## Classified Clauses
${clauseBlock || 'No clauses provided.'}

Analyze gaps. Return JSON only.`
}
