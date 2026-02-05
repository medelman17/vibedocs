# Phase 7: Risk Scoring - Research

**Researched:** 2026-02-05
**Domain:** LLM-powered legal clause risk assessment with RAG evidence grounding
**Confidence:** HIGH (codebase-driven, patterns established in prior phases)

## Summary

This phase enhances the existing risk scorer agent to meet the user's decisions from the discuss phase. The current implementation (`agents/risk-scorer.ts`) already runs as a pipeline stage inside Inngest, processes clauses one-at-a-time via `generateText` with `Output.object`, and uses `findSimilarClauses` for RAG retrieval. However, it has significant gaps relative to the CONTEXT.md requirements:

1. **No perspective awareness** -- the current prompt is perspective-agnostic (no receiving/disclosing/balanced toggle).
2. **No Bonterms/template baseline comparison** -- only queries `findSimilarClauses` against general reference embeddings, not template-specific baselines.
3. **No structured citation references** -- the LLM outputs free-text citations/comparisons, not source IDs + section paths that enable verification.
4. **No negotiation suggestions** -- the current explanation is just risk assessment, not actionable advice.
5. **No atypical language detection** -- not flagging unusual wording even when substance is standard.
6. **No persistence of risk assessments** -- the pipeline writes `overallRiskScore` and `overallRiskLevel` to `analyses`, but does NOT persist per-clause risk assessments to `clauseExtractions`. The `clauseExtractions` table has `riskLevel`, `riskExplanation`, and `evidence` columns, but they are never populated by the current pipeline.
7. **No re-scoring support** -- no mechanism to trigger re-scoring with a different perspective without re-running the entire pipeline.
8. **No executive summary** -- the `summary` field on `analyses` is never populated.
9. **The `cuadCategories.riskWeight` column exists** but is never queried for weighted scoring.

**Primary recommendation:** Refactor the risk scorer agent's prompt, schema, and evidence retrieval to support perspective-aware assessment with structured citations, then add a persistence step to `clauseExtractions` and a re-scoring server action. Use the existing `cuadCategories.riskWeight` column for weighted document-level scoring.

## Standard Stack

### Core (Already in Project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | v6 | `generateText` + `Output.object` for structured LLM output | Already used by all agents; provides type-safe structured output via Zod |
| `zod` | v4 | Schema definition for risk assessment output | Already used for all agent schemas; `.issues` not `.errors` per CLAUDE.md |
| Drizzle ORM | latest | Database queries for reference data and result persistence | Already used for all DB operations |
| `lru-cache` | latest | Caching vector search results | Already used in `agents/tools/vector-search.ts` |
| Inngest | latest | Durable workflow orchestration | Pipeline already runs inside Inngest steps |

### Supporting (Already in Project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Voyage AI (`voyage-law-2`) | 1024-dim | Embedding generation for baseline comparison queries | When retrieving template baselines for comparison |
| `cosineDistance` (Drizzle) | -- | pgvector similarity queries | When finding similar reference clauses and templates |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One-at-a-time LLM calls per clause | Batching (like classifier does) | Batching reduces API calls ~75%, but risk scoring needs full RAG context per clause which makes batching harder (each clause needs different references). Consider batching 2-3 clauses if token budget allows. |
| Free-text citations | Structured reference IDs + sections | More complex schema but enables verification pipeline (RSK-05) |

**Installation:** No new packages needed. All dependencies are already in the project.

## Architecture Patterns

### Recommended Changes to Existing Structure

```
agents/
├── risk-scorer.ts              # Refactor: add perspective, batching, structured citations
├── prompts/
│   └── risk-scorer.ts          # Refactor: perspective-aware prompt, negotiation suggestions
├── tools/
│   └── vector-search.ts        # Extend: add findTemplateBaselines helper
├── types.ts                    # Extend: enhanced risk assessment schema
├── validation/
│   └── gates.ts                # Add: risk scorer validation gate
db/
├── queries/
│   └── risk-scoring.ts         # NEW: risk scoring queries (persist, re-score, executive summary)
app/(main)/(dashboard)/analyses/
│   └── actions.ts              # Extend: add re-score action, perspective toggle
components/artifact/
│   └── analysis-view.tsx       # Extend: evidence expandable, perspective toggle, executive summary
inngest/functions/
│   └── analyze-nda.ts          # Extend: persist risk results to clauseExtractions
```

