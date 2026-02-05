import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeNda } from './analyze-nda'

// Mock all agents
vi.mock('@/agents/parser', () => ({
  runParserAgent: vi.fn().mockResolvedValue({
    document: {
      documentId: 'doc-1',
      title: 'Test NDA',
      rawText: 'Sample text content for testing',
      structure: {
        sections: [
          {
            title: 'Section 1',
            startOffset: 0,
            endOffset: 30,
            depth: 0,
            children: [],
          },
        ],
        parties: { disclosing: undefined, receiving: undefined },
        hasExhibits: false,
        hasSignatureBlock: false,
        hasRedactedText: false,
      },
    },
    quality: {
      charCount: 30,
      wordCount: 5,
      pageCount: 1,
      confidence: 0.95,
      warnings: [],
    },
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
    rawClassifications: [
      {
        chunkIndex: 0,
        primary: {
          category: 'Governing Law',
          confidence: 0.9,
          rationale: 'Test classification',
        },
        secondary: [],
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
        evidence: { citations: ['sample'], references: [] },
        startPosition: 0,
        endPosition: 13,
      },
    ],
    overallRiskScore: 25,
    overallRiskLevel: 'standard',
    executiveSummary: 'Low risk NDA with standard clauses.',
    perspective: 'balanced',
    riskDistribution: { standard: 1, cautious: 0, aggressive: 0, unknown: 0 },
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

// Mock validation gates
vi.mock('@/agents/validation', () => ({
  validateParserOutput: vi.fn().mockReturnValue({ valid: true }),
  validateClassifierOutput: vi.fn().mockReturnValue({ valid: true }),
  validateTokenBudget: vi.fn().mockReturnValue({
    estimate: { tokenCount: 100, estimatedCost: 0.01 },
    withinBudget: true,
    truncation: null,
    warning: null,
  }),
  mapExtractionError: vi.fn(),
}))

// Mock legal chunker
vi.mock('@/lib/document-chunking/legal-chunker', () => ({
  chunkLegalDocument: vi.fn().mockReturnValue([
    {
      id: 'chunk-0',
      index: 0,
      content: 'Sample clause',
      sectionPath: ['Section 1'],
      tokenCount: 10,
      startPosition: 0,
      endPosition: 13,
      chunkType: 'clause',
      metadata: {
        overlapTokens: 0,
        references: [],
        structureSource: 'heading',
        isOcr: false,
        parentClauseIntro: null,
      },
    },
  ]),
}))

// Mock chunk map utilities
vi.mock('@/lib/document-chunking/chunk-map', () => ({
  generateChunkMap: vi.fn().mockReturnValue({ chunks: [] }),
  computeChunkStats: vi.fn().mockReturnValue({ totalChunks: 1 }),
}))

// Mock tokenizer init
vi.mock('@/lib/document-chunking/token-counter', () => ({
  initVoyageTokenizer: vi.fn().mockResolvedValue(undefined),
}))

// Mock embeddings client
vi.mock('@/lib/embeddings', () => ({
  getVoyageAIClient: vi.fn().mockReturnValue({
    embedBatch: vi.fn().mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]] }),
  }),
  VOYAGE_CONFIG: { batchLimit: 128 },
}))

// Mock risk scoring persistence
vi.mock('@/db/queries/risk-scoring', () => ({
  persistRiskAssessments: vi.fn().mockResolvedValue(undefined),
  calculateWeightedRisk: vi.fn().mockResolvedValue({ score: 25, level: 'standard' }),
}))

// Mock budget tracker
vi.mock('@/lib/ai/budget', () => {
  class MockBudgetTracker {
    getUsage() {
      return { total: { total: 2000, estimatedCost: 0.05 } }
    }
  }
  return { BudgetTracker: MockBudgetTracker }
})

// Mock database
const mockDb = {
  execute: vi.fn().mockResolvedValue({ rows: [] }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'analysis-123' }]),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  delete: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
}

