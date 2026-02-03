# Agent Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the foundational agent infrastructure from the approved design document.

**Architecture:** Vercel AI SDK 6 with AI Gateway, per-agent model configuration, cache-optimized prompts, and test utilities for API-free testing.

**Tech Stack:** AI SDK 6 (`ai@6.0.67`), Vercel AI Gateway, Zod 4, Vitest, pgvector, LRU cache

---

## Prerequisites

- Bootstrap pipeline complete (21K+ reference embeddings) ✅
- Inngest infrastructure in place ✅
- `ai@6.0.67` already installed ✅

---

## Task 1: Create AI Configuration Module

**Files:**
- Create: `lib/ai/config.ts`
- Create: `lib/ai/index.ts`
- Test: `lib/ai/config.test.ts`

### Step 1: Write the failing test

```typescript
// lib/ai/config.test.ts
import { describe, it, expect } from 'vitest'
import { MODELS, AGENT_MODELS, getAgentModel, GENERATION_CONFIG } from './config'

describe('AI Configuration', () => {
  it('exports model tiers', () => {
    expect(MODELS.fast).toBe('anthropic/claude-haiku-4.5')
    expect(MODELS.balanced).toBe('anthropic/claude-sonnet-4')
    expect(MODELS.best).toBe('anthropic/claude-sonnet-4.5')
    expect(MODELS.premium).toBe('anthropic/claude-opus-4.5')
  })

  it('exports per-agent model assignments', () => {
    expect(AGENT_MODELS.parser).toBe(MODELS.fast)
    expect(AGENT_MODELS.classifier).toBe(MODELS.balanced)
    expect(AGENT_MODELS.riskScorer).toBe(MODELS.best)
    expect(AGENT_MODELS.gapAnalyst).toBe(MODELS.best)
  })

  it('returns model instance for agent', () => {
    const model = getAgentModel('parser')
    expect(model).toBeDefined()
  })

  it('exports generation config with zero temperature', () => {
    expect(GENERATION_CONFIG.temperature).toBe(0)
    expect(GENERATION_CONFIG.maxTokens).toBe(4096)
  })
})
```

### Step 2: Run test to verify it fails

Run: `pnpm test lib/ai/config.test.ts`
Expected: FAIL with "Cannot find module './config'"

### Step 3: Write minimal implementation

```typescript
// lib/ai/config.ts
import { gateway } from 'ai'

/** Available models via Vercel AI Gateway */
export const MODELS = {
  fast: 'anthropic/claude-haiku-4.5',
  balanced: 'anthropic/claude-sonnet-4',
  best: 'anthropic/claude-sonnet-4.5',
  premium: 'anthropic/claude-opus-4.5',
} as const

export type ModelTier = keyof typeof MODELS

/** Per-agent model configuration */
export const AGENT_MODELS = {
  parser: MODELS.fast,
  classifier: MODELS.balanced,
  riskScorer: MODELS.best,
  gapAnalyst: MODELS.best,
} as const

export type AgentType = keyof typeof AGENT_MODELS

/** Get model instance for an agent */
export function getAgentModel(agent: AgentType) {
  return gateway(AGENT_MODELS[agent])
}

/** Override model for specific agent (useful for testing/tuning) */
export function getModelOverride(agent: AgentType, tier: ModelTier) {
  return gateway(MODELS[tier])
}

/** Default generation config */
export const GENERATION_CONFIG = {
  temperature: 0,
  maxTokens: 4096,
} as const
```

### Step 4: Create barrel export

```typescript
// lib/ai/index.ts
export * from './config'
```

### Step 5: Run test to verify it passes

Run: `pnpm test lib/ai/config.test.ts`
Expected: PASS

### Step 6: Commit

```bash
git add lib/ai/config.ts lib/ai/config.test.ts lib/ai/index.ts
git commit -m "$(cat <<'EOF'
feat(agents): add AI configuration module

- Model tiers via Vercel AI Gateway
- Per-agent model assignments (Haiku→parser, Sonnet 4→classifier, Sonnet 4.5→risk/gap)
- Zero temperature for deterministic legal analysis

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create Token Budget Tracker

**Files:**
- Create: `lib/ai/budget.ts`
- Update: `lib/ai/index.ts`
- Test: `lib/ai/budget.test.ts`

### Step 1: Write the failing test

```typescript
// lib/ai/budget.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { BudgetTracker, DOCUMENT_TOKEN_BUDGET, AGENT_BUDGETS, PRICING } from './budget'

describe('BudgetTracker', () => {
  let tracker: BudgetTracker

  beforeEach(() => {
    tracker = new BudgetTracker()
  })

  it('starts with zero tokens used', () => {
    expect(tracker.totalTokens).toBe(0)
    expect(tracker.remaining).toBe(DOCUMENT_TOKEN_BUDGET)
    expect(tracker.isExceeded).toBe(false)
    expect(tracker.isWarning).toBe(false)
  })

  it('records usage from an agent call', () => {
    tracker.record('parser', 1000, 500)
    expect(tracker.totalTokens).toBe(1500)
    expect(tracker.remaining).toBe(DOCUMENT_TOKEN_BUDGET - 1500)
  })

  it('accumulates usage for the same agent', () => {
    tracker.record('parser', 1000, 500)
    tracker.record('parser', 2000, 1000)
    expect(tracker.totalTokens).toBe(4500)
  })

  it('tracks usage per agent', () => {
    tracker.record('parser', 1000, 500)
    tracker.record('classifier', 2000, 1000)
    const usage = tracker.getUsage()
    expect(usage.byAgent['parser'].total).toBe(1500)
    expect(usage.byAgent['classifier'].total).toBe(3000)
    expect(usage.total.total).toBe(4500)
  })

  it('warns at 80% budget', () => {
    const warningThreshold = DOCUMENT_TOKEN_BUDGET * 0.8
    tracker.record('test', warningThreshold, 0)
    expect(tracker.isWarning).toBe(true)
    expect(tracker.isExceeded).toBe(false)
  })

  it('marks exceeded at 100% budget', () => {
    tracker.record('test', DOCUMENT_TOKEN_BUDGET, 0)
    expect(tracker.isExceeded).toBe(true)
  })

  it('calculates estimated cost', () => {
    tracker.record('test', 1_000_000, 100_000) // 1M input, 100K output
    const usage = tracker.getUsage()
    // Input: 1M * $3/1M = $3, Output: 100K * $15/1M = $1.50
    expect(usage.total.estimatedCost).toBeCloseTo(4.5, 2)
  })
})

