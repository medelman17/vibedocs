# Agent Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the foundational agent infrastructure using Vercel AI SDK 6 agents, Claude API client, base agent patterns with token tracking and error handling, and shared utilities for the NDA analysis pipeline.

**Architecture:** Agents are implemented using AI SDK 6's `ToolLoopAgent` for multi-step tool orchestration. Each agent runs inside an Inngest `step.run()` for durability. The base agent utilities provide token budget tracking, retry logic, and rate limit coordination. This plan creates the patterns and utilities that all agents will use.

**Tech Stack:** Vercel AI SDK 6, Anthropic Claude API, Zod for structured output, TypeScript

**Prerequisite Plans:**
- Plan 1: Inngest Infrastructure ✓
- Plan 2: Bootstrap Pipeline ✓

**Dependent Plans:**
- Plan 4: Analysis Pipeline (uses these agent patterns)
- Plan 5: Comparison & Generation (uses these patterns)

---

## Overview

This plan establishes:
1. AI SDK 6 setup with Anthropic provider
2. Base agent utilities (token tracking, retry, rate limits)
3. Shared agent state types
4. Tool definitions for vector search
5. Prompt templates with ContractNLI integration
6. Agent test utilities (mock client, fixtures)

---

## Task 1: Install AI SDK and Anthropic Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install AI SDK 6 and Anthropic provider**

Run: `pnpm add ai @ai-sdk/anthropic zod`

Note: AI SDK 6 uses `ai` as the main package with provider-specific packages like `@ai-sdk/anthropic`.

**Step 2: Verify installation**

Run: `pnpm list ai @ai-sdk/anthropic zod`
Expected: All packages installed at latest versions

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add AI SDK 6 and Anthropic provider

- ai: Vercel AI SDK 6 core
- @ai-sdk/anthropic: Claude provider
- zod: Schema validation for structured output

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create AI SDK Configuration

**Files:**
- Create: `src/lib/ai/config.ts`

**Step 1: Create AI configuration**

```typescript
// src/lib/ai/config.ts
/**
 * @fileoverview AI SDK Configuration
 *
 * Centralized configuration for AI SDK 6 with Anthropic Claude.
 * Provides model configuration, token limits, and pricing for
 * budget tracking.
 *
 * @module lib/ai/config
 */

import { anthropic } from "@ai-sdk/anthropic"

/**
 * Claude model configuration.
 * Sonnet 4.5 provides best cost/quality for structured extraction.
 */
export const CLAUDE_MODEL = "claude-sonnet-4-5-20250929" as const

/**
 * Get the configured Claude model instance.
 */
export function getModel() {
  return anthropic(CLAUDE_MODEL)
}

/**
 * Model token limits.
 */
export const TOKEN_LIMITS = {
  /** Maximum context window */
  contextWindow: 200_000,
  /** Maximum output tokens */
  maxOutput: 8_192,
  /** Default output tokens for agents */
  defaultOutput: 4_096,
} as const

/**
 * Pricing per 1M tokens (as of 2025).
 * Used for cost estimation and budget tracking.
 */
export const PRICING = {
  /** Input token price per 1M */
  inputPer1M: 3.00,
  /** Output token price per 1M */
  outputPer1M: 15.00,
} as const

/**
 * Calculate estimated cost for token usage.
 *
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD
 */
export function estimateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * PRICING.inputPer1M
  const outputCost = (outputTokens / 1_000_000) * PRICING.outputPer1M
  return Math.round((inputCost + outputCost) * 10000) / 10000 // 4 decimal places
}

/**
 * Default agent configuration.
 */
export const AGENT_CONFIG = {
  /** Temperature for deterministic output */
  temperature: 0,
  /** Maximum steps for tool loops */
  maxSteps: 10,
  /** Default output tokens */
  maxTokens: TOKEN_LIMITS.defaultOutput,
} as const
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/ai/config.ts
git commit -m "feat(ai): add AI SDK configuration

- Claude Sonnet 4.5 model configuration
- Token limits and pricing for budget tracking
- Cost estimation utility

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Base Agent Utilities

**Files:**
- Create: `src/lib/ai/base-agent.ts`
- Create: `src/lib/ai/base-agent.test.ts`

**Step 1: Create base agent utilities**

```typescript
// src/lib/ai/base-agent.ts
/**
 * @fileoverview Base Agent Utilities
 *
 * Provides shared utilities for all NDA analysis agents including:
 * - Token budget tracking
 * - Retry logic with exponential backoff
 * - Rate limit coordination with Inngest
 * - Usage aggregation
 *
 * @module lib/ai/base-agent
 */

import { generateText, Output, type CoreTool } from "ai"
import { getModel, AGENT_CONFIG, estimateCost, TOKEN_LIMITS } from "./config"
import { RATE_LIMITS } from "@/inngest/utils/rate-limit"
import { RetriableError, NonRetriableError, wrapApiError } from "@/inngest/utils/errors"
import { z } from "zod"

/**
 * Token usage tracking.
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number
}

/**
 * Aggregated usage across multiple agent calls.
 */
export interface AggregatedUsage {
  calls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  estimatedCost: number
}

/**
 * Token budget configuration.
 */
export interface TokenBudget {
  /** Maximum total tokens for this operation */
  maxTokens: number
  /** Warning threshold (percentage, 0-1) */
  warningThreshold?: number
}

/**
 * Budget tracker for monitoring token usage.
 */
export class BudgetTracker {
  private usage: AggregatedUsage = {
    calls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
  }

  constructor(private budget: TokenBudget) {}

  /**
   * Record token usage from an agent call.
   */
  recordUsage(usage: TokenUsage): void {
    this.usage.calls++
    this.usage.totalInputTokens += usage.inputTokens
    this.usage.totalOutputTokens += usage.outputTokens
    this.usage.totalTokens += usage.totalTokens
    this.usage.estimatedCost += usage.estimatedCost
  }

  /**
   * Get current usage statistics.
   */
  getUsage(): AggregatedUsage {
    return { ...this.usage }
  }

  /**
   * Get remaining token budget.
   */
  getRemainingBudget(): number {
    return Math.max(0, this.budget.maxTokens - this.usage.totalTokens)
  }

  /**
   * Check if budget is exceeded.
   */
  isExceeded(): boolean {
    return this.usage.totalTokens >= this.budget.maxTokens
  }

  /**
   * Check if usage is above warning threshold.
   */
  isWarning(): boolean {
    const threshold = this.budget.warningThreshold ?? 0.8
    return this.usage.totalTokens >= this.budget.maxTokens * threshold
  }

  /**
   * Get percentage of budget used.
   */
  getUsagePercentage(): number {
    return Math.round((this.usage.totalTokens / this.budget.maxTokens) * 100)
  }
}

/**
 * Default budget for document analysis (~212K tokens per PRD).
 */
export const DEFAULT_DOCUMENT_BUDGET: TokenBudget = {
  maxTokens: 212_000,
  warningThreshold: 0.8,
}

/**
 * Options for agent execution.
 */
export interface AgentExecuteOptions<TOutput> {
  /** System prompt */
  system: string
  /** User prompt */
  prompt: string
  /** Tools available to the agent */
  tools?: Record<string, CoreTool>
  /** Output schema for structured output */
  outputSchema?: z.ZodSchema<TOutput>
  /** Maximum steps for tool loops */
  maxSteps?: number
  /** Temperature override */
  temperature?: number
  /** Budget tracker for usage monitoring */
  budgetTracker?: BudgetTracker
}

