# Requirements: VibeDocs Analysis Pipeline

**Defined:** 2026-02-04
**Core Value:** Every uploaded NDA gets a complete, evidence-grounded analysis in under 90 seconds

## v1 Requirements

Requirements for the analysis pipeline milestone. Each maps to roadmap phases.

### Foundation

- [x] **FND-01**: Migrate all agents from deprecated `generateObject` to `generateText` + `Output.object()`
- [x] **FND-02**: Add validation gates between pipeline stages to catch errors early
- [x] **FND-03**: Convert database INSERT operations to upsert patterns for idempotency
- [x] **FND-04**: Implement pre-flight token estimation before analysis starts
- [x] **FND-05**: Enforce hard budget limits that abort analysis if exceeded
- [x] **FND-06**: Add document size caps (page count, file size) with clear error messages

### Extraction

- [x] **EXT-01**: Extract raw text from PDF documents using pdf-parse
- [x] **EXT-02**: Extract raw text from DOCX documents using mammoth
- [x] **EXT-03**: Preserve document structure (headings, sections, paragraphs)
- [x] **EXT-04**: Validate extraction quality before proceeding (non-empty, reasonable length)
- [x] **EXT-05**: Handle extraction failures gracefully (corrupt files, encrypted)
- [x] **EXT-06**: Support raw text input for Word Add-in (bypass extraction)

### OCR

- [x] **OCR-01**: Detect non-readable PDFs (scanned, image-based) via extraction validation
- [x] **OCR-02**: Apply OCR processing to extract text from scanned documents
- [x] **OCR-03**: Handle OCR quality issues (low confidence text, partial extraction)
- [x] **OCR-04**: Warn user when OCR quality is poor and may affect analysis accuracy

### Chunking

- [x] **CHK-01**: Split extracted text into legal-aware chunks
- [x] **CHK-02**: Detect section boundaries using legal patterns (ARTICLE, Section, numbered clauses)
- [x] **CHK-03**: Use LLM for boundary detection when structure is ambiguous
- [x] **CHK-04**: Preserve section paths for each chunk (e.g., ["Article 5", "Section 5.2"])
- [x] **CHK-05**: Respect max token limit per chunk (512 tokens, 50 token overlap)
- [x] **CHK-06**: Generate Voyage AI embeddings for each chunk
- [x] **CHK-07**: Store chunks with embeddings in tenant database

### Classification

- [x] **CLS-01**: Retrieve top-5 similar CUAD examples via vector search for each chunk
- [x] **CLS-02**: Classify each chunk into CUAD 41-category taxonomy
- [x] **CLS-03**: Provide confidence score (0.0-1.0) for each classification
- [x] **CLS-04**: Support multi-category clauses (primary + secondary labels)
- [x] **CLS-05**: Flag low-confidence classifications (< 0.7) for potential review
- [x] **CLS-06**: Aggregate chunk-level classifications into document-level clause list

### Risk Scoring

- [x] **RSK-01**: Retrieve ContractNLI evidence and template baselines for each clause
- [x] **RSK-02**: Assign risk level: standard | cautious | aggressive | unknown
- [x] **RSK-03**: Generate plain-language explanation (2-3 sentences) per clause
- [x] **RSK-04**: Cite evidence from reference corpus (CUAD statistics, ContractNLI spans)
- [x] **RSK-05**: Verify citations exist in reference database (no hallucinated evidence)
- [x] **RSK-06**: Calculate overall document risk score as weighted average

### Gap Analysis

- [x] **GAP-01**: Compare extracted categories against full CUAD 41-category taxonomy
- [x] **GAP-02**: Identify missing categories relevant to NDAs
- [x] **GAP-03**: Explain importance of each missing clause type
- [x] **GAP-04**: Retrieve recommended language from Bonterms/CommonAccord templates
- [x] **GAP-05**: Compare against Bonterms baseline for gap severity

### Pipeline Orchestration

- [x] **PIP-01**: Wrap each agent in Inngest `step.run()` for durability
- [x] **PIP-02**: Add `step.sleep()` delays for rate limit compliance (Claude 60 RPM, Voyage 300 RPM)
- [x] **PIP-03**: Emit stage-level progress events via `step.sendEvent()`
- [x] **PIP-04**: Emit chunk-level progress within long stages (Classifier, Risk Scorer)
- [x] **PIP-05**: Support analysis cancellation via Inngest `cancelOn` events
- [x] **PIP-06**: Preserve partial results on cancellation where possible

### Progress Streaming

- [x] **STR-01**: Create SSE endpoint for progress event consumption
- [x] **STR-02**: Support progress subscription by analysis ID
- [x] **STR-03**: Emit events compatible with Word Add-in consumption
- [x] **STR-04**: Handle reconnection gracefully (resume from last event)

### Document Rendering