### Pattern 1: Perspective-Aware Risk Assessment

**What:** The system prompt and user prompt include the assessment perspective (receiving party, disclosing party, balanced/neutral). The LLM adjusts its risk assessment accordingly -- a clause favorable to the disclosing party would be "standard" from the disclosing perspective but "cautious" from the receiving perspective.

**When to use:** Every risk scoring call.

**Example:**
```typescript
// Enhanced risk assessment schema
const enhancedRiskAssessmentSchema = z.object({
  riskLevel: riskLevelSchema,
  confidence: z.number().min(0).max(1),
  explanation: z.string().max(500),
  negotiationSuggestion: z.string().max(200).optional(),
  atypicalLanguage: z.boolean(),
  atypicalLanguageNote: z.string().max(200).optional(),
  evidence: z.object({
    citations: z.array(z.object({
      text: z.string(),
      sourceType: z.enum(['clause', 'reference', 'template']),
    })).min(1),
    references: z.array(z.object({
      sourceId: z.string(),
      source: z.enum(['cuad', 'contract_nli', 'bonterms', 'commonaccord']),
      section: z.string().optional(),
      similarity: z.number().min(0).max(1),
      summary: z.string().max(200),
    })).max(5),
    baselineComparison: z.string().max(300).optional(),
  }),
})
```

### Pattern 2: Multi-Source Evidence Retrieval

**What:** For each clause, retrieve evidence from three sources before calling the LLM:
1. **Category-filtered reference clauses** via `findSimilarClauses` (existing)
2. **Template baselines** via `findSimilarTemplates` from `db/queries/similarity.ts` (exists but unused by risk scorer)
3. **ContractNLI spans** by querying `referenceEmbeddings` with `granularity = 'span'` and relevant `hypothesisId`

**When to use:** During evidence retrieval step before each LLM call.

**Example:**
```typescript
// Three-source evidence retrieval
async function retrieveEvidence(clauseText: string, category: CuadCategory) {
  const embedding = await voyageClient.embed(clauseText, 'query')

  const [references, templates, nliSpans] = await Promise.all([
    findSimilarClauses(clauseText, { category, limit: 3 }),
    findSimilarTemplates(embedding.embedding, { limit: 2 }),
    findNliSpansForCategory(embedding.embedding, category, { limit: 2 }),
  ])

  return { references, templates, nliSpans }
}
```

### Pattern 3: Re-Scoring Without Full Pipeline Re-Run

**What:** A server action that re-runs only the risk scoring step for an existing analysis, using a different perspective. This reads existing classifications from `chunkClassifications`, reconstructs the `ClassifiedClause[]` array, and runs the risk scorer agent with the new perspective.

**When to use:** When user toggles perspective in the UI.

**Example:**
```typescript
// Server action for re-scoring
export async function rescoreAnalysis(
  analysisId: string,
  perspective: 'receiving' | 'disclosing' | 'balanced'
): Promise<ApiResponse<void>> {
  const { db, tenantId } = await withTenant()

  // 1. Load existing classifications
  const classifications = await getClassificationsByPosition(analysisId, tenantId)

  // 2. Reconstruct ClassifiedClause[] from chunk data
  const clauses = await reconstructClausesFromClassifications(db, classifications)

  // 3. Run risk scorer with new perspective
  const budgetTracker = new BudgetTracker()
  const riskResult = await runRiskScorerAgent({
    clauses,
    budgetTracker,
    perspective,
  })

  // 4. Persist results (upsert clauseExtractions)
  await persistRiskAssessments(db, tenantId, analysisId, riskResult)

  // 5. Update analysis-level score
  await updateAnalysisRiskScore(db, analysisId, riskResult)

  return ok(undefined)
}
```

### Pattern 4: Clause Extraction Persistence

**What:** After risk scoring completes in the pipeline, persist each assessment to the `clauseExtractions` table. This table already has `riskLevel`, `riskExplanation`, and `evidence` columns -- they just aren't populated.

**When to use:** After the risk scorer agent step in `analyze-nda.ts`.