/**
 * Agent execution result.
 */
export interface AgentResult<TOutput> {
  /** The generated output */
  output: TOutput
  /** Token usage for this call */
  usage: TokenUsage
  /** Number of steps taken */
  steps: number
  /** Whether tool calls were made */
  usedTools: boolean
}

/**
 * Execute an agent with retry logic and usage tracking.
 *
 * @param options - Agent execution options
 * @returns Agent result with output and usage
 *
 * @example
 * ```typescript
 * const result = await executeAgent({
 *   system: CLASSIFIER_SYSTEM_PROMPT,
 *   prompt: createClassifierPrompt(chunk, references),
 *   tools: { vectorSearch },
 *   outputSchema: classifiedClauseSchema,
 *   budgetTracker: tracker,
 * })
 * ```
 */
export async function executeAgent<TOutput = string>(
  options: AgentExecuteOptions<TOutput>
): Promise<AgentResult<TOutput>> {
  const {
    system,
    prompt,
    tools,
    outputSchema,
    maxSteps = AGENT_CONFIG.maxSteps,
    temperature = AGENT_CONFIG.temperature,
    budgetTracker,
  } = options

  // Check budget before execution
  if (budgetTracker?.isExceeded()) {
    throw new NonRetriableError(
      `Token budget exceeded: ${budgetTracker.getUsagePercentage()}% used`
    )
  }

  try {
    const result = await generateText({
      model: getModel(),
      system,
      prompt,
      tools,
      maxSteps,
      temperature,
      maxTokens: AGENT_CONFIG.maxTokens,
      // Add structured output if schema provided
      ...(outputSchema && {
        experimental_output: Output.object({ schema: outputSchema }),
      }),
    })

    // Extract usage
    const inputTokens = result.usage?.promptTokens ?? 0
    const outputTokens = result.usage?.completionTokens ?? 0
    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost: estimateCost(inputTokens, outputTokens),
    }

    // Record usage
    if (budgetTracker) {
      budgetTracker.recordUsage(usage)

      // Log warning if approaching budget
      if (budgetTracker.isWarning()) {
        console.warn(
          `Token budget warning: ${budgetTracker.getUsagePercentage()}% used ` +
            `(${budgetTracker.getRemainingBudget()} tokens remaining)`
        )
      }
    }

    // Extract output
    let output: TOutput
    if (outputSchema && result.experimental_output) {
      output = result.experimental_output as TOutput
    } else {
      output = result.text as unknown as TOutput
    }

    return {
      output,
      usage,
      steps: result.steps?.length ?? 1,
      usedTools: (result.steps?.length ?? 0) > 1,
    }
  } catch (error) {
    // Wrap API errors for proper retry handling
    throw wrapApiError(error, "Agent execution")
  }
}

/**
 * Execute an agent with automatic retry on transient failures.
 *
 * @param options - Agent execution options
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Agent result
 */
export async function executeAgentWithRetry<TOutput = string>(
  options: AgentExecuteOptions<TOutput>,
  maxRetries: number = 3
): Promise<AgentResult<TOutput>> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await executeAgent(options)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry non-retriable errors
      if (error instanceof NonRetriableError) {
        throw error
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw lastError
      }

      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
      console.warn(
        `Agent execution failed (attempt ${attempt + 1}/${maxRetries + 1}), ` +
          `retrying in ${delay}ms: ${lastError.message}`
      )
      await sleep(delay)
    }
  }

  throw lastError ?? new Error("Agent execution failed")
}

/**
 * Get rate limit delay for inter-agent coordination.
 */
export function getAgentRateLimitDelay(): number {
  return RATE_LIMITS.claude.delayMs
}

/**
 * Sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

**Step 2: Write tests**

```typescript
// src/lib/ai/base-agent.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  BudgetTracker,
  DEFAULT_DOCUMENT_BUDGET,
  type TokenUsage,
} from "./base-agent"
import { estimateCost } from "./config"

describe("Base Agent Utilities", () => {
  describe("BudgetTracker", () => {
    let tracker: BudgetTracker

    beforeEach(() => {
      tracker = new BudgetTracker({
        maxTokens: 1000,
        warningThreshold: 0.8,
      })
    })

    it("should track token usage", () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCost: 0.01,
      }

      tracker.recordUsage(usage)

      const aggregated = tracker.getUsage()
      expect(aggregated.calls).toBe(1)
      expect(aggregated.totalTokens).toBe(150)
    })

    it("should aggregate multiple calls", () => {
      tracker.recordUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCost: 0.01,
      })

      tracker.recordUsage({
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        estimatedCost: 0.02,
      })

      const aggregated = tracker.getUsage()
      expect(aggregated.calls).toBe(2)
      expect(aggregated.totalTokens).toBe(450)
      expect(aggregated.estimatedCost).toBe(0.03)
    })

    it("should calculate remaining budget", () => {
      tracker.recordUsage({
        inputTokens: 300,
        outputTokens: 200,
        totalTokens: 500,
        estimatedCost: 0.01,
      })

      expect(tracker.getRemainingBudget()).toBe(500)
    })

    it("should detect budget exceeded", () => {
      expect(tracker.isExceeded()).toBe(false)

      tracker.recordUsage({
        inputTokens: 600,
        outputTokens: 400,
        totalTokens: 1000,
        estimatedCost: 0.01,
      })

      expect(tracker.isExceeded()).toBe(true)
    })

    it("should detect warning threshold", () => {
      expect(tracker.isWarning()).toBe(false)

      tracker.recordUsage({
        inputTokens: 500,
        outputTokens: 300,
        totalTokens: 800,
        estimatedCost: 0.01,
      })

      expect(tracker.isWarning()).toBe(true)
      expect(tracker.isExceeded()).toBe(false)
    })

    it("should calculate usage percentage", () => {
      tracker.recordUsage({
        inputTokens: 250,
        outputTokens: 250,
        totalTokens: 500,
        estimatedCost: 0.01,
      })

      expect(tracker.getUsagePercentage()).toBe(50)
    })
  })

  describe("estimateCost", () => {
    it("should calculate cost correctly", () => {
      // 1M input tokens at $3 + 1M output tokens at $15 = $18
      const cost = estimateCost(1_000_000, 1_000_000)
      expect(cost).toBe(18)
    })

    it("should handle small token counts", () => {
      // 1000 input ($0.003) + 1000 output ($0.015) = $0.018
      const cost = estimateCost(1000, 1000)
      expect(cost).toBe(0.018)
    })
  })

  describe("DEFAULT_DOCUMENT_BUDGET", () => {
    it("should have correct token limit", () => {
      expect(DEFAULT_DOCUMENT_BUDGET.maxTokens).toBe(212_000)
    })

    it("should have warning threshold", () => {
      expect(DEFAULT_DOCUMENT_BUDGET.warningThreshold).toBe(0.8)
    })
  })
})
```

**Step 3: Run tests**

Run: `pnpm test src/lib/ai/base-agent.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/lib/ai/base-agent.ts src/lib/ai/base-agent.test.ts
git commit -m "feat(ai): add base agent utilities

- BudgetTracker for token budget monitoring
- executeAgent with retry and usage tracking
- Rate limit coordination with Inngest
- Cost estimation and aggregation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create Shared Agent Types

**Files:**
- Create: `src/agents/types.ts`

**Step 1: Create shared agent types**

```typescript
// src/agents/types.ts
/**
 * @fileoverview Shared Agent Type Definitions
 *
 * Defines common types used across all NDA analysis agents.
 * These types ensure consistency between agents and enable
 * type-safe state passing through the Inngest pipeline.
 *
 * @module agents/types
 */

