import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeNda } from './analyze-nda'

// Mock all agents
vi.mock('@/agents/parser', () => ({
  runParserAgent: vi.fn().mockResolvedValue({
    document: {
      documentId: 'doc-1',
      title: 'Test NDA',
      rawText: 'Sample text content',
      chunks: [
        {
          id: 'chunk-0',
          index: 0,
          content: 'Sample clause',
          sectionPath: [],
          tokenCount: 10,
          startPosition: 0,
          endPosition: 13,
          embedding: [0.1, 0.2],
        },
      ],
    },
    tokenUsage: { embeddingTokens: 100 },
  }),
}))

vi.mock('@/agents/classifier', () => ({
  runClassifierAgent: vi.fn().mockResolvedValue({
    clauses: [
      {
        chunkId: 'chunk-0',
        clauseText: 'Sample clause',
        category: 'Governing Law',
        secondaryCategories: [],
        confidence: 0.9,
        reasoning: 'Test',
        startPosition: 0,
        endPosition: 13,
      },
    ],
    tokenUsage: { inputTokens: 500, outputTokens: 100 },
  }),
}))

vi.mock('@/agents/risk-scorer', () => ({
  runRiskScorerAgent: vi.fn().mockResolvedValue({
    assessments: [
      {
        clauseId: 'chunk-0',
        clause: {
          chunkId: 'chunk-0',
          clauseText: 'Sample clause',
          category: 'Governing Law',
          secondaryCategories: [],
          confidence: 0.9,
          reasoning: 'Test',
          startPosition: 0,
          endPosition: 13,
        },
        riskLevel: 'standard',
        confidence: 0.9,
        explanation: 'Standard clause',
        evidence: { citations: ['sample'], comparisons: ['ref'] },
        startPosition: 0,
        endPosition: 13,
      },
    ],
    overallRiskScore: 25,
    overallRiskLevel: 'standard',
    tokenUsage: { inputTokens: 800, outputTokens: 200 },
  }),
}))

vi.mock('@/agents/gap-analyst', () => ({
  runGapAnalystAgent: vi.fn().mockResolvedValue({
    gapAnalysis: {
      presentCategories: ['Governing Law'],
      missingCategories: [],
      weakClauses: [],
      gapScore: 10,
    },
    hypothesisCoverage: [],
    tokenUsage: { inputTokens: 1000, outputTokens: 300 },
  }),
}))

// Mock database
vi.mock('@/db/client', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'analysis-123' }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}))

// Mock inngest client
vi.mock('@/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((config, trigger, handler) => ({
      ...config,
      trigger,
      fn: handler,
    })),
  },
}))

/**
 * Creates a mock step object with vi.fn() for testing Inngest functions.
 * Tracks calls for assertion while executing the actual functions.
 */
function createMockStep() {
  const run = vi.fn().mockImplementation(async (_name: string, fn: () => unknown) => {
    return await fn()
  })
  const sendEvent = vi.fn().mockResolvedValue(undefined)
  const sleep = vi.fn().mockResolvedValue(undefined)

  return { run, sendEvent, sleep }
}

describe('analyzeNda Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs all agents in sequence', async () => {
    const event = {
      data: {
        documentId: 'doc-123',
        tenantId: 'tenant-456',
        source: 'web' as const,
      },
    }
    const step = createMockStep()

    // Access handler via the mock's fn property (bypassing private access)
    const handler = (analyzeNda as unknown as { fn: (ctx: unknown) => Promise<{ success: boolean; analysisId: string }> }).fn
    const result = await handler({ event, step })

    expect(step.run).toHaveBeenCalledWith('create-analysis', expect.any(Function))
    expect(step.run).toHaveBeenCalledWith('parser-agent', expect.any(Function))
    expect(step.run).toHaveBeenCalledWith('classifier-agent', expect.any(Function))
    expect(step.run).toHaveBeenCalledWith('risk-scorer-agent', expect.any(Function))
    expect(step.run).toHaveBeenCalledWith('gap-analyst-agent', expect.any(Function))
    expect(step.run).toHaveBeenCalledWith('persist-final', expect.any(Function))
    expect(result.success).toBe(true)
  })

  it('emits progress events at each stage', async () => {
    const event = {
      data: {
        documentId: 'doc-123',
        tenantId: 'tenant-456',
        source: 'web' as const,
      },
    }
    const step = createMockStep()

    const handler = (analyzeNda as unknown as { fn: (ctx: unknown) => Promise<unknown> }).fn
    await handler({ event, step })

    const sendEventCalls = step.sendEvent.mock.calls as Array<[string, { name: string }]>
    const progressEvents = sendEventCalls.filter(
      ([_name, payload]) => payload.name === 'nda/analysis.progress'
    )

    // Should have progress events for: parsing, classifying, scoring, analyzing_gaps, complete
    expect(progressEvents.length).toBeGreaterThanOrEqual(4)
  })

  it('handles word-addin source with content', async () => {
    const event = {
      data: {
        documentId: 'doc-789',
        tenantId: 'tenant-456',
        source: 'word-addin' as const,
        content: {
          rawText: 'NDA content from Word',
          paragraphs: [{ text: 'Test', style: 'Normal', isHeading: false }],
        },
        metadata: { title: 'Word NDA' },
      },
    }
    const step = createMockStep()

    const handler = (analyzeNda as unknown as { fn: (ctx: unknown) => Promise<{ success: boolean }> }).fn
    const result = await handler({ event, step })

    expect(result.success).toBe(true)
    // Parser should receive the content
    const parserCalls = (step.run.mock.calls as Array<[string, unknown]>).filter(
      ([name]) => name === 'parser-agent'
    )
    expect(parserCalls.length).toBe(1)
  })

  it('emits completion event with risk scores', async () => {
    const event = {
      data: {
        documentId: 'doc-123',
        tenantId: 'tenant-456',
        source: 'web' as const,
      },
    }
    const step = createMockStep()

    const handler = (analyzeNda as unknown as { fn: (ctx: unknown) => Promise<unknown> }).fn
    await handler({ event, step })

    const sendEventCalls = step.sendEvent.mock.calls as Array<[string, { name: string; data: Record<string, unknown> }]>
    const completionEvent = sendEventCalls.find(
      ([_name, payload]) => payload.name === 'nda/analysis.completed'
    )

    expect(completionEvent).toBeDefined()
    expect(completionEvent?.[1].data.overallRiskScore).toBeDefined()
    expect(completionEvent?.[1].data.overallRiskLevel).toBeDefined()
  })
})