**Example:**
```typescript
// In analyze-nda.ts, after risk-scorer-agent step
await step.run('persist-risk-assessments', async () => {
  const values = riskResult.assessments.map(assessment => ({
    tenantId,
    analysisId,
    documentId,
    chunkId: assessment.clauseId,
    category: assessment.clause.category,
    secondaryCategories: assessment.clause.secondaryCategories,
    clauseText: assessment.clause.clauseText,
    startPosition: assessment.startPosition,
    endPosition: assessment.endPosition,
    confidence: assessment.clause.confidence,
    riskLevel: assessment.riskLevel,
    riskExplanation: assessment.explanation,
    evidence: assessment.evidence,
    metadata: {
      perspective: 'balanced',
      riskConfidence: assessment.confidence,
      atypicalLanguage: assessment.atypicalLanguage,
      negotiationSuggestion: assessment.negotiationSuggestion,
    },
  }))

  // Upsert: ON CONFLICT (analysisId, chunkId) DO UPDATE
  for (let i = 0; i < values.length; i += 100) {
    const batch = values.slice(i, i + 100)
    await ctx.db
      .insert(clauseExtractions)
      .values(batch)
      .onConflictDoUpdate({
        target: [clauseExtractions.analysisId, clauseExtractions.chunkId],
        set: {
          riskLevel: sql`EXCLUDED.risk_level`,
          riskExplanation: sql`EXCLUDED.risk_explanation`,
          evidence: sql`EXCLUDED.evidence`,
          metadata: sql`EXCLUDED.metadata`,
          updatedAt: new Date(),
        },
      })
  }
})
```

### Pattern 5: Weighted Document-Level Score Using cuadCategories

**What:** Query `cuadCategories.riskWeight` from the database to compute a weighted document-level score instead of the current uniform weighting.

**When to use:** In `calculateOverallRisk` function.

**Example:**
```typescript
async function calculateWeightedRisk(
  assessments: RiskAssessmentResult[]
): Promise<{ score: number; level: RiskLevel }> {
  // Fetch category weights from DB
  const categories = await db
    .select({ name: cuadCategories.name, weight: cuadCategories.riskWeight })
    .from(cuadCategories)

  const weightMap = new Map(categories.map(c => [c.name, c.weight ?? 1.0]))

  const riskValues: Record<RiskLevel, number> = {
    aggressive: 1.0,
    cautious: 0.5,
    standard: 0.0,
    unknown: 0.25,
  }

  let weightedSum = 0
  let totalWeight = 0

  for (const assessment of assessments) {
    const categoryWeight = weightMap.get(assessment.clause.category) ?? 1.0
    weightedSum += riskValues[assessment.riskLevel] * categoryWeight
    totalWeight += categoryWeight
  }

  const normalizedScore = totalWeight > 0
    ? Math.round((weightedSum / totalWeight) * 100)
    : 0

  const level: RiskLevel =
    normalizedScore >= 60 ? 'aggressive'
    : normalizedScore >= 30 ? 'cautious'
    : 'standard'

  return { score: normalizedScore, level }
}
```

### Anti-Patterns to Avoid

- **Pre-computing all perspectives:** The user decided re-scoring triggers on toggle, not pre-computed. Don't score 3x during initial pipeline run.
- **Hallucinating citations:** RSK-05 requires citation verification. The structured reference schema with `sourceId` enables post-hoc verification against the database. Don't use free-text citations that can't be verified.
- **Blocking re-score on Inngest:** Re-scoring a single analysis is fast enough (~15 clauses x 1 LLM call each) to run as a server action, not a separate Inngest function. Keep it simple.
- **Barrel export danger:** Don't add `risk-scoring` queries to a barrel export. Import directly per CLAUDE.md rules.
- **Modifying the analyses schema:** The schema already has all needed columns (`overallRiskScore`, `overallRiskLevel`, `summary`). The `clauseExtractions` table also has all needed columns. No migrations needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity search | Custom embedding + distance calculation | `findSimilarClauses` + `findSimilarTemplates` from existing codebase | Already optimized with LRU cache, pgvector HNSW indexes |
| Category weighting | Hardcoded weight arrays | `cuadCategories.riskWeight` from database | Already seeded during bootstrap; can be tuned without code changes |
| Structured output parsing | JSON.parse + manual validation | AI SDK `Output.object` + Zod schema | Type-safe, handles retries on malformed output |
| Rate limiting | Custom delays | `getRateLimitDelay('claude')` + `step.sleep` | Already calibrated for Claude 60 RPM |
| Budget tracking | Custom token counters | `BudgetTracker` class | Already integrated with all agents |

