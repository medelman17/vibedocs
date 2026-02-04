# Architecture Patterns: Multi-Agent LLM Pipelines

**Domain:** NDA Analysis Pipeline with Inngest Orchestration
**Researched:** 2026-02-04
**Confidence:** HIGH (verified via existing implementation + authoritative sources)

## Executive Summary

VibeDocs already implements a well-structured sequential pipeline pattern with Inngest for durability. The existing architecture aligns with industry best practices for multi-agent LLM systems. This document codifies the patterns in use and provides guidance for extension.

---

## Recommended Architecture

### Current Pipeline: Sequential Processing

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Parser    │────▶│  Classifier  │────▶│ Risk Scorer  │────▶│ Gap Analyst  │
│   Agent     │     │  Agent       │     │  Agent       │     │  Agent       │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
      │                   │                    │                    │
      ▼                   ▼                    ▼                    ▼
  ParsedChunk[]     ClassifiedClause[]   RiskAssessment[]      GapAnalysis
```

**Why sequential works here:**
- Each agent genuinely depends on the previous output
- No opportunity for parallel processing between stages
- Linear flow is "refreshingly easy to debug" (Google multi-agent patterns)
- Inngest step durability ensures partial progress survives failures

### Component Boundaries

| Component | Responsibility | Input | Output | Communicates With |
|-----------|---------------|-------|--------|-------------------|
| Parser Agent | Text extraction, chunking, embedding | Document (blob or inline) | `ParsedChunk[]` with embeddings | Voyage AI API |
| Classifier Agent | CUAD category classification | `ParsedChunk[]` | `ClassifiedClause[]` | Vector search (RAG), Claude API |
| Risk Scorer Agent | Risk level assessment with evidence | `ClassifiedClause[]` | `RiskAssessment[]` + overall score | Vector search, Claude API |
| Gap Analyst Agent | Missing/weak clause identification | `ClassifiedClause[]` + `RiskAssessment[]` | `GapAnalysis` | Claude API |
| Inngest Orchestrator | Pipeline durability, progress tracking | Event trigger | Final analysis record | PostgreSQL, all agents |

### Data Flow Between Agents

**State Shape at Each Stage:**

```typescript
// Stage 1: Parser Output
interface ParserOutput {
  document: {
    documentId: string
    title: string
    rawText: string
    chunks: ParsedChunk[]  // includes embedding vectors
  }
  tokenUsage: { embeddingTokens: number }
}

// Stage 2: Classifier Output
interface ClassifierOutput {
  clauses: ClassifiedClause[]  // category, confidence, reasoning
  tokenUsage: { inputTokens: number; outputTokens: number }
}

// Stage 3: Risk Scorer Output
interface RiskScorerOutput {
  assessments: RiskAssessmentResult[]  // per-clause risk with evidence
  overallRiskScore: number             // 0-100
  overallRiskLevel: RiskLevel          // standard/cautious/aggressive/unknown
  tokenUsage: { inputTokens: number; outputTokens: number }
}

