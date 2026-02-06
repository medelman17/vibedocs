import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runGapAnalystAgent, type GapAnalystInput } from './gap-analyst'
import { BudgetTracker } from '@/lib/ai/budget'

// Track call count for different mock responses
let mockCallCount = 0

// Mock AI SDK generateText with Output.object pattern (sequential responses)
vi.mock('ai', () => ({
  tool: vi.fn(),
  generateText: vi.fn().mockImplementation(() => {
    mockCallCount++
    // First call is always gap analysis, subsequent are hypothesis tests
    if (mockCallCount === 1) {
      return Promise.resolve({
        output: {
          presentCategories: ['Governing Law', 'Parties'],
          missingCategories: [
            {
              category: 'Insurance',
              importance: 'critical',
              explanation: 'No insurance requirements specified.',
            },
          ],
          weakClauses: [],
        },
        usage: { inputTokens: 1000, outputTokens: 300 },
      })
    } else {
      return Promise.resolve({
        output: {
          hypothesisId: `nli-${mockCallCount}`,
          category: 'Public Information Exception',
          status: 'not_mentioned',
          explanation: 'No relevant clause found.',
        },
        usage: { inputTokens: 500, outputTokens: 100 },
      })
    }
  }),
  Output: {
    object: vi.fn().mockReturnValue({}),
  },
  NoObjectGeneratedError: {
    isInstance: vi.fn().mockReturnValue(false),
  },
}))

// Mock AI config
vi.mock('@/lib/ai/config', () => ({
  getAgentModel: vi.fn().mockReturnValue({}),
}))

describe('Gap Analyst Agent', () => {
  let budgetTracker: BudgetTracker

  beforeEach(() => {
    mockCallCount = 0
    budgetTracker = new BudgetTracker()
  })

  it('identifies missing critical categories', async () => {
    const input: GapAnalystInput = {
      clauses: [
        {
          chunkId: 'c1',
          clauseText: 'Governing law clause',
          category: 'Governing Law',
          secondaryCategories: [],
          confidence: 0.9,
          reasoning: '',
          startPosition: 0,
          endPosition: 20,
        },
      ],
      assessments: [],
      documentSummary: 'A basic NDA between two parties.',
      budgetTracker,
    }

    const result = await runGapAnalystAgent(input)

    expect(result.gapAnalysis.gaps.length).toBeGreaterThan(0)
    expect(result.gapAnalysis.gaps[0].severity).toBe('critical')
  })

  it('tests ContractNLI hypotheses', async () => {
    const input: GapAnalystInput = {
      clauses: [
        {
          chunkId: 'c1',
          clauseText: 'Confidential info defined.',
          category: 'Parties',
          secondaryCategories: [],
          confidence: 0.9,
          reasoning: '',
          startPosition: 0,
          endPosition: 26,
        },
      ],
      assessments: [],
      documentSummary: 'Basic NDA',
      budgetTracker,
    }

    const result = await runGapAnalystAgent(input)

    expect(result.hypothesisCoverage.length).toBeGreaterThan(0)
    expect(result.hypothesisCoverage[0].status).toBeDefined()
    expect(['entailment', 'contradiction', 'not_mentioned']).toContain(
      result.hypothesisCoverage[0].status
    )
  })

  it('records token usage in budget tracker', async () => {
    const input: GapAnalystInput = {
      clauses: [
        {
          chunkId: 'c1',
          clauseText: 'Sample clause',
          category: 'Governing Law',
          secondaryCategories: [],
          confidence: 0.9,
          reasoning: '',
          startPosition: 0,
          endPosition: 13,
        },
      ],
      assessments: [],
      documentSummary: 'Test NDA',
      budgetTracker,
    }

    await runGapAnalystAgent(input)

    const usage = budgetTracker.getUsage()
    expect(usage.byAgent['gapAnalyst']).toBeDefined()
    expect(usage.byAgent['gapAnalyst'].input).toBeGreaterThan(0)
  })

  it('calculates gap score based on findings', async () => {
    const input: GapAnalystInput = {
      clauses: [],
      assessments: [],
      documentSummary: 'Empty NDA',
      budgetTracker,
    }

    const result = await runGapAnalystAgent(input)

    expect(result.gapAnalysis.gapScore).toBeDefined()
    expect(typeof result.gapAnalysis.gapScore).toBe('number')
    expect(result.gapAnalysis.gapScore).toBeGreaterThanOrEqual(0)
    expect(result.gapAnalysis.gapScore).toBeLessThanOrEqual(100)
  })

  it('identifies present categories from classified clauses', async () => {
    const input: GapAnalystInput = {
      clauses: [
        {
          chunkId: 'c1',
          clauseText: 'Governing law clause',
          category: 'Governing Law',
          secondaryCategories: [],
          confidence: 0.9,
          reasoning: '',
          startPosition: 0,
          endPosition: 20,
        },
        {
          chunkId: 'c2',
          clauseText: 'Parties clause',
          category: 'Parties',
          secondaryCategories: [],
          confidence: 0.95,
          reasoning: '',
          startPosition: 21,
          endPosition: 35,
        },
      ],
      assessments: [],
      documentSummary: 'NDA with basic clauses',
      budgetTracker,
    }

    const result = await runGapAnalystAgent(input)

    // The mock returns Governing Law and Parties as present
    expect(result.gapAnalysis.presentCategories).toContain('Governing Law')
    expect(result.gapAnalysis.presentCategories).toContain('Parties')
  })
})
