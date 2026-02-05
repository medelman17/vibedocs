# Phase 7 Plan 2: Perspective-Aware Risk Scoring with Multi-Source Evidence Summary

**One-liner:** Perspective-aware risk scorer with parallel evidence retrieval from CUAD, template baselines, and ContractNLI spans; enhanced prompts, citation verification, and executive summary generation.

---

## Frontmatter

- **Phase:** 07-risk-scoring
- **Plan:** 02
- **Subsystem:** agents/risk-scorer, agents/prompts, agents/tools
- **Tags:** risk-scoring, perspective, evidence-retrieval, citations, prompts
- **Requires:** Phase 7 Plan 01 (Enhanced Risk Assessment Schema & Types)
- **Provides:** Working risk scorer agent with perspective-aware assessments and structured evidence
- **Affects:** 07-03 (pipeline integration), 07-04 (UI)

### Tech Stack

- **Added:** None (no new libraries)
- **Patterns:** Multi-source parallel evidence retrieval, citation verification against reference DB, perspective-aware prompt generation

### Key Files

- **Modified:** `agents/risk-scorer.ts`, `agents/risk-scorer.test.ts`, `agents/prompts/risk-scorer.ts`, `agents/tools/vector-search.ts`
- **Created:** None

---

## What Was Done

### Task 1: Refactor prompts and add multi-source evidence helpers

**Part A: Perspective-aware prompts (`agents/prompts/risk-scorer.ts`)**

1. Replaced static `RISK_SCORER_SYSTEM_PROMPT` with `createRiskScorerSystemPrompt(perspective)` function:
   - `receiving`: Assesses from receiving party perspective (clauses favoring discloser = higher risk)
   - `disclosing`: Assesses from disclosing party perspective (clauses giving receiver latitude = higher risk)
   - `balanced`: Neutral perspective (one-sided clauses in either direction = higher risk)
   - Includes risk-first explanation requirements, VP of Sales audience, negotiation suggestions, atypical language detection
   - Includes evidence requirements matching enhancedRiskAssessmentSchema JSON structure
   - Instructs LLM to only use sourceIds provided in context (prevents hallucination)

2. Added `createEnhancedRiskScorerPrompt(clauseText, category, references, templates, nliSpans, perspective)`:
   - Three evidence blocks: `[REF-N]` for CUAD references, `[TPL-N]` for template baselines, `[NLI-N]` for ContractNLI spans
   - Each block shows source, category, ID, similarity percentage, and truncated content
   - Falls back to "No X available." when empty

3. Preserved backward-compatible exports:
   - `RISK_SCORER_SYSTEM_PROMPT` = `createRiskScorerSystemPrompt('balanced')`
   - `createRiskScorerPrompt` retained with `@deprecated` annotation

**Part B: Evidence retrieval helpers (`agents/tools/vector-search.ts`)**

1. `findTemplateBaselines(clauseText, options?)`:
   - Generates embedding via Voyage AI, queries `findSimilarReferences` with `granularity: 'template'`
   - Default limit 2, threshold 0.5
   - Cached via existing `searchCache` with `tpl:` prefix
   - Returns `[]` gracefully on any error (no throw)

2. `findNliSpans(clauseText, options?)`:
   - Generates embedding, queries `findSimilarReferences` with `granularity: 'span'`
   - Optional category filter for targeted NLI evidence
   - Default limit 2, threshold 0.5
   - Cached via `searchCache` with `nli:` prefix
   - Returns `[]` gracefully on any error

Both helpers import `findSimilarReferences` directly from `@/db/queries/similarity` (no barrel export).

### Task 2: Implement multi-source evidence retrieval and enhanced scoring loop

1. **Multi-source evidence retrieval** (parallel via `Promise.all`):
   - CUAD references via `findSimilarClauses` (limit 3)
   - Template baselines via `findTemplateBaselines` (limit 2)
   - NLI spans via `findNliSpans` (limit 2)

2. **Enhanced LLM call**:
   - Uses `enhancedRiskAssessmentSchema` (replacing legacy `riskAssessmentSchema`)
   - Perspective-aware system prompt cached across clauses
   - Enhanced user prompt includes all three evidence sources

3. **Citation verification (RSK-05)**:
   - `verifyCitations()` function batch-checks sourceIds against `referenceDocuments`
   - Accepts all references (IDs come from our vector search results in the prompt context)
   - Logs informational warnings for sourceIds not found in referenceDocuments

4. **Executive summary generation**:
   - `generateExecutiveSummary(assessments, score, level)` function
   - Sorts assessments by severity (aggressive first)
   - Highlights top 3-5 non-standard clauses as key findings
   - Format: "Overall Risk: {level} ({score}/100). {N} clauses analyzed: {counts}."

5. **Budget-aware reference reduction**:
   - When `budgetTracker.isWarning` is true, reduces limits to 2/1/1 instead of 3/2/2

6. **Tests updated**: 9 tests pass (7 existing updated + 2 new):
   - New: "generates executive summary with key findings"
   - New: "calls all three evidence retrieval sources"

---

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Accept all LLM-generated references, log warnings for unverified sourceIds | IDs come from our own vector search results in prompt context; strict filtering would reject valid referenceEmbeddings IDs not in referenceDocuments |
| 2 | Cache system prompt across clauses in the loop | Same perspective applies to all clauses; avoids redundant string construction |
| 3 | Budget-aware limits: 3/2/2 normal, 2/1/1 on warning | Prevents token exhaustion on large documents while maintaining evidence quality |
| 4 | Executive summary populated in Plan 02 (not Plan 03 as originally planned) | Natural fit since generateExecutiveSummary uses the assessment data already available |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock state persistence across tests**

- **Found during:** Task 2
- **Issue:** `vi.clearAllMocks()` does not reset `mockResolvedValue` overrides from previous tests, causing the "populates structured evidence references" test to receive wrong mock data
- **Fix:** Reset default mock implementation in `beforeEach` via async import and `mockResolvedValue`
- **Files modified:** `agents/risk-scorer.test.ts`
- **Commit:** 646c24d

**2. [Rule 2 - Missing Critical] Executive summary populated early**

- **Found during:** Task 2
- **Issue:** Plan said executiveSummary would be populated in Plan 03, but the data needed was already available after assessment loop
- **Fix:** Implemented `generateExecutiveSummary` in Plan 02 instead of leaving as empty string placeholder
- **Files modified:** `agents/risk-scorer.ts`
- **Commit:** 646c24d

---

## Verification

- `pnpm tsc --noEmit` passes (zero TypeScript errors)
- `pnpm lint` clean on modified files (pre-existing `index.js` error unrelated)
- Risk scorer agent accepts `perspective` parameter and uses it in prompt
- Evidence retrieval queries three sources (CUAD, templates, NLI) in parallel
- Output schema includes structured citations with sourceId/source fields
- Executive summary generated from assessment results with key findings
- 9 risk scorer tests pass

---

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `94306bc` | feat(07-02): add perspective-aware prompts and multi-source evidence helpers |
| 2 | `646c24d` | feat(07-02): implement multi-source evidence retrieval and enhanced scoring loop |

---

## Metrics

- **Duration:** ~7.4 min
- **Completed:** 2026-02-05
- **Tasks:** 2/2

---

## Next Phase Readiness

Plan 07-03 can proceed immediately. It will:
1. Wire the enhanced risk scorer into the Inngest pipeline (persist results to clauseExtractions)
2. Implement weighted risk scoring via cuadCategories.riskWeight
3. Add re-scoring server action for perspective toggle

No blockers or concerns.
