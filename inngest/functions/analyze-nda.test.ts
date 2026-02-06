import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeNda } from './analyze-nda'

// Mock sub-functions referenced by step.invoke()
vi.mock('./nda-parse', () => ({
  ndaParse: { id: 'nda-parse' },
}))
vi.mock('./nda-chunk-embed', () => ({
  ndaChunkEmbed: { id: 'nda-chunk-embed' },
}))
vi.mock('./nda-classify', () => ({
  ndaClassify: { id: 'nda-classify' },
}))
vi.mock('./nda-score-risks', () => ({
  ndaScoreRisks: { id: 'nda-score-risks' },
}))
vi.mock('./nda-analyze-gaps', () => ({
  ndaAnalyzeGaps: { id: 'nda-analyze-gaps' },
}))

// Mock database
const mockDb = {
  execute: vi.fn().mockResolvedValue({ rows: [] }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}

vi.mock('@/db/client', () => ({
  db: mockDb,
}))

// Mock inngest barrel
vi.mock('@/inngest', () => ({
  inngest: {
    createFunction: vi.fn((config, trigger, handler) => ({
      ...config,
      trigger,
      fn: handler,
    })),
  },
  CONCURRENCY: { analysis: { limit: 5 } },
  RETRY_CONFIG: { default: { retries: 3 } },
  withTenantContext: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (ctx: { db: typeof mockDb }) => Promise<unknown>) => {
      return await fn({ db: mockDb })
    }
  ),
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue({}),
  sql: Object.assign(vi.fn().mockReturnValue({}), {
    raw: vi.fn().mockReturnValue({}),
  }),
}))

// Mock Inngest Realtime channels
vi.mock('@/inngest/channels', () => ({
  analysisChannel: vi.fn().mockReturnValue({
    progress: vi.fn().mockReturnValue({ topic: 'progress' }),
  }),
}))

// Mock schema tables
vi.mock('@/db/schema/analyses', () => ({
  analyses: { id: 'id' },
}))

/**
 * Creates a mock step object for the new orchestrator pattern.
 * Includes step.invoke() which returns mock sub-function results.
 */
function createMockStep() {
  const invokeResults: Record<string, unknown> = {
    'invoke-parse': {
      title: 'Test NDA',
      quality: { charCount: 30, wordCount: 5, pageCount: 1, confidence: 0.95, warnings: [] },
      rawTextLength: 30,
      wasTruncated: false,
    },
    'invoke-chunk-embed': {
      chunkCount: 5,
      embeddableCount: 4,
      boilerplateCount: 1,
    },
    'invoke-classify': {
      clauseCount: 3,
      classificationCount: 4,
      tokenUsage: {
        byAgent: { classifier: { input: 500, output: 100, total: 600, estimatedCost: 0.01 } },
        total: { input: 500, output: 100, total: 600, estimatedCost: 0.01 },
      },
    },
    'invoke-score-risks': {
      overallRiskScore: 25,
      overallRiskLevel: 'standard',
      weightedRiskScore: 30,
      weightedRiskLevel: 'standard',
      executiveSummary: 'Low risk NDA with standard clauses.',
      perspective: 'balanced',
      riskDistribution: { standard: 3, cautious: 0, aggressive: 0, unknown: 0 },
      assessmentCount: 3,
      tokenUsage: {
        byAgent: { riskScorer: { input: 800, output: 200, total: 1000, estimatedCost: 0.02 } },
        total: { input: 800, output: 200, total: 1000, estimatedCost: 0.02 },
      },
    },
    'invoke-analyze-gaps': {
      gapAnalysis: {
        gaps: [],
        coverageSummary: { totalCategories: 20, presentCount: 15, missingCount: 3, incompleteCount: 2, coveragePercent: 85 },
        presentCategories: ['Governing Law'],
        weakClauses: [],
      },
      tokenUsage: {
        byAgent: { gapAnalyst: { input: 1000, output: 300, total: 1300, estimatedCost: 0.03 } },
        total: { input: 1000, output: 300, total: 1300, estimatedCost: 0.03 },
      },
    },
  }

  const run = vi.fn().mockImplementation(async (_name: string, fn: () => unknown) => {
    return await fn()
  })
  const invoke = vi.fn().mockImplementation(async (stepId: string) => {
    return invokeResults[stepId]
  })
  const sendEvent = vi.fn().mockResolvedValue(undefined)
  const sleep = vi.fn().mockResolvedValue(undefined)

  return { run, invoke, sendEvent, sleep }
}

