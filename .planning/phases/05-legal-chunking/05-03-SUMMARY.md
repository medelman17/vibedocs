---
phase: 05-legal-chunking
plan: 03
subsystem: inngest-pipeline
tags: [pipeline-integration, parser-refactor, chunking, embedding, voyage-ai, inngest, persistence]
requires:
  - "05-01 (types, token counter, schema extensions)"
  - "05-02 (legal chunker, strategies, merger, cross-reference, chunk-map)"
  - "Phase 3 (document extraction)"
  - "Phase 4 (OCR processing)"
provides:
  - "Parser agent simplified to extraction + structure detection only"
  - "Legal-aware chunking integrated into Inngest pipeline as separate step"
  - "Batched Voyage AI embedding with rate limiting (128/batch)"
  - "Chunk persistence with replace strategy (delete old, insert new)"
  - "Chunk map and stats persisted to analyses table"
  - "Downstream classifier compatibility shim"
  - "'chunking' progress stage in pipeline events"
affects:
  - "Phase 6 (classification reads legal chunks from DB)"
  - "Phase 7 (risk scoring benefits from better chunk metadata)"
  - "Phase 9 (pipeline orchestration already using new step structure)"
  - "Phase 11 (document rendering uses chunk positions for highlighting)"
tech-stack:
  added: []
  patterns:
    - "Shared runChunkingPipeline helper for code reuse between main and post-OCR pipelines"
    - "Dynamic import for tokenizer in Inngest step (avoids eager loading)"
    - "Compatibility shim pattern: transform EmbeddedChunk[] to ParsedChunk[] for downstream agents"
    - "Replace strategy for chunk persistence: delete old + bulk insert new"
    - "Batched DB inserts (100 per batch) for chunk persistence"
key-files:
  created: []
  modified:
    - "agents/parser.ts"
    - "agents/parser.test.ts"
    - "agents/validation/gates.ts"
    - "inngest/types.ts"
    - "inngest/functions/analyze-nda.ts"
key-decisions:
  - id: "05-03-01"
    decision: "Parser agent does extraction + structure detection only, no chunking or embedding"
    reason: "Chunking and embedding are separate Inngest steps for better durability and observability"
  - id: "05-03-02"
    decision: "Token budget estimation runs pre-chunking on raw text with empty chunks array"
    reason: "Chunks don't exist yet at estimation time; truncation handled by truncateToTokenBudget's empty-chunks edge case"
  - id: "05-03-03"
    decision: "Shared runChunkingPipeline helper with InngestStep type alias (any) for step parameter"
    reason: "Inngest's step type has complex generics that can't be easily extracted; any is pragmatic here"
  - id: "05-03-04"
    decision: "validateParserOutput chunks parameter made optional"
    reason: "Parser no longer produces chunks; validation happens on raw text only at parser stage"
duration: "9.0 min"
completed: "2026-02-05"
---

# Phase 5 Plan 3: Pipeline Integration Summary

**One-liner:** Refactored parser to extraction-only, wired legal-aware chunking and batched Voyage AI embedding as separate Inngest steps with chunk persistence and downstream compatibility shim.

## Performance

| Metric | Value |
|--------|-------|
| Duration | 9.0 min |
| Tasks | 2/2 |
| Deviations | 1 |
| Blockers | 0 |

## Accomplishments

### Task 1: Refactor parser agent to separate extraction from chunking
- Removed `chunkDocument()` and `embedBatch()` calls from parser agent
- Removed `ParsedChunk` type export (replaced by `LegalChunk` + `EmbeddedChunk` from chunking module)
- Simplified `ParserOutput` to `{ document: { documentId, title, rawText, structure }, quality }`
- Added `isOcr` flag to quality metrics for OCR source identification
- Added 'chunking' stage to `analysisProgressPayload` enum in `inngest/types.ts`
- Added `embeddingBatchesCompleted` and `totalEmbeddingBatches` to progress metadata schema
- Made `chunks` parameter optional in `validateParserOutput` (parser no longer produces chunks)
- Updated parser tests to match simplified extraction-only interface

### Task 2: Wire chunking, embedding, and persistence into Inngest pipeline
- Extracted `runChunkingPipeline()` shared helper used by both main and post-OCR pipelines
- Pipeline now flows: parser -> validate -> init-tokenizer -> chunk-document -> persist-chunk-metadata -> embed-batch-N -> persist-chunks -> classify -> score -> gaps
- Tokenizer initialization via dynamic import in Inngest step (avoids eager loading)
- Legal-aware chunking via `chunkLegalDocument()` as separate durable step
- Chunk map and stats generated and persisted to analyses table JSONB columns
- Embedding runs in batches of 128 (VOYAGE_CONFIG.batchLimit) with rate limiting between batches
- Boilerplate chunks stored with null embedding (skip embedding for signature blocks, notices)
- Replace strategy: delete old chunks for document+analysis before inserting new ones
- DB inserts batched at 100 per batch to keep INSERT statements reasonable
- Compatibility shim transforms EmbeddedChunk[] to ParsedChunk[] for downstream classifier agent
- Updated progress percentages: parsing 15%, chunking 25-35%, classifying 50%, scoring 70%, gaps 90%

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Refactor parser agent | 62c1381 | agents/parser.ts, agents/parser.test.ts, agents/validation/gates.ts, inngest/types.ts |
| 2 | Wire chunking into pipeline | d6c51cf | inngest/functions/analyze-nda.ts |

## Files Modified

| File | Changes |
|------|---------|
| `agents/parser.ts` | Removed chunking/embedding imports and logic; simplified ParserOutput; added isOcr flag |
| `agents/parser.test.ts` | Updated tests for extraction-only interface; removed chunk/embedding assertions |
| `agents/validation/gates.ts` | Made chunks parameter optional in validateParserOutput |
| `inngest/types.ts` | Added 'chunking' stage; added embedding batch metadata fields |
| `inngest/functions/analyze-nda.ts` | Added runChunkingPipeline helper; rewrote both pipelines with separate chunk/embed/persist steps |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 05-03-01 | Parser does extraction + structure only | Separate Inngest steps for chunking/embedding improve durability and observability |
| 05-03-02 | Budget estimation pre-chunking with empty chunks | Chunks don't exist yet; truncation edge case handles empty array |
| 05-03-03 | InngestStep type alias (any) for shared helper | Inngest step type has complex generics incompatible with extracted function signatures |
| 05-03-04 | validateParserOutput chunks optional | Parser refactor removes chunks from parser output |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] validateParserOutput updated to support optional chunks**
- **Found during:** Task 1
- **Issue:** Parser no longer produces chunks, but validateParserOutput required chunks parameter
- **Fix:** Made chunks parameter optional; only validates chunks when provided
- **Files modified:** agents/validation/gates.ts
- **Commit:** 62c1381

## Issues Encountered

None.

## Next Phase Readiness

**Phase 5 Complete:** All three plans (types/token-counter, legal chunker, pipeline integration) are implemented. The legal chunking pipeline is fully wired:

1. Parser extracts text and detects structure
2. Legal chunker produces structure-aware chunks with position tracking
3. Voyage AI embeddings generated in batches with rate limiting
4. Chunks persisted to tenant database with full metadata
5. Downstream agents receive compatible chunk format

**Ready for Phase 6 (CUAD Classification):** Classifier agent already receives chunks via compatibility shim. The improved legal-aware chunks with section paths and cross-references should improve classification accuracy. Chunks are stored in the database and can be queried by analysis ID.
