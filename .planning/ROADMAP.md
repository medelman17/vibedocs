# Roadmap: VibeDocs Analysis Pipeline

## Overview

This roadmap delivers the complete NDA analysis pipeline: document extraction through gap analysis, with durable orchestration and real-time progress streaming. The pipeline transforms uploaded NDAs into evidence-grounded analysis with clause extraction, CUAD taxonomy classification, risk scoring, and gap identification. Phases progress from foundation hardening (AI SDK migration, validation gates) through the sequential agent pipeline (extraction, chunking, classification, risk, gaps), then integration layers (orchestration, streaming, UI rendering).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation Hardening** - Migrate to AI SDK 6 patterns, add validation gates, ensure idempotency
- [x] **Phase 2: Budget Protection** - Pre-flight estimation, hard limits, document size caps
- [x] **Phase 3: Document Extraction** - Extract text from PDF/DOCX, handle failures, support Word Add-in text input
- [x] **Phase 4: OCR Processing** - Detect and process scanned PDFs, handle quality issues
- [x] **Phase 5: Legal Chunking** - Split into legal-aware chunks, embed with Voyage AI, store in tenant DB
- [ ] **Phase 6: CUAD Classification** - Classify chunks against 41-category taxonomy with confidence scoring
- [ ] **Phase 7: Risk Scoring** - Assign risk levels with evidence-grounded explanations and citations
- [ ] **Phase 8: Gap Analysis** - Identify missing clauses, explain importance, suggest language
- [ ] **Phase 9: Pipeline Orchestration** - Wrap agents in Inngest steps, emit progress events, support cancellation
- [ ] **Phase 10: Progress Streaming** - SSE endpoint for real-time UI updates, Word Add-in consumption
- [ ] **Phase 11: Document Rendering** - Display extracted documents with clause highlighting in UI

## Phase Details

### Phase 1: Foundation Hardening
**Goal**: All agents use current AI SDK 6 patterns with validation gates preventing cascading failures
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03
**Success Criteria** (what must be TRUE):
  1. All agents use `generateText` with `Output.object()` instead of deprecated `generateObject`
  2. Pipeline halts with clear error when validation gate fails (e.g., 0 clauses detected)
  3. Database writes use upsert patterns - retrying a step does not create duplicate records
  4. Validation failures surface as user-visible errors (not silent progression)
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Create validation gate infrastructure
- [x] 01-02-PLAN.md — Migrate agents to AI SDK 6 pattern
- [x] 01-03-PLAN.md — Integrate validation gates and idempotent writes

### Phase 2: Budget Protection
**Goal**: Analysis cannot exceed token/cost limits - enforced before execution, not just tracked
**Depends on**: Phase 1
**Requirements**: FND-04, FND-05, FND-06
**Success Criteria** (what must be TRUE):
  1. Documents over 50 pages or 10MB are rejected at upload with clear explanation
  2. Oversized documents (>200K tokens) are truncated at section boundaries with warning
  3. Token usage tracked internally per analysis (admin-only visibility)
  4. Admin API provides aggregate usage statistics
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Create budget infrastructure (limits, estimation, truncation, schema)
- [x] 02-02-PLAN.md — Integrate upload validation and token budget gate
- [x] 02-03-PLAN.md — Pipeline integration with truncation and cost tracking
- [x] 02-04-PLAN.md — Admin usage API endpoint

### Phase 3: Document Extraction
**Goal**: Raw text reliably extracted from PDF and DOCX documents with structure preserved
**Depends on**: Phase 2
**Requirements**: EXT-01, EXT-02, EXT-03, EXT-04, EXT-05, EXT-06
**Success Criteria** (what must be TRUE):
  1. User can upload PDF and see extracted text in analysis
  2. User can upload DOCX and see extracted text in analysis
  3. Document headings and section structure appear in extracted output
  4. Corrupt or encrypted files show clear error message (not silent failure)
  5. Word Add-in can submit raw text directly (bypasses extraction)
**Plans**: 5 plans

Plans:
- [x] 03-01-PLAN.md — Create extraction infrastructure (error types, quality metrics, extractors)
- [x] 03-02-PLAN.md — LLM-assisted structure detection with position tracking
- [x] 03-03-PLAN.md — Unified extractDocument with validation flow
- [x] 03-04-PLAN.md — Pipeline integration with error handling
- [x] 03-05-PLAN.md — Word Add-in enhancements with deduplication

### Phase 4: OCR Processing
**Goal**: Scanned/image-based PDFs are detected and processed with user awareness of quality limitations
**Depends on**: Phase 3
**Requirements**: OCR-01, OCR-02, OCR-03, OCR-04
**Success Criteria** (what must be TRUE):
  1. Scanned PDFs detected automatically (not processed as empty documents)
  2. OCR extracts readable text from scanned documents
  3. Low-confidence OCR shows warning to user about potential accuracy impact
  4. User can proceed with analysis despite OCR quality warnings
**Plans**: 5 plans

Plans:
- [x] 04-01-PLAN.md — OCR infrastructure (types, PDF-to-image conversion)
- [x] 04-02-PLAN.md — OCR processor (Tesseract worker, quality assessment)
- [x] 04-03-PLAN.md — Pipeline integration (Inngest function, schema updates)
- [x] 04-04-PLAN.md — UI warning display and pipeline continuation
- [x] 04-05-PLAN.md — Gap closure: Wire OCR trigger event emission