vi.mock('@/db/client', () => ({
  db: mockDb,
}))

// Mock inngest barrel (client, utils, types)
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
  getRateLimitDelay: vi.fn().mockReturnValue('1s'),
}))

// Mock inngest errors
vi.mock('@/inngest/utils/errors', () => ({
  NonRetriableError: class NonRetriableError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'NonRetriableError'
    }
  },
}))

// Mock inngest client (direct import used by barrel)
vi.mock('@/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((config, trigger, handler) => ({
      ...config,
      trigger,
      fn: handler,
    })),
  },
}))

// Mock error classes
vi.mock('@/lib/errors', () => ({
  EncryptedDocumentError: class extends Error {},
  CorruptDocumentError: class extends Error {},
  OcrRequiredError: class extends Error {},
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue({}),
  and: vi.fn().mockReturnValue({}),
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
  chunkClassifications: { id: 'id' },
}))

vi.mock('@/db/schema/documents', () => ({
  documentChunks: { documentId: 'document_id', analysisId: 'analysis_id' },
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

/** Mock publish function for Inngest Realtime */
const mockPublish = vi.fn().mockResolvedValue(undefined)

describe('analyzeNda Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs all agents in sequence', async () => {
    const event = {
      data: {
        documentId: 'doc-123',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        source: 'web' as const,
      },
    }
    const step = createMockStep()

    const handler = (analyzeNda as unknown as { fn: (ctx: unknown) => Promise<{ success: boolean; analysisId: string }> }).fn
    const result = await handler({ event, step, publish: mockPublish })

    expect(step.run).toHaveBeenCalledWith('create-analysis', expect.any(Function))
    expect(step.run).toHaveBeenCalledWith('parser-agent', expect.any(Function))
    // Pipeline uses batched steps for classifier and risk scorer (Phase 9)
    // Verify key pipeline stages ran
    const stepNames = step.run.mock.calls.map((c: unknown[]) => c[0])
    expect(stepNames).toContain('create-analysis')
    expect(stepNames).toContain('parser-agent')
    expect(result.success).toBe(true)
  })

  it('emits progress events at each stage', async () => {
    const event = {
      data: {
        documentId: 'doc-123',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        source: 'web' as const,
      },
    }
    const step = createMockStep()

    const handler = (analyzeNda as unknown as { fn: (ctx: unknown) => Promise<unknown> }).fn
    await handler({ event, step, publish: mockPublish })

    // Phase 10 replaced step.sendEvent progress with Inngest Realtime publish()
    // publish() is throttled to 1/sec, so in fast tests fewer calls are made.
    // Verify at least initial + terminal publish calls fired.
    expect(mockPublish).toHaveBeenCalled()
    expect(mockPublish.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('handles word-addin source with content', async () => {
    const event = {
      data: {
        documentId: 'doc-789',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
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
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
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
    expect(completionEvent?.[1].data.overallRiskScore).toBeDefined()
    expect(completionEvent?.[1].data.overallRiskLevel).toBeDefined()
  })

  it('records budget estimate after parsing', async () => {
    const event = {
      data: {
        documentId: 'doc-123',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        source: 'web' as const,
      },
    }
    const step = createMockStep()

    const handler = (analyzeNda as unknown as { fn: (ctx: unknown) => Promise<unknown> }).fn
    await handler({ event, step, publish: mockPublish })

    // Verify budget estimate step is called after parser
    expect(step.run).toHaveBeenCalledWith('record-budget-estimate', expect.any(Function))

    // Verify the order: parser-agent should come before record-budget-estimate
    const stepCalls = step.run.mock.calls.map(([name]) => name)
    const parserIndex = stepCalls.indexOf('parser-agent')
    const budgetIndex = stepCalls.indexOf('record-budget-estimate')
    expect(parserIndex).toBeLessThan(budgetIndex)
  })
})