- [x] **RND-01**: Convert extracted text to structured markdown representation
- [x] **RND-02**: Preserve heading hierarchy and section structure in markdown
- [x] **RND-03**: Display rendered document in UI artifact panel
- [x] **RND-04**: Highlight clause spans within rendered document (click-to-navigate)
- [x] **RND-05**: Sync document view with clause list (scroll to clause on selection)

### Output & Persistence

- [x] **OUT-01**: Persist clause extractions to `clause_extractions` table
- [x] **OUT-02**: Persist gap analysis to `analyses.gap_analysis` JSONB column
- [x] **OUT-03**: Persist overall risk score and level to `analyses` table
- [x] **OUT-04**: Include clause positions (start/end) for Word Add-in content controls
- [x] **OUT-05**: Track token usage and cost per analysis
- [x] **OUT-06**: Update document status through pipeline stages

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Advanced Analysis

- **ADV-01**: ContractNLI 17-hypothesis NLI scoring per clause
- **ADV-02**: Smart model routing based on clause complexity
- **ADV-03**: Hallucination detection beyond citation verification
- **ADV-04**: Confidence calibration based on historical accuracy

### Advanced Progress

- **PRG-01**: Predictive time remaining estimates
- **PRG-02**: Comparison progress streaming (side-by-side updates)

### Optimization

- **OPT-01**: Parallel execution of independent agents
- **OPT-02**: Batch classification for multiple chunks
- **OPT-03**: Embedding caching across documents

## Out of Scope

| Feature | Reason |
|---------|--------|
| NDA comparison | Separate milestone - different pipeline architecture |
| NDA generation | Separate milestone - requires template manipulation |
| Real-time collaborative editing | Not needed for analysis workflow |
| PDF export of analysis | Deferred to later milestone |
| Custom risk playbooks | Post-MVP differentiation feature |
| Mobile-specific progress UI | Responsive web sufficient for MVP |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Complete |
| FND-02 | Phase 1 | Complete |
| FND-03 | Phase 1 | Complete |
| FND-04 | Phase 2 | Complete |
| FND-05 | Phase 2 | Complete |
| FND-06 | Phase 2 | Complete |
| EXT-01 | Phase 3 | Complete |
| EXT-02 | Phase 3 | Complete |
| EXT-03 | Phase 3 | Complete |
| EXT-04 | Phase 3 | Complete |
| EXT-05 | Phase 3 | Complete |
| EXT-06 | Phase 3 | Complete |
| OCR-01 | Phase 4 | Complete |
| OCR-02 | Phase 4 | Complete |
| OCR-03 | Phase 4 | Complete |
| OCR-04 | Phase 4 | Complete |
| CHK-01 | Phase 5 | Complete |
| CHK-02 | Phase 5 | Complete |
| CHK-03 | Phase 5 | Complete |
| CHK-04 | Phase 5 | Complete |
| CHK-05 | Phase 5 | Complete |
| CHK-06 | Phase 5 | Complete |
| CHK-07 | Phase 5 | Complete |
| CLS-01 | Phase 6 | Complete |
| CLS-02 | Phase 6 | Complete |
| CLS-03 | Phase 6 | Complete |
| CLS-04 | Phase 6 | Complete |
| CLS-05 | Phase 6 | Complete |
| CLS-06 | Phase 6 | Complete |
| RSK-01 | Phase 7 | Complete |
| RSK-02 | Phase 7 | Complete |
| RSK-03 | Phase 7 | Complete |
| RSK-04 | Phase 7 | Complete |
| RSK-05 | Phase 7 | Complete |
| RSK-06 | Phase 7 | Complete |
| GAP-01 | Phase 8 | Complete |
| GAP-02 | Phase 8 | Complete |
| GAP-03 | Phase 8 | Complete |
| GAP-04 | Phase 8 | Complete |
| GAP-05 | Phase 8 | Complete |
| PIP-01 | Phase 9 | Complete |
| PIP-02 | Phase 9 | Complete |
| PIP-03 | Phase 9 | Complete |
| PIP-04 | Phase 9 | Complete |
| PIP-05 | Phase 9 | Complete |
| PIP-06 | Phase 9 | Complete |
| STR-01 | Phase 10 | Complete |
| STR-02 | Phase 10 | Complete |
| STR-03 | Phase 10 | Complete |
| STR-04 | Phase 10 | Complete |
| RND-01 | Phase 11 | Complete |
| RND-02 | Phase 11 | Complete |
| RND-03 | Phase 11 | Complete |
| RND-04 | Phase 11 | Complete |
| RND-05 | Phase 11 | Complete |
| OUT-01 | Phase 11 | Complete |
| OUT-02 | Phase 11 | Complete |
| OUT-03 | Phase 11 | Complete |
| OUT-04 | Phase 11 | Complete |
| OUT-05 | Phase 11 | Complete |
| OUT-06 | Phase 11 | Complete |

**Coverage:**
- v1 requirements: 61 total
- Mapped to phases: 61
- Unmapped: 0

---
*Requirements defined: 2026-02-04*
*Last updated: 2026-02-05 (All v1 requirements complete — milestone finished)*
