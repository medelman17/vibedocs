---
phase: 02-budget-protection
plan: 01
subsystem: budget
tags: [gpt-tokenizer, token-estimation, budget-limits, truncation, drizzle]

# Dependency graph
requires:
  - phase: 01-foundation-hardening
    provides: validation gates infrastructure
provides:
  - Budget limit constants (BUDGET_LIMITS, MAX_FILE_SIZE, MAX_PAGES, TOKEN_BUDGET)
  - Token estimation utilities using gpt-tokenizer
  - Section-boundary truncation logic
  - Upload validation (file size, page count)
  - Schema columns for budget tracking
affects: [02-02 upload hooks, 02-03 pipeline integration, agents, inngest functions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import for pdf-parse to avoid barrel export issues"
    - "Schema versioning in test setup for migration handling"

key-files:
  created:
    - lib/budget/limits.ts
    - lib/budget/estimation.ts
    - lib/budget/validation.ts
    - lib/budget/truncation.ts
    - lib/budget/index.ts
  modified:
    - db/schema/analyses.ts
    - test/setup.ts

key-decisions:
  - "gpt-tokenizer as proxy for Claude tokenization (~10-15% variance acceptable for budget enforcement)"
  - "Dynamic import for pdf-parse in validation.ts to avoid barrel export browser-only dep issues"
  - "Schema versioning in test/setup.ts to auto-recreate on column changes"

patterns-established:
  - "Budget utilities are lightweight, safe for barrel export"
  - "Heavy dependencies (pdf-parse) use dynamic import to isolate"

# Metrics
duration: 7min
completed: 2026-02-04
---

# Phase 02 Plan 01: Budget Infrastructure Summary

**Token estimation with gpt-tokenizer, section-boundary truncation using DocumentChunk, and schema columns for budget tracking (estimatedTokens, actualTokens, estimatedCost, wasTruncated)**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-04T21:57:03Z
- **Completed:** 2026-02-04T22:04:27Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Created lib/budget/ module with centralized budget constants and utilities
- Token estimation using gpt-tokenizer as Claude tokenizer proxy
- Section-boundary truncation that respects DocumentChunk structure
- Upload validation for file size and PDF page count
- Added 4 new columns to analyses table for budget tracking

## Task Commits

Each task was committed atomically:

1. **Task 1: Create budget limits and estimation utilities** - `d0739f6` (feat)
2. **Task 2: Add token tracking columns to analyses schema** - `1913079` (feat)
3. **Task 3: Push schema changes and run tests** - `cc17837` (test)

## Files Created/Modified
- `lib/budget/limits.ts` - BUDGET_LIMITS constants (MAX_FILE_SIZE, MAX_PAGES, TOKEN_BUDGET)
- `lib/budget/estimation.ts` - estimateTokens and checkTokenBudget using gpt-tokenizer
- `lib/budget/validation.ts` - validateFileSize and validatePageCount with dynamic pdf-parse import
- `lib/budget/truncation.ts` - truncateToTokenBudget using DocumentChunk boundaries
- `lib/budget/index.ts` - Barrel export (lightweight, safe)
- `db/schema/analyses.ts` - Added estimatedTokens, actualTokens, estimatedCost, wasTruncated columns
- `test/setup.ts` - Updated schema SQL and added versioning for automatic recreation
- `drizzle/0000_overjoyed_spacker_dave.sql` - Generated migration with new columns

## Decisions Made
- **gpt-tokenizer proxy:** Used gpt-tokenizer instead of Claude-specific tokenizer. GPT-4 tokenizer differs by ~10-15% from Claude's but is sufficient for budget enforcement. Exact matching not required.
- **Dynamic pdf-parse import:** Used dynamic import in validation.ts to avoid pulling browser-only pdfjs-dist dependencies into the barrel export (see barrel export issues in CLAUDE.md).
- **Schema version flag:** Added SCHEMA_VERSION constant in test/setup.ts that forces schema recreation when incremented. This handles new column additions without manual intervention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pdf-parse import pattern**
- **Found during:** Task 1 (Create budget utilities)
- **Issue:** Plan specified `(await import('pdf-parse')).default` but pdf-parse v2 uses named export `PDFParse` class
- **Fix:** Changed to `const { PDFParse } = await import('pdf-parse')` matching existing document-processing.ts pattern
- **Files modified:** lib/budget/validation.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** d0739f6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor fix to align with existing codebase patterns. No scope creep.

## Issues Encountered
- Test failures after schema changes: PGlite test database didn't have new columns. Fixed by adding schema versioning to force recreation when schema changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Budget utilities ready for integration into upload hooks (02-02)
- Schema columns ready for pipeline budget tracking (02-03)
- All tests passing (848/848)

---
*Phase: 02-budget-protection*
*Completed: 2026-02-04*
