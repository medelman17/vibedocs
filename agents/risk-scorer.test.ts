import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRiskScorerAgent, type RiskScorerInput } from './risk-scorer'
import { BudgetTracker } from '@/lib/ai/budget'

// Mock AI SDK generateObject with inline data (vi.mock is hoisted)
vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      riskLevel: 'standard',
      confidence: 0.9,
      explanation: 'Delaware law is commonly used in commercial agreements.',
      evidence: {
        citations: ['governed by Delaware law'],
        comparisons: ['Matches standard governing law clauses'],
        statistic: 'Delaware is used in 34% of commercial NDAs.',
      },
    },
    usage: { inputTokens: 800, outputTokens: 200 },
  }),
}))

// Mock vector search
vi.mock('./tools/vector-search', () => ({
  findSimilarClauses: vi.fn().mockResolvedValue([
    {
      id: 'ref-0',
      content: 'Standard governing law clause from reference corpus.',
      category: 'Governing Law',
      similarity: 0.88,
      source: 'CUAD Reference',
    },
  ]),
}))

// Mock AI config
vi.mock('@/lib/ai/config', () => ({
  getAgentModel: vi.fn().mockReturnValue({}),
}))

describe('Risk Scorer Agent', () => {
  let budgetTracker: BudgetTracker

  beforeEach(() => {
    vi.clearAllMocks()
    budgetTracker = new BudgetTracker()
  })

  it('scores governing law clause as standard risk', async () => {
    const input: RiskScorerInput = {
      clauses: [
        {
          chunkId: 'chunk-0',
          clauseText: 'Governed by Delaware law.',
          category: 'Governing Law',
          secondaryCategories: [],
          confidence: 0.95,
          reasoning: 'Jurisdiction clause',
          startPosition: 0,
          endPosition: 26,
        },
      ],
      budgetTracker,
    }

    const result = await runRiskScorerAgent(input)

    expect(result.assessments.length).toBe(1)
    expect(result.assessments[0].riskLevel).toBe('standard')
    expect(result.assessments[0].evidence.citations.length).toBeGreaterThan(0)
    expect(result.assessments[0].startPosition).toBe(0)
  })

  it('calculates overall risk score correctly', async () => {
    // Override mock to return aggressive risk
    const { generateObject } = await import('ai')
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        riskLevel: 'aggressive',
        confidence: 0.85,
        explanation: 'Five-year worldwide non-compete significantly exceeds market standard.',
        evidence: {
          citations: ['five (5) years', 'anywhere in the world'],
          comparisons: ['Exceeds 92% of CUAD non-compete clauses'],
          statistic: 'Average non-compete duration is 2.1 years.',
        },
      },
      usage: { inputTokens: 800, outputTokens: 200 },
    } as unknown as Awaited<ReturnType<typeof generateObject>>)

    const input: RiskScorerInput = {
      clauses: [
        {
          chunkId: 'c1',
          clauseText: 'Non-compete worldwide for five years',
          category: 'Non-Compete',
          secondaryCategories: [],
          confidence: 0.9,
          reasoning: '',
          startPosition: 0,
          endPosition: 36,
        },
        {
          chunkId: 'c2',
          clauseText: 'Non-solicit global provisions',
          category: 'No-Solicit Of Employees',
          secondaryCategories: [],
          confidence: 0.9,
          reasoning: '',
          startPosition: 37,
          endPosition: 66,
        },
      ],
      budgetTracker,
    }

    const result = await runRiskScorerAgent(input)

    expect(result.overallRiskLevel).toBe('aggressive')
    expect(result.overallRiskScore).toBeGreaterThanOrEqual(60)
  })

  it('records token usage in budget tracker', async () => {
    const input: RiskScorerInput = {
      clauses: [
        {
          chunkId: 'chunk-0',
          clauseText: 'Sample clause',
          category: 'Governing Law',
          secondaryCategories: [],
          confidence: 0.9,
          reasoning: '',
          startPosition: 0,
          endPosition: 13,
        },
      ],
      budgetTracker,
    }

    await runRiskScorerAgent(input)

    const usage = budgetTracker.getUsage()
    expect(usage.byAgent['riskScorer']).toBeDefined()
    expect(usage.byAgent['riskScorer'].input).toBe(800)
    expect(usage.byAgent['riskScorer'].output).toBe(200)
  })

  it('preserves position information from classified clauses', async () => {
    const input: RiskScorerInput = {
      clauses: [
        {
          chunkId: 'chunk-0',
          clauseText: 'First clause text',
          category: 'Governing Law',
          secondaryCategories: [],
          confidence: 0.9,
          reasoning: '',
          startPosition: 100,
          endPosition: 200,
        },
        {
          chunkId: 'chunk-1',
          clauseText: 'Second clause text',
          category: 'Non-Compete',
          secondaryCategories: [],
          confidence: 0.85,
          reasoning: '',
          startPosition: 250,
          endPosition: 350,
        },
      ],
      budgetTracker,
    }

    const result = await runRiskScorerAgent(input)

    expect(result.assessments[0].startPosition).toBe(100)
    expect(result.assessments[0].endPosition).toBe(200)
    expect(result.assessments[1].startPosition).toBe(250)
    expect(result.assessments[1].endPosition).toBe(350)
  })

  it('handles empty clause list', async () => {
    const input: RiskScorerInput = {
      clauses: [],
      budgetTracker,
    }

    const result = await runRiskScorerAgent(input)

    expect(result.assessments.length).toBe(0)
    expect(result.overallRiskLevel).toBe('unknown')
    expect(result.overallRiskScore).toBe(0)
  })
})
