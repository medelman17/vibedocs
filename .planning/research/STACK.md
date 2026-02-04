# Technology Stack

**Project:** VibeDocs NDA Analysis Pipeline
**Researched:** 2026-02-04
**Overall Confidence:** HIGH

## Executive Summary

The existing codebase already implements the 2025/2026 best-practice stack for multi-agent LLM pipelines. The key evolution is **AI SDK 6's deprecation of `generateObject`** in favor of `generateText` with the `output` property, and **Claude's native structured outputs** (GA as of late 2025). The current implementation uses `generateObject`, which still works but should be migrated.

Inngest's step patterns for durable orchestration remain the gold standard for serverless agent pipelines, with the new `step.ai.wrap()` and `step.ai.infer()` APIs providing enhanced observability.

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Next.js | 16.1.6 | App framework | Already in use. RSC + App Router is the standard for AI apps. No change needed. | HIGH |
| TypeScript | 5.9.x | Type safety | Strict mode enables reliable agent I/O typing. Already configured. | HIGH |
| AI SDK | 6.0.x | LLM orchestration | Current (6.0.67). Provides unified structured output API. **Migrate from `generateObject` to `generateText` + `output`.** | HIGH |
| Inngest | 3.50.x | Durable workflows | Current version. Best-in-class for serverless agent orchestration. | HIGH |

### AI/ML Layer

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Claude Sonnet 4.5 | Latest | Primary reasoning | Best structured output support. Native JSON schema enforcement via `output_config.format`. 200K context handles full NDAs. | HIGH |
| Claude Haiku 4.5 | Latest | Fast classification | 10x faster than Sonnet. Use for high-volume parsing tasks. Now supports structured outputs (GA). | HIGH |
| Voyage AI voyage-law-2 | Latest | Legal embeddings | Domain-specific legal embeddings. 1024 dims, 16K context. Already configured correctly. | HIGH |

### Database & Vector Search

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Neon PostgreSQL | Serverless | Primary database | Already in use. Serverless scales with Vercel. | HIGH |
| pgvector | Latest | Vector similarity | HNSW indexes for fast retrieval. Already configured. | HIGH |
| Drizzle ORM | 0.45.x | Type-safe queries | Best DX for TypeScript. Already in use. | HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| Zod | 4.x | Schema validation | Define agent output schemas. Works with both AI SDK and Claude API. | HIGH |
| lru-cache | 11.x | In-memory caching | Embedding cache, response cache. Already configured. | HIGH |
| gpt-tokenizer | 3.x | Token counting | Budget tracking. Already in use. | MEDIUM |

## Critical Architecture Decision: Structured Output Strategy

### Current State (Working but Deprecated)

The codebase uses `generateObject` from AI SDK:

```typescript
// Current pattern in agents/classifier.ts
const { object, usage } = await generateObject({
  model: getAgentModel('classifier'),
  system: CLASSIFIER_SYSTEM_PROMPT,
  prompt,
  schema: classificationSchema,
})
```

### Recommended Migration: AI SDK 6 Output Property

**Rationale:** `generateObject` and `streamObject` are deprecated in AI SDK 6. The new unified API uses `generateText` with the `output` property.

```typescript
// Recommended pattern
import { generateText, Output } from 'ai'

const { output, usage } = await generateText({
  model: getAgentModel('classifier'),
  system: CLASSIFIER_SYSTEM_PROMPT,
  prompt,
  output: Output.object({ schema: classificationSchema }),
})
```

**Benefits:**
1. **Future-proof:** Won't break when deprecated functions are removed
2. **Unified API:** Same pattern for text, objects, arrays, and streaming
3. **Better tool integration:** Can combine structured output with tool calling in same request
4. **Step counting:** Works with `stopWhen` for agent loops

### Alternative: Native Claude Structured Outputs

**When to use:** For maximum reliability on complex schemas or when not using AI SDK.

Claude now supports native structured outputs via `output_config.format`:

```typescript
// Direct Anthropic API (if not using AI SDK)
const response = await client.messages.create({
  model: "claude-sonnet-4-5",
  output_config: {
    format: {
      type: "json_schema",
      schema: zodToJsonSchema(classificationSchema),
    }
  },
  messages: [...]
})
```

**Benefits:**
- Grammar-enforced schema compliance (tokens literally cannot violate schema)
- No parsing errors
- Works with Pydantic/Zod via SDK helpers

**Current status:** GA on Claude Sonnet 4.5, Opus 4.5, and Haiku 4.5

**Recommendation:** Stick with AI SDK 6 `Output.object()` since it provides the same structured output guarantees while maintaining portability across model providers.