import { z } from "zod"

/**
 * CUAD 41-category taxonomy for clause classification.
 */
export const CUAD_CATEGORIES = [
  "Document Name",
  "Parties",
  "Agreement Date",
  "Effective Date",
  "Expiration Date",
  "Renewal Term",
  "Notice Period To Terminate Renewal",
  "Governing Law",
  "Most Favored Nation",
  "Non-Compete",
  "Exclusivity",
  "No-Solicit Of Customers",
  "Competitive Restriction Exception",
  "No-Solicit Of Employees",
  "Non-Disparagement",
  "Termination For Convenience",
  "Rofr/Rofo/Rofn",
  "Change Of Control",
  "Anti-Assignment",
  "Revenue/Profit Sharing",
  "Price Restrictions",
  "Minimum Commitment",
  "Volume Restriction",
  "Ip Ownership Assignment",
  "Joint Ip Ownership",
  "License Grant",
  "Non-Transferable License",
  "Affiliate License",
  "Unlimited/All-You-Can-Eat-License",
  "Irrevocable Or Perpetual License",
  "Source Code Escrow",
  "Post-Termination Services",
  "Audit Rights",
  "Uncapped Liability",
  "Cap On Liability",
  "Liquidated Damages",
  "Warranty Duration",
  "Insurance",
  "Covenant Not To Sue",
  "Third Party Beneficiary",
  "Unknown",
] as const

export type CuadCategory = (typeof CUAD_CATEGORIES)[number]

/**
 * ContractNLI 17 hypothesis categories for NLI-based analysis.
 */
export const CONTRACT_NLI_CATEGORIES = [
  "Purpose Limitation",
  "Permitted Disclosure",
  "Third Party Disclosure",
  "Standard of Care",
  "Survival Period",
  "Termination",
  "Return/Destruction",
  "IP License",
  "Warranties",
  "Liability Limitation",
  "Governing Law",
  "Legal Compulsion",
  "Public Information Exception",
  "Prior Knowledge Exception",
  "Independent Development Exception",
  "Assignment",
  "Amendment",
] as const

export type ContractNLICategory = (typeof CONTRACT_NLI_CATEGORIES)[number]

/**
 * Risk levels for clause assessment.
 */
export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

/**
 * Document chunk with optional embedding.
 */
export interface DocumentChunk {
  /** Chunk ID from database */
  id: string
  /** Chunk index within document */
  index: number
  /** Text content */
  content: string
  /** Section path for context */
  sectionPath: string[]
  /** Token count */
  tokenCount?: number
  /** Embedding vector (1024 dims) */
  embedding?: number[]
}

/**
 * Parser Agent output - structured document.
 */
export interface ParsedDocument {
  /** Document ID */
  documentId: string
  /** Document title */
  title: string
  /** Full text content */
  rawText: string
  /** Parsed chunks */
  chunks: DocumentChunk[]
  /** Detected sections */
  sections: Array<{
    name: string
    startIndex: number
    endIndex: number
  }>
  /** Metadata */
  metadata: {
    tokenCount: number
    chunkCount: number
    pageCount?: number
  }
}

/**
 * Reference clause from CUAD corpus.
 */
export interface ReferenceClause {
  /** Reference ID */
  id: string
  /** Clause text */
  content: string
  /** CUAD category */
  category: CuadCategory
  /** Similarity score (0-1) */
  similarity: number
  /** Source document */
  source: string
}

/**
 * Classifier Agent output - classified clause.
 */
export interface ClassifiedClause {
  /** Source chunk ID */
  chunkId: string
  /** Clause text */
  clauseText: string
  /** Primary CUAD category */
  category: CuadCategory
  /** Secondary categories (if applicable) */
  secondaryCategories?: CuadCategory[]
  /** Classification confidence (0-1) */
  confidence: number
  /** Position in document */
  startPosition?: number
  endPosition?: number
  /** Similar reference clauses used for classification */
  references: ReferenceClause[]
}

/**
 * Risk Scorer Agent output - risk assessment.
 */
export interface RiskAssessment {
  /** Clause being assessed */
  clause: ClassifiedClause
  /** Risk level */
  riskLevel: RiskLevel
  /** Risk score (0-100) */
  riskScore: number
  /** Plain-language explanation */
  explanation: string
  /** Supporting evidence */
  evidence: {
    /** Citations from document */
    citations: string[]
    /** Comparison to reference corpus */
    comparisons: string[]
    /** Statistical context */
    statistics?: string
  }
}

/**
 * Gap analysis for ContractNLI hypotheses.
 */
export interface HypothesisCoverage {
  /** ContractNLI hypothesis ID */
  hypothesisId: string
  /** Hypothesis category */
  category: ContractNLICategory
  /** Whether the hypothesis is covered */
  isCovered: boolean
  /** Coverage status: entailment, contradiction, not mentioned */
  status: "entailment" | "contradiction" | "not_mentioned"
  /** Supporting clause if covered */
  supportingClause?: string
  /** Explanation */
  explanation: string
}

/**
 * Gap Analyst Agent output - missing clause analysis.
 */
export interface GapAnalysis {
  /** Categories found in document */
  presentCategories: CuadCategory[]
  /** Categories missing from document */
  missingCategories: Array<{
    category: CuadCategory
    importance: "critical" | "important" | "optional"
    explanation: string
    recommendedLanguage?: string
  }>
  /** Categories present but weak */
  weakCategories: Array<{
    category: CuadCategory
    issue: string
    recommendation: string
  }>
  /** ContractNLI hypothesis coverage */
  hypothesisCoverage: HypothesisCoverage[]
  /** Overall gap score (0-100, higher = more gaps) */
  gapScore: number
}

/**
 * Complete analysis result combining all agent outputs.
 */
export interface AnalysisResult {
  /** Document ID */
  documentId: string
  /** Tenant ID */
  tenantId: string
  /** Parsed document structure */
  parsedDocument: ParsedDocument
  /** Classified clauses */
  classifiedClauses: ClassifiedClause[]
  /** Risk assessments */
  riskAssessments: RiskAssessment[]
  /** Gap analysis */
  gapAnalysis: GapAnalysis
  /** Overall metrics */
  summary: {
    /** Overall risk score (0-100) */
    overallRiskScore: number
    /** Overall risk level */
    overallRiskLevel: RiskLevel
    /** Executive summary text */
    executiveSummary: string
  }
  /** Token usage across all agents */
  tokenUsage: {
    parser: number
    classifier: number
    riskScorer: number
    gapAnalyst: number
    total: number
  }
  /** Processing time in ms */
  processingTimeMs: number
}

/**
 * Zod schema for ClassifiedClause (for structured output).
 */
export const classifiedClauseSchema = z.object({
  chunkId: z.string(),
  clauseText: z.string(),
  category: z.enum(CUAD_CATEGORIES),
  secondaryCategories: z.array(z.enum(CUAD_CATEGORIES)).optional(),
  confidence: z.number().min(0).max(1),
})