describe('Budget constants', () => {
  it('defines document budget as 212K tokens', () => {
    expect(DOCUMENT_TOKEN_BUDGET).toBe(212_000)
  })

  it('defines per-agent budgets that sum to ~100%', () => {
    const total = Object.values(AGENT_BUDGETS).reduce((a, b) => a + b, 0)
    expect(total).toBe(212_000)
  })

  it('defines pricing for Sonnet 4.5', () => {
    expect(PRICING.input).toBe(3.00)
    expect(PRICING.output).toBe(15.00)
  })
})
```

### Step 2: Run test to verify it fails

Run: `pnpm test lib/ai/budget.test.ts`
Expected: FAIL with "Cannot find module './budget'"

### Step 3: Write minimal implementation

```typescript
// lib/ai/budget.ts
/** Token budget per document (from PRD) */
export const DOCUMENT_TOKEN_BUDGET = 212_000

/** Per-agent budget allocation */
export const AGENT_BUDGETS = {
  parser: 20_000,
  classifier: 60_000,
  riskScorer: 80_000,
  gapAnalyst: 52_000,
} as const

/** Pricing per 1M tokens (Sonnet 4.5 rates) */
export const PRICING = {
  input: 3.00,
  output: 15.00,
} as const

export interface TokenUsage {
  input: number
  output: number
  total: number
  estimatedCost: number
}

export interface AggregatedUsage {
  byAgent: Record<string, TokenUsage>
  total: TokenUsage
}

/** Budget tracker for a document analysis run */
export class BudgetTracker {
  private usage: Map<string, TokenUsage> = new Map()

  constructor(private maxTokens: number = DOCUMENT_TOKEN_BUDGET) {}

  /** Record usage from an agent call */
  record(agent: string, input: number, output: number): void {
    const existing = this.usage.get(agent) ?? { input: 0, output: 0, total: 0, estimatedCost: 0 }
    const cost = this.calculateCost(input, output)

    this.usage.set(agent, {
      input: existing.input + input,
      output: existing.output + output,
      total: existing.total + input + output,
      estimatedCost: existing.estimatedCost + cost,
    })
  }

  /** Get total tokens used */
  get totalTokens(): number {
    return Array.from(this.usage.values()).reduce((sum, u) => sum + u.total, 0)
  }

  /** Get remaining budget */
  get remaining(): number {
    return Math.max(0, this.maxTokens - this.totalTokens)
  }

  /** Check if budget exceeded */
  get isExceeded(): boolean {
    return this.totalTokens >= this.maxTokens
  }

  /** Check if approaching budget (80% threshold) */
  get isWarning(): boolean {
    return this.totalTokens >= this.maxTokens * 0.8
  }

  /** Get aggregated usage report */
  getUsage(): AggregatedUsage {
    const byAgent = Object.fromEntries(this.usage)
    const total = {
      input: Array.from(this.usage.values()).reduce((sum, u) => sum + u.input, 0),
      output: Array.from(this.usage.values()).reduce((sum, u) => sum + u.output, 0),
      total: this.totalTokens,
      estimatedCost: Array.from(this.usage.values()).reduce((sum, u) => sum + u.estimatedCost, 0),
    }
    return { byAgent, total }
  }

  private calculateCost(input: number, output: number): number {
    const inputCost = (input / 1_000_000) * PRICING.input
    const outputCost = (output / 1_000_000) * PRICING.output
    return Math.round((inputCost + outputCost) * 10000) / 10000
  }
}
```

### Step 4: Update barrel export

```typescript
// lib/ai/index.ts
export * from './config'
export * from './budget'
```

### Step 5: Run test to verify it passes

Run: `pnpm test lib/ai/budget.test.ts`
Expected: PASS

### Step 6: Commit

```bash
git add lib/ai/budget.ts lib/ai/budget.test.ts lib/ai/index.ts
git commit -m "$(cat <<'EOF'
feat(agents): add token budget tracker

- 212K token budget per document (PRD spec)
- Per-agent allocation tracking
- Cost estimation at Sonnet 4.5 rates
- Warning at 80%, exceeded at 100%

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create Core Agent Types

**Files:**
- Create: `agents/types.ts`
- Create: `agents/index.ts`
- Test: `agents/types.test.ts`

### Step 1: Write the failing test

```typescript
// agents/types.test.ts
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
```

### Step 2: Run test to verify it fails

Run: `pnpm test agents/types.test.ts`
Expected: FAIL with "Cannot find module './types'"

### Step 3: Write minimal implementation