## Inngest Step Patterns for Agent Orchestration

### Current Implementation (Correct)

The existing `analyze-nda.ts` correctly implements durable step patterns:

```typescript
// Each agent runs in its own durable step
const parserResult = await step.run('parser-agent', () =>
  runParserAgent({ documentId, tenantId, source, content, metadata })
)

// Rate limiting via sleep between steps
await step.sleep('rate-limit-parser', getRateLimitDelay('claude'))

// Progress events for real-time UI
await step.sendEvent(`emit-progress-${stage}`, {
  name: 'nda/analysis.progress',
  data: { analysisId, stage, progress, message },
})
```

This pattern is correct and follows best practices.

### Enhanced Pattern: step.ai.wrap() for Observability

Inngest introduced `step.ai.wrap()` for enhanced AI call observability:

```typescript
// Enhanced pattern with AI SDK wrapping
const { output, usage } = await step.ai.wrap(
  'classifier-agent',
  generateText,
  {
    model: getAgentModel('classifier'),
    system: CLASSIFIER_SYSTEM_PROMPT,
    prompt,
    output: Output.object({ schema: classificationSchema }),
  }
)
```

**Benefits:**
- Automatic token usage tracking in Inngest dashboard
- Prompt/response logging for debugging
- Replayable with edited prompts in dev server

**Recommendation:** Adopt `step.ai.wrap()` for all LLM calls within Inngest functions. This provides free observability without code changes.

### Alternative: step.ai.infer() for Cost Optimization

For serverless cost optimization, `step.ai.infer()` offloads inference to Inngest infrastructure:

```typescript
// Offloaded inference (function pauses, no compute charges during inference)
const result = await step.ai.infer('classify', {
  model: openai('gpt-4o'),
  prompt: 'Classify this clause...',
})
```

**When to use:** High-volume workloads where serverless function runtime costs matter.

**Current recommendation:** Not needed for VibeDocs. The `step.run()` pattern with `step.ai.wrap()` provides better observability and the existing rate limiting approach controls costs effectively.

## Progress Event Emission Patterns

### Current Implementation (Correct)

```typescript
const emitProgress = async (stage: ProgressStage, progress: number, message: string) => {
  // Persist to DB for reliability
  await step.run(`update-progress-${stage}`, async () => {
    await ctx.db.update(analyses).set({
      progressStage: stage,
      progressPercent: progress,
    }).where(eq(analyses.id, analysisId))
  })

  // Emit event for real-time consumers
  await step.sendEvent(`emit-progress-${stage}`, {
    name: 'nda/analysis.progress',
    data: { analysisId, stage, progress, message },
  })
}
```

This dual-write pattern (DB + event) is correct for durability + real-time.

### Enhanced Pattern: Inngest Realtime (Future)

For true real-time streaming without polling, Inngest Realtime provides SSE channels:

```typescript
// Future pattern with Inngest Realtime
import { channel } from 'inngest'

const analysisChannel = channel.define<{ progress: number; message: string }>({
  name: 'analysis-progress',
  params: z.object({ analysisId: z.string() }),
})

// In function
await analysisChannel.publish({ analysisId }, {
  topic: 'progress',
  data: { progress: 45, message: 'Classifying clauses...' },
})

// In client
const { messages } = useSubscribe(analysisChannel, { analysisId })
```

**Status:** Available but requires additional setup.
**Recommendation:** Current event-based approach is sufficient for MVP. Consider Realtime for v2 if polling latency becomes an issue.

## Rate Limiting Strategies

### Current Configuration (Correct)

```typescript
// inngest/utils/rate-limit.ts
export const RATE_LIMITS = {
  voyageAi: {
    requestsPerMinute: 300,
    delayMs: 200,
    batchSize: 128,
  },
  claude: {
    requestsPerMinute: 60,
    delayMs: 1000,
  },
}
```

### Verification Against Official Docs

| Service | Documented Limit | Current Config | Status |
|---------|-----------------|----------------|--------|
| Claude API | 60 RPM (Tier 1) | 60 RPM / 1000ms | Correct |
| Voyage AI | 2000 RPM (Tier 1) | 300 RPM / 200ms | **Conservative** |

**Finding:** Voyage AI rate limit is more generous than configured (2000 RPM vs 300 RPM). The conservative setting is fine for MVP but can be increased for throughput.

### Recommended Enhancement: Dynamic Rate Limiting

