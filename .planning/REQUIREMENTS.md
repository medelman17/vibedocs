# Requirements: VibeDocs Analysis Pipeline

**Defined:** 2026-02-04
**Core Value:** Every uploaded NDA gets a complete, evidence-grounded analysis in under 90 seconds

## v1 Requirements

Requirements for the analysis pipeline milestone. Each maps to roadmap phases.

### Foundation

- [ ] **FND-01**: Migrate all agents from deprecated `generateObject` to `generateText` + `Output.object()`
- [ ] **FND-02**: Add validation gates between pipeline stages to catch errors early
- [ ] **FND-03**: Convert database INSERT operations to upsert patterns for idempotency
- [ ] **FND-04**: Implement pre-flight token estimation before analysis starts
- [ ] **FND-05**: Enforce hard budget limits that abort analysis if exceeded
- [ ] **FND-06**: Add document size caps (page count, file size) with clear error messages

### Extraction

- [ ] **EXT-01**: Extract raw text from PDF documents using pdf-parse
- [ ] **EXT-02**: Extract raw text from DOCX documents using mammoth
- [ ] **EXT-03**: Preserve document structure (headings, sections, paragraphs)
- [ ] **EXT-04**: Validate extraction quality before proceeding (non-empty, reasonable length)
- [ ] **EXT-05**: Handle extraction failures gracefully (corrupt files, encrypted)
- [ ] **EXT-06**: Support raw text input for Word Add-in (bypass extraction)

### OCR

- [ ] **OCR-01**: Detect non-readable PDFs (scanned, image-based) via extraction validation
- [ ] **OCR-02**: Apply OCR processing to extract text from scanned documents
- [ ] **OCR-03**: Handle OCR quality issues (low confidence text, partial extraction)
- [ ] **OCR-04**: Warn user when OCR quality is poor and may affect analysis accuracy

### Chunking

- [ ] **CHK-01**: Split extracted text into legal-aware chunks
- [ ] **CHK-02**: Detect section boundaries using legal patterns (ARTICLE, Section, numbered clauses)
- [ ] **CHK-03**: Use LLM for boundary detection when structure is ambiguous
- [ ] **CHK-04**: Preserve section paths for each chunk (e.g., ["Article 5", "Section 5.2"])
- [ ] **CHK-05**: Respect max token limit per chunk (512 tokens, 50 token overlap)
- [ ] **CHK-06**: Generate Voyage AI embeddings for each chunk
- [ ] **CHK-07**: Store chunks with embeddings in tenant database

### Classification

- [ ] **CLS-01**: Retrieve top-5 similar CUAD examples via vector search for each chunk
- [ ] **CLS-02**: Classify each chunk into CUAD 41-category taxonomy
- [ ] **CLS-03**: Provide confidence score (0.0-1.0) for each classification
- [ ] **CLS-04**: Support multi-category clauses (primary + secondary labels)
- [ ] **CLS-05**: Flag low-confidence classifications (< 0.7) for potential review
- [ ] **CLS-06**: Aggregate chunk-level classifications into document-level clause list

### Risk Scoring

- [ ] **RSK-01**: Retrieve ContractNLI evidence and template baselines for each clause
- [ ] **RSK-02**: Assign risk level: standard | cautious | aggressive | unknown
- [ ] **RSK-03**: Generate plain-language explanation (2-3 sentences) per clause
- [ ] **RSK-04**: Cite evidence from reference corpus (CUAD statistics, ContractNLI spans)
- [ ] **RSK-05**: Verify citations exist in reference database (no hallucinated evidence)
- [ ] **RSK-06**: Calculate overall document risk score as weighted average

### Gap Analysis

- [ ] **GAP-01**: Compare extracted categories against full CUAD 41-category taxonomy
- [ ] **GAP-02**: Identify missing categories relevant to NDAs
- [ ] **GAP-03**: Explain importance of each missing clause type
- [ ] **GAP-04**: Retrieve recommended language from Bonterms/CommonAccord templates
- [ ] **GAP-05**: Compare against Bonterms baseline for gap severity

### Pipeline Orchestration

- [ ] **PIP-01**: Wrap each agent in Inngest `step.run()` for durability
- [ ] **PIP-02**: Add `step.sleep()` delays for rate limit compliance (Claude 60 RPM, Voyage 300 RPM)
- [ ] **PIP-03**: Emit stage-level progress events via `step.sendEvent()`
- [ ] **PIP-04**: Emit chunk-level progress within long stages (Classifier, Risk Scorer)
- [ ] **PIP-05**: Support analysis cancellation via Inngest `cancelOn` events
- [ ] **PIP-06**: Preserve partial results on cancellation where possible