/**
 * Zod schema for RiskAssessment output.
 */
export const riskAssessmentSchema = z.object({
  riskLevel: z.enum(RISK_LEVELS),
  riskScore: z.number().min(0).max(100),
  explanation: z.string(),
  citations: z.array(z.string()),
  comparisons: z.array(z.string()),
})

/**
 * Zod schema for HypothesisCoverage output.
 */
export const hypothesisCoverageSchema = z.object({
  hypothesisId: z.string(),
  category: z.enum(CONTRACT_NLI_CATEGORIES),
  isCovered: z.boolean(),
  status: z.enum(["entailment", "contradiction", "not_mentioned"]),
  supportingClause: z.string().optional(),
  explanation: z.string(),
})

/**
 * Zod schema for GapAnalysis output.
 */
export const gapAnalysisSchema = z.object({
  missingCategories: z.array(
    z.object({
      category: z.enum(CUAD_CATEGORIES),
      importance: z.enum(["critical", "important", "optional"]),
      explanation: z.string(),
      recommendedLanguage: z.string().optional(),
    })
  ),
  weakCategories: z.array(
    z.object({
      category: z.enum(CUAD_CATEGORIES),
      issue: z.string(),
      recommendation: z.string(),
    })
  ),
  hypothesisCoverage: z.array(hypothesisCoverageSchema),
  gapScore: z.number().min(0).max(100),
})
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agents/types.ts
git commit -m "feat(agents): add shared type definitions

- CUAD 41-category taxonomy
- ContractNLI 17 hypothesis categories
- Risk levels and assessment types
- Document chunk and parsed document types
- Hypothesis coverage for NLI analysis
- Zod schemas for structured output

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create Vector Search Tools

**Files:**
- Create: `src/agents/tools/vector-search.ts`

**Step 1: Create vector search tools**

```typescript
// src/agents/tools/vector-search.ts
/**
 * @fileoverview Vector Search Tools for Agents
 *
 * Provides vector similarity search functions for retrieving
 * relevant reference clauses and similar documents. These are
 * exposed as AI SDK tools for agent use.
 *
 * @module agents/tools/vector-search
 */

import { tool } from "ai"
import { z } from "zod"
import { db } from "@/db/client"
import { referenceEmbeddings, referenceDocuments } from "@/db/schema/reference"
import { documentChunks } from "@/db/schema/documents"
import { cosineDistance, sql, eq, and, lt } from "drizzle-orm"
import { getVoyageAIClient } from "@/lib/embeddings"
import type { ReferenceClause, CuadCategory } from "../types"

/**
 * Search options for vector queries.
 */
export interface VectorSearchOptions {
  /** Maximum results to return */
  limit?: number
  /** Minimum similarity threshold (0-1, higher = more similar) */
  similarityThreshold?: number
  /** Filter by granularity level */
  granularity?: "document" | "section" | "clause" | "evidence" | "template"
  /** Filter by CUAD category */
  category?: CuadCategory
}

const DEFAULT_OPTIONS: Required<Omit<VectorSearchOptions, "category">> = {
  limit: 5,
  similarityThreshold: 0.7,
  granularity: "clause",
}

/**
 * Find similar reference clauses from CUAD corpus.
 *
 * @param queryText - Text to find similar clauses for
 * @param options - Search options
 * @returns Array of similar reference clauses with similarity scores
 */
export async function findSimilarReferenceClauses(
  queryText: string,
  options: VectorSearchOptions = {}
): Promise<ReferenceClause[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Generate query embedding
  const voyage = getVoyageAIClient()
  const { embedding: queryEmbedding } = await voyage.embed(queryText, "query")

  // Convert similarity threshold to distance (cosine distance = 1 - similarity)
  const distanceThreshold = 1 - opts.similarityThreshold

  // Build query
  const results = await db
    .select({
      id: referenceEmbeddings.id,
      content: referenceEmbeddings.content,
      category: referenceEmbeddings.category,
      distance: cosineDistance(referenceEmbeddings.embedding, queryEmbedding),
      documentId: referenceEmbeddings.documentId,
    })
    .from(referenceEmbeddings)
    .where(
      and(
        eq(referenceEmbeddings.granularity, opts.granularity),
        lt(cosineDistance(referenceEmbeddings.embedding, queryEmbedding), distanceThreshold),
        opts.category ? eq(referenceEmbeddings.category, opts.category) : undefined
      )
    )
    .orderBy(cosineDistance(referenceEmbeddings.embedding, queryEmbedding))
    .limit(opts.limit)

  // Fetch source document titles
  const docIds = [...new Set(results.map((r) => r.documentId))]
  const docs = docIds.length > 0
    ? await db
        .select({ id: referenceDocuments.id, title: referenceDocuments.title })
        .from(referenceDocuments)
        .where(sql`${referenceDocuments.id} IN (${sql.join(docIds.map(id => sql`${id}`), sql`, `)})`)
    : []

  const docMap = new Map(docs.map((d) => [d.id, d.title]))

  return results.map((r) => ({
    id: String(r.id),
    content: r.content,
    category: r.category as CuadCategory,
    similarity: 1 - (r.distance as number),
    source: docMap.get(r.documentId) ?? "Unknown",
  }))
}

/**
 * AI SDK tool for vector search.
 * Allows agents to search the reference corpus.
 */
export const vectorSearchTool = tool({
  description:
    "Search for similar clauses in the CUAD legal reference corpus. " +
    "Use this to find examples of how similar clauses are typically written.",
  parameters: z.object({
    query: z.string().describe("The clause text to search for similar examples"),
    category: z
      .string()
      .optional()
      .describe("Optional CUAD category to filter results (e.g., 'Governing Law')"),
    limit: z
      .number()
      .optional()
      .default(3)
      .describe("Maximum number of results (default: 3)"),
  }),
  execute: async ({ query, category, limit }) => {
    const results = await findSimilarReferenceClauses(query, {
      limit,
      category: category as CuadCategory | undefined,
      similarityThreshold: 0.5,
    })

    return results.map((r) => ({
      category: r.category,
      similarity: `${(r.similarity * 100).toFixed(0)}%`,
      content: r.content.substring(0, 500) + (r.content.length > 500 ? "..." : ""),
      source: r.source,
    }))
  },
})

/**
 * Find similar chunks within tenant documents.
 *
 * @param queryText - Text to search for
 * @param tenantId - Tenant ID for isolation
 * @param options - Search options
 * @returns Similar document chunks
 */
export async function findSimilarTenantChunks(
  queryText: string,
  tenantId: string,
  options: Pick<VectorSearchOptions, "limit" | "similarityThreshold"> = {}
): Promise<
  Array<{
    id: string
    documentId: string
    content: string
    sectionPath: string[]
    similarity: number
  }>
> {
  const opts = {
    limit: options.limit ?? DEFAULT_OPTIONS.limit,
    similarityThreshold: options.similarityThreshold ?? DEFAULT_OPTIONS.similarityThreshold,
  }

  const voyage = getVoyageAIClient()
  const { embedding: queryEmbedding } = await voyage.embed(queryText, "query")

  const distanceThreshold = 1 - opts.similarityThreshold

  const results = await db
    .select({
      id: documentChunks.id,
      documentId: documentChunks.documentId,
      content: documentChunks.content,
      sectionPath: documentChunks.sectionPath,
      distance: cosineDistance(documentChunks.embedding, queryEmbedding),
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.tenantId, tenantId),
        lt(cosineDistance(documentChunks.embedding, queryEmbedding), distanceThreshold)
      )
    )
    .orderBy(cosineDistance(documentChunks.embedding, queryEmbedding))
    .limit(opts.limit)

  return results.map((r) => ({
    id: String(r.id),
    documentId: String(r.documentId),
    content: r.content,
    sectionPath: (r.sectionPath as string[]) ?? [],
    similarity: 1 - (r.distance as number),
  }))
}

/**
 * Batch find similar reference clauses for multiple texts.
 * More efficient than calling findSimilarReferenceClauses multiple times.
 *
 * @param queries - Array of { id, text } to search for
 * @param options - Search options (applied to all queries)
 * @returns Map of query ID to results
 */
export async function batchFindSimilarClauses(
  queries: Array<{ id: string; text: string }>,
  options: VectorSearchOptions = {}
): Promise<Map<string, ReferenceClause[]>> {
  const results = new Map<string, ReferenceClause[]>()

  // Process in batches to avoid overwhelming the embedding API
  const batchSize = 10
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize)

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(async ({ id, text }) => ({
        id,
        clauses: await findSimilarReferenceClauses(text, options),
      }))
    )

    for (const { id, clauses } of batchResults) {
      results.set(id, clauses)
    }
  }

  return results
}
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agents/tools/vector-search.ts
git commit -m "feat(agents): add vector search tools

- findSimilarReferenceClauses for CUAD corpus search
- findSimilarTenantChunks for document search
- vectorSearchTool as AI SDK tool for agents
- batchFindSimilarClauses for efficient bulk search

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Prompt Templates with ContractNLI

**Files:**
- Create: `src/agents/prompts/index.ts`
- Create: `src/agents/prompts/classifier.ts`
- Create: `src/agents/prompts/risk-scorer.ts`
- Create: `src/agents/prompts/gap-analyst.ts`

**Step 1: Create prompt utilities**

```typescript
// src/agents/prompts/index.ts
/**
 * @fileoverview Agent Prompt Templates
 *
 * Centralized prompt templates for NDA analysis agents.
 * Each agent has its own system prompt and user prompt formatter.
 *
 * @module agents/prompts
 */

