import { describe, it, expect } from 'vitest'
import {
  RISK_LEVELS,
  CUAD_CATEGORIES,
  CONTRACT_NLI_CATEGORIES,
  riskLevelSchema,
  cuadCategorySchema,
  classificationSchema,
  riskAssessmentSchema,
} from './types'

describe('Risk Levels', () => {
  it('defines PRD-aligned risk levels', () => {
    expect(RISK_LEVELS).toEqual(['standard', 'cautious', 'aggressive', 'unknown'])
  })

  it('validates risk levels with Zod', () => {
    expect(riskLevelSchema.parse('standard')).toBe('standard')
    expect(riskLevelSchema.parse('aggressive')).toBe('aggressive')
    expect(() => riskLevelSchema.parse('high')).toThrow()
    expect(() => riskLevelSchema.parse('low')).toThrow()
  })
})

describe('CUAD Categories', () => {
  it('defines 41 categories', () => {
    expect(CUAD_CATEGORIES).toHaveLength(41)
  })

  it('includes core NDA categories', () => {
    expect(CUAD_CATEGORIES).toContain('Parties')
    expect(CUAD_CATEGORIES).toContain('Governing Law')
    expect(CUAD_CATEGORIES).toContain('Non-Compete')
    expect(CUAD_CATEGORIES).toContain('Cap On Liability')
  })

  it('uses title case for abbreviations', () => {
    expect(CUAD_CATEGORIES).toContain('Ip Ownership Assignment')
    expect(CUAD_CATEGORIES).not.toContain('IP Ownership Assignment')
  })

  it('validates categories with Zod', () => {
    expect(cuadCategorySchema.parse('Governing Law')).toBe('Governing Law')
    expect(() => cuadCategorySchema.parse('Invalid Category')).toThrow()
  })
})

describe('ContractNLI Categories', () => {
  it('defines 17 categories', () => {
    expect(CONTRACT_NLI_CATEGORIES).toHaveLength(17)
  })

  it('includes key NDA hypotheses', () => {
    expect(CONTRACT_NLI_CATEGORIES).toContain('Purpose Limitation')
    expect(CONTRACT_NLI_CATEGORIES).toContain('Standard of Care')
    expect(CONTRACT_NLI_CATEGORIES).toContain('Return/Destruction')
  })
})

describe('Classification Schema', () => {
  it('validates valid classification', () => {
    const result = classificationSchema.parse({
      category: 'Governing Law',
      secondaryCategories: ['Parties'],
      confidence: 0.95,
      reasoning: 'Clear governing law clause',
    })
    expect(result.category).toBe('Governing Law')
    expect(result.confidence).toBe(0.95)
  })

  it('defaults secondaryCategories to empty array', () => {
    const result = classificationSchema.parse({
      category: 'Governing Law',
      confidence: 0.9,
      reasoning: 'Test',
    })
    expect(result.secondaryCategories).toEqual([])
  })

  it('limits secondaryCategories to 2', () => {
    expect(() => classificationSchema.parse({
      category: 'Governing Law',
      secondaryCategories: ['Parties', 'Effective Date', 'Expiration Date'],
      confidence: 0.9,
      reasoning: 'Test',
    })).toThrow()
  })
})

describe('Risk Assessment Schema', () => {
  it('validates valid risk assessment', () => {
    const result = riskAssessmentSchema.parse({
      riskLevel: 'aggressive',
      confidence: 0.85,
      explanation: 'Worldwide 5-year non-compete exceeds market standard',
      evidence: {
        citations: ['five (5) years thereafter', 'anywhere in the world'],
        comparisons: ['Exceeds 92% of CUAD non-competes'],
      },
    })
    expect(result.riskLevel).toBe('aggressive')
  })

  it('requires at least one citation', () => {
    expect(() => riskAssessmentSchema.parse({
      riskLevel: 'standard',
      confidence: 0.9,
      explanation: 'Test',
      evidence: {
        citations: [],
        comparisons: ['Test comparison'],
      },
    })).toThrow()
  })

  it('allows optional statistic', () => {
    const result = riskAssessmentSchema.parse({
      riskLevel: 'cautious',
      confidence: 0.8,
      explanation: 'Test',
      evidence: {
        citations: ['quote'],
        comparisons: ['comparison'],
        statistic: '78% of NDAs use this pattern',
      },
    })
    expect(result.evidence.statistic).toBe('78% of NDAs use this pattern')
  })
})