```typescript
// agents/types.ts
import { z } from 'zod'

// ============================================================================
// Risk Levels (PRD-aligned)
// ============================================================================

/** Risk levels per PRD (not low/medium/high) */
export const RISK_LEVELS = [
  'standard',
  'cautious',
  'aggressive',
  'unknown',
] as const

export type RiskLevel = (typeof RISK_LEVELS)[number]

export const riskLevelSchema = z.enum(RISK_LEVELS)

/** Gap status for clause coverage */
export const GAP_STATUS = [
  'present',
  'weak',
  'missing',
] as const

export type GapStatus = (typeof GAP_STATUS)[number]

// ============================================================================
// CUAD Categories
// ============================================================================

/** CUAD 41-category taxonomy (title case for abbreviations per CLAUDE.md) */
export const CUAD_CATEGORIES = [
  'Document Name',
  'Parties',
  'Agreement Date',
  'Effective Date',
  'Expiration Date',
  'Renewal Term',
  'Notice Period To Terminate Renewal',
  'Governing Law',
  'Most Favored Nation',
  'Non-Compete',
  'Exclusivity',
  'No-Solicit Of Customers',
  'Competitive Restriction Exception',
  'No-Solicit Of Employees',
  'Non-Disparagement',
  'Termination For Convenience',
  'Rofr/Rofo/Rofn',
  'Change Of Control',
  'Anti-Assignment',
  'Revenue/Profit Sharing',
  'Price Restrictions',
  'Minimum Commitment',
  'Volume Restriction',
  'Ip Ownership Assignment',
  'Joint Ip Ownership',
  'License Grant',
  'Non-Transferable License',
  'Affiliate License',
  'Unlimited/All-You-Can-Eat-License',
  'Irrevocable Or Perpetual License',
  'Source Code Escrow',
  'Post-Termination Services',
  'Audit Rights',
  'Uncapped Liability',
  'Cap On Liability',
  'Liquidated Damages',
  'Warranty Duration',
  'Insurance',
  'Covenant Not To Sue',
  'Third Party Beneficiary',
  'Unknown',
] as const

export type CuadCategory = (typeof CUAD_CATEGORIES)[number]

export const cuadCategorySchema = z.enum(CUAD_CATEGORIES)

// ============================================================================
// ContractNLI Categories
// ============================================================================

/** ContractNLI 17 hypothesis categories */
export const CONTRACT_NLI_CATEGORIES = [
  'Purpose Limitation',
  'Permitted Disclosure',
  'Third Party Disclosure',
  'Standard of Care',
  'Survival Period',
  'Termination',
  'Return/Destruction',
  'Ip License',
  'Warranties',
  'Liability Limitation',
  'Governing Law',
  'Legal Compulsion',
  'Public Information Exception',
  'Prior Knowledge Exception',
  'Independent Development Exception',
  'Assignment',
  'Amendment',
] as const

export type ContractNLICategory = (typeof CONTRACT_NLI_CATEGORIES)[number]

// ============================================================================
// Agent Output Types
// ============================================================================

/** Classification result from Classifier agent */
export interface ClassificationResult {
  clauseId: string
  category: CuadCategory
  secondaryCategories: CuadCategory[]
  confidence: number
  reasoning: string
}

export const classificationSchema = z.object({
  category: cuadCategorySchema,
  secondaryCategories: z.array(cuadCategorySchema).max(2).default([]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
})

/** Risk assessment from Risk Scorer agent */
export interface RiskAssessment {
  clauseId: string
  riskLevel: RiskLevel
  confidence: number
  explanation: string
  evidence: {
    citations: string[]
    comparisons: string[]
    statistic?: string
  }
}

export const riskAssessmentSchema = z.object({
  riskLevel: riskLevelSchema,
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  evidence: z.object({
    citations: z.array(z.string()).min(1),
    comparisons: z.array(z.string()).min(1),
    statistic: z.string().optional(),
  }),
})

/** Hypothesis coverage from Gap Analyst */
export interface HypothesisCoverage {
  hypothesisId: string
  category: ContractNLICategory
  status: 'entailment' | 'contradiction' | 'not_mentioned'
  supportingClause?: string
  explanation: string
}

export const hypothesisCoverageSchema = z.object({
  hypothesisId: z.string(),
  category: z.enum(CONTRACT_NLI_CATEGORIES),
  status: z.enum(['entailment', 'contradiction', 'not_mentioned']),
  supportingClause: z.string().optional(),
  explanation: z.string(),
})

/** Gap analysis result */
export interface GapAnalysis {
  presentCategories: CuadCategory[]
  missingCategories: Array<{
    category: CuadCategory
    importance: 'critical' | 'important' | 'optional'
    explanation: string
  }>
  weakClauses: Array<{
    clauseId: string
    category: CuadCategory
    issue: string
    recommendation: string
  }>
  hypothesisCoverage: HypothesisCoverage[]
  gapScore: number
}
```

### Step 4: Create barrel export

```typescript
// agents/index.ts
export * from './types'
```

### Step 5: Run test to verify it passes

Run: `pnpm test agents/types.test.ts`
Expected: PASS

### Step 6: Commit

```bash
git add agents/types.ts agents/types.test.ts agents/index.ts
git commit -m "$(cat <<'EOF'
feat(agents): add core agent types

- PRD-aligned risk levels (standard/cautious/aggressive/unknown)
- CUAD 41-category taxonomy with title case abbreviations
- ContractNLI 17 hypothesis categories
- Zod schemas for structured output validation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement Vector Search Tool

**Files:**
- Replace: `agents/tools/vector-search.ts`
- Create: `agents/tools/index.ts`
- Test: `agents/tools/vector-search.test.ts`

### Step 1: Write the failing test

```typescript
// agents/tools/vector-search.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { vectorSearchTool, findSimilarClauses, type VectorSearchResult } from './vector-search'

// Mock the database and embeddings
vi.mock('@/db/client', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      {
        id: 'emb-1',
        content: 'This Agreement shall be governed by Delaware law.',
        category: 'Governing Law',
        distance: 0.15,
        documentId: 'doc-1',
      },
    ]),
  },
}))

vi.mock('@/lib/embeddings', () => ({
  getVoyageAIClient: vi.fn().mockReturnValue({
    embed: vi.fn().mockResolvedValue({
      embedding: new Array(1024).fill(0.1),
      tokens: 50,
      fromCache: false,
    }),
  }),
}))

