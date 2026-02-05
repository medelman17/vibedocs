---
phase: 05-legal-chunking
plan: 02
subsystem: document-chunking
tags: [chunking, legal-aware, voyage-ai, structure-detection, cross-reference, llm-fallback]
requires:
  - "Phase 3 (document extraction: DocumentStructure, PositionedSection, detectStructure)"
  - "05-01 (types: LegalChunk, ChunkType, ChunkMetadata; token-counter: countVoyageTokensSync)"
provides:
  - "chunkLegalDocument() main entry point for legal-aware chunking"
  - "Six chunking strategies: definitions, clauses, recitals, boilerplate, exhibits, fallback"
  - "Post-processing: mergeShortChunks, splitOversizedChunks"
  - "Cross-reference extraction from legal text"
  - "Chunk map and statistics generation"
  - "detectStructure forceLlm option for LLM re-chunking"
affects:
  - "05-03 (pipeline integration wires chunkLegalDocument into Inngest)"
  - "Phase 6 (classification reads chunks produced by this chunker)"
  - "Phase 7 (risk scoring uses chunk metadata)"
  - "Phase 11 (document rendering uses chunk positions for highlighting)"
tech-stack:
  added: []
  patterns:
    - "Section-type dispatch pattern for strategy selection"
    - "CHK-03 LLM re-chunking fallback when structure quality is poor"
    - "Structure quality validation with bounds checking and coverage analysis"
    - "Overlap token application for context continuity at chunk boundaries"
key-files:
  created:
    - "lib/document-chunking/legal-chunker.ts"
    - "lib/document-chunking/chunk-strategies.ts"
    - "lib/document-chunking/chunk-merger.ts"
    - "lib/document-chunking/cross-reference.ts"
    - "lib/document-chunking/chunk-map.ts"
  modified:
    - "lib/document-extraction/structure-detector.ts"
key-decisions:
  - id: "05-02-01"
    decision: "chunk-merger.ts and cross-reference.ts created in Task 1 alongside legal-chunker.ts"
    reason: "legal-chunker.ts imports from both; TypeScript compilation requires them to exist"
  - id: "05-02-02"
    decision: "Recital detection via WHEREAS content pattern, not SectionType enum"
    reason: "SectionType has no 'recital' value; recitals appear as 'clause' or 'other' from structure detector"
  - id: "05-02-03"
    decision: "CHK-03 only uses LLM re-chunking result when it improves over initial chunking"
    reason: "Defensive approach: LLM results aren't always better, so compare chunk counts"
duration: "6.1 min"
completed: "2026-02-05"
---

# Phase 5 Plan 2: Legal Chunker Engine Summary

**One-liner:** Structure-aware legal chunker with six strategies, CHK-03 LLM re-chunking fallback, cross-reference extraction, and chunk map generation for Voyage AI embedding pipeline.

## Performance

| Metric | Value |
|--------|-------|
| Duration | 6.1 min |
| Tasks | 2/2 |
| Deviations | 1 |
| Blockers | 0 |

## Accomplishments

### Task 1: Legal chunker entry point, chunking strategies, and forceLlm support
- Updated `detectStructure()` with optional `DetectStructureOptions` parameter containing `forceLlm?: boolean`
- Created `chunkLegalDocument()` as the main entry point consuming DocumentStructure and producing LegalChunk[]
- Structure quality validation: bounds checking, overlap detection, gap coverage warnings (>20% uncovered triggers warning)
- CHK-03 LLM re-chunking: triggers when structure.sections is empty OR chunk/page ratio < 2, uses `detectStructure({ forceLlm: true })`
- Six strategy functions in chunk-strategies.ts:
  - `chunkDefinitions()` - one chunk per defined term via regex matching
  - `chunkClause()` - detects sub-clauses (a), (b), (c) and splits each into own chunk with parentClauseIntro metadata
  - `chunkBoilerplate()` - marks signature blocks/notices as boilerplate type
  - `chunkExhibit()` - chunks exhibits, falls back to paragraph splitting for long ones
  - `chunkRecital()` - each WHEREAS paragraph becomes its own chunk
  - `chunkFallback()` - paragraph-based splitting for unstructured text
- Created chunk-merger.ts with mergeShortChunks (50-token threshold) and splitOversizedChunks (sentence boundary splitting)
- Created cross-reference.ts with extractCrossReferences for Section/Article/clause/Exhibit/Schedule patterns

### Task 2: Chunk map generator
- Created `generateChunkMap()` producing complete ChunkMap with entries for JSONB storage
- Created `computeChunkStats()` for lightweight aggregate statistics (total, avg, min, max, distribution)
- Handles empty chunk arrays gracefully

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Legal chunker, strategies, forceLlm | aa35063 | legal-chunker.ts, chunk-strategies.ts, structure-detector.ts, chunk-merger.ts, cross-reference.ts |
| 2 | Chunk map generator | 0a93f0a | chunk-map.ts |

## Files Created

| File | Purpose |
|------|---------|
| `lib/document-chunking/legal-chunker.ts` | Main entry point: chunkLegalDocument() with validation, CHK-03, overlap, re-indexing |
| `lib/document-chunking/chunk-strategies.ts` | Six strategy functions for definitions, clauses, recitals, boilerplate, exhibits, fallback |
| `lib/document-chunking/chunk-merger.ts` | Short chunk merging and oversized chunk splitting at sentence boundaries |
| `lib/document-chunking/cross-reference.ts` | Cross-reference extraction with Section/Article/Exhibit/Schedule regex patterns |
| `lib/document-chunking/chunk-map.ts` | Chunk map summary and statistics generator for JSONB storage |

## Files Modified

| File | Changes |
|------|---------|
| `lib/document-extraction/structure-detector.ts` | Added DetectStructureOptions interface, optional options parameter to detectStructure() |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 05-02-01 | chunk-merger.ts and cross-reference.ts created in Task 1 | legal-chunker.ts imports from both; TypeScript compilation requires them |
| 05-02-02 | Recital detection via WHEREAS content pattern | SectionType enum has no 'recital' value; recitals appear as 'clause'/'other' |
| 05-02-03 | LLM re-chunking only replaces initial results when better | Defensive: compare chunk counts before accepting LLM-based structure |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] chunk-merger.ts and cross-reference.ts created in Task 1 instead of Task 2**
- **Found during:** Task 1
- **Issue:** legal-chunker.ts imports from chunk-merger.ts and cross-reference.ts; TypeScript requires these modules to exist for compilation
- **Fix:** Created full implementations of both files in Task 1 alongside legal-chunker.ts
- **Impact:** Task 2 reduced to only chunk-map.ts creation; no code quality impact
- **Commit:** aa35063

## Issues Encountered

None.

## Next Phase Readiness

**Ready for 05-03:** All chunking modules are in place. The pipeline integration plan (05-03) can:
- Import `chunkLegalDocument` from `@/lib/document-chunking/legal-chunker`
- Import `generateChunkMap`, `computeChunkStats` from `@/lib/document-chunking/chunk-map`
- Wire chunking into the Inngest pipeline as a durable step after structure detection
- Batch Voyage AI embedding generation after chunks are finalized
