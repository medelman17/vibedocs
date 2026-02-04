# Project Research Summary

**Project:** VibeDocs NDA Analysis Pipeline
**Domain:** Multi-agent LLM pipeline for legal document analysis
**Researched:** 2026-02-04
**Confidence:** HIGH

## Executive Summary

VibeDocs is building a production-grade LLM agent pipeline for NDA analysis with a well-structured foundation already in place. The existing architecture follows industry best practices: sequential Inngest orchestration (Parser → Classifier → Risk Scorer → Gap Analyst), AI SDK 6 for structured outputs, and Voyage AI legal embeddings for RAG retrieval. The stack is solid and requires only targeted refinements rather than major changes.

The primary technical challenge is **migrating from deprecated AI SDK patterns** (`generateObject` → `generateText` with `output` property) and **strengthening validation between pipeline stages**. Research reveals that cascading errors from early agents compound through the pipeline, making inter-stage validation gates critical. The token budget of ~$1.10/document is achievable with current configuration, but cost protection requires enforcing budget limits before they're exceeded.

Key strategic recommendation: **Focus on hardening the existing pipeline before adding new features**. SSE streaming and analysis cancellation are the only table-stakes gaps, while features like playbooks and hallucination detection can defer to v2. The phased approach should prioritize AI SDK migration → validation gates → SSE streaming → cost protection, then layer in differentiators once the foundation is bulletproof.

## Key Findings

### Recommended Stack

The existing stack aligns with 2025/2026 best practices for multi-agent LLM pipelines. AI SDK 6's unified API (`generateText` with `output` property) replaces the deprecated `generateObject` pattern currently in use. Inngest remains the gold standard for durable serverless orchestration, with new observability features like `step.ai.wrap()` providing enhanced AI call tracking.

**Core technologies:**
- **AI SDK 6** (current: 6.0.67): Unified structured output API — migrate from `generateObject` to `generateText` + `Output.object()` for future-proofing
- **Inngest 3.50.x**: Durable workflows with step-based durability — add `step.ai.wrap()` for enhanced observability
- **Claude Sonnet 4.5**: Primary reasoning with native structured outputs — optimal balance of accuracy and cost ($3/$15 per 1M tokens)
- **Voyage AI voyage-law-2**: Legal domain embeddings (1024 dims) — domain-specific superiority over generic embeddings
- **Drizzle ORM + pgvector**: Type-safe queries with HNSW vector indexes — already configured correctly

**Critical migration:** The codebase uses `generateObject` which is deprecated. Migration to `generateText` with `output: Output.object({ schema })` is required before deprecated APIs are removed in future AI SDK releases.

### Expected Features

**Must have (table stakes):**
- **Durable step execution** — agents must resume after failure (implemented via Inngest `step.run()`)
- **Rate limit handling** — Claude 60 RPM and Voyage 300 RPM enforced (implemented with `getRateLimitDelay()`)
- **Progress tracking** — users need visibility into pipeline state (DB persistence complete, SSE consumer missing)
- **Evidence citation** — legal domain requires grounding, not opinions (RAG with CUAD/ContractNLI implemented)
- **Multi-tenant isolation** — cross-tenant leaks are catastrophic (RLS + `withTenantContext()` implemented)
- **Error classification** — retryable vs non-retryable determines recovery (implemented with custom error classes)

**Should have (competitive):**
- **Real-time streaming updates** — SSE endpoint for live progress (events emitted, consumer not implemented)
- **Analysis cancellation** — stop long-running jobs and save tokens (Inngest supports `cancelOn`, needs wiring)
- **Confidence scoring** — per-clause confidence helps prioritize review (partially implemented)
- **Clause-level granular progress** — "Scoring clause 7 of 15" vs generic "Scoring..." (minor loop modification)

**Defer (v2+):**
- **Playbook support** — custom risk criteria per organization (requires significant schema changes)
- **Smart model routing** — cheaper models for simple tasks (optimization, not critical path)
- **Hallucination detection** — verify citations against corpus (emerging technique, not mature)
- **Human-in-the-loop review** — queue for low-confidence results (requires UI and workflow changes)