// Stage 4: Gap Analyst Output
interface GapAnalystOutput {
  gapAnalysis: {
    presentCategories: CuadCategory[]
    missingCategories: MissingCategory[]
    weakClauses: WeakClause[]
    gapScore: number
  }
  hypothesisCoverage: HypothesisCoverage[]
  tokenUsage: { inputTokens: number; outputTokens: number }
}
```

**Key Design Decisions:**
1. **Agents don't share internal state**, only defined outputs (Pipeline of Agents pattern)
2. **Position preservation**: `startPosition`/`endPosition` flow through all stages for Word Add-in highlighting
3. **Budget tracking**: Shared `BudgetTracker` passed through pipeline for cost monitoring
4. **Minimal data passing**: Each stage receives only what it needs (isolation)

---

## Patterns to Follow

### Pattern 1: Step-Wrapped Agent Execution

**What:** Each agent runs inside an Inngest `step.run()` call, providing atomic durability boundaries.

**Why:** If Risk Scorer fails at clause 12, only that step re-runs. Parser and Classifier results are preserved.

**Implementation:**
```typescript
export const analyzeNda = inngest.createFunction(
  { id: 'analyze-nda', concurrency: CONCURRENCY.analysis },
  { event: 'nda/analysis.requested' },
  async ({ event, step }) => {
    // Each agent is a durable checkpoint
    const parserResult = await step.run('parser-agent', () =>
      runParserAgent(input)
    )

    await step.sleep('rate-limit', getRateLimitDelay('claude'))

    const classifierResult = await step.run('classifier-agent', () =>
      runClassifierAgent({ parsedDocument: parserResult.document })
    )
    // ... continues
  }
)
```

**Source:** [Inngest AI documentation](https://www.inngest.com/ai), verified in existing codebase

### Pattern 2: Error Classification for Retry Control

**What:** Explicit classification of errors as retriable vs non-retriable.

**Why:** Prevents wasted retries on permanent failures (validation errors, not found) while ensuring transient failures (network, rate limits) recover.

**Implementation:**
```typescript
// From inngest/utils/errors.ts
export class RetriableError extends InngestWorkflowError {
  readonly isRetriable = true  // Network timeouts, rate limits
}

export class NonRetriableError extends InngestWorkflowError {
  readonly isRetriable = false  // Invalid input, missing resources
}

export class ApiError extends InngestWorkflowError {
  constructor(service: string, message: string, statusCode?: number) {
    // Auto-determine: 5xx and 429 are retriable
    this.isRetriable = statusCode >= 500 || statusCode === 429
  }
}
```

**Source:** [Portkey error handling guide](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/)

### Pattern 3: Rate Limit Delays Between Steps

**What:** Explicit `step.sleep()` calls after API-heavy agents to respect provider limits.

**Why:** Prevents retry storms and respects Claude (60 RPM) and Voyage (300 RPM) limits.

**Implementation:**
```typescript
// After each Claude-heavy agent
await step.sleep('rate-limit-classifier', getRateLimitDelay('claude'))

// getRateLimitDelay returns:
// - claude: 1000ms (60 RPM)
// - voyage: 200ms (300 RPM)
```

### Pattern 4: Progress Events for UI Feedback

**What:** Emit events at each pipeline stage for real-time progress tracking.

**Why:** Long-running analysis (30+ seconds) needs UI feedback. Also persists to DB for crash recovery.

**Implementation:**
```typescript
const emitProgress = async (stage: ProgressStage, progress: number, message: string) => {
  // Persist to DB (survives crashes)
  await step.run(`update-progress-${stage}`, async () => {
    await ctx.db.update(analyses)
      .set({ progressStage: stage, progressPercent: progress })
      .where(eq(analyses.id, analysisId))
  })

  // Emit for real-time consumers (future SSE)
  await step.sendEvent(`emit-progress-${stage}`, {
    name: 'nda/analysis.progress',
    data: { stage, progress, message }
  })
}
```

### Pattern 5: Tenant Context Isolation

**What:** All agent operations wrapped in `withTenantContext()` for RLS enforcement.

**Why:** Multi-tenant isolation is critical for B2B SaaS. RLS context must be set before any DB operations.

**Implementation:**
```typescript
return await withTenantContext(tenantId, async (ctx) => {
  // ctx.db has RLS context set
  // All queries automatically filtered by tenantId
  const [analysis] = await ctx.db.insert(analyses).values({
    documentId,
    tenantId,  // Explicit for audit trail
    status: 'processing'
  })
})
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Sharing Mutable State Between Agents

**What:** Passing shared objects that agents modify (e.g., accumulator arrays).

**Why bad:** Makes debugging impossible. Which agent added which item? Step replay breaks.

**Instead:** Each agent returns its complete output. Orchestrator assembles final result.

