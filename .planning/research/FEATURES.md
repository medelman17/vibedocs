# Feature Landscape: LLM Agent Pipelines for Document Analysis

**Domain:** Production LLM agent pipeline for NDA analysis
**Researched:** 2026-02-04
**Confidence:** HIGH (verified against current implementations and industry sources)

## Table Stakes

Features users expect. Missing = pipeline is broken or feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Durable Step Execution** | Agents must resume after failure, not restart from scratch | Med | VibeDocs has this via Inngest `step.run()` |
| **Rate Limit Handling** | Claude/Voyage APIs enforce limits; violations cause cascading failures | Low | Implemented: `getRateLimitDelay()`, `step.sleep()` |
| **Progress Tracking** | Users need to know pipeline is working, not stuck | Med | Implemented: `emitProgress()`, DB persistence |
| **Error Classification** | Retryable vs non-retryable determines recovery strategy | Low | Implemented: `RetriableError`, `NonRetriableError` |
| **Structured Output** | LLM responses must parse reliably; JSON mode is mandatory | Low | Using AI SDK `generateObject()` with Zod schemas |
| **Evidence Citation** | Legal domain requires grounding, not just opinions | High | Implemented: RAG with CUAD/ContractNLI evidence |
| **Multi-tenant Isolation** | Documents are confidential; cross-tenant leak is catastrophic | High | RLS + `withTenantContext()` wrapper |
| **Token Budget Tracking** | Cost visibility and runaway prevention | Low | Implemented: `BudgetTracker` class |
| **Timeout Handling** | Long-running operations must fail gracefully | Low | Inngest step timeouts configured |
| **Input Validation** | Bad documents should fail fast, not mid-pipeline | Low | Zod schemas at each agent boundary |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Real-time Streaming Updates** | Users see progress live, not just polling | Med | PRD: SSE endpoint planned, events emitted but not consumed |
| **Analysis Cancellation** | Users can stop long-running analyses and save tokens | Med | PRD: "Remaining" - requires Inngest cancellation API |
| **Confidence Scoring** | Per-clause confidence helps prioritize human review | Low | Partially implemented in classification output |
| **Multi-source Evidence Fusion** | CUAD + ContractNLI + templates = richer grounding | High | Architecture exists; query-time merge pattern |
| **Observability Dashboard** | See traces, costs, latencies per document | Med | Inngest provides dashboard; custom metrics would be additive |
| **Clause-level Granular Progress** | "Scoring clause 7 of 15" vs "Scoring in progress" | Low | Emit per-clause events from risk-scorer loop |
| **Smart Model Routing** | Use cheaper models for simple classifications | Med | Route easy clauses to Haiku, complex to Sonnet |
| **Hallucination Detection** | Flag when LLM cites non-existent evidence | High | Emerging pattern: verify citations against corpus |
| **Comparative Risk Benchmarking** | "This clause is stricter than 87% of NDAs in our dataset" | Med | Requires statistical pre-computation over CUAD |
| **Parallel Agent Execution** | Classify/score multiple chunks concurrently | Med | Inngest fan-out pattern; adds complexity |
| **Playbook Support** | Users define custom risk criteria per organization | High | Common in commercial tools (Spellbook, LegalFly) |
| **Human-in-the-Loop Review** | Flag uncertain classifications for human validation | Med | Add review queue for low-confidence results |

## Anti-Features

Features to explicitly NOT build for MVP. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Per-token Streaming** | Overhead for structured extraction; users want results, not partial JSON | Stream at step/clause granularity, not token |
| **Synchronous API** | 90-second analysis cannot block HTTP request | Async with polling/SSE |
| **Global Model Singleton** | Makes testing and model routing impossible | Inject model via context/config |
| **Unstructured LLM Output** | Regex/JSON parsing of free text is fragile | Always use `generateObject()` with Zod |
| **Optimistic Progress** | Showing fake progress erodes trust | Only emit progress for completed steps |
| **Silent Failures** | Pipeline "completes" with missing data | Fail explicitly; validate at boundaries |
| **Embedding on Every Request** | Re-embedding unchanged reference corpus wastes tokens | Idempotent via content_hash |
| **Complex Agent State Machines** | LangGraph-style graphs add overhead without clear benefit for linear pipelines | Sequential Inngest steps are simpler for 4-stage linear flow |
| **Client-side RAG** | Exposing vector search to browser leaks architecture | Keep retrieval server-side |
| **Overengineered Caching** | Premature optimization; LRU is sufficient for MVP | Start with in-memory LRU, add Redis later |
| **Multi-model Ensemble Voting** | Complexity for marginal accuracy gains | Single model with confidence thresholds |
| **Auto-retry Without Limits** | Runaway costs from infinite retry loops | Cap retries (5 max per Inngest config) |