export * from "./classifier"
export * from "./risk-scorer"
export * from "./gap-analyst"

/**
 * Common legal disclaimer included in all analysis output.
 */
export const LEGAL_DISCLAIMER = `
DISCLAIMER: This analysis is generated by AI and does not constitute legal advice.
Consult a qualified attorney for legal guidance.
`.trim()

/**
 * Format reference clauses for prompt context.
 */
export function formatReferenceClauses(
  clauses: Array<{
    content: string
    category: string
    similarity: number
  }>
): string {
  if (clauses.length === 0) {
    return "No similar reference clauses found."
  }

  return clauses
    .map(
      (c, i) =>
        `Reference ${i + 1} (${c.category}, ${(c.similarity * 100).toFixed(0)}% match):
${c.content}`
    )
    .join("\n\n")
}
```

**Step 2: Create classifier prompts**

```typescript
// src/agents/prompts/classifier.ts
/**
 * @fileoverview Classifier Agent Prompts
 *
 * Prompt templates for the clause classification agent.
 * Classifies document chunks into CUAD 41-category taxonomy.
 *
 * @module agents/prompts/classifier
 */

import { CUAD_CATEGORIES } from "../types"
import { formatReferenceClauses } from "./index"
import type { ReferenceClause } from "../types"

/**
 * System prompt for the Classifier Agent.
 */
export const CLASSIFIER_SYSTEM_PROMPT = `You are a legal clause classification expert specializing in contract analysis.

Your task is to classify legal text into categories from the CUAD (Contract Understanding Atticus Dataset) taxonomy.

## CUAD Categories (41 total)

${CUAD_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## Classification Guidelines

1. **Primary Category**: Assign the single most relevant CUAD category
2. **Secondary Categories**: If the clause clearly covers multiple topics, list up to 2 secondary categories
3. **Confidence Score**: Provide a confidence score from 0.0 to 1.0:
   - 0.9-1.0: Clear, unambiguous match
   - 0.7-0.9: Strong match with minor ambiguity
   - 0.5-0.7: Moderate confidence, may need review
   - Below 0.5: Low confidence, uncertain classification

4. **Use Reference Examples**: Compare the input text with the provided reference clauses to inform your classification

5. **"Unknown" Category**: Use this only when the text clearly doesn't fit any other category

## Important Notes

- Focus on the legal substance, not just keywords
- Consider the context and purpose of the clause
- A clause about "term" could be "Renewal Term" or "Expiration Date" - read carefully
- Non-disclosure specific clauses may map to multiple categories`

/**
 * Create user prompt for clause classification.
 *
 * @param clauseText - The text to classify
 * @param references - Similar reference clauses for context
 * @returns Formatted user prompt
 */
export function createClassifierPrompt(
  clauseText: string,
  references: ReferenceClause[]
): string {
  return `Classify the following clause from an NDA document.

## Clause Text
${clauseText}

## Similar Reference Clauses (from CUAD corpus)
${formatReferenceClauses(references)}

## Instructions
Based on the clause text and reference examples, provide your classification.`
}
```

**Step 3: Create risk scorer prompts**

```typescript
// src/agents/prompts/risk-scorer.ts
/**
 * @fileoverview Risk Scorer Agent Prompts
 *
 * Prompt templates for the risk assessment agent.
 * Evaluates clauses for risk level with evidence-based explanations.
 *
 * @module agents/prompts/risk-scorer
 */

import { formatReferenceClauses } from "./index"
import type { ClassifiedClause, ReferenceClause } from "../types"

/**
 * System prompt for the Risk Scorer Agent.
 */
export const RISK_SCORER_SYSTEM_PROMPT = `You are a legal risk assessment expert specializing in NDA analysis.

Your task is to evaluate the risk level of contract clauses and provide evidence-based explanations.

## Risk Levels

1. **low** (0-25): Standard, market-friendly terms
   - Common language found in most NDAs
   - Balanced obligations for both parties
   - No unusual or aggressive provisions

2. **medium** (26-50): Terms requiring review
   - Slightly one-sided but generally acceptable
   - May need minor negotiation
   - Contains common but notable provisions

3. **high** (51-75): Terms requiring negotiation
   - Clearly one-sided or aggressive
   - Unusual provisions that deviate from market standard
   - May create significant exposure

4. **critical** (76-100): Terms presenting significant risk
   - Highly unusual or potentially unenforceable
   - Creates substantial legal or business exposure
   - Requires immediate attention and likely renegotiation

## Assessment Guidelines

1. **Compare to References**: Use the provided reference clauses to determine if this language is standard or unusual
2. **Consider Scope**: Broader scope = higher risk (worldwide vs. specific geography)
3. **Consider Duration**: Longer duration = higher risk (5 years vs. 2 years)
4. **Consider Remedies**: Unlimited liability or liquidated damages = higher risk
5. **Consider Enforcement**: Ambiguous or one-sided enforcement = higher risk

## Evidence Requirements

Every risk assessment MUST include:
- Specific citations from the clause text
- Comparisons to reference clauses showing why this is standard/unusual
- Statistical context when available (e.g., "This exceeds 80% of similar clauses")`