### Architecture Approach

VibeDocs implements a **sequential pipeline pattern** where each agent produces well-defined outputs consumed by the next stage. This linear flow is "refreshingly easy to debug" (per Google multi-agent research) and appropriate for the inherent dependencies in NDA analysis: you can't classify clauses before parsing, can't score risk before classification, and can't identify gaps before scoring. Inngest's step-based durability ensures partial progress survives failures without expensive checkpointing.

**Major components:**
1. **Parser Agent** — Text extraction, chunking, embedding (outputs: `ParsedChunk[]` with vectors)
2. **Classifier Agent** — CUAD category classification (outputs: `ClassifiedClause[]` with confidence)
3. **Risk Scorer Agent** — Risk assessment with evidence (outputs: `RiskAssessment[]` + overall score)
4. **Gap Analyst Agent** — Missing/weak clause identification (outputs: `GapAnalysis` + recommendations)
5. **Inngest Orchestrator** — Durability, progress tracking, rate limiting (manages entire pipeline lifecycle)

**Key patterns:** Step-wrapped agent execution for durability, error classification for retry control, rate limit delays between API-heavy stages, progress events for UI feedback, and tenant context isolation for multi-tenancy.

### Critical Pitfalls

Research identified cascading failures, hallucinated citations, cost explosions, idempotency violations, and API deprecation as the top risks requiring immediate attention.