**Key insight:** The entire infrastructure for this phase already exists. The risk scorer agent, vector search, database tables, budget tracking, Inngest pipeline, and UI components are all in place. This phase is primarily about enriching the prompt, schema, and adding persistence -- not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Schema Mismatch Between Agent Output and DB Columns

**What goes wrong:** The `clauseExtractions.riskLevel` column currently stores `'low' | 'medium' | 'high' | 'critical'` (per the schema comments), but the PRD uses `'standard' | 'cautious' | 'aggressive' | 'unknown'`.

**Why it happens:** The schema was written early before the risk level terminology was settled. The column type is `text` so any value works, but the comments and existing queries (like `getHighRiskClauses`) filter on `'aggressive'` -- which IS the correct PRD value.

**How to avoid:** Use the PRD risk levels consistently. The column type is `text` (not an enum), so there's no constraint violation. Update schema comments to match.

**Warning signs:** If you see `'low'`, `'medium'`, `'high'`, or `'critical'` anywhere in risk level context, it's using the old nomenclature.

### Pitfall 2: Token Budget Exhaustion on Large Documents

**What goes wrong:** Risk scorer gets ~80K tokens from the budget. With ~15 clauses, that's ~5.3K per clause. Each clause needs: clause text (~500 tokens) + 3 reference clauses (~1500 tokens) + 2 template baselines (~1000 tokens) + system prompt (~800 tokens) + output (~500 tokens) = ~4300 tokens. This is tight if documents have many clauses.

**Why it happens:** Adding template baselines and NLI spans increases per-clause token consumption beyond the original budget.

**How to avoid:** Cap reference count per source (3 references + 2 templates + 2 NLI spans = 7 max). Truncate reference content to 200 chars each. Monitor budget via `budgetTracker.isWarning` and reduce reference count if approaching limit.

**Warning signs:** `budgetTracker.isExceeded` returns true mid-scoring.

### Pitfall 3: Re-Scoring Race Conditions

**What goes wrong:** User clicks perspective toggle rapidly, triggering multiple concurrent re-scores that write conflicting data.

**Why it happens:** Server actions are not automatically debounced.

**How to avoid:** Use optimistic UI with a debounce on the toggle. Add a `perspective` column to `analyses` so the UI knows which perspective the current scores reflect. Consider a simple mutex (e.g., check `analyses.status !== 'processing'` before starting re-score).

**Warning signs:** Inconsistent risk levels across clauses after rapid toggling.

### Pitfall 4: Empty Evidence When No Reference Match Exists

**What goes wrong:** The CONTEXT.md says "still score with caveat" when no reference match exists. If the vector search returns empty results, the prompt needs graceful handling.

**Why it happens:** The existing `findSimilarClauses` returns empty arrays when similarity is below 0.5 threshold.

**How to avoid:** The existing prompt already handles this: `createRiskScorerPrompt` shows "No references available" for empty results. Ensure the enhanced prompt also handles empty template baselines and NLI spans gracefully. The schema should allow `references` to be an empty array.

**Warning signs:** `NoObjectGeneratedError` when the LLM can't produce valid evidence with empty context.

### Pitfall 5: Perspective Not Stored With Results

**What goes wrong:** After re-scoring, there's no record of which perspective was used, so the UI can't display the correct toggle state.

**Why it happens:** The current schema doesn't have a `perspective` field.

**How to avoid:** Store perspective in `analyses.metadata` as `{ perspective: 'balanced' }`. On re-score, update this field. The UI reads it to set the toggle default.

**Warning signs:** Toggle resets to default after page refresh.

## Code Examples

### Enhanced Risk Scorer System Prompt

```typescript
// Source: Adapted from agents/prompts/risk-scorer.ts
export function createRiskScorerSystemPrompt(
  perspective: 'receiving' | 'disclosing' | 'balanced'
): string {
  const perspectiveDescriptions = {
    receiving: 'You are assessing risk FROM THE PERSPECTIVE OF THE RECEIVING PARTY (the party receiving confidential information). Clauses that favor the disclosing party or restrict the receiving party increase risk.',
    disclosing: 'You are assessing risk FROM THE PERSPECTIVE OF THE DISCLOSING PARTY (the party sharing confidential information). Clauses that insufficiently protect disclosed information or give the receiving party too much latitude increase risk.',
    balanced: 'You are assessing risk FROM A BALANCED/NEUTRAL PERSPECTIVE. Evaluate whether the clause is fair to both parties. One-sided clauses in either direction increase risk.',
  }

  return `You are a legal risk assessment expert specializing in NDA analysis.