/**
 * Create user prompt for risk assessment.
 */
export function createRiskScorerPrompt(
  clause: ClassifiedClause,
  additionalReferences: ReferenceClause[]
): string {
  const allReferences = [...clause.references, ...additionalReferences]

  return `Assess the risk level of the following ${clause.category} clause.

## Clause Text
${clause.clauseText}

## Classification
- Primary Category: ${clause.category}
- Secondary Categories: ${clause.secondaryCategories?.join(", ") || "None"}
- Classification Confidence: ${(clause.confidence * 100).toFixed(0)}%

## Reference Clauses for Comparison
${formatReferenceClauses(allReferences)}

## Instructions
Evaluate the risk level of this clause compared to market standard terms.
Provide specific citations and evidence for your assessment.`
}
```

**Step 4: Create gap analyst prompts with ContractNLI**

```typescript
// src/agents/prompts/gap-analyst.ts
/**
 * @fileoverview Gap Analyst Agent Prompts
 *
 * Prompt templates for the gap analysis agent.
 * Identifies missing and weak clauses in NDA documents.
 * Integrates ContractNLI hypotheses for richer analysis.
 *
 * @module agents/prompts/gap-analyst
 */

import { CUAD_CATEGORIES, CONTRACT_NLI_CATEGORIES, type CuadCategory, type ContractNLICategory } from "../types"

/**
 * Categories that are critical for NDAs.
 */
export const CRITICAL_NDA_CATEGORIES: CuadCategory[] = [
  "Parties",
  "Effective Date",
  "Governing Law",
]

/**
 * Categories that are important for NDAs.
 */
export const IMPORTANT_NDA_CATEGORIES: CuadCategory[] = [
  "Expiration Date",
  "Non-Compete",
  "No-Solicit Of Employees",
  "No-Solicit Of Customers",
  "Cap On Liability",
  "Termination For Convenience",
]

/**
 * Categories that are optional for NDAs.
 */
export const OPTIONAL_NDA_CATEGORIES: CuadCategory[] = [
  "Renewal Term",
  "Audit Rights",
  "Insurance",
  "Most Favored Nation",
]

/**
 * ContractNLI hypothesis definitions for NLI-based gap analysis.
 */
export const CONTRACT_NLI_HYPOTHESES: Array<{
  id: string
  category: ContractNLICategory
  hypothesis: string
  importance: "critical" | "important" | "optional"
}> = [
  {
    id: "nli-1",
    category: "Purpose Limitation",
    hypothesis: "Confidential information shall be used solely for the purpose of evaluating the proposed transaction.",
    importance: "critical",
  },
  {
    id: "nli-2",
    category: "Permitted Disclosure",
    hypothesis: "The Receiving Party may share confidential information with its employees.",
    importance: "important",
  },
  {
    id: "nli-3",
    category: "Third Party Disclosure",
    hypothesis: "The Receiving Party may share confidential information with third parties.",
    importance: "important",
  },
  {
    id: "nli-4",
    category: "Standard of Care",
    hypothesis: "The Receiving Party shall protect confidential information with the same degree of care as its own confidential information.",
    importance: "critical",
  },
  {
    id: "nli-5",
    category: "Survival Period",
    hypothesis: "Confidential information shall remain confidential for a specified period after termination.",
    importance: "important",
  },
  {
    id: "nli-6",
    category: "Termination",
    hypothesis: "The agreement may be terminated for convenience.",
    importance: "optional",
  },
  {
    id: "nli-7",
    category: "Return/Destruction",
    hypothesis: "The Receiving Party shall return or destroy confidential information upon termination.",
    importance: "important",
  },
  {
    id: "nli-8",
    category: "IP License",
    hypothesis: "The agreement grants no license to intellectual property.",
    importance: "important",
  },
  {
    id: "nli-9",
    category: "Warranties",
    hypothesis: "The Disclosing Party makes no warranties about the confidential information.",
    importance: "optional",
  },
  {
    id: "nli-10",
    category: "Liability Limitation",
    hypothesis: "Neither party shall be liable for consequential damages.",
    importance: "important",
  },
  {
    id: "nli-11",
    category: "Governing Law",
    hypothesis: "The agreement shall be governed by the laws of a specific jurisdiction.",
    importance: "critical",
  },
  {
    id: "nli-12",
    category: "Legal Compulsion",
    hypothesis: "The Receiving Party may disclose confidential information if required by law.",
    importance: "critical",
  },
  {
    id: "nli-13",
    category: "Public Information Exception",
    hypothesis: "Information that is publicly known is not confidential.",
    importance: "critical",
  },
  {
    id: "nli-14",
    category: "Prior Knowledge Exception",
    hypothesis: "Information known to the Receiving Party before disclosure is not confidential.",
    importance: "important",
  },
  {
    id: "nli-15",
    category: "Independent Development Exception",
    hypothesis: "Information independently developed is not confidential.",
    importance: "important",
  },
  {
    id: "nli-16",
    category: "Assignment",
    hypothesis: "The agreement may not be assigned without consent.",
    importance: "optional",
  },
  {
    id: "nli-17",
    category: "Amendment",
    hypothesis: "The agreement shall be amended only in writing.",
    importance: "optional",
  },
]

/**
 * System prompt for the Gap Analyst Agent.
 */
export const GAP_ANALYST_SYSTEM_PROMPT = `You are a legal gap analysis expert specializing in NDA completeness.

Your task is to identify missing clauses and weak protections in NDA documents using both CUAD categories and ContractNLI hypotheses.

## CUAD Category Importance for NDAs

### Critical (Must Have)
${CRITICAL_NDA_CATEGORIES.map((c) => `- ${c}`).join("\n")}

### Important (Should Have)
${IMPORTANT_NDA_CATEGORIES.map((c) => `- ${c}`).join("\n")}

### Optional (Nice to Have)
${OPTIONAL_NDA_CATEGORIES.map((c) => `- ${c}`).join("\n")}

## ContractNLI Hypotheses (17 total)

These hypotheses test specific NDA obligations. For each, determine if the NDA:
- **Entails** the hypothesis (clause supports it)
- **Contradicts** the hypothesis (clause opposes it)
- **Does not mention** it (clause is absent)

${CONTRACT_NLI_HYPOTHESES.map((h) => `### ${h.category} (${h.importance})
ID: ${h.id}
Hypothesis: "${h.hypothesis}"`).join("\n\n")}

## Analysis Guidelines

1. **Missing Clauses**: Identify important categories not present in the document
2. **Weak Clauses**: Identify present clauses that are inadequate or one-sided
3. **Hypothesis Coverage**: For each ContractNLI hypothesis, determine coverage status
4. **Gap Score**: Calculate overall completeness (0 = fully complete, 100 = many gaps)

## Gap Score Calculation

CUAD Categories:
- Each missing critical category: +15 points
- Each missing important category: +8 points
- Each missing optional category: +3 points
- Each weak critical clause: +10 points
- Each weak important clause: +5 points

ContractNLI Hypotheses:
- Each critical hypothesis not mentioned: +10 points
- Each important hypothesis not mentioned: +5 points
- Each contradicted hypothesis: +15 points

Cap the score at 100.

## Recommendations

For each gap, provide:
1. Why this clause matters for NDAs
2. What risks arise from its absence
3. Suggested language from standard templates (if applicable)`

