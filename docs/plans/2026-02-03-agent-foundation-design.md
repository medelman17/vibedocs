# Agent Foundation Design

> **Status:** COMPLETE (audited 2026-02-04)
>
> Full 4-agent pipeline implemented. See agents/, inngest/functions/analyze-nda.ts.

**Date**: 2026-02-03
**Status**: Approved
**Supersedes**: `2026-02-01-inngest-agents-foundation.md` (path updates, API changes)

## Overview

Establish the foundational agent infrastructure for the NDA analysis pipeline using Vercel AI SDK 6 with the AI Gateway, configurable per-agent models, and cache-optimized prompts.

## Goals

- AI SDK 6 setup with Vercel AI Gateway (not direct providers)
- Per-agent model configuration for cost optimization
- Token budget tracking (~212K per document per PRD)
- PRD-aligned risk levels (`standard | cautious | aggressive | unknown`)
- Cache-optimized prompts for cost reduction
- Test utilities for API-free testing

## Prerequisites

- Bootstrap pipeline complete (21K+ reference embeddings)
- Inngest infrastructure in place
- `ai@6.0.67` already installed

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Foundation                          │
├─────────────────┬─────────────────┬─────────────────────────┤
│  lib/ai/        │  agents/        │  agents/testing/        │
│  - config.ts    │  - types.ts     │  - mock-ai.ts           │
│  - budget.ts    │  - tools/       │  - fixtures.ts          │
│                 │  - prompts/     │                         │
└─────────────────┴─────────────────┴─────────────────────────┘
```

---

## Component Specifications

### 1. AI Configuration (`lib/ai/config.ts`)

Centralized model configuration using Vercel AI Gateway.

```typescript
import { gateway } from 'ai'

/** Available models via Vercel AI Gateway */
export const MODELS = {
  fast: 'anthropic/claude-haiku-4.5',       // Fastest, cost-effective
  balanced: 'anthropic/claude-sonnet-4',     // Good balance
  best: 'anthropic/claude-sonnet-4.5',       // Complex reasoning
  premium: 'anthropic/claude-opus-4.5',      // Most capable (if needed)
} as const

export type ModelTier = keyof typeof MODELS

/** Per-agent model configuration */
export const AGENT_MODELS = {
  parser: MODELS.fast,         // Extraction, chunking - speed matters
  classifier: MODELS.balanced, // Category matching
  riskScorer: MODELS.best,     // Nuanced risk judgment
  gapAnalyst: MODELS.best,     // Complex gap reasoning
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
  temperature: 0,        // Deterministic for legal analysis
  maxTokens: 4096,       // Default output limit
} as const
```

**Model Selection Rationale:**
- **Parser (Haiku 4.5)**: Extraction is straightforward, speed matters for chunking
- **Classifier (Sonnet 4)**: Pattern matching, good balance of speed/accuracy
- **Risk Scorer (Sonnet 4.5)**: Needs nuanced judgment, evidence synthesis
- **Gap Analyst (Sonnet 4.5)**: Complex reasoning about what's missing

---

### 2. Token Budget Tracking (`lib/ai/budget.ts`)

Monitor token usage per document analysis run.

```typescript
/** Token budget per document (from PRD) */
export const DOCUMENT_TOKEN_BUDGET = 212_000