/** Mock publish function for Inngest Realtime */
const mockPublish = vi.fn().mockResolvedValue(undefined)

describe('analyzeNda Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invokes all 5 sub-functions in sequence', async () => {
    const event = {
      data: {
        documentId: 'doc-123',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        analysisId: 'analysis-abc',
        source: 'web' as const,
      },
    }
    const step = createMockStep()

    const handler = (analyzeNda as unknown as { fn: (ctx: unknown) => Promise<{ success: boolean; analysisId: string }> }).fn
    const result = await handler({ event, step, publish: mockPublish })

    // Verify init step ran
    expect(step.run).toHaveBeenCalledWith('init-analysis', expect.any(Function))

    // Verify all 5 sub-functions were invoked
    const invokeStepIds = step.invoke.mock.calls.map((c: unknown[]) => c[0])
    expect(invokeStepIds).toContain('invoke-parse')
    expect(invokeStepIds).toContain('invoke-chunk-embed')
    expect(invokeStepIds).toContain('invoke-classify')
    expect(invokeStepIds).toContain('invoke-score-risks')
    expect(invokeStepIds).toContain('invoke-analyze-gaps')

    // Verify order: parse before chunk-embed before classify etc.
    expect(invokeStepIds.indexOf('invoke-parse')).toBeLessThan(invokeStepIds.indexOf('invoke-chunk-embed'))
    expect(invokeStepIds.indexOf('invoke-chunk-embed')).toBeLessThan(invokeStepIds.indexOf('invoke-classify'))
    expect(invokeStepIds.indexOf('invoke-classify')).toBeLessThan(invokeStepIds.indexOf('invoke-score-risks'))
    expect(invokeStepIds.indexOf('invoke-score-risks')).toBeLessThan(invokeStepIds.indexOf('invoke-analyze-gaps'))

    expect(result.success).toBe(true)
    expect(result.analysisId).toBe('analysis-abc')
  })

  it('emits completion event with risk scores', async () => {
    const event = {
      data: {
        documentId: 'doc-123',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        analysisId: 'analysis-abc',
        source: 'web' as const,
      },
    }
    const step = createMockStep()

    const handler = (analyzeNda as unknown as { fn: (ctx: unknown) => Promise<unknown> }).fn
    await handler({ event, step, publish: mockPublish })

    const sendEventCalls = step.sendEvent.mock.calls as Array<[string, { name: string; data: Record<string, unknown> }]>
    const completionEvent = sendEventCalls.find(
      ([_name, payload]) => payload.name === 'nda/analysis.completed'
    )

    expect(completionEvent).toBeDefined()
    expect(completionEvent?.[1].data.overallRiskScore).toBe(25)
    expect(completionEvent?.[1].data.overallRiskLevel).toBe('standard')
  })

  it('publishes realtime progress at completion', async () => {
    const event = {
      data: {
        documentId: 'doc-123',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        analysisId: 'analysis-abc',
        source: 'web' as const,
      },
    }
    const step = createMockStep()

    const handler = (analyzeNda as unknown as { fn: (ctx: unknown) => Promise<unknown> }).fn
    await handler({ event, step, publish: mockPublish })

    expect(mockPublish).toHaveBeenCalled()
  })

  it('persists final results with aggregated token usage', async () => {
    const event = {
      data: {
        documentId: 'doc-123',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        analysisId: 'analysis-abc',
        source: 'web' as const,
      },
    }
    const step = createMockStep()

    const handler = (analyzeNda as unknown as { fn: (ctx: unknown) => Promise<unknown> }).fn
    await handler({ event, step, publish: mockPublish })

    // Verify persist-final step ran
    expect(step.run).toHaveBeenCalledWith('persist-final', expect.any(Function))

    // Verify DB update was called
    expect(mockDb.update).toHaveBeenCalled()
  })

  it('passes content and metadata for word-addin source', async () => {
    const event = {
      data: {
        documentId: 'doc-789',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        analysisId: 'analysis-xyz',
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
    const result = await handler({ event, step, publish: mockPublish })

    expect(result.success).toBe(true)

    // Verify parse was invoked with content and metadata
    const parseInvoke = step.invoke.mock.calls.find(
      (c: unknown[]) => c[0] === 'invoke-parse'
    )
    expect(parseInvoke).toBeDefined()
    expect(parseInvoke?.[1].data.content).toBeDefined()
    expect(parseInvoke?.[1].data.metadata).toBeDefined()
  })
})
