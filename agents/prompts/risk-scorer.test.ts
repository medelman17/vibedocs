import { describe, it, expect } from 'vitest'
import { RISK_SCORER_SYSTEM_PROMPT, createRiskScorerPrompt } from './risk-scorer'
import { RISK_LEVELS } from '../types'

describe('RISK_SCORER_SYSTEM_PROMPT', () => {
  it('contains all PRD risk levels', () => {
    for (const level of RISK_LEVELS) {
      expect(RISK_SCORER_SYSTEM_PROMPT).toContain(level)
    }
  })

  it('includes assessment criteria', () => {
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('Assessment Approach')
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('Explanation Requirements')
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('Evidence Requirements')
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('Output Format')
  })

  it('requires evidence in assessments', () => {
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('citations')
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('references')
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('MANDATORY')
  })

  it('requests JSON output format', () => {
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('JSON')
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('"riskLevel"')
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('"evidence"')
  })
})

describe('createRiskScorerPrompt', () => {
  it('includes clause text and category', () => {
    const prompt = createRiskScorerPrompt(
      'Non-compete for 5 years worldwide',
      'Non-Compete',
      []
    )
    expect(prompt).toContain('Non-compete for 5 years worldwide')
    expect(prompt).toContain('Non-Compete')
  })

  it('includes reference comparisons', () => {
    const prompt = createRiskScorerPrompt(
      'Test clause',
      'Governing Law',
      [{ content: 'Delaware law reference', category: 'Governing Law', similarity: 0.88 }]
    )
    expect(prompt).toContain('Delaware law reference')
    expect(prompt).toContain('88%')
  })

  it('shows "No references available" when empty', () => {
    const prompt = createRiskScorerPrompt('Test', 'Unknown', [])
    expect(prompt).toContain('No references available')
  })
})