${perspectiveDescriptions[perspective]}

## Risk Levels
- **standard**: Normal, market-friendly terms found in most NDAs. Balanced obligations.
- **cautious**: Slightly one-sided but generally acceptable. Minor negotiation may be warranted.
- **aggressive**: Clearly one-sided or unusual provisions. Significant exposure, negotiate.
- **unknown**: Cannot determine risk level due to ambiguous or unclear language.

## Assessment Approach
Compare the clause against Bonterms/standard NDA baselines. Deviation from market standard determines risk level.

## Explanation Requirements
1. Lead with the risk implication (risk-first pattern)
2. Explain why in plain language (VP of Sales audience)
3. For non-standard clauses, include a concrete negotiation suggestion
4. Flag atypical language even when substance is standard
5. 2-3 sentences maximum

## Evidence Requirements (MANDATORY)
1. Quote specific text from the clause
2. Reference similar clauses from the reference corpus with source labels
3. Compare to template baseline when available
4. When no reference match exists, note: "No reference corpus match — assessment based on legal analysis only"

Return JSON matching the required schema.`
}
```

### Enhanced Risk Scorer User Prompt

```typescript
export function createEnhancedRiskScorerPrompt(
  clauseText: string,
  category: string,
  references: VectorSearchResult[],
  templates: VectorSearchResult[],
  nliSpans: VectorSearchResult[],
  perspective: 'receiving' | 'disclosing' | 'balanced'
): string {
  const refBlock = references.length > 0
    ? references
        .map((r, i) => `[REF-${i + 1}] Source: ${r.source} | Category: ${r.category} | Similarity: ${Math.round(r.similarity * 100)}%\n${r.content.slice(0, 300)}`)
        .join('\n\n')
    : 'No reference corpus matches found.'

  const templateBlock = templates.length > 0
    ? templates
        .map((t, i) => `[TPL-${i + 1}] Source: ${t.source} | Similarity: ${Math.round(t.similarity * 100)}%\n${t.content.slice(0, 300)}`)
        .join('\n\n')
    : 'No template baselines available.'

  const nliBlock = nliSpans.length > 0
    ? nliSpans
        .map((n, i) => `[NLI-${i + 1}] Source: ContractNLI | Category: ${n.category}\n${n.content.slice(0, 200)}`)
        .join('\n\n')
    : 'No NLI evidence available.'

  return `## Clause to Assess
Category: ${category}
Perspective: ${perspective}

${clauseText}

## Reference Clauses (from CUAD corpus)
${refBlock}

## Template Baselines (from Bonterms/CommonAccord)
${templateBlock}

## NLI Evidence Spans
${nliBlock}

Assess the risk level from the ${perspective} perspective. Return JSON only.`
}
```

### Persistence Step (analyze-nda.ts Addition)

```typescript
// After risk-scorer-agent step, before gap-analyst-agent
await step.run('persist-risk-assessments', async () => {
  const clauseValues = riskResult.assessments.map(a => ({
    tenantId,
    analysisId,
    documentId,
    chunkId: a.clauseId,
    category: a.clause.category,
    secondaryCategories: a.clause.secondaryCategories,
    clauseText: a.clause.clauseText,
    startPosition: a.startPosition,
    endPosition: a.endPosition,
    confidence: a.clause.confidence,
    riskLevel: a.riskLevel,
    riskExplanation: a.explanation,
    evidence: {
      citations: a.evidence.citations,
      references: a.evidence.references,
      baselineComparison: a.evidence.baselineComparison,
      riskConfidence: a.confidence,
      atypicalLanguage: a.atypicalLanguage,
      negotiationSuggestion: a.negotiationSuggestion,
    },
    metadata: { perspective: 'balanced' },
  }))

  const BATCH_SIZE = 100
  for (let i = 0; i < clauseValues.length; i += BATCH_SIZE) {
    const batch = clauseValues.slice(i, i + BATCH_SIZE)
    await ctx.db.insert(clauseExtractions).values(batch).onConflictDoNothing()
  }
})
```