### Progress Streaming

- [ ] **STR-01**: Create SSE endpoint for progress event consumption
- [ ] **STR-02**: Support progress subscription by analysis ID
- [ ] **STR-03**: Emit events compatible with Word Add-in consumption
- [ ] **STR-04**: Handle reconnection gracefully (resume from last event)

### Document Rendering

- [ ] **RND-01**: Convert extracted text to structured markdown representation
- [ ] **RND-02**: Preserve heading hierarchy and section structure in markdown
- [ ] **RND-03**: Display rendered document in UI artifact panel
- [ ] **RND-04**: Highlight clause spans within rendered document (click-to-navigate)
- [ ] **RND-05**: Sync document view with clause list (scroll to clause on selection)

### Output & Persistence

- [ ] **OUT-01**: Persist clause extractions to `clause_extractions` table
- [ ] **OUT-02**: Persist gap analysis to `analyses.gap_analysis` JSONB column
- [ ] **OUT-03**: Persist overall risk score and level to `analyses` table
- [ ] **OUT-04**: Include clause positions (start/end) for Word Add-in content controls
- [ ] **OUT-05**: Track token usage and cost per analysis
- [ ] **OUT-06**: Update document status through pipeline stages

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
| FND-01 | Phase 1 | Pending |
| FND-02 | Phase 1 | Pending |
| FND-03 | Phase 1 | Pending |
| FND-04 | Phase 2 | Pending |
| FND-05 | Phase 2 | Pending |
| FND-06 | Phase 2 | Pending |
| EXT-01 | Phase 3 | Pending |
| EXT-02 | Phase 3 | Pending |
| EXT-03 | Phase 3 | Pending |
| EXT-04 | Phase 3 | Pending |
| EXT-05 | Phase 3 | Pending |
| EXT-06 | Phase 3 | Pending |
| OCR-01 | Phase 4 | Pending |
| OCR-02 | Phase 4 | Pending |
| OCR-03 | Phase 4 | Pending |
| OCR-04 | Phase 4 | Pending |
| CHK-01 | Phase 5 | Pending |
| CHK-02 | Phase 5 | Pending |
| CHK-03 | Phase 5 | Pending |
| CHK-04 | Phase 5 | Pending |
| CHK-05 | Phase 5 | Pending |
| CHK-06 | Phase 5 | Pending |
| CHK-07 | Phase 5 | Pending |
| CLS-01 | Phase 6 | Pending |
| CLS-02 | Phase 6 | Pending |
| CLS-03 | Phase 6 | Pending |
| CLS-04 | Phase 6 | Pending |
| CLS-05 | Phase 6 | Pending |
| CLS-06 | Phase 6 | Pending |
| RSK-01 | Phase 7 | Pending |
| RSK-02 | Phase 7 | Pending |
| RSK-03 | Phase 7 | Pending |
| RSK-04 | Phase 7 | Pending |
| RSK-05 | Phase 7 | Pending |
| RSK-06 | Phase 7 | Pending |
| GAP-01 | Phase 8 | Pending |
| GAP-02 | Phase 8 | Pending |
| GAP-03 | Phase 8 | Pending |
| GAP-04 | Phase 8 | Pending |
| GAP-05 | Phase 8 | Pending |
| PIP-01 | Phase 9 | Pending |
| PIP-02 | Phase 9 | Pending |
| PIP-03 | Phase 9 | Pending |
| PIP-04 | Phase 9 | Pending |
| PIP-05 | Phase 9 | Pending |
| PIP-06 | Phase 9 | Pending |
| STR-01 | Phase 10 | Pending |
| STR-02 | Phase 10 | Pending |
| STR-03 | Phase 10 | Pending |
| STR-04 | Phase 10 | Pending |
| RND-01 | Phase 11 | Pending |
| RND-02 | Phase 11 | Pending |
| RND-03 | Phase 11 | Pending |
| RND-04 | Phase 11 | Pending |
| RND-05 | Phase 11 | Pending |
| OUT-01 | Phase 11 | Pending |
| OUT-02 | Phase 11 | Pending |
| OUT-03 | Phase 11 | Pending |
| OUT-04 | Phase 11 | Pending |
| OUT-05 | Phase 11 | Pending |
| OUT-06 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 61 total
- Mapped to phases: 61
- Unmapped: 0

---
*Requirements defined: 2026-02-04*
*Last updated: 2026-02-04 after roadmap creation*
