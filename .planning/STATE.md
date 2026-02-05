# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** Every uploaded NDA gets a complete, evidence-grounded analysis in under 90 seconds
**Current focus:** Phase 12 - Admin Document CRUD

## Current Position

Phase: 12 of 12 (Admin Document CRUD)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-05 - Completed 12-02-PLAN.md

Progress: [██████████████████████████████████████████████████░] 98% (53 plans of 54 total)
**Next Phase:** Phase 12 Plan 03 - Admin Detail Panel & Bulk Delete

## Performance Metrics

**Velocity:**
- Total plans completed: 53
- Average duration: 5.0 min
- Total execution time: 261.9 min

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
| 09 | 7 | 20.6 min | 2.9 min |
| 10 | 4 | 24.2 min | 6.1 min |
| 11 | 8 | 56.0 min | 7.0 min |
| 12 | 2 | 13.5 min | 6.8 min |

**Recent Trend:**
- Last 5 plans: 11-07 (3.9 min), 11-08 (4.0 min), 12-01 (10.0 min), 12-02 (3.5 min)
- Trend: Phase 12 progressing - admin data table UI complete

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
- [09-05]: Queue position counts all pending+processing+pending_ocr analyses for the tenant
- [09-05]: CancelledView uses window.location.reload() after resume/start-fresh for clean state reset
- [09-04]: SCORER_BATCH_SIZE=3 for risk scorer (smaller than classifier's 4 due to higher token intensity)
- [09-04]: Progress range 60-80% allocated to scoring stage (classifier 40-60%, gap analysis 80-100%)
- [09-04]: RiskScorerResultType via Awaited<ReturnType<>> consistent with ClassifierResultType pattern
- [09-07]: setTimeout(0) for initial fetch to satisfy react-hooks/set-state-in-effect lint rule
- [09-07]: No barrel export in components/debug/ per project convention
- [09-07]: Step statuses derived from progressStage and analysis status (no additional DB columns)
- [10-01]: No @inngest/realtime exports in inngest/index.ts barrel (barrel export anti-pattern)
- [10-01]: generateAnalysisToken has no auth checks; callers verify ownership (shared by two auth mechanisms)
- [10-01]: Channel scoping: analysis:{analysisId} per analysis for progress isolation
- [10-02]: publish() outside step.run() - fire-and-forget, at-most-once delivery acceptable
- [10-02]: 1s throttle with terminal bypass for realtime publish (per CONTEXT.md)
- [10-03]: fetchRealtimeToken throws on error (not ApiResponse) for useInngestSubscription refreshToken compatibility
- [10-03]: Degraded polling at 5s (was 2s) when realtime unavailable
- [10-03]: Late-join DB snapshot on mount before realtime subscription starts
- [10-04]: Track disconnectedFor analysisId instead of boolean flag (React 19 ref-in-render prohibition)
- [10-04]: Derive progress via useMemo not setState in effect (React 19 set-state-in-effect rule)
- [10-04]: setTimeout(0) for terminal stage auto-disconnect (cannot setState in useMemo body)
- [11-02]: No persistence middleware for clause selection (ephemeral state)
- [11-02]: Overlapping match detection in document search (advance by 1 char)
- [11-02]: Binary search for paragraph index lookup (O(log n))
- [11-01]: Offset map convention: { original: X, markdown: X + cumulativeShift } for absolute positions
- [11-01]: Markdown conversion is client-side only; server action returns raw data
- [11-01]: DocumentStructure parsed from document.metadata.structure JSONB with safe fallback
- [11-03]: useMemo for section tracking instead of useEffect + setState (React 19 pattern)
- [11-03]: Paper styling uses bg-card semantic token (dark mode adaptive)
- [11-03]: estimateSize only for virtual scrolling (no measureElement per research pitfall 2)
- [11-04]: Remove export type re-exports from "use server" modules (Turbopack incompatibility)
- [11-04]: Import types directly from source modules (db/queries, agents/types, lib/realtime)
- [11-05]: Reuse ChatLayoutClient for analysis route layout (generic sidebar/header shell)
- [11-05]: orientation prop (not direction) for ResizablePanelGroup (react-resizable-panels v3)
- [11-05]: Analysis mentions and showArtifact navigate to /analysis/[id] (not artifact panel)
- [11-06]: useState for conversationId instead of useRef (react-hooks/refs ESLint v7 rule)
- [11-06]: clauseText as optional prop on ClauseHighlight (backward compatible)
- [11-06]: ChatTab lazy-mounted only when Chat tab active (avoids useChat overhead)
- [11-07]: Individual Zustand selectors instead of destructured object for fine-grained re-render control
- [11-07]: nextClause/prevClause set selectionSource to 'document' to trigger analysis-side scroll
- [11-07]: No changes needed for analysis tabs (already correct from 11-04)
- [11-08]: Clauses passed to renderer only after scoring completes (prevents incomplete overlays during progressive reveal)
- [11-08]: Token usage shows only estimated cost (compact "$X.XX" format) in metadata header
- [11-08]: URL sync uses prevClauseIdRef to avoid redundant router.replace calls
- [11-08]: proxy.ts already includes /analysis in protectedRoutes - no changes needed
- [11-08]: Responsive layout already handled by useIsMobile from 11-05 - no changes needed
- [12-01]: Admin actions use requireRole(['admin', 'owner']) not withTenant, no uploadedBy filter
- [12-01]: Hard delete with cascade cleanup - comparisons deleted before document (documentAId and documentBId)
- [12-01]: Blob file deleted before DB row to avoid orphaned files
- [12-01]: Admin can delete last analysis (no guard unlike dashboard)
- [12-01]: Inngest source field uses "web" for admin-triggered analyses (enum constraint)
- [12-02]: TanStack Table in manual mode for server-side pagination/sorting (large datasets)
- [12-02]: URL search params for all table state (page, size, search, filters, sort)
- [12-02]: Empty state differentiation based on active filter params (no-docs vs no-matches)
- [12-02]: Selection state via onSelectionChange callback (DocumentsTable to parent)

### Pending Todos

None.

### Roadmap Evolution

- Phase 12 added: Admin Document CRUD

### Blockers/Concerns

- [Resolved]: Phase 10 SSE evaluation complete - using Inngest Realtime (not custom SSE)

## Session Continuity

Last session: 2026-02-05T23:18:49Z
Stopped at: Completed 12-02-PLAN.md
Resume file: None