describe('vectorSearchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has correct description', () => {
    expect(vectorSearchTool.description).toContain('CUAD')
    expect(vectorSearchTool.description).toContain('reference corpus')
  })

  it('defines query, category, and limit parameters', () => {
    const params = vectorSearchTool.parameters
    expect(params.shape.query).toBeDefined()
    expect(params.shape.category).toBeDefined()
    expect(params.shape.limit).toBeDefined()
  })
})

describe('findSimilarClauses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns search results', async () => {
    const results = await findSimilarClauses('governing law clause')
    expect(results).toHaveLength(1)
    expect(results[0].category).toBe('Governing Law')
  })

  it('accepts optional category filter', async () => {
    const results = await findSimilarClauses('test query', { category: 'Non-Compete' })
    expect(results).toBeDefined()
  })

  it('accepts optional limit', async () => {
    const results = await findSimilarClauses('test query', { limit: 3 })
    expect(results).toBeDefined()
  })
})
```

### Step 2: Run test to verify it fails

Run: `pnpm test agents/tools/vector-search.test.ts`
Expected: FAIL (current implementation throws "Not implemented")

### Step 3: Write the implementation

```typescript
// agents/tools/vector-search.ts
/**
 * Vector Search Tool
 *
 * AI SDK tool for semantic similarity search across reference documents.
 * Uses Voyage AI voyage-law-2 embeddings with pgvector.
 *
 * @module agents/tools/vector-search
 */

import { tool } from 'ai'
import { z } from 'zod'
import { db } from '@/db/client'
import { referenceEmbeddings, referenceDocuments } from '@/db/schema/reference'
import { cosineDistance, lt, eq, and, sql } from 'drizzle-orm'
import { getVoyageAIClient } from '@/lib/embeddings'
import { LRUCache } from 'lru-cache'
import type { CuadCategory } from '../types'

/** Search result from vector query */
export interface VectorSearchResult {
  id: string
  content: string
  category: string
  similarity: number
  source: string
}

/** Cache for search results (5 min TTL, 500 entries) */
const searchCache = new LRUCache<string, VectorSearchResult[]>({
  max: 500,
  ttl: 1000 * 60 * 5,
})

/**
 * AI SDK tool for agents to search reference corpus.
 * Finds similar clauses from CUAD/ContractNLI embeddings.
 */
export const vectorSearchTool = tool({
  description:
    'Search the CUAD legal reference corpus for similar clauses. ' +
    'Use to find examples of standard clause language for comparison.',
  parameters: z.object({
    query: z.string().describe('Clause text to find similar examples for'),
    category: z.string().optional().describe('Filter by CUAD category'),
    limit: z.number().min(1).max(10).default(5).describe('Max results (1-10)'),
  }),
  execute: async ({ query, category, limit }) => {
    // Check cache
    const cacheKey = `${query.slice(0, 100)}:${category ?? 'all'}:${limit}`
    const cached = searchCache.get(cacheKey)
    if (cached) return cached

    // Generate query embedding
    const voyageClient = getVoyageAIClient()
    const { embedding } = await voyageClient.embed(query, 'query')

    // Search with cosine distance
    const distanceThreshold = 0.3 // similarity > 0.7

    const whereConditions = [
      lt(cosineDistance(referenceEmbeddings.embedding, embedding), distanceThreshold),
    ]
    if (category) {
      whereConditions.push(eq(referenceEmbeddings.category, category))
    }

    const results = await db
      .select({
        id: referenceEmbeddings.id,
        content: referenceEmbeddings.content,
        category: referenceEmbeddings.category,
        distance: cosineDistance(referenceEmbeddings.embedding, embedding),
        documentId: referenceEmbeddings.documentId,
      })
      .from(referenceEmbeddings)
      .where(and(...whereConditions))
      .orderBy(cosineDistance(referenceEmbeddings.embedding, embedding))
      .limit(limit)

    // Fetch source document titles
    const docIds = [...new Set(results.map(r => r.documentId))]
    const docs = docIds.length > 0
      ? await db
          .select({ id: referenceDocuments.id, title: referenceDocuments.title })
          .from(referenceDocuments)
          .where(sql`${referenceDocuments.id} IN (${sql.join(docIds.map(id => sql`${id}`), sql`, `)})`)
      : []

    const docMap = new Map(docs.map(d => [d.id, d.title]))

    const searchResults: VectorSearchResult[] = results.map(r => ({
      id: r.id,
      content: r.content.slice(0, 500),
      category: r.category ?? 'Unknown',
      similarity: Math.round((1 - (r.distance as number)) * 100) / 100,
      source: docMap.get(r.documentId) ?? 'Unknown',
    }))

    // Cache results
    searchCache.set(cacheKey, searchResults)

    return searchResults
  },
})

/**
 * Direct function for non-agent use (e.g., batch processing).
 */
export async function findSimilarClauses(
  query: string,
  options: { category?: CuadCategory; limit?: number } = {}
): Promise<VectorSearchResult[]> {
  return vectorSearchTool.execute({
    query,
    category: options.category,
    limit: options.limit ?? 5,
  })
}

/** Clear search cache (for testing) */
export function clearSearchCache(): void {
  searchCache.clear()
}
```

### Step 4: Create barrel export

```typescript
// agents/tools/index.ts
export * from './vector-search'
```

### Step 5: Update agents barrel export

```typescript
// agents/index.ts
export * from './types'
export * from './tools'
```

### Step 6: Run test to verify it passes

Run: `pnpm test agents/tools/vector-search.test.ts`
Expected: PASS

### Step 7: Commit

```bash
git add agents/tools/vector-search.ts agents/tools/vector-search.test.ts agents/tools/index.ts agents/index.ts
git commit -m "$(cat <<'EOF'
feat(agents): implement vector search tool

- AI SDK tool wrapper for pgvector similarity search
- LRU cache (5 min TTL, 500 entries)
- Category filtering support
- Direct function for non-agent use

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create Classifier Prompt