### Executive Summary Generation

```typescript
// After risk scoring, generate executive summary for the analyses.summary field
function generateExecutiveSummary(
  assessments: RiskAssessmentResult[],
  overallScore: number,
  overallLevel: RiskLevel
): string {
  // Sort by risk severity (aggressive first)
  const riskOrder: Record<RiskLevel, number> = {
    aggressive: 0, cautious: 1, unknown: 2, standard: 3
  }
  const sorted = [...assessments].sort(
    (a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]
  )

  // Top 3-5 riskiest clauses
  const topRisks = sorted
    .filter(a => a.riskLevel !== 'standard')
    .slice(0, 5)

  const riskCounts = assessments.reduce((acc, a) => {
    acc[a.riskLevel] = (acc[a.riskLevel] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  let summary = `Overall Risk: ${overallLevel} (${overallScore}/100). `
  summary += `${assessments.length} clauses analyzed: `
  summary += Object.entries(riskCounts)
    .map(([level, count]) => `${count} ${level}`)
    .join(', ') + '. '

  if (topRisks.length > 0) {
    summary += '\n\nKey Findings:\n'
    topRisks.forEach((risk, i) => {
      summary += `${i + 1}. ${risk.clause.category}: ${risk.explanation}\n`
    })
  }

  return summary
}
```

## Discretion Recommendations

The CONTEXT.md lists several areas as Claude's discretion. Here are my recommendations:

### "Unknown" Risk Level Threshold and Criteria

**Recommendation:** Assign `unknown` when:
- Classification confidence < 0.5 (clause type itself is uncertain)
- Risk confidence < 0.4 (LLM is unsure about the risk assessment)
- Clause text is < 20 words (too short for meaningful assessment)
- No reference matches AND clause doesn't clearly fit any risk pattern

**Rationale:** These thresholds are conservative. Better to flag for human review than to misclassify.

### Mutual vs Unilateral NDA Baselines

**Recommendation:** Do NOT differentiate at this stage. The Bonterms template is a mutual NDA. For MVP, treat all NDAs against the mutual NDA baseline. This simplifies the prompt and avoids needing to first classify the NDA type before scoring.

**Rationale:** Most NDAs in the target audience (VPs of Sales, startup founders) are mutual NDAs. Unilateral NDA differentiation can be added later when the user base demands it.

### Explicit vs Implicit Baseline Comparison

**Recommendation:** Use explicit baseline comparison when a template match exists (similarity > 0.7). Use implicit baseline (general market standard language) when no template match exists. The prompt should instruct the LLM to state the comparison explicitly when a template is available: "Compared to the Bonterms Standard NDA, this clause..."

### Citation Count Per Assessment

**Recommendation:** 1-3 references per assessment. Quality over quantity. At minimum: 1 clause text citation (from the analyzed clause itself). Ideally: 1 reference corpus match + 1 template baseline comparison. Maximum: 3 references + 2 template comparisons.

### Citation Verification Strictness

**Recommendation:** Semantic match (not exact match). The LLM outputs `sourceId` values from references provided in its context. Post-hoc verification checks that the `sourceId` exists in `referenceEmbeddings`. This catches hallucinated reference IDs without requiring exact text matching.

**Implementation:** After the LLM returns structured references, validate each `sourceId` exists in the database. Log but don't fail if verification fails (some references may be paraphrased).

### Category Weighting Strategy

**Recommendation:** Use importance-weighted scoring via `cuadCategories.riskWeight`. Default weight is 1.0. High-impact categories should have higher weights:
- **Weight 2.0:** Uncapped Liability, Cap On Liability, Non-Compete, Exclusivity
- **Weight 1.5:** Liquidated Damages, Anti-Assignment, Change Of Control, Ip Ownership Assignment
- **Weight 1.0:** Everything else

These weights should be seeded during bootstrap and stored in the database so they can be tuned without code changes.

## State of the Art

