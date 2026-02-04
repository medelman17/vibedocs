# VibeDocs Analysis Pipeline

## What This Is

Implement the full NDA analysis agent pipeline for VibeDocs — a 5-stage durable workflow that extracts clauses, classifies them against the CUAD taxonomy, scores risk with cited evidence, and identifies gaps. The pipeline runs inside Inngest for durability and emits progress events for real-time UI updates. Must work for both web uploads and Word Add-in analysis.

## Core Value

**Every uploaded NDA gets a complete, evidence-grounded analysis in under 90 seconds.** If the pipeline doesn't produce accurate clause extraction with risk scores and gap analysis, the product has no value.

## Requirements

### Validated

- ✓ Auth.js authentication with Google, GitHub, Microsoft Entra — existing
- ✓ Multi-tenant database with RLS isolation — existing
- ✓ Inngest orchestration infrastructure with rate limiting — existing
- ✓ Reference data bootstrap (CUAD, ContractNLI embeddings) — existing
- ✓ Document upload flow with Vercel Blob storage — existing
- ✓ Chat UI with RAG vector search — existing
- ✓ Word Add-in API routes scaffolded — existing

### Active

- [ ] **EXT-01**: Extractor step extracts raw text from PDF/DOCX documents
- [ ] **EXT-02**: Extractor preserves document structure (headings, sections, paragraphs)
- [ ] **CHK-01**: Chunker splits text into legal-aware chunks with section paths
- [ ] **CHK-02**: Chunker uses LLM for boundary detection when structure is ambiguous
- [ ] **CHK-03**: Chunks stored with Voyage AI embeddings in tenant database
- [ ] **CLS-01**: Classifier retrieves similar CUAD examples via vector search
- [ ] **CLS-02**: Classifier assigns CUAD category with confidence score per chunk
- [ ] **CLS-03**: Classifier handles multi-category clauses (primary + secondary)
- [ ] **RSK-01**: Risk Scorer assigns risk level: standard | cautious | aggressive | unknown
- [ ] **RSK-02**: Risk Scorer provides plain-language explanation per clause
- [ ] **RSK-03**: Risk Scorer cites evidence from reference corpus
- [ ] **GAP-01**: Gap Analyst identifies missing CUAD categories
- [ ] **GAP-02**: Gap Analyst explains importance of each missing clause
- [ ] **GAP-03**: Gap Analyst suggests recommended language from templates
- [ ] **PIP-01**: Full pipeline orchestrated as Inngest steps with durability
- [ ] **PIP-02**: Pipeline emits progress events (stage + per-chunk granularity)
- [ ] **PIP-03**: Progress events consumable via SSE for UI and Word Add-in
- [ ] **PIP-04**: Pipeline works with both file upload (web) and text input (Word Add-in)
- [ ] **PIP-05**: Results include clause positions for Word Add-in content controls
- [ ] **OUT-01**: Analysis results persisted to analyses + clause_extractions tables
- [ ] **OUT-02**: Overall risk score calculated as weighted average

### Out of Scope

- NDA comparison (separate milestone) — pipeline focuses on single-document analysis
- NDA generation (separate milestone) — requires different agent architecture
- ContractNLI NLI scoring (post-MVP) — adds 17x LLM calls per clause
- Real-time collaborative editing — not needed for analysis workflow
- PDF export of analysis — deferred to later milestone

## Context

**Existing Infrastructure:**
- Agent scaffolds exist in `agents/` (parser.ts, classifier.ts, risk-scorer.ts, gap-analyst.ts)
- Prompts defined in `agents/prompts/`
- Schemas defined in `agents/comparison/schemas.ts` (need analysis equivalents)
- Inngest function scaffold at `inngest/functions/analyze-nda.ts`
- Vector search tool exists at `agents/tools/vector-search.ts`

**Token Budget:**
- ~212K tokens per document (~$1.10 at Sonnet pricing)
- Parser: 1-2 calls (~20K tokens)
- Classifier: ~15 calls (~75K tokens)
- Risk Scorer: ~15 calls (~105K tokens)
- Gap Analyst: 1 call (~12K tokens)

**Word Add-in Integration:**
- Add-in extracts text client-side via Office.js
- Sends text to `/api/word-addin/analyze`
- Subscribes to SSE at `/api/word-addin/status/:id`
- Results need clause positions (start/end) for content control placement

## Constraints

- **AI SDK 6**: Must use `generateObject()` for structured output, not raw Claude API
- **Inngest steps**: Each agent wrapped in `step.run()` for durability
- **Rate limits**: Claude 60 RPM, Voyage AI 300 RPM — use `step.sleep()` between calls
- **90-second target**: Full pipeline should complete in under 90 seconds for typical NDAs
- **Evidence grounding**: All risk assessments must cite reference corpus, not just LLM opinion

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Split Parser into Extractor + Chunker | Extraction is I/O-bound (no LLM), chunking needs LLM for boundary detection — better retry granularity | — Pending |
| Progress events via Inngest sendEvent | Native to orchestration layer, can be consumed by SSE endpoints | — Pending |
| Both stage-level and chunk-level progress | Stage gives high-level status, chunk progress shows detailed activity during long stages | — Pending |
| Same pipeline for web + Word Add-in | Avoid code duplication, Word Add-in just has different entry point (text vs file) | — Pending |

---
*Last updated: 2026-02-04 after initialization*