## Feature Dependencies

```
Document Upload
     |
     v
Parser Agent --> [chunks emitted]
     |
     v
Classifier Agent --> [requires parsed chunks]
     |                    |
     v                    v
Risk Scorer Agent --> Gap Analyst Agent
     |                    |
     v                    v
  [assessments]      [gap analysis]
     |                    |
     +--------+----------+
              |
              v
     Analysis Persistence
              |
              v
    Completion Event --> SSE/Polling consumer
```

**Key Dependencies:**
- Parser must complete before Classifier can start
- Classifier output feeds both Risk Scorer and Gap Analyst
- Risk Scorer and Gap Analyst could theoretically run in parallel (both read classifier output)
- Progress tracking depends on all agents emitting events
- Cancellation requires all agents to respect abort signals

## MVP Recommendation

For MVP (current state + immediate priorities), focus on:

### Must Complete (Table Stakes Gaps)
1. **SSE Progress Streaming** - Events are emitted but no consumer. Users see stale polling.
2. **Error Recovery UX** - When analysis fails, user sees generic error. Needs specific remediation.

### High-Value Differentiators (Post-MVP Phase 1)
3. **Analysis Cancellation** - Inngest supports `cancelOn` events; wire to UI button
4. **Clause-level Granular Progress** - Small change to risk-scorer loop for better UX
5. **Confidence Thresholds** - Route low-confidence classifications to human review queue

### Defer to Post-MVP Phase 2+
- Playbook support (requires significant schema changes)
- Smart model routing (optimization, not critical path)
- Hallucination detection (emerging technique, not mature)
- Human-in-the-loop review (requires review UI, workflow changes)
- Parallel agent execution (complexity vs. marginal speed gain)

## Complexity Estimates

| Feature | Effort | Risk | Dependencies |
|---------|--------|------|--------------|
| SSE streaming endpoint | 2-3 days | Low | Inngest events already emitted |
| Analysis cancellation | 3-4 days | Med | Inngest cancelOn, UI button, state cleanup |
| Clause-level progress | 1 day | Low | Modify risk-scorer loop |
| Smart model routing | 1 week | Med | Model abstraction, routing logic |
| Playbook support | 2-3 weeks | High | Schema, UI, per-tenant config |
| Hallucination detection | 2 weeks | High | Citation verification, UI warnings |

## Current Implementation Status

Based on codebase review:

| Feature | Status | Location |
|---------|--------|----------|
| Durable execution | Complete | `inngest/functions/analyze-nda.ts` |
| Rate limiting | Complete | `inngest/utils/rate-limit.ts` |
| Progress tracking | Complete (DB), Partial (SSE) | `emitProgress()` helper |
| Error handling | Complete | `inngest/utils/errors.ts` |
| Token tracking | Complete | `lib/ai/budget.ts` |
| Evidence citation | Complete | `agents/tools/vector-search.ts` |
| Tenant isolation | Complete | `withTenantContext()` |
| Structured output | Complete | Zod schemas in `agents/types.ts` |
| SSE endpoint | Not started | PRD: "Remaining" |
| Cancellation | Not started | PRD: "Remaining" |

## Sources

### Verified (HIGH confidence)
- [ZenML: LLM Agents in Production](https://www.zenml.io/blog/llm-agents-in-production-architectures-challenges-and-best-practices) - Architecture patterns
- [Inngest Documentation](https://www.inngest.com/docs) - Rate limiting, flow control, cancellation
- [Braintrust: AI Observability Tools 2026](https://www.braintrust.dev/articles/best-ai-observability-tools-2026) - Tracing and monitoring
- [AI SDK Documentation](https://ai-sdk.dev/docs/advanced/stopping-streams) - Cancellation patterns
- [Portkey: Retries, Fallbacks, Circuit Breakers](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/) - Resilience patterns
- [Spellbook: Legal AI Contract Review](https://www.spellbook.legal/learn/ai-legal-contract-review-faster-analysis) - Legal domain features

### Industry Context (MEDIUM confidence)
- [n8n: 15 Best Practices for AI Agents](https://blog.n8n.io/best-practices-for-deploying-ai-agents-in-production/) - Task decomposition, testing
- [arxiv: Agentic AI Workflows Guide](https://arxiv.org/html/2512.08769v1) - Multi-agent patterns
- [Confident AI: LLM Evaluation Metrics](https://www.confident-ai.com/blog/llm-evaluation-metrics-everything-you-need-for-llm-evaluation) - Evaluation approaches
- [CustomGPT: Best AI for Document Analysis 2026](https://customgpt.ai/best-ai-for-document-analysis/) - Document processing features