| Old Approach (Current) | New Approach (Phase 7) | Impact |
|------------------------|------------------------|--------|
| Perspective-agnostic scoring | Perspective-aware (receiving/disclosing/balanced) | User can see risk from their position in the NDA |
| Free-text citations | Structured references with sourceId + section | Enables citation verification (RSK-05) |
| No template baseline comparison | Multi-source RAG (CUAD + templates + NLI) | More grounded, evidence-based assessments |
| No persistence to clauseExtractions | Clause-level risk persistence | Risk data queryable and filterable |
| Uniform category weighting | Database-driven importance weighting | More accurate document-level scores |
| No negotiation suggestions | Actionable suggestions per non-standard clause | Higher user value |
| No executive summary | Top-N risky clauses highlighted | Quick decision-making |

## Open Questions

1. **Inngest vs Server Action for Re-Scoring**
   - What we know: Re-scoring ~15 clauses takes ~15 LLM calls, each ~2-3 seconds = ~45 seconds total. This is borderline for a server action (Next.js default timeout is 30s on Vercel).
   - What's unclear: Whether Vercel's serverless function timeout will be an issue.
   - Recommendation: Use Inngest for re-scoring too, with the same progress tracking pattern. The UI shows a mini progress indicator during re-score. This keeps the pattern consistent and avoids timeout issues.

2. **Schema Migration for `perspective` Column**
   - What we know: The `analyses.metadata` JSONB field can store perspective without a migration. But the `clauseExtractions` table doesn't have a `perspective` column.
   - What's unclear: Whether we need a dedicated column or JSONB metadata is sufficient.
   - Recommendation: Use `analyses.metadata.perspective` and `clauseExtractions.metadata.perspective`. No migration needed. If we later need to query by perspective, add a column then.

3. **Bonterms Template Data Availability**
   - What we know: The bootstrap pipeline ingests Bonterms data and stores template-granularity embeddings. The `findSimilarTemplates` query function exists.
   - What's unclear: Whether the bootstrap has actually been run and Bonterms data exists in the database for the development environment.
   - Recommendation: Handle gracefully (empty templates = "No template baseline available"). Add a check/log during risk scoring initialization.

## Sources

### Primary (HIGH confidence)
- `/Users/medelman/GitHub/medelman17/vibedocs/agents/risk-scorer.ts` -- Current risk scorer implementation
- `/Users/medelman/GitHub/medelman17/vibedocs/agents/prompts/risk-scorer.ts` -- Current prompt
- `/Users/medelman/GitHub/medelman17/vibedocs/agents/types.ts` -- Risk assessment schema
- `/Users/medelman/GitHub/medelman17/vibedocs/inngest/functions/analyze-nda.ts` -- Pipeline orchestration
- `/Users/medelman/GitHub/medelman17/vibedocs/db/schema/analyses.ts` -- Database tables (analyses, clauseExtractions, chunkClassifications)
- `/Users/medelman/GitHub/medelman17/vibedocs/db/schema/reference.ts` -- Reference data tables (cuadCategories, referenceEmbeddings)
- `/Users/medelman/GitHub/medelman17/vibedocs/db/queries/similarity.ts` -- findSimilarTemplates query
- `/Users/medelman/GitHub/medelman17/vibedocs/db/queries/classifications.ts` -- Classification queries
- `/Users/medelman/GitHub/medelman17/vibedocs/agents/tools/vector-search.ts` -- Vector search tool
- `/Users/medelman/GitHub/medelman17/vibedocs/components/artifact/analysis-view.tsx` -- Current analysis UI
- `/Users/medelman/GitHub/medelman17/vibedocs/app/(main)/(dashboard)/analyses/actions.ts` -- Server actions
- `/Users/medelman/GitHub/medelman17/vibedocs/.planning/phases/07-risk-scoring/07-CONTEXT.md` -- User decisions

### Secondary (MEDIUM confidence)
- Context7: Vercel AI SDK documentation for `generateText` + `Output.object` patterns
- `/Users/medelman/GitHub/medelman17/vibedocs/docs/PRD.md` -- PRD F-003 Risk Analysis specification
- `/Users/medelman/GitHub/medelman17/vibedocs/docs/agents.md` -- Agent architecture specs

### Tertiary (LOW confidence)
- None -- all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, all patterns established
- Architecture: HIGH -- patterns derived from existing classifier and pipeline implementations
- Pitfalls: HIGH -- identified from actual codebase state (e.g., schema mismatch between comments and PRD)
- Discretion items: MEDIUM -- recommendations based on domain analysis and codebase constraints

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (stable -- no external dependencies to version-track)
