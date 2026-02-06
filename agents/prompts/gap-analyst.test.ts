import { describe, it, expect } from 'vitest'
import {
  GAP_ANALYST_SYSTEM_PROMPT,
  createGapAnalystPrompt,
  CRITICAL_CATEGORIES,
  IMPORTANT_CATEGORIES,
  CONTRACT_NLI_HYPOTHESES,
} from './gap-analyst'

describe('Gap Analyst constants', () => {
  it('defines critical categories for NDAs', () => {
    expect(CRITICAL_CATEGORIES).toContain('Parties')
    expect(CRITICAL_CATEGORIES).toContain('Effective Date')
    expect(CRITICAL_CATEGORIES).toContain('Governing Law')
  })

  it('defines important categories for NDAs', () => {
    expect(IMPORTANT_CATEGORIES).toContain('Expiration Date')
    expect(IMPORTANT_CATEGORIES).toContain('Non-Compete')
    expect(IMPORTANT_CATEGORIES).toContain('Cap On Liability')
  })

  it('defines ContractNLI hypotheses with importance', () => {
    expect(CONTRACT_NLI_HYPOTHESES.length).toBeGreaterThan(5)
    expect(CONTRACT_NLI_HYPOTHESES[0]).toHaveProperty('id')
    expect(CONTRACT_NLI_HYPOTHESES[0]).toHaveProperty('category')
    expect(CONTRACT_NLI_HYPOTHESES[0]).toHaveProperty('importance')
    expect(CONTRACT_NLI_HYPOTHESES[0]).toHaveProperty('hypothesis')
  })
})

describe('GAP_ANALYST_SYSTEM_PROMPT', () => {
  it('includes gap status tiers and severity levels', () => {
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('missing')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('incomplete')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('critical')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('important')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('informational')
  })

  it('includes ContractNLI hypothesis testing', () => {
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('entailment')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('contradiction')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('not_mentioned')
  })

  it('includes recommended language and style matching guidelines', () => {
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('Style Matching')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('Recommended Language')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('template')
  })

  it('requests JSON output format with coverage summary', () => {
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('JSON')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('"presentCategories"')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('"coverageSummary"')
  })
})

describe('createGapAnalystPrompt', () => {
  const defaultGaps = [
    {
      category: 'Non-Compete',
      status: 'missing' as const,
      severity: 'important',
      templateContext: [],
    },
  ]
  const defaultSampleClauses = [
    { category: 'Governing Law', text: 'This Agreement shall be governed by Delaware law.' },
  ]

  it('includes document summary', () => {
    const prompt = createGapAnalystPrompt(
      'NDA between Company A and Company B',
      ['Parties', 'Governing Law'],
      [],
      defaultGaps,
      defaultSampleClauses
    )
    expect(prompt).toContain('Company A and Company B')
  })

  it('lists present categories', () => {
    const prompt = createGapAnalystPrompt(
      'Summary',
      ['Parties', 'Governing Law', 'Non-Compete'],
      [],
      defaultGaps,
      defaultSampleClauses
    )
    expect(prompt).toContain('Categories Found (3)')
    expect(prompt).toContain('Parties')
  })

  it('includes sample clauses for style reference', () => {
    const prompt = createGapAnalystPrompt(
      'Summary',
      ['Governing Law'],
      [{ id: 'cl-1', category: 'Governing Law', text: 'Delaware law governs this agreement' }],
      defaultGaps,
      [{ category: 'Governing Law', text: 'This Agreement shall be governed by the laws of Delaware.' }]
    )
    expect(prompt).toContain('Sample Existing Clauses')
    expect(prompt).toContain('governed by the laws of Delaware')
  })
})