```typescript
// Enhanced rate limit with tier awareness
export const RATE_LIMITS = {
  voyageAi: {
    tier1: { rpm: 2000, tpm: 3_000_000, batchSize: 128 },
    tier2: { rpm: 4000, tpm: 6_000_000, batchSize: 128 },
    tier3: { rpm: 6000, tpm: 9_000_000, batchSize: 128 },
  },
  claude: {
    tier1: { rpm: 60 },
    tier2: { rpm: 120 },
    tier3: { rpm: 180 },
  },
}
```

**Recommendation:** Keep current conservative limits for now. Add tier detection when scaling.

## Model Selection Strategy

### Current Configuration (Correct)

```typescript
// lib/ai/config.ts
export const AGENT_MODELS = {
  parser: MODELS.fast,       // Haiku - text extraction
  classifier: MODELS.balanced, // Sonnet - classification
  riskScorer: MODELS.best,   // Sonnet 4.5 - complex reasoning
  gapAnalyst: MODELS.best,   // Sonnet 4.5 - complex reasoning
}
```

This tiered approach is correct. Parsing doesn't need reasoning; classification needs accuracy; risk scoring needs nuanced judgment.

### Cost Optimization Note

| Agent | Model | Input $/1M | Output $/1M | Typical Tokens | Est. Cost |
|-------|-------|-----------|------------|----------------|-----------|
| Parser | Haiku 4.5 | $0.25 | $1.25 | 20K in / 2K out | ~$0.008 |
| Classifier | Sonnet 4 | $1.00 | $5.00 | 60K in / 10K out | ~$0.11 |
| Risk Scorer | Sonnet 4.5 | $3.00 | $15.00 | 80K in / 15K out | ~$0.47 |
| Gap Analyst | Sonnet 4.5 | $3.00 | $15.00 | 52K in / 10K out | ~$0.31 |
| **Total** | | | | ~212K | **~$0.90** |

PRD budget of $1.10/doc is achievable with current configuration.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| LLM SDK | AI SDK 6 | LangChain, LlamaIndex | AI SDK has best Next.js integration, lighter weight, better TypeScript support |
| Workflow | Inngest | Temporal, AWS Step Functions | Inngest has serverless-native design, no infrastructure to manage |
| Embeddings | Voyage voyage-law-2 | OpenAI ada-002, Cohere | voyage-law-2 is domain-specific for legal text, better retrieval |
| Structured Output | AI SDK Output.object | Claude native, JSON mode | AI SDK provides portability while leveraging Claude's native support |

## Migration Checklist

### Immediate (Before New Features)

- [ ] Migrate `generateObject` to `generateText` + `Output.object()` in all agents
- [ ] Update to AI SDK 6.0 patterns (`stopWhen` instead of `maxSteps`)
- [ ] Wrap LLM calls with `step.ai.wrap()` for observability

### Near-term (During Phase Implementation)

- [ ] Add `step.ai.wrap()` to all agent LLM calls
- [ ] Consider increasing Voyage AI rate limits if throughput is needed
- [ ] Add token budget warnings in Inngest dashboard

### Future (v2)

- [ ] Evaluate Inngest Realtime for true SSE progress updates
- [ ] Consider `step.ai.infer()` for cost optimization at scale
- [ ] Add tier-aware dynamic rate limiting

## Installation

Current dependencies are correct. No new packages needed.

```bash
# Already installed
pnpm add ai@^6.0.67 inngest@^3.50.0 zod@^4.3.6

# Verify versions
pnpm list ai inngest zod
```

## Sources

### HIGH Confidence (Official Documentation)

- [AI SDK 6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) - Deprecation of generateObject/streamObject
- [AI SDK Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) - Output.object() patterns
- [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) - Native JSON schema enforcement (GA)
- [Voyage AI Rate Limits](https://docs.voyageai.com/docs/rate-limits) - 2000 RPM Tier 1
- [Inngest Realtime](https://www.inngest.com/docs/examples/realtime) - Progress streaming patterns
- [Inngest step.ai](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/step-ai-orchestration) - AI SDK wrapping

### MEDIUM Confidence (Blog/Announcements)

- [AI SDK 6 Blog](https://vercel.com/blog/ai-sdk-6) - Feature overview
- [Inngest AgentKit](https://www.inngest.com/blog/ai-orchestration-with-agentkit-step-ai) - Agent patterns

### Codebase Verification

- `/Users/medelman/GitHub/medelman17/vibedocs/package.json` - Current versions confirmed
- `/Users/medelman/GitHub/medelman17/vibedocs/agents/*.ts` - Current patterns analyzed
- `/Users/medelman/GitHub/medelman17/vibedocs/inngest/functions/analyze-nda.ts` - Orchestration patterns verified
