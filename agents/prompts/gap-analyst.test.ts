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
  it('lists critical and important categories', () => {
    for (const cat of CRITICAL_CATEGORIES) {
      expect(GAP_ANALYST_SYSTEM_PROMPT).toContain(cat)
    }
    for (const cat of IMPORTANT_CATEGORIES) {
      expect(GAP_ANALYST_SYSTEM_PROMPT).toContain(cat)
    }
  })

  it('includes ContractNLI hypothesis testing', () => {
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('entailment')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('contradiction')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('not_mentioned')
  })

  it('includes gap score calculation', () => {
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('Gap Score')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('+15')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('+10')
  })

  it('requests JSON output format', () => {
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('JSON')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('"presentCategories"')
    expect(GAP_ANALYST_SYSTEM_PROMPT).toContain('"gapScore"')
  })
})

describe('createGapAnalystPrompt', () => {
  it('includes document summary', () => {
    const prompt = createGapAnalystPrompt(
      'NDA between Company A and Company B',
      ['Parties', 'Governing Law'],
      []
    )
    expect(prompt).toContain('Company A and Company B')
  })

  it('lists present categories', () => {
    const prompt = createGapAnalystPrompt(
      'Summary',
      ['Parties', 'Governing Law', 'Non-Compete'],
      []
    )
    expect(prompt).toContain('Categories Found (3)')
    expect(prompt).toContain('Parties')
  })

  it('includes classified clauses', () => {
    const prompt = createGapAnalystPrompt(
      'Summary',
      ['Governing Law'],
      [{ id: 'cl-1', category: 'Governing Law', text: 'Delaware law governs this agreement' }]
    )
    expect(prompt).toContain('[cl-1]')
    expect(prompt).toContain('Delaware law')
  })
})