1. **Cascading error propagation** — Early parsing/classification errors compound through downstream agents. Prevent with validation gates between stages: minimum clause thresholds, confidence filters, sanity checks (e.g., halt if 0 clauses detected). Research shows "early mistakes rarely remain confined; instead, they cascade into subsequent steps" ([arXiv 2509.25370](https://arxiv.org/abs/2509.25370)).

2. **Hallucinated evidence citations** — RAG systems with legal documents hallucinate 17-33% of the time. Risk Scorer must use citation verification loops: validate reference IDs exist, constrain generation to provided IDs only, use structured data not free-text. Schema should require citations as reference IDs, not strings.

3. **Token budget explosion** — Single 100-page NDA could consume 500K+ tokens vs expected 212K. Implement pre-flight estimation based on document size, enforce hard limits before each agent (not just tracking), cap maximum chunks per document (e.g., 30 chunks), and reject >50 page documents at upload.

4. **Inngest step non-idempotency** — Step retries cause duplicate database records and repeated side effects. Use upsert patterns (`ON CONFLICT DO UPDATE`), check-before-write queries, and return IDs from early steps to prevent re-creation in later steps.

5. **`generateObject` deprecation** — Current AI SDK pattern is deprecated. Migration to `generateText` with `output` property is required before future SDK releases break all agents. Pin SDK version until migration complete and add explicit schema validation.

## Implications for Roadmap

Based on research, suggested phase structure prioritizes foundation hardening before new features:

### Phase 1: AI SDK 6 Migration & Validation Gates
**Rationale:** Must address deprecation before it breaks production and prevent cascading failures from compounding
**Delivers:**
- All agents migrated from `generateObject` to `generateText` + `Output.object()`
- `step.ai.wrap()` observability for all LLM calls
- Inter-stage validation (minimum clause counts, confidence filters, sanity checks)
- Shared confidence threshold configuration

**Addresses:**
- Cascading error propagation (Pitfall #1)
- generateObject deprecation (Pitfall #5)
- Inconsistent confidence thresholds (Pitfall #10)

**Avoids:** Breaking changes from future AI SDK releases

### Phase 2: Cost Protection & Budget Enforcement
**Rationale:** Current budget tracking doesn't enforce limits; one large document could exceed costs 5-10x
**Delivers:**
- Pre-flight token estimation based on document size
- Hard budget enforcement before each agent execution
- Document size limits at upload (reject >50 pages)
- Chunk limiting (max 30 chunks per document)

**Addresses:**
- Token budget explosion (Pitfall #3)
- Silent cost overruns

**Uses:** Existing `BudgetTracker` class, enhanced with enforcement

### Phase 3: Real-time Progress & Cancellation
**Rationale:** SSE streaming is table-stakes gap; cancellation saves tokens on user-initiated stops
**Delivers:**
- SSE endpoint consuming existing progress events
- Analysis cancellation via Inngest `cancelOn` pattern
- Timeout detection and auto-fail for stuck analyses (>10 min)
- Progress state reconciliation

**Addresses:**
- Real-time streaming updates (table stakes feature)
- Analysis cancellation (high-value differentiator)
- Progress state inconsistency (Pitfall #9)

**Implements:** Event emission layer already exists; add SSE transport and cancellation wiring

### Phase 4: Evidence Hardening & Citation Verification
**Rationale:** Legal domain cannot tolerate hallucinated evidence; highest reputational risk
**Delivers:**
- Citation verification loop in Risk Scorer (validate reference IDs exist)
- Schema change: evidence.citations as reference IDs, not strings
- Constrained generation: only allow citations from provided references
- Category-scoped vector search for better retrieval relevance

**Addresses:**
- Hallucinated evidence citations (Pitfall #2)
- Vector search relevance drift (Pitfall #8)

**Implements:** Architecture component enhancement (Risk Scorer Agent)

### Phase 5: Extraction Validation & Idempotency
**Rationale:** Scanned PDFs and encrypted documents cause silent failures; retry duplicates need fixing
**Delivers:**
- Extraction validation (minimum text length, quality checks, format detection)
- OCR fallback for scanned PDFs (optional, evaluate cost/benefit)
- Upsert patterns for all database writes (idempotency)
- Step return value refactoring to prevent re-creation

**Addresses:**
- PDF/DOCX extraction silent failures (Pitfall #6)
- Inngest step non-idempotency (Pitfall #4)

**Uses:** Parser Agent enhancement + Inngest pattern refinement

### Phase 6: Advanced Features (Post-MVP)
**Rationale:** Foundation is solid; layer in differentiators once core pipeline is bulletproof
**Delivers:**
- Clause-level granular progress (minor loop modification)
- Enhanced confidence scoring with review queue routing
- Smart model routing (Haiku for simple, Sonnet for complex)
- Comparative risk benchmarking against CUAD dataset

**Addresses:**
- Competitive differentiators from feature research
- User experience polish

### Phase Ordering Rationale

- **Phase 1 first** because deprecated APIs block all future work and validation prevents cascading failures
- **Phase 2 before SSE** because cost protection is more critical than real-time updates (one runaway analysis costs more than delayed progress)
- **Phase 3 before evidence** because SSE is table-stakes (users expect it) while citation verification is quality enhancement
- **Phase 4 before extraction** because legal accuracy is higher priority than handling edge-case documents
- **Phase 5 before advanced** because production robustness (idempotency) must precede UX polish
- **Phase 6 last** because these are differentiators that compound value on a stable foundation

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 3 (SSE):** Complex integration with Inngest events, SSE transport patterns, and UI consumption — needs API research on Inngest Realtime vs custom SSE
- **Phase 4 (Citations):** Citation verification loop patterns not well-documented for AI SDK 6 — may need custom implementation research

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (AI SDK migration):** Official migration guide provides complete patterns
- **Phase 2 (Cost protection):** Straightforward validation logic, well-understood patterns
- **Phase 5 (Extraction/Idempotency):** Standard document processing patterns, Inngest docs cover idempotency thoroughly
- **Phase 6 (Advanced features):** Incremental enhancements to existing agents

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against official AI SDK 6, Inngest, Claude docs; existing implementation validated |
| Features | HIGH | Cross-referenced with industry patterns (ZenML, Inngest docs) and commercial tools (Spellbook) |
| Architecture | HIGH | Sequential pipeline verified against Google multi-agent patterns; existing codebase follows best practices |
| Pitfalls | MEDIUM | Cascading errors and hallucination rates verified in research; specific mitigation strategies inferred from patterns |

**Overall confidence:** HIGH

Research is well-grounded in official documentation, verified against the existing codebase, and cross-referenced with multiple authoritative sources. The stack is current, the architecture is sound, and the pitfalls are documented in both academic research and production post-mortems.

### Gaps to Address

**AI SDK 6 migration specifics:** Official docs provide high-level patterns but error handling differences between `generateObject` and `generateText` with `output` may surface during implementation. Plan for testing edge cases (malformed schemas, partial JSON, timeout handling).

**Citation verification implementation:** Pattern is clear (validate reference IDs exist) but integration with AI SDK structured outputs needs validation. May require post-generation validation step or custom schema constraints.

**Voyage AI rate limit tuning:** Configured conservatively at 300 RPM vs documented 2000 RPM Tier 1 limit. Can increase throughput but needs monitoring to confirm tier and avoid violations.

**OCR integration cost/benefit:** Scanned PDF detection is straightforward but OCR service integration (Tesseract vs Cloud Vision) requires cost analysis. Defer to Phase 5 implementation with recommendation to add only if extraction failures are common.

**Inngest Realtime vs custom SSE:** Research shows Inngest Realtime provides native SSE channels but requires additional setup. Custom SSE endpoint consuming existing events may be simpler for MVP. Evaluate during Phase 3 planning.

## Sources

### Primary (HIGH confidence)
- [AI SDK 6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) — Deprecation patterns, migration steps
- [AI SDK Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) — `Output.object()` patterns
- [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — Native JSON schema enforcement
- [Inngest AI Documentation](https://www.inngest.com/ai) — Step patterns, rate limiting, agent orchestration
- [Inngest AgentKit](https://agentkit.inngest.com/overview) — Multi-agent workflow patterns
- [Inngest Error Handling](https://www.inngest.com/docs/guides/error-handling) — Retry configuration, error classification
- [Inngest Idempotency Guide](https://www.inngest.com/docs/guides/handling-idempotency) — Step idempotency requirements
- [Voyage AI Rate Limits](https://docs.voyageai.com/docs/rate-limits) — 2000 RPM Tier 1 documented
- Existing VibeDocs codebase (`analyze-nda.ts`, agent implementations, CLAUDE.md) — Current patterns verified

### Secondary (MEDIUM confidence)
- [ZenML: LLM Agents in Production](https://www.zenml.io/blog/llm-agents-in-production-architectures-challenges-and-best-practices) — Architecture patterns
- [Google Multi-Agent Design Patterns](https://www.infoq.com/news/2026/01/multi-agent-design-patterns/) — Pipeline patterns, sequential flow rationale
- [Pipeline of Agents Pattern](https://vitaliihonchar.com/insights/how-to-build-pipeline-of-agents) — Data flow between agents
- [Portkey: Retries, Fallbacks, Circuit Breakers](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/) — Error handling patterns
- [Braintrust: AI Observability Tools 2026](https://www.braintrust.dev/articles/best-ai-observability-tools-2026) — Observability best practices
- [Spellbook: Legal AI Contract Review](https://www.spellbook.legal/learn/ai-legal-contract-review-faster-analysis) — Legal domain feature expectations
- [Where LLM Agents Fail](https://arxiv.org/abs/2509.25370) — Cascading error research
- [Legal RAG Hallucinations - Stanford](https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf) — 17-33% hallucination rates

### Tertiary (LOW confidence)
- [n8n: 15 Best Practices for AI Agents](https://blog.n8n.io/best-practices-for-deploying-ai-agents-in-production/) — General best practices
- [Confident AI: LLM Evaluation Metrics](https://www.confident-ai.com/blog/llm-evaluation-metrics-everything-you-need-for-llm-evaluation) — Evaluation approaches
- [Composio: Why AI Agent Pilots Fail](https://composio.dev/blog/why-ai-agent-pilots-fail-2026-integration-roadmap) — Common failure modes
- Community posts on timeout values, specific cost estimates — needs validation with production data

---
*Research completed: 2026-02-04*
*Ready for roadmap: yes*
