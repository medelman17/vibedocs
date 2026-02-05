---
phase: 11-document-rendering
plan: 01
subsystem: document-rendering
tags: [markdown, offset-mapping, text-processing, server-action]

dependency_graph:
  requires: []
  provides:
    - text-to-markdown conversion with offset tracking
    - offset mapper for clause position translation
    - getDocumentForRendering server action
    - rendering type definitions
  affects:
    - 11-05 (analysis page uses getDocumentForRendering + client-side conversion)
    - 11-02 (clause overlays consume ClauseOverlay type)
    - 11-03 (document panel renders markdown segments)
    - 11-08 (token usage from server action)

tech_stack:
  added: []
  patterns:
    - cumulative offset map for text transformation tracking
    - binary search for O(log n) position translation
    - paragraph-based document segmentation for virtualization
    - safe JSONB parsing with empty fallbacks

key_files:
  created:
    - lib/document-rendering/types.ts
    - lib/document-rendering/text-to-markdown.ts
    - lib/document-rendering/text-to-markdown.test.ts
    - lib/document-rendering/offset-mapper.ts
    - lib/document-rendering/offset-mapper.test.ts
  modified:
    - app/(main)/(dashboard)/analyses/actions.ts

decisions:
  - "Offset map convention: { original: X, markdown: X + cumulativeShift } records absolute positions, not relative shifts"
  - "Markdown conversion is client-side only - server action returns raw data (rawText + structure + clauses)"
  - "Paragraph splitting uses string indexOf for offset tracking rather than regex match positions"
  - "DocumentStructure parsed from document.metadata.structure JSONB with safe fallback to empty structure"
  - "riskLevelConfig exported as a static config object (not a function) for direct import by UI components"

metrics:
  duration: 7.6 min
  completed: 2026-02-05
  tests: 29 (16 text-to-markdown + 13 offset-mapper)
  files_created: 5
  files_modified: 1
---

# Phase 11 Plan 01: Text-to-Markdown Conversion with Offset Mapping Summary

Built the data layer foundation for document rendering: type definitions, text-to-markdown conversion with character offset tracking, and a server action that provides all data needed to render a document with clause overlays.

## What Was Built

### Type Definitions (`lib/document-rendering/types.ts`)
- `OffsetMapping`: Records translation points between original and markdown coordinate systems
- `MarkdownConversion`: Result of convertToMarkdown containing markdown text and offset map
- `DocumentSegment`: Paragraph-level segment for virtual scroll windowing
- `ClauseOverlay`: Clause positioned in both original and markdown coordinates
- `DocumentRenderingData`: Complete server action response shape
- `ClauseForRendering`: Minimal clause data subset needed for rendering
- `RiskLevelInfo`: Visual configuration (colors, labels) for risk levels

### Text-to-Markdown Conversion (`lib/document-rendering/text-to-markdown.ts`)
- `convertToMarkdown(rawText, sections)`: Inserts heading prefixes (#/##/###/####) based on DocumentStructure sections. Tracks every insertion in an offset map using cumulative shift tracking.
- `splitIntoParagraphs(markdownText)`: Splits on double newlines, returns DocumentSegment array with accurate start/end offsets for virtual scroll rendering.

### Offset Mapper (`lib/document-rendering/offset-mapper.ts`)
- `translateOffset(originalPos, offsetMap)`: Binary search (O(log n)) for nearest mapping at or before the target position, applies cumulative shift.
- `mapClausePositions(clauses, offsetMap, paragraphs)`: Bulk translates clause positions from original to markdown coordinates. Handles null positions (skip), negative positions (clamp to 0), and determines paragraph index for each clause.

### Server Action (`app/(main)/(dashboard)/analyses/actions.ts`)
- `getDocumentForRendering(analysisId)`: Single fetch for all rendering data. Returns raw document text, DocumentStructure, ordered clause positions, analysis status, and token usage. Uses `withTenant()` for tenant isolation.
- `riskLevelConfig`: Static object mapping risk levels to Tailwind CSS color classes for clause highlighting.
- Re-exports `DocumentRenderingData` and `RiskLevelInfo` types for UI consumption.

## TDD Execution

### RED Phase (commit a3959f1)
- 16 tests for text-to-markdown (empty text, no sections, heading levels 1-4, cumulative offsets, mixed levels, text preservation, mid-document headings, paragraph splitting)
- 13 tests for offset-mapper (empty map, single/multiple mappings, exact/before mapping points, clause mapping with null/negative/zero-length edge cases, paragraph index assignment)
- All tests failed as expected (modules not yet created)

### GREEN Phase (commit 30e5bde)
- Implemented all modules, all 29 tests pass
- No refactor phase needed (implementation is clean and efficient)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Offset map records absolute positions `{ original: X, markdown: X + shift }` | Enables simple shift calculation: `shift = markdown - original` at any mapping point |
| Markdown conversion is client-side only | Keeps server action simple (returns raw data), avoids transmitting both raw and markdown text over the wire |
| Binary search for offset translation | O(log n) lookup vs O(n) linear scan; critical for documents with many sections |
| Safe JSONB fallback for DocumentStructure | Documents may not have structure metadata (e.g., still processing); empty structure means no heading insertion |
| riskLevelConfig as static export | Avoids duplication across UI components; single source of truth for risk level visual config |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `pnpm test lib/document-rendering/` -- 29/29 tests pass
- `pnpm build` -- succeeds with no type errors
- convertToMarkdown correctly inserts heading prefixes with cumulative offset tracking
- translateOffset accurately maps positions via binary search
- mapClausePositions handles all edge cases (null, negative, zero-length, paragraph assignment)
- getDocumentForRendering returns complete data with tenant isolation

## Next Phase Readiness

Plan 11-01 provides the foundational data layer that Plans 11-03 (document panel), 11-05 (analysis page), and 11-08 (cost display) depend on. No blockers for downstream plans.
