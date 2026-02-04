---
phase: 03-document-extraction
plan: 02
subsystem: document-processing
tags: [llm, structure-detection, regex, ai-sdk, zod, legal-documents]

# Dependency graph
requires:
  - phase: 03-01
    provides: ExtractionResult types, PDF/DOCX extractors
provides:
  - DocumentStructure type with positioned sections
  - Regex-based parser for obvious legal headings (ARTICLE, Section)
  - LLM fallback for ambiguous document structure
  - Character position tracking for UI highlighting
  - Party name extraction (disclosing/receiving)
affects: [pipeline-orchestration, ui-highlighting, analysis-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Regex fast-path with LLM fallback for ambiguous cases"
    - "Position tracking with startOffset/endOffset for UI highlighting"
    - "50K char limit on LLM input to prevent token overflow"

key-files:
  created:
    - lib/document-extraction/structure-detector.ts
  modified:
    - lib/document-extraction/index.ts
    - lib/document-extraction/types.ts

key-decisions:
  - "Regex patterns for ARTICLE, Section, numbered headings detect 'obvious' structure"
  - "LLM fallback uses generateObject with Zod schema for type-safe structured output"
  - "Character positions computed via string indexOf with sequential search offset"

patterns-established:
  - "Structure types already existed from 03-01 (PositionedSection, DocumentStructure)"
  - "Gateway import from 'ai' package directly (not custom wrapper)"

# Metrics
duration: 3min
completed: 2026-02-04
---

# Phase 3 Plan 2: Structure Detection Summary

**LLM-assisted structure detection with regex fast-path for obvious legal headings, position tracking for UI highlighting, and party name extraction**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-04T23:35:52Z
- **Completed:** 2026-02-04T23:38:50Z
- **Tasks:** 3 (1 already done from prior plan)
- **Files modified:** 2

## Accomplishments

- Regex-based parser for ARTICLE I, Section 1.2, numbered heading patterns
- LLM fallback using generateObject for ambiguous documents (50K char limit)
- Character position computation for each section (startOffset, endOffset, sectionPath)
- Party name extraction from NDA patterns ("Disclosing Party", "Receiving Party")
- Detection flags for signature blocks, exhibits, and redacted text

## Task Commits

Each task was committed atomically:

1. **Task 1: Add structure types** - Already existed from 03-01 plan (no commit needed)
2. **Task 2: Create structure detector** - `4cb73f1` (feat)
3. **Task 3: Update barrel export** - `59dfd6a` (feat)

## Files Created/Modified

- `lib/document-extraction/structure-detector.ts` - Main structure detection with regex/LLM
- `lib/document-extraction/index.ts` - Barrel export with structure types and functions

## Decisions Made

- **Regex patterns for obvious structure:** ARTICLE (Roman/Arabic), Section (numbered), and pure numbered headings
- **LLM truncation at 50K chars:** Prevents token overflow while capturing document structure
- **Sequential position search:** Uses indexOf with currentOffset to handle duplicate text

## Deviations from Plan

None - plan executed exactly as written.

Note: Task 1 (structure types) was already complete from 03-01 plan, so no new commit was needed for it.

## Issues Encountered

- Task 1 types were already committed in prior plan 03-01 - discovered via lint-staged empty commit prevention

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Structure detection ready for integration with parsing pipeline
- detectStructure returns DocumentStructure with all positioned sections
- parseObviousStructure available for direct regex-only parsing when needed

---
*Phase: 03-document-extraction*
*Completed: 2026-02-04*
