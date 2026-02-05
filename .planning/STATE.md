# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** Every uploaded NDA gets a complete, evidence-grounded analysis in under 90 seconds
**Current focus:** Phase 9 - Pipeline Orchestration (in progress)

## Current Position

Phase: 9 of 11 (Pipeline Orchestration)
Plan: 3 of 7 in current phase
Status: In progress
Last activity: 2026-02-05 - Completed 09-03-PLAN.md

Progress: [███████████████████████████░░░░░░░░░░░░░] 90% (35 plans of 39 total)

## Performance Metrics

**Velocity:**
- Total plans completed: 35
- Average duration: 4.5 min
- Total execution time: 157.3 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | 8.5 min | 2.8 min |
| 02 | 4 | 19.5 min | 4.9 min |
| 03 | 5 | 28.5 min | 5.7 min |
| 04 | 5 | 15.5 min | 3.1 min |
| 05 | 3 | 18.3 min | 6.1 min |
| 06 | 4 | 18.2 min | 4.6 min |
| 07 | 4 | 22.9 min | 5.7 min |
| 08 | 4 | 16.2 min | 4.1 min |
| 09 | 3 | 9.7 min | 3.2 min |

**Recent Trend:**
- Last 5 plans: 08-04 (3.0 min), 09-01 (2.7 min), 09-02 (5.0 min), 09-03 (2.0 min)
- Trend: Pipeline orchestration plans consistently fast (~2-5 min)

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
- [06-04]: Classification queries use shared db client directly (existing db/queries pattern, tenantId filtering explicit)
- [06-04]: ClassificationView fetches via useEffect on mount/toggle (matches existing AnalysisView pattern)
- [06-04]: No barrel export for db/queries/classifications (import directly per CLAUDE.md)
- [07-01]: Keep original riskAssessmentSchema alongside enhancedRiskAssessmentSchema for backward compatibility
- [07-01]: Bridge transformation from legacy to enhanced evidence in risk-scorer.ts (removed in Plan 02)
- [07-01]: executiveSummary initialized to empty string placeholder (populated in Plan 03)
- [07-01]: computeRiskDistribution uses explicit object literal initialization (no RISK_LEVELS runtime dep)
- [07-02]: Accept all LLM-generated references, log warnings for unverified sourceIds (IDs come from vector search results in prompt context)
- [07-02]: Budget-aware reference limits: 3/2/2 normal, 2/1/1 on warning
- [07-02]: Executive summary populated in Plan 02 (not Plan 03 as originally planned)
- [07-02]: System prompt cached across clauses in scoring loop (same perspective for all)
- [07-03]: ON CONFLICT DO UPDATE (not DO NOTHING) for clauseExtractions supports re-scoring
- [07-03]: JSONB merge preserves existing metadata while adding perspective/riskDistribution
- [07-03]: Fallback to uniform weight 1.0 when cuadCategories empty (bootstrap not run)
- [07-03]: updateAnalysisWithRiskResults exported but not used in pipeline (available for standalone use)
- [07-04]: Re-score via Inngest to avoid serverless timeout; no-op check via metadata.perspective
- [07-04]: Poll-based refresh (3s) for re-score completion; bumps rescoreVersion state
- [07-04]: fetchRiskAssessments replaces getAnalysisClauses for document-order display
- [07-04]: Evidence and metadata parsed from JSONB with typed interfaces
- [08-01]: New types use ENHANCED_ prefix to avoid collision with existing GAP_STATUS
- [08-02]: Tasks 2+3 combined into single commit (same file, inseparable helper + wiring changes)
- [08-02]: Bare catch instead of catch (_error) for ESLint caughtErrorsIgnorePattern compatibility
- [08-03]: fetchGapAnalysis returns empty EnhancedGapResult (not null) when data unavailable
- [09-01]: Monotonic counter per function instance for unique emitProgress step IDs
- [09-01]: progressMessage as dedicated text column (not metadata JSONB)
- [09-02]: Optimistic DB update in cancelAnalysis for immediate UI feedback; cleanup handler as safety net
- [09-02]: pending_ocr added to cancellable statuses
- [09-02]: resumeAnalysis relies on Inngest step memoization for efficient restart
- [09-02]: @ts-expect-error for inngest/function.cancelled system event (not in InngestEvents type map)
- [09-03]: Per-batch classifier steps with const accumulator arrays (push mutates content, not reference)
- [09-03]: Progress range 40-60% allocated to classifier stage in pipeline progress
- [09-03]: ClassifierResultType via Awaited<ReturnType<>> to stay in sync with classifier agent

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Phase 10 (SSE) may need Inngest Realtime vs custom SSE evaluation

## Session Continuity

Last session: 2026-02-05
Stopped at: Completed 09-03-PLAN.md (per-batch classifier steps)
Resume file: None
