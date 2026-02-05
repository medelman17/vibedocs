# Phase 7 Plan 1: Risk Assessment Schema & Types Summary

**One-liner:** Enhanced risk assessment Zod schema with structured citations, perspective enum, atypical language detection, and negotiation suggestions; risk scorer types updated with perspective-aware input/output.

---

## Frontmatter

- **Phase:** 07-risk-scoring
- **Plan:** 01
- **Subsystem:** agents/types
- **Tags:** zod, schema, risk-scoring, perspective, citations
- **Requires:** Phase 6 (CUAD Classification)
- **Provides:** Enhanced risk assessment schema and updated risk scorer types for Plans 02-04
- **Affects:** 07-02 (prompt), 07-03 (pipeline), 07-04 (UI)

### Tech Stack

- **Added:** None (no new libraries)
- **Patterns:** Perspective enum pattern, structured evidence schema, legacy-to-enhanced transformation bridge

### Key Files

- **Modified:** `agents/types.ts`, `agents/risk-scorer.ts`, `agents/risk-scorer.test.ts`
- **Created:** None

---

## What Was Done

### Task 1: Enhanced Risk Assessment Schema (agents/types.ts)

Added three new schema definitions to `agents/types.ts`:

1. **`perspectiveSchema`** and `Perspective` type -- enum of `'receiving' | 'disclosing' | 'balanced'` for assessment perspective parameter
2. **`enhancedRiskAssessmentSchema`** -- Zod schema for the risk scorer LLM output with:
   - Structured citations (`{ text, sourceType }` objects instead of plain strings)
   - Structured references (`{ sourceId, source, section, similarity, summary }`)
   - `atypicalLanguage` boolean flag with optional note
   - `negotiationSuggestion` optional field
   - `baselineComparison` for template-based comparison text
   - Field-level `.max()` constraints and `.describe()` annotations for LLM guidance
3. **`EnhancedRiskAssessment`** TypeScript type inferred from the schema

The original `riskAssessmentSchema` and `RiskAssessment` interface are preserved for backward compatibility (used by existing tests and gap analyst).

### Task 2: Updated Risk Scorer Types (agents/risk-scorer.ts)

Updated the three core interfaces:

- **`RiskScorerInput`**: Added optional `perspective?: Perspective` (defaults to `'balanced'`)
- **`RiskAssessmentResult`**: New evidence structure with structured citations/references, plus `atypicalLanguage`, `atypicalLanguageNote`, `negotiationSuggestion` fields
- **`RiskScorerOutput`**: Added `perspective`, `executiveSummary` (placeholder), `riskDistribution` (Record<RiskLevel, number>)

Implementation bridge:
- The LLM call still uses the old `riskAssessmentSchema` (to be switched in Plan 02)
- Legacy evidence shape (`citations: string[]`) is transformed to enhanced structure (`citations: Array<{text, sourceType}>`)
- Vector search results are mapped to structured references with `sourceId`, `source`, `similarity`, `summary`
- `atypicalLanguage` defaults to `false`, `executiveSummary` defaults to `''` (filled in Plan 03)
- Added `computeRiskDistribution()` helper function

Tests updated:
- Existing assertions updated for new evidence shape
- 2 new tests: perspective parameter acceptance and structured evidence references from vector search
- All 21 tests pass (14 types + 7 risk-scorer)

---

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Keep original `riskAssessmentSchema` alongside `enhancedRiskAssessmentSchema` | Backward compatibility with existing tests and gap analyst |
| 2 | Bridge transformation from legacy to enhanced evidence in risk-scorer.ts | Allows incremental migration; Plan 02 will switch LLM schema and remove bridge |
| 3 | `computeRiskDistribution` uses explicit object literal initialization | Avoids runtime dependency on `RISK_LEVELS` array; all four keys initialized to 0 |
| 4 | `executiveSummary` initialized to empty string | Placeholder until Plan 03 implements executive summary generation |

---

## Deviations from Plan

None -- plan executed exactly as written.

---

## Verification

- `pnpm build` passes (zero TypeScript errors)
- `pnpm lint` clean on modified files (pre-existing `index.js` error unrelated)
- `agents/types.ts` exports `enhancedRiskAssessmentSchema`, `Perspective`, `perspectiveSchema`, `EnhancedRiskAssessment`
- `agents/risk-scorer.ts` exports updated `RiskScorerInput`, `RiskAssessmentResult`, `RiskScorerOutput`
- All 21 agent tests pass

---

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `71f3c73` | feat(07-01): add enhanced risk assessment schema with perspective support |
| 2 | `a71f260` | feat(07-01): update risk scorer types with perspective and structured evidence |

---

## Metrics

- **Duration:** ~8 min
- **Completed:** 2026-02-05
- **Tasks:** 2/2

---

## Next Phase Readiness

Plan 07-02 can proceed immediately. It will:
1. Switch the LLM call from `riskAssessmentSchema` to `enhancedRiskAssessmentSchema`
2. Implement perspective-aware system/user prompts
3. Remove the legacy-to-enhanced transformation bridge

No blockers or concerns.
