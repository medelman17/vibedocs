# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** Every uploaded NDA gets a complete, evidence-grounded analysis in under 90 seconds
**Current focus:** Phase 6 - CUAD Classification (in progress)

## Current Position

Phase: 6 of 11 (CUAD Classification)
Plan: 3 of 4 in current phase
Status: In progress
Last activity: 2026-02-05 - Completed 06-03-PLAN.md (Pipeline Integration)

Progress: [████████████████░] ~74% (23 plans of ~31 total)

## Performance Metrics

**Velocity:**
- Total plans completed: 23
- Average duration: 4.5 min
- Total execution time: 103.9 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | 8.5 min | 2.8 min |
| 02 | 4 | 19.5 min | 4.9 min |
| 03 | 5 | 28.5 min | 5.7 min |
| 04 | 5 | 15.5 min | 3.1 min |
| 05 | 3 | 18.3 min | 6.1 min |
| 06 | 3 | 13.6 min | 4.5 min |

**Recent Trend:**
- Last 5 plans: 05-03 (9.0 min), 06-01 (4.2 min), 06-02 (7.3 min), 06-03 (2.1 min)
- Trend: Pipeline integration was straightforward; single file modification

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: AI SDK migration before extraction work (deprecated API risk)
- [Roadmap]: OCR as separate phase (adds complexity, research flagged)
- [Roadmap]: Pipeline orchestration after all agents (weaves them together)
- [01-01]: No garbled text detection - let downstream stages fail naturally
- [01-01]: Validation gates are infrastructure only - Plan 03 integrates into pipeline
- [01-02]: NoObjectGeneratedError wrapped to AnalysisFailedError for consistent domain errors
- [01-02]: Gap analyst graceful degradation - continues on individual hypothesis failure
- [01-03]: Validation gates run outside step.run() for immediate NonRetriableError
- [01-03]: Failure state persisted inside step.run() for durability
- [01-03]: Deterministic ID uses documentId + requestedAt for unique analysis per request
- [02-01]: gpt-tokenizer as proxy for Claude tokenization (~10-15% variance acceptable)
- [02-01]: Dynamic import for pdf-parse to avoid barrel export issues
- [02-01]: Schema versioning in test/setup.ts for automatic recreation on changes
- [02-02]: Token budget gate always passes - truncation handles excess instead of rejection
- [02-02]: Graceful fallback when PDF page count fails - let downstream budget check catch
- [02-03]: Token budget validation runs outside step.run (consistent with other gates)
- [02-03]: workingDocument pattern passes truncated version to downstream agents
- [03-01]: PDFParse class API used (getText, getInfo) matching existing pattern
- [03-01]: PasswordException/InvalidPDFException as primary error detection, message fallback for safety
- [03-01]: OCR threshold at 100 chars per CONTEXT.md decision
- [03-01]: Confidence score based on text-to-file-size ratio
- [03-02]: Regex patterns for ARTICLE/Section/numbered headings detect "obvious" structure
- [03-02]: LLM fallback with 50K char limit to prevent token overflow
- [03-02]: Character positions computed via indexOf with sequential offset tracking
- [03-03]: Unified extractDocument validates MIME -> extract -> OCR check -> language check in sequence
- [03-03]: OcrRequiredError thrown when requiresOcr flag true (unless skipOcrRouting option)
- [03-03]: Non-English detection throws ValidationError with user-friendly message
- [03-03]: Structured JSON logging for extraction observability metrics
- [03-04]: Error messages stored in metadata JSONB, not separate column
- [03-04]: Word Add-in content gets confidence 1.0 (clean text)
- [03-04]: Parser tests mock extractDocument and detectStructure from document-extraction
- [03-05]: Office.js creationDate property used (not creationDateTime)
- [03-05]: Deduplication returns existing analysis without re-processing
- [03-05]: Failed analyses create new document/analysis (fall through)
- [04-01]: Confidence thresholds: 85% warning, 60% critical (per RESEARCH.md)
- [04-01]: MAX_OCR_PAGES=100 to prevent memory exhaustion
- [04-01]: Scale factor 2.0 for better OCR quality
- [04-01]: Dynamic import for pdf-to-img to avoid barrel export issues
- [04-02]: Uint8Array to Buffer conversion for Tesseract.js compatibility
- [04-03]: Combined download+OCR in single Inngest step (Buffer serialization issue)
- [04-03]: OCR completion triggers nda/analysis.ocr-complete event for pipeline resume
- [04-04]: OCR source type added to parser agent (avoids re-extraction for OCR text)
- [04-04]: Safe JSONB metadata access with type assertion for pageCount
- [04-04]: Warning component returns null for good quality (>= 85%) for clean UX
- [04-05]: No new decisions - gap closure plan followed exactly as written
- [05-01]: llama-tokenizer-js for Voyage AI token counting (Llama 2 tokenizer, not gpt-tokenizer)
- [05-01]: analysisId on documentChunks is plain UUID without FK reference (avoids circular imports)
- [05-01]: Unique constraint updated to (documentId, analysisId, chunkIndex) for per-analysis chunks
- [05-01]: Sync token counter fallback uses 4.5 chars/token for legal English text
- [05-02]: chunk-merger.ts and cross-reference.ts created in Task 1 (legal-chunker.ts requires them for compilation)
- [05-02]: Recital detection via WHEREAS content pattern since SectionType has no 'recital' value
- [05-02]: LLM re-chunking only replaces initial results when chunk count improves
- [05-03]: Parser does extraction + structure detection only (chunking/embedding in separate Inngest steps)
- [05-03]: Token budget estimation runs pre-chunking on raw text with empty chunks array
- [05-03]: Shared runChunkingPipeline helper with InngestStep type alias for step parameter
- [05-03]: validateParserOutput chunks parameter made optional (parser no longer produces chunks)
- [06-01]: z.enum() with EXTENDED_CATEGORIES uses `as unknown as [string, ...]` cast for spread array compatibility
- [06-02]: Batch size 4 chunks per LLM call (3-5 range), configurable constant
- [06-02]: 7 references per chunk via findSimilarClauses, deduplicated to top 10 per batch
- [06-02]: Both Uncategorized and Unknown filtered from clauses output; rawClassifications preserves all
- [06-03]: Single persist-classifications step (not per-batch) with ON CONFLICT DO NOTHING for idempotency

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Phase 10 (SSE) may need Inngest Realtime vs custom SSE evaluation
- [Research]: Phase 7 (Risk Scoring) citation verification patterns need validation

## Session Continuity

Last session: 2026-02-05T06:17:00Z
Stopped at: Completed 06-03-PLAN.md (Pipeline Integration)
Resume file: None