/**
 * Create user prompt for gap analysis.
 */
export function createGapAnalystPrompt(
  presentCategories: CuadCategory[],
  documentSummary: string
): string {
  const allCategories = new Set(CUAD_CATEGORIES)
  const present = new Set(presentCategories)
  const missing = [...allCategories].filter((c) => !present.has(c))

  return `Analyze the gaps in the following NDA document.

## Document Summary
${documentSummary}

## Categories Found (${presentCategories.length} of ${CUAD_CATEGORIES.length})
${presentCategories.map((c) => `- ${c}`).join("\n") || "None identified"}

## Categories Not Found (${missing.length})
${missing.map((c) => `- ${c}`).join("\n")}

## Instructions
1. Evaluate which missing categories are important for this NDA
2. Identify any present clauses that are weak or inadequate
3. Evaluate each ContractNLI hypothesis for coverage
4. Calculate the overall gap score
5. Provide recommendations for addressing critical gaps`
}
```

**Step 5: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add src/agents/prompts/
git commit -m "feat(agents): add prompt templates with ContractNLI

- Classifier prompts with CUAD category guidance
- Risk scorer prompts with evidence requirements
- Gap analyst prompts with ContractNLI 17 hypotheses
- Hypothesis coverage analysis for NLI-based gaps
- Shared utilities for reference formatting

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create Agent Test Utilities

**Files:**
- Create: `src/agents/testing/mock-ai.ts`
- Create: `src/agents/testing/fixtures.ts`
- Create: `src/agents/testing/index.ts`

**Step 1: Create mock AI client**

```typescript
// src/agents/testing/mock-ai.ts
/**
 * @fileoverview Mock AI Client for Testing
 *
 * Provides mock implementations of AI SDK functions for
 * testing agents without making actual API calls.
 *
 * @module agents/testing/mock-ai
 */

import { vi } from "vitest"
import type { TokenUsage } from "@/lib/ai/base-agent"

/**
 * Mock response configuration.
 */
export interface MockResponse<T = string> {
  /** The response content */
  content: T
  /** Token usage (optional, defaults provided) */
  usage?: Partial<TokenUsage>
  /** Number of steps (for multi-step agents) */
  steps?: number
  /** Whether to simulate tool usage */
  usedTools?: boolean
}

/**
 * Create a mock for the executeAgent function.
 *
 * @param responses - Array of responses to return in sequence
 * @returns Mocked executeAgent function
 */
export function createMockExecuteAgent<T = string>(
  responses: MockResponse<T>[]
) {
  let callIndex = 0

  return vi.fn().mockImplementation(async () => {
    const response = responses[callIndex % responses.length]
    callIndex++

    return {
      output: response.content,
      usage: {
        inputTokens: response.usage?.inputTokens ?? 100,
        outputTokens: response.usage?.outputTokens ?? 50,
        totalTokens: response.usage?.totalTokens ?? 150,
        estimatedCost: response.usage?.estimatedCost ?? 0.001,
      },
      steps: response.steps ?? 1,
      usedTools: response.usedTools ?? false,
    }
  })
}

/**
 * Create a mock for the generateText function from AI SDK.
 *
 * @param response - The response to return
 * @returns Mocked generateText function
 */
export function createMockGenerateText(response: {
  text?: string
  experimental_output?: unknown
  usage?: { promptTokens: number; completionTokens: number }
  steps?: Array<{ toolCalls?: unknown[] }>
}) {
  return vi.fn().mockResolvedValue({
    text: response.text ?? "",
    experimental_output: response.experimental_output,
    usage: response.usage ?? { promptTokens: 100, completionTokens: 50 },
    steps: response.steps ?? [],
  })
}

/**
 * Create a mock for vector search functions.
 *
 * @param results - Results to return
 * @returns Mocked findSimilarReferenceClauses function
 */
export function createMockVectorSearch(
  results: Array<{
    id: string
    content: string
    category: string
    similarity: number
    source: string
  }>
) {
  return vi.fn().mockResolvedValue(results)
}

/**
 * Reset all agent-related mocks.
 */
export function resetAgentMocks() {
  vi.resetAllMocks()
}
```

**Step 2: Create test fixtures**

```typescript
// src/agents/testing/fixtures.ts
/**
 * @fileoverview Test Fixtures for Agents
 *
 * Provides reusable test data for agent testing.
 *
 * @module agents/testing/fixtures
 */

import type {
  DocumentChunk,
  ParsedDocument,
  ClassifiedClause,
  RiskAssessment,
  ReferenceClause,
} from "../types"

/**
 * Sample document chunk for testing.
 */
export function createMockChunk(overrides?: Partial<DocumentChunk>): DocumentChunk {
  return {
    id: "chunk-1",
    index: 0,
    content:
      "This Agreement shall be governed by and construed in accordance with " +
      "the laws of the State of Delaware, without regard to its conflict of law provisions.",
    sectionPath: ["Article V", "Section 5.1: Governing Law"],
    tokenCount: 45,
    ...overrides,
  }
}

/**
 * Sample parsed document for testing.
 */
export function createMockParsedDocument(
  overrides?: Partial<ParsedDocument>
): ParsedDocument {
  return {
    documentId: "doc-1",
    title: "Mutual Non-Disclosure Agreement",
    rawText: "MUTUAL NON-DISCLOSURE AGREEMENT...",
    chunks: [createMockChunk()],
    sections: [
      { name: "Article V", startIndex: 0, endIndex: 0 },
    ],
    metadata: {
      tokenCount: 1000,
      chunkCount: 10,
      pageCount: 3,
    },
    ...overrides,
  }
}

/**
 * Sample reference clause for testing.
 */
export function createMockReferenceClause(
  overrides?: Partial<ReferenceClause>
): ReferenceClause {
  return {
    id: "ref-1",
    content:
      "This Agreement shall be governed by and construed in accordance with " +
      "the laws of the State of New York.",
    category: "Governing Law",
    similarity: 0.92,
    source: "CUAD Contract #123",
    ...overrides,
  }
}

/**
 * Sample classified clause for testing.
 */
export function createMockClassifiedClause(
  overrides?: Partial<ClassifiedClause>
): ClassifiedClause {
  return {
    chunkId: "chunk-1",
    clauseText:
      "This Agreement shall be governed by and construed in accordance with " +
      "the laws of the State of Delaware.",
    category: "Governing Law",
    secondaryCategories: undefined,
    confidence: 0.95,
    references: [createMockReferenceClause()],
    ...overrides,
  }
}

/**
 * Sample risk assessment for testing.
 */
export function createMockRiskAssessment(
  overrides?: Partial<RiskAssessment>
): RiskAssessment {
  return {
    clause: createMockClassifiedClause(),
    riskLevel: "low",
    riskScore: 15,
    explanation:
      "This governing law clause specifies Delaware law, which is standard " +
      "and commonly used in commercial agreements.",
    evidence: {
      citations: ["governed by...the laws of the State of Delaware"],
      comparisons: [
        "92% similar to standard CUAD governing law clauses",
        "Delaware is the most common jurisdiction in commercial contracts",
      ],
      statistics: "85% of commercial NDAs use Delaware, New York, or California law",
    },
    ...overrides,
  }
}

/**
 * Sample NDA text for testing.
 */