### Anti-Pattern 2: Retry Loops Inside Agents

**What:** Implementing retry logic within agent code instead of Inngest configuration.

**Why bad:** Duplicates Inngest's retry mechanism, masks failures from observability, can cause infinite loops.

**Instead:** Use Inngest's native retry configuration:
```typescript
inngest.createFunction({
  id: 'analyze-nda',
  retries: RETRY_CONFIG.default.retries,  // 5 retries with exponential backoff
})
```

### Anti-Pattern 3: Unbounded LLM Loops

**What:** Agents that loop on tool calls without explicit limits.

**Why bad:** Production agents can enter infinite loops burning through API credits. A 2026 article warns: "Agents can enter loops burning through requests."

**Instead:** Enforce limits:
- AI SDK: `stopWhen: stepCountIs(5)` (max tool call iterations)
- Token budgets: `BudgetTracker` with hard limits
- Timeout: Inngest step timeout (5 minutes default)

### Anti-Pattern 4: Fat Barrel Exports

**What:** Exporting agent functions through `@/inngest` barrel.

**Why bad:** Production builds evaluate entire module graph. Heavy deps (pdf-parse) crash server.

**Instead:** Import directly:
```typescript
// Bad - barrel pulls in pdf-parse -> pdfjs-dist -> DOMMatrix crash
import { analyzeNda } from '@/inngest'

// Good - explicit import
import { analyzeNda } from '@/inngest/functions/analyze-nda'
```

