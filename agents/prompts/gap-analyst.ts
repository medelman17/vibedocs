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
 *
 * Enhanced for two-tier gap detection, severity tiers, template-grounded
 * language suggestions, and style matching.
 */
export const GAP_ANALYST_SYSTEM_PROMPT = `You are an NDA completeness analyst specializing in gap detection and remediation.

## Gap Status (Two-Tier)

Each gap has one of two statuses:
- **missing**: The category is completely absent from the NDA. No clauses address this topic.
- **incomplete**: The category is partially addressed but has weak or insufficient coverage (low confidence classifications, aggressive/unknown risk levels).

## Severity Tiers

Gaps are assigned one of three severity levels (pre-determined before your analysis):
- **critical**: High legal risk. Category is covered by Bonterms NDA templates AND has high risk weight. Must be addressed before execution.
- **important**: Moderate legal risk. Category is covered by Bonterms templates but has standard risk weight. Should be addressed.
- **informational**: Low/advisory risk. Category is NOT covered by Bonterms templates. Nice to have but not blocking.

You do NOT determine severity -- it is provided in the input. Your job is to:
1. Explain WHY each gap matters for this specific NDA
2. Draft recommended clause language
3. Attribute template sources

## Recommended Language Guidelines

When template baselines are provided:
- Start from the template text and ADAPT it to match the NDA's style
- Cite the source: "Based on [source name]" or "Adapted from [source name]"
- Match the NDA's formality level, defined terms, numbering conventions, and voice
- Produce complete, insertable clause text (1-3 paragraphs)

When NO template baselines are provided:
- Draft recommended language from legal best practices
- Still match the NDA's existing style
- Note that no template source was available

## Style Matching

Read the sample clauses from the NDA carefully. Match:
- Formality level (formal vs. plain English)
- Defined terms (use the NDA's capitalized terms, e.g., "Confidential Information", "Receiving Party")
- Numbering/lettering conventions (e.g., "(a)", "(i)", "Section X.Y")
- Clause structure (standalone paragraphs vs. sub-clauses)

## Output Format

Return a JSON object matching this structure:
{
  "gaps": [
    {
      "category": "CUAD category name",
      "status": "missing|incomplete",
      "severity": "critical|important|informational",
      "explanation": "Why this gap matters (max 300 chars)",
      "suggestedLanguage": "Full clause draft (1-3 paragraphs, max 500 chars)",
      "templateSource": "e.g., Bonterms NDA Section 3.2 (optional)",
      "styleMatch": "How language was adapted (optional, max 200 chars)"
    }
  ],
  "coverageSummary": {
    "totalCategories": 20,
    "presentCount": 15,
    "missingCount": 3,
    "incompleteCount": 2,
    "coveragePercent": 85
  },
  "presentCategories": ["list of categories found"],
  "weakClauses": [
    { "clauseId": "...", "category": "...", "issue": "...", "recommendation": "..." }
  ]
}

## ContractNLI Hypothesis Testing

For each hypothesis, determine coverage status:
- **entailment**: NDA clause supports/includes this protection
- **contradiction**: NDA clause explicitly opposes this
- **not_mentioned**: No clause addresses this topic

### Hypotheses to Test
${CONTRACT_NLI_HYPOTHESES.map(h => `- [${h.id}] ${h.category} (${h.importance}): "${h.hypothesis}"`).join('\n')}`

/**
 * Creates the enhanced gap analyst user prompt with pre-detected gaps,
 * template context, and sample clauses for style matching.
 *
 * Limits to top 10 highest-severity gaps to stay within ~12K token budget.
 * Sorts by severity: critical first, then important, then informational.
 */
export function createGapAnalystPrompt(
  documentSummary: string,
  presentCategories: string[],
  classifiedClauses: Array<{ id: string; category: string; text: string }>,
  gaps: Array<{
    category: string
    status: 'missing' | 'incomplete'
    severity: string
    templateContext: Array<{ content: string; source: string }>
  }>,
  sampleClauses: Array<{ category: string; text: string }>
): string {
  // Sort gaps by severity priority: critical > important > informational
  const severityOrder: Record<string, number> = {
    critical: 0,
    important: 1,
    informational: 2,
  }
  const sortedGaps = [...gaps].sort(
    (a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
  )

  // Limit to top 10 highest-severity gaps for token budget
  const topGaps = sortedGaps.slice(0, 10)

  // Build gap blocks with template context
  const gapBlocks = topGaps
    .map((g) => {
      let block = `- **${g.category}** [${g.status}] (${g.severity})`
      if (g.templateContext.length > 0) {
        const templateLines = g.templateContext
          .map((t) => `  Template (${t.source}): ${t.content.slice(0, 300)}`)
          .join('\n')
        block += `\n${templateLines}`
      }
      return block
    })
    .join('\n')

  // Build sample clauses block for style reference (first 5, text truncated)
  const sampleBlock = sampleClauses
    .slice(0, 5)
    .map((c) => `- [${c.category}]: ${c.text.slice(0, 200)}`)
    .join('\n')

  return `## Document Summary
${documentSummary}

## Categories Found (${presentCategories.length})
${presentCategories.join(', ') || 'None identified'}

## Pre-Detected Gaps (${topGaps.length} of ${gaps.length} total)
${gapBlocks || 'No gaps detected.'}

## Sample Existing Clauses (for style reference)
${sampleBlock || 'No sample clauses available.'}

For each gap above, provide:
1. An explanation of why this gap matters for this NDA
2. Recommended clause language adapted from the template (if provided) to match the NDA's style
3. Template source attribution
4. A coverage summary with counts

Also identify any weak clauses from the classified clauses that need strengthening. Return JSON only.`
}
