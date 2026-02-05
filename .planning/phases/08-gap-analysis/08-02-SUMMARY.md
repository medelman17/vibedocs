---
phase: 08-gap-analysis
plan: 02
subsystem: agents
tags: [gap-analysis, bonterms, template-baselines, two-tier-detection, severity]
dependency-graph:
  requires: [08-01]
  provides: [enhanced-gap-analyst, two-tier-detection, bonterms-severity, template-retrieval, coverage-summary]
  affects: [08-03, 08-04]
tech-stack:
  added: []
  patterns: [bonterms-presence-severity, two-tier-gap-status, template-grounded-language, coverage-summary]
file-tracking:
  key-files:
    created: []
    modified: [agents/gap-analyst.ts, agents/prompts/gap-analyst.ts]
decisions:
  - id: "08-02-01"
    description: "Task 2 and Task 3 combined into single commit (same file, inseparable changes)"
    rationale: "Helper functions and their wiring into runGapAnalystAgent are in the same file and interdependent"
  - id: "08-02-02"
    description: "Catch clause uses bare catch (no parameter) instead of catch (_error)"
    rationale: "ESLint caughtErrorsIgnorePattern not configured; bare catch avoids unused-var lint error"
metrics:
  duration: "7.8 min"
  completed: "2026-02-05"
---

# Phase 8 Plan 02: Enhanced Gap Analyst Agent Summary

**One-liner:** Two-tier gap detection with Bonterms-presence severity, template-grounded language suggestions via findTemplateBaselines, and coverage summary computation in the gap analyst agent.

## What Was Done

### Task 1: Enhance gap analyst prompts with template context (df304fe)

Rewrote `agents/prompts/gap-analyst.ts` with enhanced system and user prompts:

**System prompt enhancements:**
- Two-tier gap status definitions (missing vs incomplete)
- Three severity tier descriptions (critical/important/informational)
- Template-grounded language guidelines (adapt from Bonterms, cite source)
- Style matching instructions (formality, defined terms, numbering conventions)
- Output format matching `enhancedGapAnalysisSchema`

**User prompt function (`createGapAnalystPrompt`) enhancements:**
- New signature accepts 5 parameters: documentSummary, presentCategories, classifiedClauses, gaps (with templateContext), sampleClauses
- Sorts gaps by severity priority (critical first)
- Limits to top 10 gaps for ~12K token budget
- Includes template baselines truncated to 300 chars
- Includes 5 sample clauses (200 chars each) for style reference

**Preserved unchanged:** `CRITICAL_CATEGORIES`, `IMPORTANT_CATEGORIES`, `CONTRACT_NLI_HYPOTHESES`

### Task 2+3: Add detection helpers and wire into runGapAnalystAgent (219f2a4)

Tasks 2 and 3 were combined into a single commit since they modify the same file and the helper functions are inseparable from their wiring into `runGapAnalystAgent`.

**New helper functions:**

1. **`getNdaRelevantCategories()`** -- Queries `cuadCategories` table for `isNdaRelevant = true`, selecting name, description, and riskWeight. Falls back to `CRITICAL_CATEGORIES` (riskWeight 1.5) + `IMPORTANT_CATEGORIES` (riskWeight 1.0) with `console.warn` when table is empty.

2. **`determineSeverity(hasBontermsBaselines, riskWeight)`** -- Implements locked decision #3:
   - `hasBontermsBaselines && riskWeight >= 1.5` -> critical
   - `hasBontermsBaselines && riskWeight < 1.5` -> important
   - `!hasBontermsBaselines` -> informational

3. **`detectGapStatus(categoryName, clauses, assessments)`** -- Two-tier detection:
   - Zero matching clauses -> 'missing'
   - No clause meets LOW_CONFIDENCE (0.7) threshold -> 'incomplete'
   - All risk assessments aggressive/unknown -> 'incomplete'
   - Otherwise -> 'present'

**Enhanced `runGapAnalystAgent` flow:**
1. Get NDA-relevant categories from DB
2. Detect gap status for each category
3. For gaps: retrieve template baselines via `findTemplateBaselines(cat.description ?? cat.name)`
4. Determine severity via Bonterms presence
5. Build enhanced prompt with gaps, templates, sample clauses
6. LLM call with `enhancedGapAnalysisSchema`
7. Compute coverage summary from pre-computed data
8. Merge LLM explanations with pre-computed severity/status
9. ContractNLI hypothesis testing (preserved unchanged)
10. Calculate gap score with severity-based weights

**Updated types and constants:**
- `GapAnalystOutput.gapAnalysis` now uses `EnhancedGapResult`
- `GAP_SCORE_WEIGHTS.MISSING_OPTIONAL` renamed to `MISSING_INFORMATIONAL`
- `calculateGapScore` accepts `EnhancedGapItem[]` instead of old schema

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 08-02-01 | Tasks 2+3 combined into single commit | Same file, inseparable changes -- helper functions and their wiring are interdependent |
| 08-02-02 | Bare `catch` instead of `catch (_error)` | ESLint `caughtErrorsIgnorePattern` not configured; bare catch avoids lint error |

## Deviations from Plan

### Combined Tasks

**1. [Rule 3 - Blocking] Tasks 2 and 3 merged into single commit**
- **Found during:** Task 2 execution
- **Issue:** Tasks 2 (add helpers) and 3 (wire into runGapAnalystAgent) modify the same function in the same file. The rewrite of `runGapAnalystAgent` must include both the helpers and their usage simultaneously for the file to compile.
- **Fix:** Combined into a single commit (219f2a4). Task 1 (prompts) remains a separate commit (df304fe).
- **Impact:** 2 commits instead of 3. No functional difference.

## Verification

- `pnpm build` succeeds with no errors
- `agents/gap-analyst.ts` imports and uses `findTemplateBaselines`, `cuadCategories`, `enhancedGapAnalysisSchema`
- `findTemplateBaselines` called with `cat.description ?? cat.name` (description text for better embeddings)
- `determineSeverity(templates.length > 0, cat.riskWeight)` uses Bonterms presence as primary severity input
- `createGapAnalystPrompt` called with 5-arg enhanced signature
- `getNdaRelevantCategories()` queries DB with hardcoded fallback
- `detectGapStatus()` implements two-tier detection
- ContractNLI hypothesis loop preserved unchanged (lines 390-433)

## Commits

| Hash | Message |
|------|---------|
| df304fe | feat(08-02): enhance gap analyst prompts with template context |
| 219f2a4 | feat(08-02): add gap detection, Bonterms-presence severity, and helper functions |

## Next Phase Readiness

Plan 03 (pipeline persistence) can now:
- Call enhanced `runGapAnalystAgent` which returns `EnhancedGapResult`
- Persist `gapAnalysis` JSONB with gaps, coverageSummary, weakClauses, hypothesisCoverage, gapScore
- Tests will need updating to mock the new imports (cuadCategories, findTemplateBaselines)

Plan 04 (UI) can now:
- Read `EnhancedGapResult` from `gapAnalysis` JSONB column
- Display gaps with severity badges, status badges, template attribution
- Show coverage summary with present/missing/incomplete counts
