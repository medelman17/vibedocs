import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRiskScorerAgent, type RiskScorerInput } from './risk-scorer'
import { BudgetTracker } from '@/lib/ai/budget'

// Mock AI SDK generateText with enhanced Output.object pattern
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    output: {
      riskLevel: 'standard',
      confidence: 0.9,
      explanation: 'Delaware law is commonly used in commercial agreements.',
      negotiationSuggestion: undefined,
      atypicalLanguage: false,
      atypicalLanguageNote: undefined,
      evidence: {
        citations: [
          { text: 'governed by Delaware law', sourceType: 'clause' },
        ],
        references: [
          {
            sourceId: 'ref-0',
            source: 'cuad',
            similarity: 0.88,
            summary: 'Standard governing law clause from reference corpus.',
          },
        ],
        baselineComparison: undefined,
      },
    },
    usage: { inputTokens: 800, outputTokens: 200 },
  }),
  Output: {
    object: vi.fn().mockReturnValue({}),
  },
  NoObjectGeneratedError: {
    isInstance: vi.fn().mockReturnValue(false),
  },
}))

// Mock vector search with all three evidence helpers
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
  findTemplateBaselines: vi.fn().mockResolvedValue([]),
  findNliSpans: vi.fn().mockResolvedValue([]),
}))

// Mock AI config
vi.mock('@/lib/ai/config', () => ({
  getAgentModel: vi.fn().mockReturnValue({}),
}))

// Mock drizzle-orm inArray (used by verifyCitations)
vi.mock('drizzle-orm', () => ({
  inArray: vi.fn(),
}))

// Mock db client (used by verifyCitations)
vi.mock('@/db/client', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}))

// Mock reference schema
vi.mock('@/db/schema/reference', () => ({
  referenceDocuments: { id: 'id' },
}))

describe('Risk Scorer Agent', () => {
  let budgetTracker: BudgetTracker

  beforeEach(async () => {
    vi.clearAllMocks()
    budgetTracker = new BudgetTracker()

    // Reset the default mock implementation (overrides from previous tests)
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValue({
      output: {
        riskLevel: 'standard',
        confidence: 0.9,
        explanation: 'Delaware law is commonly used in commercial agreements.',
        negotiationSuggestion: undefined,
        atypicalLanguage: false,
        atypicalLanguageNote: undefined,
        evidence: {
          citations: [
            { text: 'governed by Delaware law', sourceType: 'clause' },
          ],
          references: [
            {
              sourceId: 'ref-0',
              source: 'cuad',
              similarity: 0.88,
              summary:
                'Standard governing law clause from reference corpus.',
            },
          ],
          baselineComparison: undefined,
        },
      },
      usage: { inputTokens: 800, outputTokens: 200 },
    } as unknown as Awaited<ReturnType<typeof generateText>>)
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
    expect(result.assessments[0].evidence.citations[0]).toEqual({
      text: 'governed by Delaware law',
      sourceType: 'clause',
    })
    expect(result.assessments[0].atypicalLanguage).toBe(false)
    expect(result.assessments[0].startPosition).toBe(0)

    // Verify new output fields
    expect(result.perspective).toBe('balanced')
    expect(result.executiveSummary).toContain('Overall Risk:')
    expect(result.riskDistribution).toEqual({
      standard: 1,
      cautious: 0,
      aggressive: 0,
      unknown: 0,
    })
  })

  it('calculates overall risk score correctly', async () => {
    // Override mock to return aggressive risk
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValue({
      output: {
        riskLevel: 'aggressive',
        confidence: 0.85,
        explanation:
          'Five-year worldwide non-compete significantly exceeds market standard.',
        atypicalLanguage: false,
        evidence: {
          citations: [
            { text: 'five (5) years', sourceType: 'clause' },
            { text: 'anywhere in the world', sourceType: 'clause' },
          ],
          references: [],
        },
      },
      usage: { inputTokens: 800, outputTokens: 200 },
    } as unknown as Awaited<ReturnType<typeof generateText>>)

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
    expect(result.riskDistribution.aggressive).toBe(2)
    expect(result.perspective).toBe('balanced')
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
    expect(result.perspective).toBe('balanced')
    expect(result.executiveSummary).toContain('No clauses analyzed')
    expect(result.riskDistribution).toEqual({
      standard: 0,
      cautious: 0,
      aggressive: 0,
      unknown: 0,
    })
  })

  it('accepts perspective parameter', async () => {
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
      perspective: 'receiving',
    }

    const result = await runRiskScorerAgent(input)

    expect(result.perspective).toBe('receiving')
  })

  it('populates structured evidence references from LLM output', async () => {
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

    // References come from LLM output (verified against reference DB)
    expect(result.assessments[0].evidence.references).toHaveLength(1)
    expect(result.assessments[0].evidence.references[0]).toEqual({
      sourceId: 'ref-0',
      source: 'cuad',
      similarity: 0.88,
      summary: 'Standard governing law clause from reference corpus.',
    })
  })

  it('generates executive summary with key findings', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValue({
      output: {
        riskLevel: 'aggressive',
        confidence: 0.85,
        explanation: 'This clause is highly aggressive.',
        atypicalLanguage: true,
        atypicalLanguageNote: 'Uses archaic language.',
        negotiationSuggestion: 'Consider capping duration at 2 years.',
        evidence: {
          citations: [{ text: 'five years', sourceType: 'clause' }],
          references: [],
        },
      },
      usage: { inputTokens: 800, outputTokens: 200 },
    } as unknown as Awaited<ReturnType<typeof generateText>>)

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
      ],
      budgetTracker,
    }

    const result = await runRiskScorerAgent(input)

    expect(result.executiveSummary).toContain('Overall Risk:')
    expect(result.executiveSummary).toContain('Key Findings:')
    expect(result.executiveSummary).toContain('Non-Compete')
    expect(result.assessments[0].atypicalLanguage).toBe(true)
    expect(result.assessments[0].atypicalLanguageNote).toBe(
      'Uses archaic language.'
    )
    expect(result.assessments[0].negotiationSuggestion).toBe(
      'Consider capping duration at 2 years.'
    )
  })

  it('calls all three evidence retrieval sources', async () => {
    const { findSimilarClauses, findTemplateBaselines, findNliSpans } =
      await import('./tools/vector-search')

    const input: RiskScorerInput = {
      clauses: [
        {
          chunkId: 'chunk-0',
          clauseText: 'Sample clause text.',
          category: 'Governing Law',
          secondaryCategories: [],
          confidence: 0.9,
          reasoning: '',
          startPosition: 0,
          endPosition: 19,
        },
      ],
      budgetTracker,
    }

    await runRiskScorerAgent(input)

    expect(findSimilarClauses).toHaveBeenCalledWith('Sample clause text.', {
      category: 'Governing Law',
      limit: 3,
    })
    expect(findTemplateBaselines).toHaveBeenCalledWith('Sample clause text.', {
      limit: 2,
    })
    expect(findNliSpans).toHaveBeenCalledWith('Sample clause text.', {
      category: 'Governing Law',
      limit: 2,
    })
  })
})
