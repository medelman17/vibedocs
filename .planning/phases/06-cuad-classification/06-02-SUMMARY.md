---
phase: 06-cuad-classification
plan: 02
title: "Enhanced Batch Classifier"
status: complete
duration: "7.3 min"
completed: 2026-02-05

subsystem: classification-pipeline
tags: [classifier, batch-processing, rag, vector-search, neighbor-context]

dependency-graph:
  requires: [06-01]
  provides: [batch-classifier, two-stage-rag, neighbor-context, raw-classifications]
  affects: [06-03, 06-04, 07-01]

tech-stack:
  added: []
  patterns: [batch-llm-classification, two-stage-rag-retrieval, neighbor-context-windowing]

key-files:
  created: []
  modified:
    - agents/classifier.ts
    - agents/classifier.test.ts
    - agents/prompts/classifier.ts

decisions:
  - id: "06-02-01"
    description: "Batch size of 4 chunks per LLM call as default (3-5 range)"
    rationale: "4 provides good balance between context window usage and API call reduction (~75% fewer calls)"
  - id: "06-02-02"
    description: "7 references per chunk, deduplicate to top 10 across batch"
    rationale: "More references per chunk than before (was 3), but cap total to avoid prompt bloat"
  - id: "06-02-03"
    description: "Uncategorized and Unknown both filtered from clauses output"
    rationale: "Risk-scorer cannot process either; raw classifications preserved for Plan 03 persistence"
---

# Phase 6 Plan 02: Enhanced Batch Classifier Summary

Batch classifier with neighbor context (200 chars), two-stage RAG (7 refs/chunk via findSimilarClauses), and multi-label output with Uncategorized support.

## What Was Done

### Task 1: Enhance classifier prompt for batch classification with neighbor context
**Commit:** `ceb4b66`

Updated `agents/prompts/classifier.ts`:
- Updated `CLASSIFIER_SYSTEM_PROMPT` with batch processing guidelines, Uncategorized category guidance, and batch JSON output format
- Added `createBatchClassifierPrompt()` function that accepts chunks with neighbor context, deduplicated reference examples, and candidate categories narrowed by vector search
- Prompt includes section paths, preceding/following context, and instruction to classify per-chunk
- Preserved existing `createClassifierPrompt()` (marked deprecated) for backward compatibility until Plan 03 rewires pipeline

### Task 2: Rewrite classifier agent for batch classification with two-stage RAG
**Commit:** `786ba88`

Rewrote `agents/classifier.ts` with enhanced classification pipeline:
- **Batch processing**: Chunks processed in groups of 4 (BATCH_SIZE constant), reducing API calls from ~N to ~N/4
- **Neighbor context**: `buildNeighborMap()` creates a Map<chunkId, NeighborContext> with 200-char slices from adjacent chunks
- **Two-stage RAG**: For each chunk in a batch, calls `findSimilarClauses(content, { limit: 7 })`, then deduplicates references across the entire batch (keeping top 10 by similarity)
- **Candidate categories**: Unique categories extracted from deduplicated references, passed to prompt so LLM focuses on likely matches
- **Confidence thresholds**: Primary classifications below 0.3 (MINIMUM_FLOOR) become "Uncategorized"; secondary classifications below 0.3 are filtered out
- **Dual output**: Returns both `clauses` (filtered, no Uncategorized/Unknown, for risk-scorer) and `rawClassifications` (all results including Uncategorized, for Plan 03 persistence)
- **Error handling**: Batch-aware error messages include batch number and chunk indices
- Updated tests to match batch classification format with 8 comprehensive test cases

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm build` passes | PASS |
| `createBatchClassifierPrompt` exported | PASS |
| `runClassifierAgent` returns `clauses` + `rawClassifications` | PASS |
| `buildNeighborMap` uses 200-char slices | PASS |
| Batch size is 4 | PASS |
| Two-stage RAG: 7 refs/chunk, dedup to 10 | PASS |
| Below 0.3 confidence -> Uncategorized | PASS |
| `ClassifiedClause` interface unchanged | PASS |
| All tests pass (16 total: 8 agent + 8 prompt) | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated tests for batch classification format**
- **Found during:** Task 2
- **Issue:** Existing tests used old single-classification mock format (`{ category, secondaryCategories, confidence, reasoning }`) which no longer matches the batch output schema (`{ classifications: [...] }`)
- **Fix:** Rewrote test mocks to return `multiLabelClassificationSchema`-compatible output, dynamically parsing chunk indices from the prompt to build matching classifications. Added 4 new test cases (rawClassifications, Uncategorized filtering, confidence floor, batch count verification, two-stage RAG verification).
- **Files modified:** `agents/classifier.test.ts`
- **Commit:** `786ba88`

## Decisions Made

1. **Batch size 4** (06-02-01): Default of 4 chunks per LLM call provides good balance. Constants are defined at module level for easy tuning.
2. **7 references per chunk, top 10 per batch** (06-02-02): Increased from 3 references per chunk (old) to 7, but deduplicates across the entire batch to cap at 10 total references in the prompt.
3. **Filter both Uncategorized and Unknown from clauses** (06-02-03): The `clauses` array (used by risk-scorer) excludes both Uncategorized (new) and Unknown (legacy) categories. The `rawClassifications` array preserves all results for Plan 03's persistence to `chunkClassifications` table.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | ceb4b66 | feat | Enhance classifier prompt for batch classification with neighbor context |
| 2 | 786ba88 | feat | Rewrite classifier agent for batch classification with two-stage RAG |

## Next Plan Readiness

Plan 06-03 (Pipeline Integration) can proceed. It depends on:
- `runClassifierAgent` returning `rawClassifications` (delivered)
- `createBatchClassifierPrompt` for prompt construction (delivered)
- `chunkClassifications` table from Plan 06-01 (previously delivered)
- Integration will wire `rawClassifications` persistence to the new table
