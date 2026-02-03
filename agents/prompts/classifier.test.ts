import { describe, it, expect } from 'vitest'
import { CLASSIFIER_SYSTEM_PROMPT, createClassifierPrompt } from './classifier'
import { CUAD_CATEGORIES } from '../types'

describe('CLASSIFIER_SYSTEM_PROMPT', () => {
  it('contains all 41 CUAD categories', () => {
    for (const category of CUAD_CATEGORIES) {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain(category)
    }
  })

  it('includes classification guidelines', () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('Primary Category')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('Secondary Categories')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('Unknown')
  })

  it('includes confidence scoring guidance', () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('0.9-1.0')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('0.7-0.9')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('0.5-0.7')
  })

  it('requests JSON output format', () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('JSON')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('"category"')
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain('"confidence"')
  })
})

describe('createClassifierPrompt', () => {
  it('includes clause text', () => {
    const prompt = createClassifierPrompt(
      'This Agreement shall be governed by Delaware law.',
      []
    )
    expect(prompt).toContain('governed by Delaware law')
  })

  it('includes reference clauses when provided', () => {
    const prompt = createClassifierPrompt(
      'Test clause',
      [
        { content: 'Reference governing law clause', category: 'Governing Law', similarity: 0.92 },
      ]
    )
    expect(prompt).toContain('Reference governing law clause')
    expect(prompt).toContain('Governing Law')
    expect(prompt).toContain('92%')
  })

  it('shows "No similar references found" when no references', () => {
    const prompt = createClassifierPrompt('Test clause', [])
    expect(prompt).toContain('No similar references found')
  })

  it('is minimal to optimize for caching', () => {
    // User prompt should be significantly shorter than system prompt
    const userPrompt = createClassifierPrompt('Short clause', [])
    expect(userPrompt.length).toBeLessThan(CLASSIFIER_SYSTEM_PROMPT.length / 2)
  })
})
