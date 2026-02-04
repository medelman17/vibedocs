---
phase: 03-document-extraction
plan: 03
subsystem: extraction
tags: [pdf, docx, validation, ocr-routing, language-detection]

# Dependency graph
requires:
  - phase: 03-01
    provides: PDF and DOCX extractors with quality metrics
provides:
  - Unified extractDocument() entry point for all document types
  - Validation flow with OCR routing and language detection
  - Backward-compatible extractText() using new extractors
affects: [04-ocr-processing, pipeline-integration, api-routes]

# Tech tracking
tech-stack:
  added: []
  patterns: [unified-extraction-entry-point, validation-gate-flow, structured-logging]

key-files:
  created:
    - lib/document-extraction/extract-document.ts
  modified:
    - lib/document-extraction/index.ts
    - lib/document-processing.ts
    - lib/document-processing.test.ts

key-decisions:
  - "Unified extractDocument validates MIME type, applies OCR check, then language check in sequence"
  - "OcrRequiredError thrown immediately when requiresOcr flag is true (unless skipOcrRouting option)"
  - "Non-English detection throws ValidationError with user-friendly message"
  - "Low confidence English (< 70%) adds warning but continues extraction"
  - "Structured JSON logging via console.log for observability metrics"

patterns-established:
  - "Validation flow: extract → OCR check → language check → return"
  - "Skip options (skipLanguageCheck, skipOcrRouting) for testing and special cases"
  - "Quality metrics logged with outcome status (success, ocr_required, non_english)"

# Metrics
duration: 7min
completed: 2026-02-04
---

# Phase 3 Plan 3: Unified Extraction Summary

**Unified extractDocument() with MIME-based routing, OCR detection gate, English-only validation, and structured observability logging**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-04T23:41:32Z
- **Completed:** 2026-02-04T23:48:07Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Created single extractDocument() entry point handling PDF, DOCX, and plain text
- Implemented validation flow: extract → OCR check (throws OcrRequiredError) → language check (throws ValidationError)
- Updated document-processing.ts for backward compatibility using new extractors
- Added structured JSON logging for all extraction metrics

## Task Commits

Each task was committed atomically:

1. **Task 1: Create unified extractDocument function** - `81bfac5` (feat)
2. **Task 2: Update barrel export** - `3383e96` (feat)
3. **Task 3: Update lib/document-processing.ts for backward compatibility** - `a0aabe9` (refactor)

## Files Created/Modified
- `lib/document-extraction/extract-document.ts` - Unified extraction with validation flow
- `lib/document-extraction/index.ts` - Added extractDocument export
- `lib/document-processing.ts` - Updated to use new extractors, marked as deprecated
- `lib/document-processing.test.ts` - Updated mocks for new extraction module

## Decisions Made
- Unified extractDocument validates in sequence: MIME type → raw extraction → OCR check → language check
- OcrRequiredError thrown immediately when <100 chars detected (per CONTEXT.md)
- Non-English documents throw ValidationError with user-friendly message
- Skip options provided for testing (skipLanguageCheck, skipOcrRouting)
- Structured JSON logging via console.log (can be replaced with proper logger later)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated document-processing tests for new architecture**
- **Found during:** Task 3 (backward compatibility update)
- **Issue:** Tests mocked pdf-parse and mammoth directly, but document-processing now imports from @/lib/document-extraction
- **Fix:** Updated mocks to mock the new @/lib/document-extraction module instead
- **Files modified:** lib/document-processing.test.ts
- **Verification:** `pnpm vitest run lib/document-processing.test.ts` passes (7/7 tests)
- **Committed in:** a0aabe9 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for tests to pass with new architecture. No scope creep.

## Issues Encountered
- Pre-existing test failures in app/api/word-addin/analyze/route.test.ts (unrelated to this plan, not addressed)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Unified extraction API complete and ready for pipeline integration
- extractDocument provides rich ExtractionResult with quality metrics
- OCR routing gate in place (Phase 4 will implement actual OCR processing)
- Backward compatibility maintained for existing extractText() callers

---
*Phase: 03-document-extraction*
*Completed: 2026-02-04*