**Files:**
- Create: `agents/prompts/classifier.ts`
- Create: `agents/prompts/index.ts`
- Test: `agents/prompts/classifier.test.ts`

### Step 1: Write the failing test

```typescript
// agents/prompts/classifier.test.ts
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
```

### Step 2: Run test to verify it fails

Run: `pnpm test agents/prompts/classifier.test.ts`
Expected: FAIL with "Cannot find module './classifier'"

### Step 3: Write minimal implementation

```typescript
// agents/prompts/classifier.ts
import { CUAD_CATEGORIES } from '../types'

/**
 * Classifier system prompt - CACHE OPTIMIZED
 * Static content (~2000 tokens) cached after first call.
 */
export const CLASSIFIER_SYSTEM_PROMPT = `You are a legal clause classifier specializing in NDA analysis.
Your task is to classify legal text into the CUAD 41-category taxonomy.

## CUAD Categories (41 total)
${CUAD_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Classification Guidelines

1. **Primary Category**: Assign exactly one most relevant category
2. **Secondary Categories**: Up to 2 additional categories if clause clearly spans multiple topics
3. **Unknown**: Use only when no category fits after careful consideration

## Confidence Scoring

- 0.9-1.0: Unambiguous match, clear legal language
- 0.7-0.9: Strong match with minor ambiguity
- 0.5-0.7: Moderate confidence, recommend human review
- <0.5: Low confidence, uncertain classification

## Important Notes

- Focus on legal substance, not just keywords
- "Term" could be Renewal Term OR Expiration Date - read carefully
- NDA-specific clauses may map to multiple categories
- Compare against provided reference examples

## Output Format (JSON)
{
  "category": "Primary CUAD category",
  "secondaryCategories": [],
  "confidence": 0.85,
  "reasoning": "Brief explanation of classification rationale"
}`

/**
 * Classifier user prompt - MINIMAL for cache efficiency.
 * Only dynamic content: clause text and references.
 */
export function createClassifierPrompt(
  clauseText: string,
  references: Array<{ content: string; category: string; similarity: number }>
): string {
  const refBlock = references.length > 0
    ? references
        .map((r, i) => `[${i + 1}] ${r.category} (${Math.round(r.similarity * 100)}%): ${r.content.slice(0, 200)}...`)
        .join('\n')
    : 'No similar references found.'

  return `## Clause to Classify
${clauseText}

## Similar Reference Clauses
${refBlock}

Classify this clause. Return JSON only.`
}
```

### Step 4: Create barrel export

```typescript
// agents/prompts/index.ts
export * from './classifier'

/** Legal disclaimer for all outputs */
export const LEGAL_DISCLAIMER =
  'This analysis is AI-generated and does not constitute legal advice. ' +
  'Consult a qualified attorney for legal guidance.'
```

### Step 5: Update agents barrel export

```typescript
// agents/index.ts
export * from './types'
export * from './tools'
export * from './prompts'
```

### Step 6: Run test to verify it passes

Run: `pnpm test agents/prompts/classifier.test.ts`
Expected: PASS

### Step 7: Commit

```bash
git add agents/prompts/classifier.ts agents/prompts/classifier.test.ts agents/prompts/index.ts agents/index.ts
git commit -m "$(cat <<'EOF'
feat(agents): add classifier prompt template

- Cache-optimized structure (static system, minimal user)
- All 41 CUAD categories in system prompt
- Confidence scoring guidance
- JSON output format

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Create Risk Scorer Prompt

**Files:**
- Create: `agents/prompts/risk-scorer.ts`
- Update: `agents/prompts/index.ts`
- Test: `agents/prompts/risk-scorer.test.ts`

### Step 1: Write the failing test

```typescript
// agents/prompts/risk-scorer.test.ts
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
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('Scope')
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('Duration')
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('Remedies')
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('Balance')
  })

  it('requires evidence in assessments', () => {
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('Citations')
    expect(RISK_SCORER_SYSTEM_PROMPT).toContain('Comparisons')
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
```

### Step 2: Run test to verify it fails

Run: `pnpm test agents/prompts/risk-scorer.test.ts`
Expected: FAIL with "Cannot find module './risk-scorer'"

### Step 3: Write minimal implementation

```typescript
// agents/prompts/risk-scorer.ts
import { RISK_LEVELS } from '../types'

/**
 * Risk Scorer system prompt - CACHE OPTIMIZED
 */
export const RISK_SCORER_SYSTEM_PROMPT = `You are a legal risk assessment expert specializing in NDA analysis.
Your task is to evaluate clause risk levels with evidence-based explanations.

## Risk Levels

${RISK_LEVELS.map(level => {
  const descriptions: Record<string, string> = {
    standard: 'Normal, market-friendly terms found in most NDAs. Balanced obligations.',
    cautious: 'Slightly one-sided but generally acceptable. Minor negotiation may be warranted.',
    aggressive: 'Clearly one-sided or unusual provisions. Significant exposure, negotiate.',
    unknown: 'Cannot determine risk level due to ambiguous or unclear language.',
  }
  return `- **${level}**: ${descriptions[level]}`
}).join('\n')}

## Assessment Criteria

1. **Scope**: Broader scope = higher risk (worldwide vs. specific geography)
2. **Duration**: Longer duration = higher risk (5 years vs. 2 years)
3. **Remedies**: Unlimited liability or liquidated damages = higher risk
4. **Balance**: One-sided enforcement or obligations = higher risk
5. **Market Standard**: Compare to reference corpus examples

## Evidence Requirements (MANDATORY)

Every assessment MUST include:
1. **Citations**: Specific quotes from the clause text
2. **Comparisons**: How this compares to reference examples
3. **Statistics**: Quantitative context when available (e.g., "exceeds 87% of NDAs")

## Output Format (JSON)
{
  "riskLevel": "standard|cautious|aggressive|unknown",
  "confidence": 0.85,
  "explanation": "Plain-language explanation of risk assessment",
  "evidence": {
    "citations": ["quoted text from clause"],
    "comparisons": ["comparison to reference corpus"],
    "statistic": "optional quantitative context"
  }
}`

/**
 * Risk Scorer user prompt - MINIMAL for cache efficiency.
 */
export function createRiskScorerPrompt(
  clauseText: string,
  category: string,
  references: Array<{ content: string; category: string; similarity: number }>
): string {
  const refBlock = references.length > 0
    ? references
        .map((r, i) => `[${i + 1}] (${Math.round(r.similarity * 100)}% similar): ${r.content.slice(0, 200)}...`)
        .join('\n')
    : 'No references available.'

  return `## Clause to Assess
Category: ${category}

${clauseText}

## Reference Clauses for Comparison
${refBlock}

Assess the risk level. Return JSON only.`
}
```

### Step 4: Update barrel export

```typescript
// agents/prompts/index.ts
export * from './classifier'
export * from './risk-scorer'

/** Legal disclaimer for all outputs */
export const LEGAL_DISCLAIMER =
  'This analysis is AI-generated and does not constitute legal advice. ' +
  'Consult a qualified attorney for legal guidance.'
```

### Step 5: Run test to verify it passes

Run: `pnpm test agents/prompts/risk-scorer.test.ts`
Expected: PASS

### Step 6: Commit

```bash
git add agents/prompts/risk-scorer.ts agents/prompts/risk-scorer.test.ts agents/prompts/index.ts
git commit -m "$(cat <<'EOF'
feat(agents): add risk scorer prompt template

- PRD-aligned risk levels with descriptions
- Assessment criteria (scope, duration, remedies, balance)
- Mandatory evidence requirements
- Cache-optimized structure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Create Gap Analyst Prompt

**Files:**
- Create: `agents/prompts/gap-analyst.ts`
- Update: `agents/prompts/index.ts`
- Test: `agents/prompts/gap-analyst.test.ts`

### Step 1: Write the failing test

```typescript
// agents/prompts/gap-analyst.test.ts
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
```

### Step 2: Run test to verify it fails

Run: `pnpm test agents/prompts/gap-analyst.test.ts`
Expected: FAIL with "Cannot find module './gap-analyst'"

### Step 3: Write minimal implementation

```typescript
// agents/prompts/gap-analyst.ts
/** Categories critical for NDAs */
export const CRITICAL_CATEGORIES = [
  'Parties',
  'Effective Date',
  'Governing Law',
] as const

/** Categories important for NDAs */
export const IMPORTANT_CATEGORIES = [
  'Expiration Date',
  'Non-Compete',
  'No-Solicit Of Employees',
  'No-Solicit Of Customers',
  'Cap On Liability',
  'Termination For Convenience',
] as const

/** ContractNLI hypotheses for NDA gap analysis */
export const CONTRACT_NLI_HYPOTHESES = [
  { id: 'nli-1', category: 'Purpose Limitation', importance: 'critical' as const,
    hypothesis: 'Confidential information shall be used solely for evaluating the proposed transaction.' },
  { id: 'nli-2', category: 'Permitted Disclosure', importance: 'important' as const,
    hypothesis: 'The Receiving Party may share confidential information with its employees.' },
  { id: 'nli-3', category: 'Standard of Care', importance: 'critical' as const,
    hypothesis: 'The Receiving Party shall protect confidential information with the same degree of care as its own.' },
  { id: 'nli-4', category: 'Survival Period', importance: 'important' as const,
    hypothesis: 'Confidentiality obligations survive termination for a specified period.' },
  { id: 'nli-5', category: 'Return/Destruction', importance: 'important' as const,
    hypothesis: 'Confidential information shall be returned or destroyed upon termination.' },
  { id: 'nli-6', category: 'Legal Compulsion', importance: 'critical' as const,
    hypothesis: 'Disclosure is permitted if required by law.' },
  { id: 'nli-7', category: 'Public Information Exception', importance: 'critical' as const,
    hypothesis: 'Publicly known information is excluded from confidentiality.' },
  { id: 'nli-8', category: 'Prior Knowledge Exception', importance: 'important' as const,
    hypothesis: 'Information known before disclosure is excluded.' },
  { id: 'nli-9', category: 'Independent Development Exception', importance: 'important' as const,
    hypothesis: 'Independently developed information is excluded.' },
  { id: 'nli-10', category: 'Governing Law', importance: 'critical' as const,
    hypothesis: 'The agreement specifies governing jurisdiction.' },
] as const

/**
 * Gap Analyst system prompt - CACHE OPTIMIZED
 */
export const GAP_ANALYST_SYSTEM_PROMPT = `You are an NDA completeness analyst.
Identify missing clauses, weak protections, and coverage gaps.

## Category Importance for NDAs

### Critical (Must Have)
${CRITICAL_CATEGORIES.map(c => `- ${c}`).join('\n')}

### Important (Should Have)
${IMPORTANT_CATEGORIES.map(c => `- ${c}`).join('\n')}

## ContractNLI Hypothesis Testing

For each hypothesis, determine coverage status:
- **entailment**: NDA clause supports/includes this protection
- **contradiction**: NDA clause explicitly opposes this
- **not_mentioned**: No clause addresses this topic

### Hypotheses to Test
${CONTRACT_NLI_HYPOTHESES.map(h => `- [${h.id}] ${h.category} (${h.importance}): "${h.hypothesis}"`).join('\n')}

## Gap Score Calculation

- Missing critical category: +15 points
- Missing important category: +8 points
- Weak critical clause: +10 points
- Weak important clause: +5 points
- Critical hypothesis not mentioned: +10 points
- Hypothesis contradicted: +15 points

Cap total at 100. Lower score = more complete NDA.

## Output Format (JSON)
{
  "presentCategories": ["list of CUAD categories found"],
  "missingCategories": [
    { "category": "...", "importance": "critical|important|optional", "explanation": "..." }
  ],
  "weakClauses": [
    { "clauseId": "...", "category": "...", "issue": "...", "recommendation": "..." }
  ],
  "hypothesisCoverage": [
    { "hypothesisId": "nli-1", "category": "...", "status": "entailment|contradiction|not_mentioned", "explanation": "..." }
  ],
  "gapScore": 25
}`

/**
 * Gap Analyst user prompt - MINIMAL for cache efficiency.
 */
export function createGapAnalystPrompt(
  documentSummary: string,
  presentCategories: string[],
  classifiedClauses: Array<{ id: string; category: string; text: string }>
): string {
  const clauseBlock = classifiedClauses
    .map(c => `[${c.id}] ${c.category}: ${c.text.slice(0, 150)}...`)
    .join('\n')

  return `## Document Summary
${documentSummary}

## Categories Found (${presentCategories.length})
${presentCategories.join(', ') || 'None identified'}

## Classified Clauses
${clauseBlock || 'No clauses provided.'}

Analyze gaps. Return JSON only.`
}
```

### Step 4: Update barrel export

```typescript
// agents/prompts/index.ts
export * from './classifier'
export * from './risk-scorer'
export * from './gap-analyst'

/** Legal disclaimer for all outputs */
export const LEGAL_DISCLAIMER =
  'This analysis is AI-generated and does not constitute legal advice. ' +
  'Consult a qualified attorney for legal guidance.'
```

### Step 5: Run test to verify it passes

Run: `pnpm test agents/prompts/gap-analyst.test.ts`
Expected: PASS

### Step 6: Commit

```bash
git add agents/prompts/gap-analyst.ts agents/prompts/gap-analyst.test.ts agents/prompts/index.ts
git commit -m "$(cat <<'EOF'
feat(agents): add gap analyst prompt template

- Critical/important category classifications
- 10 ContractNLI hypotheses with importance levels
- Gap score calculation algorithm
- Cache-optimized structure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Create Test Utilities

**Files:**
- Create: `agents/testing/mock-ai.ts`
- Create: `agents/testing/fixtures.ts`
- Create: `agents/testing/index.ts`
- Test: `agents/testing/mock-ai.test.ts`

### Step 1: Write the failing test

```typescript
// agents/testing/mock-ai.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockGenerateObject, mockGenerateText, mockVectorSearch, resetAgentMocks } from './mock-ai'

describe('mockGenerateObject', () => {
  it('returns mock function with expected response', async () => {
    const mockFn = mockGenerateObject({ category: 'Governing Law', confidence: 0.95 })
    const result = await mockFn()
    expect(result.object).toEqual({ category: 'Governing Law', confidence: 0.95 })
    expect(result.usage.promptTokens).toBe(100)
    expect(result.finishReason).toBe('stop')
  })

  it('allows custom token usage', async () => {
    const mockFn = mockGenerateObject({}, { promptTokens: 500, completionTokens: 200 })
    const result = await mockFn()
    expect(result.usage.promptTokens).toBe(500)
    expect(result.usage.completionTokens).toBe(200)
  })
})

describe('mockGenerateText', () => {
  it('returns mock function with expected text', async () => {
    const mockFn = mockGenerateText('This is a legal clause.')
    const result = await mockFn()
    expect(result.text).toBe('This is a legal clause.')
    expect(result.finishReason).toBe('stop')
  })
})

describe('mockVectorSearch', () => {
  it('returns mock function with search results', async () => {
    const mockFn = mockVectorSearch([
      { content: 'Delaware law', category: 'Governing Law', similarity: 0.92 },
    ])
    const result = await mockFn()
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Delaware law')
    expect(result[0].source).toBe('Mock CUAD Document')
  })
})

describe('resetAgentMocks', () => {
  it('clears all mocks', () => {
    const spy = vi.spyOn(vi, 'resetAllMocks')
    resetAgentMocks()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
```

### Step 2: Run test to verify it fails

Run: `pnpm test agents/testing/mock-ai.test.ts`
Expected: FAIL with "Cannot find module './mock-ai'"

### Step 3: Write the mock-ai implementation

```typescript
// agents/testing/mock-ai.ts
import { vi } from 'vitest'

/** Mock generateObject response */
export function mockGenerateObject<T>(
  response: T,
  usage?: { promptTokens?: number; completionTokens?: number }
) {
  return vi.fn().mockResolvedValue({
    object: response,
    usage: {
      promptTokens: usage?.promptTokens ?? 100,
      completionTokens: usage?.completionTokens ?? 50,
    },
    finishReason: 'stop',
  })
}

/** Mock generateText response */
export function mockGenerateText(
  text: string,
  usage?: { promptTokens?: number; completionTokens?: number }
) {
  return vi.fn().mockResolvedValue({
    text,
    usage: {
      promptTokens: usage?.promptTokens ?? 100,
      completionTokens: usage?.completionTokens ?? 50,
    },
    finishReason: 'stop',
  })
}

/** Mock vector search results */
export function mockVectorSearch(
  results: Array<{
    content: string
    category: string
    similarity: number
  }>
) {
  return vi.fn().mockResolvedValue(
    results.map((r, i) => ({
      id: `ref-${i}`,
      content: r.content,
      category: r.category,
      similarity: r.similarity,
      source: 'Mock CUAD Document',
    }))
  )
}

/** Reset all mocks */
export function resetAgentMocks() {
  vi.resetAllMocks()
}
```

### Step 4: Write the fixtures implementation

```typescript
// agents/testing/fixtures.ts
import type { ClassificationResult, RiskAssessment, HypothesisCoverage } from '../types'

// ============================================================================
// Sample Clause Text
// ============================================================================

export const SAMPLE_GOVERNING_LAW_CLAUSE =
  'This Agreement shall be governed by and construed in accordance with ' +
  'the laws of the State of Delaware, without regard to its conflict of law provisions.'

export const SAMPLE_NON_COMPETE_CLAUSE =
  'During the term of this Agreement and for a period of five (5) years thereafter, ' +
  'the Receiving Party shall not, directly or indirectly, engage in any business ' +
  'that competes with the Disclosing Party anywhere in the world.'

export const SAMPLE_CONFIDENTIALITY_CLAUSE =
  'The Receiving Party agrees to hold all Confidential Information in strict confidence ' +
  'and not to disclose such information to any third party without prior written consent.'

// ============================================================================
// Sample Agent Outputs
// ============================================================================

export const SAMPLE_CLASSIFICATION: Omit<ClassificationResult, 'clauseId'> = {
  category: 'Governing Law',
  secondaryCategories: [],
  confidence: 0.95,
  reasoning: 'Explicit governing law designation specifying Delaware jurisdiction.',
}

export const SAMPLE_RISK_ASSESSMENT: Omit<RiskAssessment, 'clauseId'> = {
  riskLevel: 'standard',
  confidence: 0.9,
  explanation: 'Delaware law is commonly used in commercial agreements and represents a neutral, well-established jurisdiction.',
  evidence: {
    citations: ['governed by and construed in accordance with the laws of the State of Delaware'],
    comparisons: ['Matches 78% of CUAD governing law clauses in structure and jurisdiction choice'],
    statistic: 'Delaware is specified in 34% of commercial NDAs, making it the most common jurisdiction.',
  },
}

export const SAMPLE_AGGRESSIVE_RISK: Omit<RiskAssessment, 'clauseId'> = {
  riskLevel: 'aggressive',
  confidence: 0.85,
  explanation: 'Five-year worldwide non-compete significantly exceeds market standard and may be unenforceable.',
  evidence: {
    citations: ['five (5) years thereafter', 'anywhere in the world'],
    comparisons: ['Exceeds 92% of CUAD non-compete clauses in duration', 'Worldwide scope is unusual; most limit to specific regions'],
    statistic: 'Average non-compete duration in NDAs is 2.1 years; 5 years is in the 95th percentile.',
  },
}

export const SAMPLE_HYPOTHESIS_COVERAGE: HypothesisCoverage = {
  hypothesisId: 'nli-7',
  category: 'Public Information Exception',
  status: 'not_mentioned',
  explanation: 'The NDA does not explicitly exclude publicly available information from confidentiality obligations.',
}

// ============================================================================
// Sample Reference Results
// ============================================================================

export const SAMPLE_VECTOR_RESULTS = [
  {
    content: 'This Agreement shall be governed by the laws of the State of New York.',
    category: 'Governing Law',
    similarity: 0.92,
  },
  {
    content: 'The validity and interpretation of this Agreement shall be governed by Delaware law.',
    category: 'Governing Law',
    similarity: 0.89,
  },
  {
    content: 'This Agreement is governed by California law without regard to conflict of laws principles.',
    category: 'Governing Law',
    similarity: 0.85,
  },
]
```

### Step 5: Create barrel export

```typescript
// agents/testing/index.ts
export * from './mock-ai'
export * from './fixtures'
```

### Step 6: Run test to verify it passes

Run: `pnpm test agents/testing/mock-ai.test.ts`
Expected: PASS

### Step 7: Commit

```bash
git add agents/testing/mock-ai.ts agents/testing/fixtures.ts agents/testing/index.ts agents/testing/mock-ai.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add test utilities

- Mock functions for generateObject/generateText
- Mock vector search results
- Sample clauses and agent output fixtures
- Reset helper for test cleanup

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final Integration and Verification

**Files:**
- Update: `agents/index.ts` (if needed)
- No test file (verification only)

### Step 1: Verify all exports work

Run:
```bash
pnpm tsc --noEmit
```
Expected: No errors

### Step 2: Run all tests

Run:
```bash
pnpm test lib/ai/ agents/
```
Expected: All tests pass

### Step 3: Run lint

Run:
```bash
pnpm lint
```
Expected: No errors

### Step 4: Verify imports work

Create temporary test file to verify imports:

```typescript
// Temporary verification (do not commit)
import { MODELS, getAgentModel, BudgetTracker } from '@/lib/ai'
import { RISK_LEVELS, CUAD_CATEGORIES, classificationSchema } from '@/agents'
import { vectorSearchTool, findSimilarClauses } from '@/agents/tools'
import { CLASSIFIER_SYSTEM_PROMPT, createClassifierPrompt } from '@/agents/prompts'
import { mockGenerateObject, SAMPLE_GOVERNING_LAW_CLAUSE } from '@/agents/testing'

console.log('All imports work!')
```

### Step 5: Commit final integration

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(agents): complete agent foundation infrastructure

Summary:
- AI configuration with Vercel AI Gateway
- Token budget tracking (212K per document)
- Core types (risk levels, CUAD 41 categories, ContractNLI 17)
- Vector search tool with caching
- Cache-optimized prompt templates
- Test utilities (mocks, fixtures)

Ready for Analysis Pipeline implementation.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Success Criteria

- [x] `pnpm tsc --noEmit` passes
- [x] `pnpm test lib/ai/ agents/` passes (new tests)
- [x] `pnpm lint` passes
- [x] Can import from `@/lib/ai` and `@/agents`
- [x] Vector search tool defined with AI SDK format
- [x] Budget tracker correctly monitors token usage

---

## Next Steps

After this plan is implemented:
1. **Analysis Pipeline Plan** - Implement the four agents (Parser, Classifier, Risk Scorer, Gap Analyst)
2. **Inngest Integration** - Wire agents into durable workflow steps

---

## References

- Design document: `docs/plans/2026-02-03-agent-foundation-design.md`
- PRD: `docs/PRD.md`
- Existing embeddings: `lib/embeddings.ts`
- Existing vector search placeholder: `agents/tools/vector-search.ts`
