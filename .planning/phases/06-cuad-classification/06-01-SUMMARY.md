---
phase: 06-cuad-classification
plan: 01
title: "Schema & Types Foundation"
status: complete
duration: "4.2 min"
completed: 2026-02-05

subsystem: classification-pipeline
tags: [drizzle, zod, schema, multi-label, cuad]

dependency-graph:
  requires: [05-01]
  provides: [chunkClassifications-table, multi-label-schemas, classification-thresholds]
  affects: [06-02, 06-03, 06-04, 07-01]

tech-stack:
  added: []
  patterns: [multi-label-junction-table, extended-enum-schema]

key-files:
  created: []
  modified:
    - db/schema/analyses.ts
    - agents/types.ts

decisions:
  - id: "06-01-01"
    description: "z.enum() with EXTENDED_CATEGORIES uses `as unknown as [string, ...]` cast for spread array compatibility"
    rationale: "TypeScript narrows spread-into-const differently than literal const arrays; cast is safe since underlying values are validated"
---

# Phase 6 Plan 01: Schema & Types Foundation Summary

Multi-label CUAD classification schema and Zod types for batch classification output.

## What Was Done

### Task 1: Add chunkClassifications table to schema
**Commit:** `e8501da`

Added `chunkClassifications` junction table to `db/schema/analyses.ts` enabling multiple category labels per chunk:
- `isPrimary` boolean distinguishes highest-confidence label from secondaries
- `chunkIndex` denormalized from documentChunks for efficient document-order queries
- Unique constraint on (analysisId, chunkId, category) prevents duplicates and enables idempotent inserts
- Foreign key references to analyses, documentChunks, and documents with cascading deletes
- Four indexes: analysis, category+analysis, chunk, and document-order

### Task 2: Add multi-label classification schemas and types
**Commit:** `e5b4c8a`

Added to `agents/types.ts`:
- `EXTENDED_CATEGORIES`: 42 values (41 CUAD + "Uncategorized")
- `extendedCategorySchema`: Zod enum for primary classification (includes Uncategorized)
- `chunkClassificationResultSchema`: Per-chunk result with primary (extended) + secondary (CUAD-only, max 2)
- `multiLabelClassificationSchema`: Batch output wrapping array of chunk results
- `CLASSIFICATION_THRESHOLDS`: `MINIMUM_FLOOR` (0.3) and `LOW_CONFIDENCE` (0.7) constants
- Types: `ExtendedCategory`, `ChunkClassificationResult`, `MultiLabelClassificationOutput`

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm build` passes | PASS |
| `chunkClassifications` exported from `db/schema/analyses.ts` | PASS |
| `multiLabelClassificationSchema` exported from `agents/types.ts` | PASS |
| `EXTENDED_CATEGORIES` has 42 entries (41 CUAD + Uncategorized) | PASS |
| Existing `classificationSchema` unchanged | PASS |
| Existing `clauseExtractions` table unchanged | PASS |
| "Uncategorized" valid for primary, rejected for secondary | PASS |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **z.enum() cast for spread arrays** (06-01-01): `EXTENDED_CATEGORIES` is created via spread (`[...CUAD_CATEGORIES, 'Uncategorized']`), which TypeScript types as `readonly (string)[]` rather than a tuple. Used `as unknown as [string, ...string[]]` cast for `z.enum()` compatibility. This is safe because the runtime values are correct and validated by Zod.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | e8501da | feat | Add chunkClassifications table for multi-label CUAD classification |
| 2 | e5b4c8a | feat | Add multi-label classification schemas and types |

## Next Plan Readiness

Plan 06-02 (Enhanced Classifier Prompt) can proceed. It depends on:
- `extendedCategorySchema` and `multiLabelClassificationSchema` from `agents/types.ts` (delivered)
- `CLASSIFICATION_THRESHOLDS` for prompt engineering (delivered)
