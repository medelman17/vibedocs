---
phase: 05-legal-chunking
plan: 01
subsystem: document-chunking
tags: [types, tokenizer, schema, voyage-ai, llama-tokenizer, drizzle]
requires:
  - "Phase 3 (document extraction types: PositionedSection, DocumentStructure)"
provides:
  - "LegalChunk, ChunkType, ChunkMetadata, ChunkStats, ChunkMap, LegalChunkOptions, EmbeddedChunk types"
  - "Voyage AI token counter (Llama 2 tokenizer via llama-tokenizer-js)"
  - "Extended documentChunks schema with position tracking, chunk type, analysis scope"
  - "Extended analyses schema with chunkMap and chunkStats JSONB columns"
affects:
  - "05-02 (legal chunker implementation consumes these types)"
  - "05-03 (pipeline integration uses token counter and schema)"
  - "Phase 6 (classification reads chunks from extended schema)"
  - "Phase 11 (document rendering uses startPosition/endPosition for highlighting)"
tech-stack:
  added:
    - "llama-tokenizer-js@1.2.2 (Llama 2 SentencePiece tokenizer for Voyage AI token counting)"
  patterns:
    - "Lazy singleton with dynamic import for heavy dependencies (token counter)"
    - "Plain UUID column without FK reference to avoid circular schema imports"
key-files:
  created:
    - "lib/document-chunking/types.ts"
    - "lib/document-chunking/token-counter.ts"
    - "drizzle/0003_complete_pete_wisdom.sql"
  modified:
    - "db/schema/documents.ts"
    - "db/schema/analyses.ts"
    - "package.json"
    - "pnpm-lock.yaml"
key-decisions:
  - id: "05-01-01"
    decision: "Use llama-tokenizer-js (Llama 2 tokenizer) for Voyage AI token counting"
    reason: "Voyage AI voyage-law-2 uses Llama 2 tokenizer per official docs; gpt-tokenizer undercounts by 10-20%"
  - id: "05-01-02"
    decision: "analysisId on documentChunks is plain UUID without FK reference"
    reason: "Avoids circular imports since analyses.ts already imports from documents.ts"
  - id: "05-01-03"
    decision: "Updated unique constraint from (documentId, chunkIndex) to (documentId, analysisId, chunkIndex)"
    reason: "Re-analysis creates new chunks; chunks are per-analysis, not just per-document"
  - id: "05-01-04"
    decision: "Sync token counter falls back to Math.ceil(text.length / 4.5) for legal English text"
    reason: "4.5 chars/token calibrated for legal English; slightly overestimates (safe direction for chunk sizing)"
duration: "3.2 min"
completed: "2026-02-05"
---

# Phase 5 Plan 1: Foundation Types, Token Counter & Schema Summary

**One-liner:** Legal chunk types, Voyage AI Llama 2 token counter, and extended documentChunks/analyses schema with position tracking and analysis-scoped chunks.

## Performance

| Metric | Value |
|--------|-------|
| Duration | 3.2 min |
| Tasks | 2/2 |
| Deviations | 0 |
| Blockers | 0 |

## Accomplishments

### Task 1: Types module and token counter
- Created `lib/document-chunking/types.ts` with all required type exports: LegalChunk, ChunkType, ChunkMetadata, ChunkStats, ChunkMap, ChunkMapEntry, LegalChunkOptions, EmbeddedChunk
- Re-exports PositionedSection and DocumentStructure from document-extraction for consumer convenience
- Created `lib/document-chunking/token-counter.ts` with lazy singleton pattern for llama-tokenizer-js
- Three exported functions: initVoyageTokenizer (pre-warm), countVoyageTokens (async exact), countVoyageTokensSync (sync with fallback)
- Comprehensive JSDoc documenting the Voyage AI -> Llama 2 -> llama-tokenizer-js chain

### Task 2: Schema extensions
- Extended `documentChunks` table with: startPosition, endPosition, chunkType, analysisId (plain UUID), overlapTokens
- Extended `analyses` table with: chunkMap (JSONB), chunkStats (JSONB)
- Updated unique constraint to `(documentId, analysisId, chunkIndex)` for per-analysis chunk isolation
- Added `idx_chunks_analysis` index for efficient analysis-scoped queries
- Added 'chunking' to progressStage valid values documentation
- Generated migration: `drizzle/0003_complete_pete_wisdom.sql`

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Types module and token counter | 5a4ae64 | lib/document-chunking/types.ts, lib/document-chunking/token-counter.ts, package.json |
| 2 | Schema extensions | 0978c5f | db/schema/documents.ts, db/schema/analyses.ts, drizzle/0003_complete_pete_wisdom.sql |

## Files Created

| File | Purpose |
|------|---------|
| `lib/document-chunking/types.ts` | LegalChunk, ChunkType, ChunkMetadata, ChunkStats, ChunkMap, LegalChunkOptions, EmbeddedChunk |
| `lib/document-chunking/token-counter.ts` | Voyage AI token counting via Llama 2 tokenizer (lazy singleton) |
| `drizzle/0003_complete_pete_wisdom.sql` | Migration: add columns to documentChunks and analyses |

## Files Modified

| File | Changes |
|------|---------|
| `db/schema/documents.ts` | Added startPosition, endPosition, chunkType, analysisId, overlapTokens; updated unique constraint; added analysis index |
| `db/schema/analyses.ts` | Added chunkMap and chunkStats JSONB columns; added 'chunking' to progressStage docs |
| `package.json` | Added llama-tokenizer-js@^1.2.2 |
| `pnpm-lock.yaml` | Updated lockfile |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 05-01-01 | llama-tokenizer-js for Voyage AI token counting | Voyage AI uses Llama 2 tokenizer; gpt-tokenizer undercounts by 10-20% |
| 05-01-02 | Plain UUID for analysisId (no FK reference) | Avoids circular import between documents.ts and analyses.ts |
| 05-01-03 | Unique constraint includes analysisId | Re-analysis creates new chunks; old constraint was per-document only |
| 05-01-04 | Sync fallback uses 4.5 chars/token | Calibrated for legal English; overestimates (safe for chunk sizing) |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready for 05-02:** All foundation types, token counter, and schema are in place. The legal chunker implementation (05-02) can import from `@/lib/document-chunking/types` and `@/lib/document-chunking/token-counter` immediately. Schema migration is generated and ready for deployment.