**Source:** [Issue #43](https://github.com/medelman17/vibedocs/issues/43) post-mortem

---

## Alternative Architectures Considered

### Parallel Fan-Out (Not Recommended for Current Use Case)

**Pattern:** Multiple agents process simultaneously, results gathered by synthesizer.

**When to use:**
- Independent subtasks (e.g., security + performance + style review)
- No data dependencies between parallel branches
- Latency-critical workloads

**Why not here:** NDA analysis is inherently sequential. Classifier needs parsed chunks. Risk scorer needs classifications. Gap analyst needs both.

**Potential future use:** Comparison pipeline could parallelize analysis of two documents before merging results.

### Hierarchical Decomposition (Consider for Scale)

**Pattern:** High-level agent breaks complex goals into subtasks, delegates to sub-agents.

**When to use:**
- Complex documents requiring specialized sub-analysis
- Different document types needing different processing
- When you need dynamic task assignment

**Potential future use:** For very large documents (100+ pages), a router could dispatch chunks to parallel classifier workers.

### Generator-Critic Loop (Consider for Quality)

**Pattern:** One agent generates, another validates, iterates until quality threshold met.

**When to use:**
- Output quality is critical
- Acceptable to trade latency for accuracy
- Clear quality metrics available

**Potential future use:** Gap analysis recommendations could benefit from a critic verifying suggested language.

---

## Error Handling Strategy

### Three-Layer Approach

```
┌─────────────────────────────────────────────────────────────┐
│                     Inngest Layer                           │
│  - Step durability (retry failed steps only)                │
│  - Exponential backoff (5 retries, 5-min timeout)           │
│  - Event replay for debugging                               │
├─────────────────────────────────────────────────────────────┤
│                   Application Layer                          │
│  - Error classification (RetriableError vs NonRetriableError)│
│  - API error handling (status-code-based retriability)       │
│  - wrapWithErrorHandling() utility                          │
├─────────────────────────────────────────────────────────────┤
│                     Agent Layer                              │
│  - Schema validation (Zod) - fail fast on bad input         │
│  - Tool usage limits - prevent infinite loops               │
│  - Budget tracking - cost protection                        │
└─────────────────────────────────────────────────────────────┘
```

### Error Response Matrix

| Error Type | Retriable | Action | Example |
|------------|-----------|--------|---------|
| Network timeout | Yes | Inngest retries | ECONNREFUSED to Claude |
| Rate limit (429) | Yes | Retry after delay | Claude RPM exceeded |
| Server error (5xx) | Yes | Retry with backoff | Claude temporary outage |
| Validation error | No | Fail immediately | Invalid document format |
| Not found | No | Fail immediately | Document deleted mid-analysis |
| Auth error (401/403) | No | Fail immediately | API key revoked |
| Budget exceeded | No | Fail immediately | Token limit hit |

### Partial Failure Handling

**Current approach:** If any agent fails after retries, entire analysis marked as `failed`.

**Rationale:** NDA analysis requires all stages. Partial results (e.g., classified but not scored) are confusing to users.

**Future consideration:** For comparison pipeline, could mark individual documents as failed while keeping successful ones.

---

## Build Order for New Agents

Based on the existing pipeline architecture and dependencies:

### Order of Implementation

1. **Data Contracts First** (`agents/types.ts`)
   - Define input/output interfaces before any agent code
   - Zod schemas for AI SDK structured output
   - Ensures type safety across pipeline

2. **Unit-Testable Agent Logic** (`agents/<name>.ts`)
   - Pure function: input -> output
   - Mock AI responses via `agents/testing/mock-ai.ts`
   - Test with fixtures from `agents/testing/fixtures.ts`

3. **Integration with Vector Search** (`agents/tools/`)
   - Only if agent needs RAG retrieval
   - Add tool definition
   - Test with embedded fixtures

4. **Inngest Function Wrapper** (`inngest/functions/<name>.ts`)
   - Wrap agent in `step.run()`
   - Add rate limiting delays
   - Emit progress events

5. **Event Types** (`inngest/types.ts`)
   - Add event schema for triggering new pipeline
   - Add progress/completion event types

6. **Database Schema** (`db/schema/`)
   - Only if new agent produces persisted output
   - Add after function logic is stable

### Dependency Graph for New Features

```
            ┌─────────────────┐
            │  agents/types   │ ◄── Define first
            └────────┬────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌───────────────┐        ┌───────────────┐
│ agents/tools  │        │ agents/<name> │ ◄── Can develop in parallel
└───────┬───────┘        └───────┬───────┘
        │                        │
        └────────────┬───────────┘
                     ▼
            ┌─────────────────┐
            │ inngest/functions│ ◄── Requires agent + tools
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐
            │  inngest/types  │ ◄── Event schemas
            └─────────────────┘
```

---

## Scalability Considerations

| Concern | Current (100 docs/day) | Growth (1K docs/day) | Scale (10K docs/day) |
|---------|------------------------|----------------------|---------------------|
| Concurrency | `CONCURRENCY.analysis = 5` | Increase to 10-20 | Multiple function variants |
| Rate limits | Manual `step.sleep()` | Inngest rate limiting | Separate queues per API |
| Database | Single Neon | Read replicas | Tenant sharding |
| Vector search | In-process LRU cache | Redis cache | Dedicated vector DB (Pinecone) |
| Cost tracking | Per-analysis budget | Tenant-level budgets | Pre-paid token pools |

---

## Sources

**HIGH confidence (official documentation, verified in codebase):**
- [Inngest AI documentation](https://www.inngest.com/ai)
- [Inngest AgentKit](https://agentkit.inngest.com/overview)
- [AI SDK Workflow Patterns](https://ai-sdk.dev/docs/agents/workflows)
- Existing VibeDocs codebase (`analyze-nda.ts`, agent implementations)

**MEDIUM confidence (multiple sources agreeing):**
- [Google Multi-Agent Design Patterns](https://www.infoq.com/news/2026/01/multi-agent-design-patterns/)
- [Pipeline of Agents Pattern](https://vitaliihonchar.com/insights/how-to-build-pipeline-of-agents)
- [Portkey Error Handling](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/)

**LOW confidence (single source, needs validation):**
- Specific timeout values from community posts
- Cost scaling estimates (require production data)