/** Per-agent budget allocation */
export const AGENT_BUDGETS = {
  parser: 20_000,      // ~10% - extraction is cheaper
  classifier: 60_000,  // ~28% - runs per chunk
  riskScorer: 80_000,  // ~38% - detailed analysis per clause
  gapAnalyst: 52_000,  // ~24% - one comprehensive pass
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

---

### 3. Core Types (`agents/types.ts`)

Shared type definitions aligned with PRD.

```typescript
import { z } from 'zod'

// ============================================================================
// Risk Levels (PRD-aligned)
// ============================================================================

/** Risk levels per PRD (not low/medium/high) */
export const RISK_LEVELS = [
  'standard',    // Normal, market-friendly terms
  'cautious',    // Slightly one-sided, review recommended
  'aggressive',  // Clearly one-sided, negotiate
  'unknown',     // Can't determine (ambiguous language)
] as const

export type RiskLevel = (typeof RISK_LEVELS)[number]

export const riskLevelSchema = z.enum(RISK_LEVELS)

/** Gap status for clause coverage */
export const GAP_STATUS = [
  'present',      // Clause exists and is adequate
  'weak',         // Clause exists but inadequate
  'missing',      // Clause not found
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
  gapScore: number // 0-100, higher = more gaps
}
```

---

### 4. Vector Search Tool (`agents/tools/vector-search.ts`)

AI SDK tool for searching the reference corpus.

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { db } from '@/db/client'
import { referenceEmbeddings, referenceDocuments } from '@/db/schema/reference'
import { cosineDistance, lt, eq, and, sql } from 'drizzle-orm'
import { generateEmbedding } from '@/lib/embeddings'
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
    const embedding = await generateEmbedding(query)

    // Search with cosine distance
    const distanceThreshold = 0.3 // similarity > 0.7

    const results = await db
      .select({
        id: referenceEmbeddings.id,
        content: referenceEmbeddings.content,
        category: referenceEmbeddings.category,
        distance: cosineDistance(referenceEmbeddings.embedding, embedding),
        documentId: referenceEmbeddings.documentId,
      })
      .from(referenceEmbeddings)
      .where(and(
        lt(cosineDistance(referenceEmbeddings.embedding, embedding), distanceThreshold),
        category ? eq(referenceEmbeddings.category, category) : undefined
      ))
      .orderBy(cosineDistance(referenceEmbeddings.embedding, embedding))
      .limit(limit)

    // Fetch source document titles
    const docIds = [...new Set(results.map(r => r.documentId))]
    const docs = docIds.length > 0
      ? await db
          .select({ id: referenceDocuments.id, title: referenceDocuments.title })
          .from(referenceDocuments)
          .where(sql`${referenceDocuments.id} IN ${docIds}`)
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
```

---

### 5. Prompt Templates (`agents/prompts/`)

Cache-optimized prompts with static system prompts and minimal user prompts.

#### `agents/prompts/index.ts`

```typescript
export * from './classifier'
export * from './risk-scorer'
export * from './gap-analyst'

/** Legal disclaimer for all outputs */
export const LEGAL_DISCLAIMER =
  'This analysis is AI-generated and does not constitute legal advice. ' +
  'Consult a qualified attorney for legal guidance.'
```

#### `agents/prompts/classifier.ts`

```typescript
import { CUAD_CATEGORIES } from '../types'

/**
 * Classifier system prompt - CACHE OPTIMIZED
 * Static content (~2000 tokens) cached after first call.
 * Put all categories and instructions here.
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

#### `agents/prompts/risk-scorer.ts`

```typescript
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
  const refBlock = references
    .map((r, i) => `[${i + 1}] (${Math.round(r.similarity * 100)}% similar): ${r.content.slice(0, 200)}...`)
    .join('\n')

  return `## Clause to Assess
Category: ${category}

${clauseText}

## Reference Clauses for Comparison
${refBlock || 'No references available.'}

Assess the risk level. Return JSON only.`
}
```

#### `agents/prompts/gap-analyst.ts`

```typescript
import { CUAD_CATEGORIES, CONTRACT_NLI_CATEGORIES } from '../types'

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

---

### 6. Test Utilities (`agents/testing/`)

#### `agents/testing/mock-ai.ts`

```typescript
import { vi } from 'vitest'

/** Mock generateObject response */
export function mockGenerateObject<T>(response: T, usage?: { promptTokens?: number; completionTokens?: number }) {
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
export function mockGenerateText(text: string, usage?: { promptTokens?: number; completionTokens?: number }) {
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
export function mockVectorSearch(results: Array<{
  content: string
  category: string
  similarity: number
}>) {
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

#### `agents/testing/fixtures.ts`

```typescript
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

#### `agents/testing/index.ts`

```typescript
export * from './mock-ai'
export * from './fixtures'
```

---

## File Structure

```
lib/
└── ai/
    ├── config.ts          # Model configuration, gateway setup
    ├── budget.ts          # Token budget tracking
    └── index.ts           # Barrel export

agents/
├── types.ts               # Risk levels, CUAD, ContractNLI types
├── tools/
│   ├── vector-search.ts   # AI SDK tool for corpus search
│   └── index.ts           # Barrel export
├── prompts/
│   ├── classifier.ts      # Classification prompts
│   ├── risk-scorer.ts     # Risk assessment prompts
│   ├── gap-analyst.ts     # Gap analysis prompts
│   └── index.ts           # Barrel export
├── testing/
│   ├── mock-ai.ts         # Mock AI responses
│   ├── fixtures.ts        # Sample data
│   └── index.ts           # Barrel export
└── index.ts               # Main barrel export
```

---

## Implementation Tasks

1. **Install dependencies** (if needed)
   - Verify `ai@6.x` is installed (already have 6.0.67)
   - No additional packages needed (gateway included)

2. **Create AI configuration** (`lib/ai/`)
   - `config.ts` - Models, gateway setup
   - `budget.ts` - Token tracking
   - `index.ts` - Barrel export

3. **Create agent types** (`agents/types.ts`)
   - Risk levels, CUAD categories, ContractNLI
   - Zod schemas for structured output

4. **Update vector search** (`agents/tools/vector-search.ts`)
   - Replace placeholder with working implementation
   - Add AI SDK tool wrapper

5. **Create prompt templates** (`agents/prompts/`)
   - Classifier, Risk Scorer, Gap Analyst
   - Cache-optimized structure

6. **Create test utilities** (`agents/testing/`)
   - Mocks, fixtures

7. **Create barrel exports**
   - `lib/ai/index.ts`
   - `agents/tools/index.ts`
   - `agents/prompts/index.ts`
   - `agents/index.ts`

8. **Write tests**
   - Budget tracker tests
   - Type validation tests
   - Prompt formatting tests

---

## Success Criteria

- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm test` passes (new tests)
- [ ] `pnpm lint` passes
- [ ] Can import from `@/lib/ai` and `@/agents`
- [ ] Vector search tool returns results from reference corpus
- [ ] Budget tracker correctly monitors token usage

---

## Next Steps

After this plan is implemented:
1. **Analysis Pipeline Plan** - Implement the four agents (Parser, Classifier, Risk Scorer, Gap Analyst)
2. **Inngest Integration** - Wire agents into durable workflow steps

---

## References

- [Vercel AI SDK 6 Docs](https://ai-sdk.dev)
- [Claude Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- PRD: `docs/PRD.md`
- Existing plan: `docs/plans/2026-02-01-inngest-agents-foundation.md`