### Phase 5: Legal Chunking
**Goal**: Extracted text split into legal-aware chunks with embeddings ready for RAG retrieval
**Depends on**: Phase 4
**Requirements**: CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, CHK-06, CHK-07
**Success Criteria** (what must be TRUE):
  1. Chunks respect legal structure (ARTICLE, Section boundaries not split mid-clause)
  2. Each chunk has section path (e.g., ["Article 5", "Section 5.2"])
  3. Chunks stored with Voyage AI embeddings in tenant database
  4. Ambiguous boundaries handled via LLM detection (not arbitrary splits)
  5. No chunk exceeds 512 tokens
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md — Infrastructure: types, Voyage AI token counter, schema extensions
- [x] 05-02-PLAN.md — Legal chunker: strategies, merging, cross-references, chunk map
- [x] 05-03-PLAN.md — Pipeline integration: refactor parser, wire Inngest steps, embed + persist

### Phase 6: CUAD Classification
**Goal**: Every chunk classified against CUAD 41-category taxonomy with confidence scores
**Depends on**: Phase 5
**Requirements**: CLS-01, CLS-02, CLS-03, CLS-04, CLS-05, CLS-06
**Success Criteria** (what must be TRUE):
  1. Each clause displays CUAD category with confidence score (0.0-1.0)
  2. Low-confidence classifications (< 0.7) are visually flagged for review
  3. Multi-category clauses show primary and secondary labels
  4. Document-level clause list aggregates chunk classifications
  5. Classification uses RAG retrieval of similar CUAD examples
**Plans**: 4 plans

Plans:
- [ ] 06-01-PLAN.md -- Schema + types: chunkClassifications table and multi-label classification schemas
- [ ] 06-02-PLAN.md -- Classifier agent: batch classification, two-stage RAG, neighbor context
- [ ] 06-03-PLAN.md -- Pipeline integration: wire classifier into Inngest, persist classifications
- [ ] 06-04-PLAN.md -- Queries + UI: classification queries, server actions, dual-view toggle

### Phase 7: Risk Scoring
**Goal**: Every clause has risk assessment with evidence-grounded explanation and verified citations
**Depends on**: Phase 6
**Requirements**: RSK-01, RSK-02, RSK-03, RSK-04, RSK-05, RSK-06
**Success Criteria** (what must be TRUE):
  1. Each clause shows risk level: standard, cautious, aggressive, or unknown
  2. Each clause has 2-3 sentence plain-language explanation
  3. Risk explanations cite evidence from reference corpus (not just LLM opinion)
  4. Citations verified to exist in reference database (no hallucinated evidence)
  5. Document shows overall risk score as weighted average
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Gap Analysis
**Goal**: Missing CUAD categories identified with importance explanation and recommended language
**Depends on**: Phase 6
**Requirements**: GAP-01, GAP-02, GAP-03, GAP-04, GAP-05
**Success Criteria** (what must be TRUE):
  1. Analysis shows which CUAD categories are missing from the NDA
  2. Each missing category includes importance explanation
  3. Missing categories show recommended language from Bonterms/CommonAccord
  4. Gap severity compared against Bonterms baseline
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: Pipeline Orchestration
**Goal**: Full pipeline runs durably with progress events and supports cancellation
**Depends on**: Phase 8
**Requirements**: PIP-01, PIP-02, PIP-03, PIP-04, PIP-05, PIP-06
**Success Criteria** (what must be TRUE):
  1. Pipeline survives failures and resumes from last successful step
  2. Rate limits respected (Claude 60 RPM, Voyage 300 RPM)
  3. Stage-level progress visible during analysis (Extracting... Classifying... Scoring...)
  4. Chunk-level progress visible in long stages (Scoring clause 7 of 15...)
  5. User can cancel analysis and see partial results where available
**Plans**: TBD

Plans:
- [ ] 09-01: TBD

### Phase 10: Progress Streaming
**Goal**: Real-time progress updates available via SSE for web UI and Word Add-in
**Depends on**: Phase 9
**Requirements**: STR-01, STR-02, STR-03, STR-04
**Success Criteria** (what must be TRUE):
  1. SSE endpoint streams progress events for active analysis
  2. Web UI shows live progress without polling
  3. Word Add-in receives progress updates for content control placement
  4. Reconnection after disconnect resumes from last event
**Plans**: TBD

Plans:
- [ ] 10-01: TBD

### Phase 11: Document Rendering
**Goal**: Extracted document displayed in UI with clause highlighting and navigation
**Depends on**: Phase 5
**Requirements**: RND-01, RND-02, RND-03, RND-04, RND-05, OUT-01, OUT-02, OUT-03, OUT-04, OUT-05, OUT-06
**Success Criteria** (what must be TRUE):
  1. Extracted document renders as structured markdown in artifact panel
  2. Heading hierarchy and sections preserved in rendering
  3. User can click clause in list to highlight and scroll to it in document
  4. Selecting clause in document scrolls clause list to match
  5. All analysis results persisted to database with clause positions
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation Hardening | 3/3 | Complete | 2026-02-04 |
| 2. Budget Protection | 4/4 | Complete | 2026-02-04 |
| 3. Document Extraction | 5/5 | Complete | 2026-02-04 |
| 4. OCR Processing | 5/5 | Complete | 2026-02-04 |
| 5. Legal Chunking | 3/3 | Complete | 2026-02-05 |
| 6. CUAD Classification | 0/4 | Not started | - |
| 7. Risk Scoring | 0/TBD | Not started | - |
| 8. Gap Analysis | 0/TBD | Not started | - |
| 9. Pipeline Orchestration | 0/TBD | Not started | - |
| 10. Progress Streaming | 0/TBD | Not started | - |
| 11. Document Rendering | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-04*
*Last updated: 2026-02-05 (Phase 5 complete)*