export const SAMPLE_NDA_TEXT = `
MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of January 1, 2025
("Effective Date") by and between:

ACME Corporation ("ACME"), a Delaware corporation, and
Widget Inc. ("Widget"), a California corporation.

ARTICLE I: DEFINITIONS

1.1 "Confidential Information" means any information disclosed by either party that is
marked as confidential or would reasonably be understood to be confidential.

ARTICLE II: OBLIGATIONS

2.1 Non-Disclosure. The Receiving Party shall not disclose Confidential Information
to any third party without the prior written consent of the Disclosing Party.

2.2 Use Restriction. The Receiving Party shall use Confidential Information solely
for the purpose of evaluating the proposed business relationship.

ARTICLE III: TERM

3.1 Term. This Agreement shall remain in effect for two (2) years from the Effective Date.

3.2 Survival. The obligations of confidentiality shall survive termination of this
Agreement for a period of three (3) years.

ARTICLE IV: GENERAL

4.1 Governing Law. This Agreement shall be governed by and construed in accordance
with the laws of the State of Delaware.

4.2 Entire Agreement. This Agreement constitutes the entire agreement between the
parties with respect to the subject matter hereof.
`.trim()

/**
 * Sample chunks from the sample NDA.
 */
export const SAMPLE_NDA_CHUNKS: DocumentChunk[] = [
  {
    id: "chunk-parties",
    index: 0,
    content:
      "ACME Corporation (\"ACME\"), a Delaware corporation, and Widget Inc. (\"Widget\"), " +
      "a California corporation.",
    sectionPath: ["Preamble"],
    tokenCount: 30,
  },
  {
    id: "chunk-definitions",
    index: 1,
    content:
      "\"Confidential Information\" means any information disclosed by either party that is " +
      "marked as confidential or would reasonably be understood to be confidential.",
    sectionPath: ["Article I", "Section 1.1: Definitions"],
    tokenCount: 35,
  },
  {
    id: "chunk-nondisclosure",
    index: 2,
    content:
      "The Receiving Party shall not disclose Confidential Information to any third party " +
      "without the prior written consent of the Disclosing Party.",
    sectionPath: ["Article II", "Section 2.1: Non-Disclosure"],
    tokenCount: 30,
  },
  {
    id: "chunk-governing-law",
    index: 3,
    content:
      "This Agreement shall be governed by and construed in accordance with the laws " +
      "of the State of Delaware.",
    sectionPath: ["Article IV", "Section 4.1: Governing Law"],
    tokenCount: 25,
  },
]
```

**Step 3: Create testing barrel export**

```typescript
// src/agents/testing/index.ts
/**
 * @fileoverview Agent Testing Utilities Barrel Export
 *
 * @module agents/testing
 */

export * from "./mock-ai"
export * from "./fixtures"
```

**Step 4: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/agents/testing/
git commit -m "feat(agents): add test utilities

- MockExecuteAgent for testing without API calls
- MockVectorSearch for testing without database
- Test fixtures: chunks, documents, clauses, assessments
- Sample NDA text for integration testing

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Create Barrel Exports

**Files:**
- Create: `src/lib/ai/index.ts`
- Create: `src/agents/tools/index.ts`
- Create: `src/agents/index.ts`

**Step 1: Create AI lib barrel**

```typescript
// src/lib/ai/index.ts
/**
 * @fileoverview AI Utilities Barrel Export
 *
 * @module lib/ai
 */

export * from "./config"
export * from "./base-agent"
```

**Step 2: Create tools barrel**

```typescript
// src/agents/tools/index.ts
/**
 * @fileoverview Agent Tools Barrel Export
 *
 * @module agents/tools
 */

export * from "./vector-search"
```

**Step 3: Create main agents barrel**

```typescript
// src/agents/index.ts
/**
 * @fileoverview NDA Analysis Agents Barrel Export
 *
 * Main entry point for the agent system. Import from `@/agents`
 * for all agent-related functionality.
 *
 * @example
 * ```typescript
 * import {
 *   CUAD_CATEGORIES,
 *   CONTRACT_NLI_CATEGORIES,
 *   findSimilarReferenceClauses,
 *   CLASSIFIER_SYSTEM_PROMPT,
 *   executeAgent,
 * } from "@/agents"
 * ```
 *
 * @module agents
 */

// Types
export * from "./types"

// Tools
export * from "./tools"

// Prompts
export * from "./prompts"

// Testing utilities (for test files)
// Note: Import from "@/agents/testing" directly in tests
```

**Step 4: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/lib/ai/index.ts src/agents/tools/index.ts src/agents/index.ts
git commit -m "feat: add barrel exports for AI and agents modules

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Add Environment Variables

**Files:**
- Modify: `.env.example`

**Step 1: Add Anthropic key**

Add to `.env.example`:

```bash
# =============================================================================
# Anthropic Claude - LLM for Analysis Agents
# =============================================================================
# Get key from: https://console.anthropic.com/

# API key for Claude Sonnet 4.5
ANTHROPIC_API_KEY=
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add ANTHROPIC_API_KEY to .env.example

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Verify Complete Agent Foundation

**Files:**
- No new files

**Step 1: Run full type check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Run linter**

Run: `pnpm lint`
Expected: No errors

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(agents): complete agent foundation infrastructure

Agent Foundation Plan complete:
- AI SDK 6 configuration with Anthropic provider
- Base agent utilities (token tracking, retry, rate limits)
- BudgetTracker for ~212K token budget per document
- Shared type definitions (CUAD + ContractNLI)
- Vector search tools as AI SDK tools
- Prompt templates with ContractNLI integration
- Agent test utilities (mocks, fixtures)
- Barrel exports for clean imports

Ready for: Analysis Pipeline (Plan 4)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

This plan establishes the agent foundation:

| Component | File | Purpose |
|-----------|------|---------|
| AI Config | `src/lib/ai/config.ts` | Claude model and pricing |
| Base Agent | `src/lib/ai/base-agent.ts` | Token tracking, retry, budget |
| Agent Types | `src/agents/types.ts` | Shared type definitions |
| Vector Search | `src/agents/tools/vector-search.ts` | AI SDK tool for search |
| Classifier Prompts | `src/agents/prompts/classifier.ts` | Classification prompts |
| Risk Scorer Prompts | `src/agents/prompts/risk-scorer.ts` | Risk assessment prompts |
| Gap Analyst Prompts | `src/agents/prompts/gap-analyst.ts` | Gap analysis + ContractNLI |
| Test Utilities | `src/agents/testing/` | Mocks and fixtures |

**Key Features:**
- **AI SDK 6** instead of LangGraph (simpler, better Next.js integration)
- **BudgetTracker** for monitoring ~212K token budget per document
- **Retry with backoff** for transient API failures
- **ContractNLI integration** in Gap Analyst (17 hypothesis coverage)
- **Test utilities** for testing agents without API calls

**Next Plan:** [Analysis Pipeline](./2026-02-01-inngest-analysis-pipeline.md) - Implement the four agents (Parser, Classifier, Risk Scorer, Gap Analyst).

---

## Sources

- [AI SDK 6 - Vercel](https://vercel.com/blog/ai-sdk-6)
- [AI SDK Core: Tool Calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK Core: Agents](https://ai-sdk.dev/docs/ai-sdk-core/agents)
- [How to build AI Agents with Vercel and the AI SDK](https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk)
