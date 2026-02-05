# Phase 8: Gap Analysis - Research

**Researched:** 2026-02-05
**Domain:** NDA clause gap detection, severity assessment, and recommended language generation
**Confidence:** HIGH (all code is local; no external library research needed)

## Summary

Phase 8 enhances the existing gap analyst agent to provide a richer, more actionable gap analysis experience. The current `runGapAnalystAgent` already identifies missing CUAD categories with importance levels and weak clauses, and tests ContractNLI hypotheses. Phase 8 adds: (1) two-tier gap status (Missing vs. Incomplete), (2) Bonterms baseline comparison for severity tiering, (3) LLM-adapted recommended clause language with source attribution, (4) a coverage summary, (5) a new Gaps tab in the analysis view, and (6) copy/export functionality.

The existing infrastructure is strong. The gap analyst agent (`agents/gap-analyst.ts`), its prompts (`agents/prompts/gap-analyst.ts`), the analysis pipeline (`inngest/functions/analyze-nda.ts`), the vector search tool (`agents/tools/vector-search.ts`), and the analysis view component (`components/artifact/analysis-view.tsx`) all provide solid foundations. The `cuadCategories` table already has `isNdaRelevant` and `riskWeight` fields. Template baselines are retrievable via `findTemplateBaselines()`.

**Primary recommendation:** Enhance the existing gap analyst agent with a new structured output schema, add Bonterms template retrieval to the gap analysis step, persist enhanced gap results as a structured JSONB column (reusing the existing `gapAnalysis` column on `analyses`), and add a Gaps tab to the `AnalysisView` component following the existing `ClassificationView` pattern.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| AI SDK 6 | latest | `generateText` + `Output.object` for structured LLM output | Already used by all 4 agents |
| Zod | 4.x | Schema validation for LLM output | Already used for all agent schemas |
| Drizzle ORM | 0.45+ | Database queries and persistence | Project ORM |
| Voyage AI voyage-law-2 | - | Embeddings for template baseline retrieval | Already used in vector search |
| React 19 + Next.js 16 | - | UI components | Project framework |
| shadcn/ui | latest | Card, Collapsible, Badge, ScrollArea components | Project component library |

### Supporting (No New Dependencies)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `lru-cache` | Caching template baseline search results | Already used in `vector-search.ts` |
| `lucide-react` | Icons for gap severity badges | Already imported in `analysis-view.tsx` |

### Alternatives Considered
None needed. This phase uses entirely existing stack components.

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure (Additions Only)
```
agents/
  gap-analyst.ts              # MODIFY: Enhanced schema, template retrieval, two-tier gaps
  prompts/
    gap-analyst.ts            # MODIFY: Enhanced prompts with template context
  types.ts                    # MODIFY: Add enhanced gap analysis types
db/
  queries/
    gap-analysis.ts           # NEW: Gap-specific queries (fetch enhanced gaps)
app/(main)/(dashboard)/
  analyses/
    actions.ts                # MODIFY: Add getEnhancedGapAnalysis action
components/
  artifact/
    analysis-view.tsx         # MODIFY: Add GapsView tab alongside existing tabs
```

### Pattern 1: Enhanced Gap Analyst Schema

**What:** New Zod schema for the enhanced gap analysis output that includes two-tier status, severity from Bonterms comparison, and recommended language with source attribution.

**When to use:** LLM structured output for the gap analyst agent call.

**Example:**
```typescript
// agents/types.ts
export const GAP_SEVERITY = ['critical', 'important', 'informational'] as const
export type GapSeverity = (typeof GAP_SEVERITY)[number]

export const GAP_STATUS = ['missing', 'incomplete'] as const  // Two-tier
export type GapStatusType = (typeof GAP_STATUS)[number]

export const enhancedGapSchema = z.object({
  gaps: z.array(z.object({
    category: cuadCategorySchema,
    status: z.enum(GAP_STATUS),
    severity: z.enum(GAP_SEVERITY),
    explanation: z.string().max(300),
    suggestedLanguage: z.string().describe('Full clause draft (1-3 paragraphs)'),
    templateSource: z.string().optional().describe('e.g., "Bonterms NDA Section 3.2"'),
    styleMatch: z.string().max(200).optional().describe('How language was adapted to match NDA style'),
  })),
  coverageSummary: z.object({
    totalCategories: z.number(),
    presentCount: z.number(),
    missingCount: z.number(),
    incompleteCount: z.number(),
    coveragePercent: z.number().min(0).max(100),
  }),
  presentCategories: z.array(cuadCategorySchema),
  weakClauses: z.array(z.object({
    clauseId: z.string(),
    category: cuadCategorySchema,
    issue: z.string(),
    recommendation: z.string(),
  })),
})
```

### Pattern 2: Gap Detection Using Classification Results + cuadCategories

**What:** Determine gaps by comparing present categories from classifier output against NDA-relevant categories from the `cuadCategories` table, rather than hardcoding a list.

**When to use:** During gap analyst agent execution, before the LLM call.

**Key insight:** The `cuadCategories` table already has `isNdaRelevant` (boolean) and `riskWeight` (real). Use these to:
1. Filter the taxonomy to NDA-relevant categories only
2. Map `riskWeight` to severity tiers (high weight = critical, medium = important, low = informational)

**Example:**
```typescript
// In agents/gap-analyst.ts
import { cuadCategories } from '@/db/schema/reference'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'

async function getNdaRelevantCategories(): Promise<Array<{
  name: string
  riskWeight: number
  severity: GapSeverity
}>> {
  const categories = await db
    .select({
      name: cuadCategories.name,
      riskWeight: cuadCategories.riskWeight,
    })
    .from(cuadCategories)
    .where(eq(cuadCategories.isNdaRelevant, true))

  return categories.map(cat => ({
    name: cat.name,
    riskWeight: cat.riskWeight ?? 1.0,
    severity: categorySeverity(cat.riskWeight ?? 1.0),
  }))
}

function categorySeverity(weight: number): GapSeverity {
  if (weight >= 1.5) return 'critical'
  if (weight >= 1.0) return 'important'
  return 'informational'
}
```

### Pattern 3: Template Baseline Retrieval for Gap Language

**What:** For each missing/incomplete category, retrieve relevant Bonterms/CommonAccord template sections via `findTemplateBaselines()` to provide source material for recommended language.

**When to use:** Inside the gap analyst agent, between gap detection and LLM call.

**Example:**
```typescript
// For each gap, fetch template baselines
for (const gap of detectedGaps) {
  const templates = await findTemplateBaselines(gap.category, { limit: 2 })
  gap.templateContext = templates.map(t => ({
    content: t.content,
    source: t.source,
    similarity: t.similarity,
  }))
}
```

### Pattern 4: Gaps Tab in AnalysisView (Following Existing UI Pattern)

**What:** Add a "Gaps" section to the `AnalysisView` component, following the same pattern as `ClassificationView` (useEffect fetch on mount/toggle).

**When to use:** Rendering the gaps tab in the analysis view.

**Key:** The existing `AnalysisView` already has:
- Executive Summary (card at top)
- CUAD Classifications (toggle between category/position views)
- Risk Assessments (scrollable list of clause cards)

Add a "Gaps" section between Classifications and Risk Assessments (or as a tabbed view).

**Example:**
```tsx
// Coverage summary card at top of gaps section
function CoverageSummary({ coverage }: { coverage: CoverageSummaryData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Coverage: {coverage.presentCount}/{coverage.totalCategories}</CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={coverage.coveragePercent} />
        <div className="flex gap-2 mt-2">
          <Badge>{coverage.missingCount} missing</Badge>
          <Badge>{coverage.incompleteCount} incomplete</Badge>
        </div>
      </CardContent>
    </Card>
  )
}

// Individual gap card with expandable recommended language
function GapCard({ gap }: { gap: EnhancedGap }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{gap.category}</CardTitle>
            <div className="flex gap-1.5">
              <GapStatusBadge status={gap.status} />
              <SeverityBadge severity={gap.severity} />
            </div>
          </div>
          <p>{gap.explanation}</p>
        </CardHeader>
        <CollapsibleContent>
          {/* Recommended language with copy button */}
          <blockquote>{gap.suggestedLanguage}</blockquote>
          {gap.templateSource && (
            <p className="text-xs">Source: {gap.templateSource}</p>
          )}
          <CopyButton text={gap.suggestedLanguage} />
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
```

### Pattern 5: Two-Tier Gap Status Detection

**What:** Distinguish "Missing" (category completely absent) from "Incomplete" (category present but weak/partial coverage).

**When to use:** In the pre-LLM gap detection logic.

**Key insight:** The classifier already provides confidence scores. A category is "Incomplete" when:
- It has at least one classification, but the highest confidence is below a threshold (e.g., 0.7)
- OR the risk scorer flagged it as "aggressive" or "unknown" risk
- OR the category has only secondary (not primary) classifications

**Example:**
```typescript
function detectGapStatus(
  category: string,
  classifications: ChunkClassificationResult[],
  riskAssessments: RiskAssessmentResult[]
): 'present' | 'incomplete' | 'missing' {
  const categoryClassifications = classifications.filter(
    c => c.primary.category === category || c.secondary.some(s => s.category === category)
  )

  if (categoryClassifications.length === 0) return 'missing'

  // Check if only secondary classifications (no primary)
  const hasPrimary = categoryClassifications.some(c => c.primary.category === category)
  if (!hasPrimary) return 'incomplete'

  // Check confidence threshold
  const maxConfidence = Math.max(
    ...categoryClassifications
      .filter(c => c.primary.category === category)
      .map(c => c.primary.confidence)
  )
  if (maxConfidence < 0.7) return 'incomplete'

  // Check risk assessment - aggressive/unknown indicates weak coverage
  const categoryRisks = riskAssessments.filter(a => a.clause.category === category)
  const hasAggressiveOrUnknown = categoryRisks.some(
    a => a.riskLevel === 'aggressive' || a.riskLevel === 'unknown'
  )
  if (hasAggressiveOrUnknown) return 'incomplete'

  return 'present'
}
```

### Anti-Patterns to Avoid

- **Don't hand-roll a CUAD category list in the agent code.** The existing `CUAD_CATEGORIES` constant in `agents/types.ts` has all 41, but the `cuadCategories` table in the database has `isNdaRelevant` and `riskWeight` which should drive filtering and severity. Use the database, not the hardcoded list.

- **Don't make a separate LLM call per gap.** The existing gap analyst makes 1 gap analysis call + N hypothesis calls. For recommended language, include template context in a single LLM call to keep within the ~12K token budget.

- **Don't create a new barrel export for gap queries.** Per CLAUDE.md, import directly: `import { getGapAnalysis } from '@/db/queries/gap-analysis'`.

- **Don't change the pipeline orchestration.** The gap analyst already runs as the 4th step in `analyze-nda.ts`. Enhance it in-place, don't restructure the pipeline.

- **Don't modify the existing `gapAnalysis` JSONB column type.** The column already stores arbitrary JSONB. Expand the data stored there, but the column itself doesn't need schema migration.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NDA-relevant category filtering | Hardcoded category list | `cuadCategories.isNdaRelevant` from DB | Already exists, maintained by bootstrap |
| Severity tier assignment | Custom importance mapping | `cuadCategories.riskWeight` from DB | Already exists, provides numeric weights |
| Template baseline retrieval | Custom template search | `findTemplateBaselines()` from `agents/tools/vector-search.ts` | Already searches Bonterms/CommonAccord templates with caching |
| Clause evidence retrieval | Manual DB queries | `findSimilarClauses()` from `agents/tools/vector-search.ts` | Already has LRU cache, embedding generation |
| Server action pattern | Custom API route | Follow `fetchRiskAssessments()` pattern from `analyses/actions.ts` | Consistent with existing UI data fetching |
| Gap card UI | Custom component from scratch | Follow `ClauseCard` pattern from `analysis-view.tsx` | Consistent collapsible card with badges |

**Key insight:** Almost everything needed for Phase 8 already exists as building blocks. The phase is primarily about composing existing pieces into a richer output.

## Common Pitfalls

### Pitfall 1: Token Budget Overrun with Recommended Language
**What goes wrong:** Including full template text + existing clause text + recommended language in a single LLM call exceeds the ~12K token gap analyst budget.
**Why it happens:** Template baselines can be 500+ chars each, and requesting full clause drafts (1-3 paragraphs) significantly increases output tokens.
**How to avoid:**
- Truncate template baselines to 300 chars in the prompt
- Limit to 2 template baselines per gap category
- Cap recommended language at 500 chars per gap in the schema
- For the top-level summary call, only include the 10 highest-severity gaps (not all 41 categories)
- Monitor BudgetTracker - the gap analyst already records token usage
**Warning signs:** BudgetTracker warnings in logs, `NoObjectGeneratedError` from output generation

### Pitfall 2: Empty cuadCategories Table
**What goes wrong:** If the bootstrap pipeline hasn't run, `cuadCategories` table is empty, causing gap detection to find zero NDA-relevant categories.
**Why it happens:** Local dev or fresh deployments may not have run bootstrap.
**How to avoid:** Fall back to the existing hardcoded `CRITICAL_CATEGORIES` and `IMPORTANT_CATEGORIES` from `agents/prompts/gap-analyst.ts` when the table is empty. The risk scorer already does this pattern (see `calculateWeightedRisk` fallback to uniform weights).
**Warning signs:** Gap analysis returns zero gaps on a document with clear gaps

### Pitfall 3: Missing Template Data for Recommended Language
**What goes wrong:** `findTemplateBaselines()` returns empty results when no Bonterms/CommonAccord data has been bootstrapped.
**Why it happens:** Template data requires the bootstrap pipeline to ingest Bonterms/CommonAccord markdown files.
**How to avoid:** The function already returns `[]` gracefully. When empty, skip the "Based on Bonterms" source attribution and let the LLM generate recommended language without template guidance. Still functional, just without the template grounding.
**Warning signs:** All gap recommendations have generic language instead of template-referenced language

### Pitfall 4: Incomplete vs. Missing Classification
**What goes wrong:** A category marked as "present" actually has very weak coverage (one secondary classification at 0.35 confidence).
**Why it happens:** Binary present/absent check only looks at whether any classification exists, not quality.
**How to avoid:** Use the two-tier status detection logic that checks confidence thresholds and primary vs. secondary classifications (see Pattern 5 above).
**Warning signs:** Users report that obviously weak clauses aren't flagged as gaps

### Pitfall 5: Gap Data Schema Mismatch Between Agent and UI
**What goes wrong:** Agent produces enhanced gap data in new format, but UI still reads old format from `gapAnalysis` JSONB column.
**Why it happens:** The `gapAnalysis` column is untyped JSONB. The agent output type and UI parsing type must align.
**How to avoid:** Define a shared TypeScript type for the enhanced gap analysis result. Use the same type in agent output mapping and UI parsing. The existing pattern (see `ClauseEvidence` and `ClauseMetadata` interfaces in `analysis-view.tsx`) shows how to type-assert JSONB data.
**Warning signs:** UI shows "No gaps found" when agent clearly produced gaps

### Pitfall 6: Perspective-Aware Gaps Complexity
**What goes wrong:** Attempting to make gap severity perspective-aware (disclosing vs. receiving party) adds significant complexity.
**Why it happens:** The CONTEXT.md leaves this as "Claude's Discretion" but the risk scorer perspective toggle already exists.
**How to avoid:** Recommendation: Do NOT make gap severity perspective-aware in Phase 8. The risk scorer handles perspective. Gaps are structural (category present or not) and don't change with perspective. The explanation could mention perspective implications, but the severity tier should remain perspective-independent.
**Warning signs:** Overcomplicated schema, inconsistent severity between perspectives

## Code Examples

### Example 1: Enhanced Gap Analyst Agent Flow
```typescript
// agents/gap-analyst.ts (enhanced)
export async function runGapAnalystAgent(input: GapAnalystInput): Promise<GapAnalystOutput> {
  const { clauses, assessments, documentSummary, budgetTracker } = input

  // 1. Get NDA-relevant categories from DB (with fallback)
  const ndaCategories = await getNdaRelevantCategories()

  // 2. Determine present categories from classifier output
  const presentCategories = [...new Set(clauses.map(c => c.category))]

  // 3. Detect gaps with two-tier status
  const gaps: DetectedGap[] = []
  for (const cat of ndaCategories) {
    const status = detectGapStatus(cat.name, clauses, assessments)
    if (status === 'missing' || status === 'incomplete') {
      // 4. Fetch template baselines for this category
      const templates = await findTemplateBaselines(cat.name, { limit: 2 })
      gaps.push({
        category: cat.name,
        status,
        severity: cat.severity,
        templateContext: templates,
      })
    }
  }

  // 5. Single LLM call for explanations + recommended language
  const gapPrompt = createEnhancedGapPrompt(
    documentSummary,
    presentCategories,
    gaps,
    clauses.slice(0, 10) // Sample of existing clauses for style matching
  )

  const result = await generateText({
    model: getAgentModel('gapAnalyst'),
    system: ENHANCED_GAP_SYSTEM_PROMPT,
    prompt: gapPrompt,
    output: Output.object({ schema: enhancedGapSchema }),
  })

  // 6. Merge LLM output with pre-computed data
  // ...

  // 7. ContractNLI hypothesis testing (existing logic, unchanged)
  // ...

  budgetTracker.record('gapAnalyst', totalInputTokens, totalOutputTokens)
  return enhancedOutput
}
```

### Example 2: Server Action for Gap Data
```typescript
// app/(main)/(dashboard)/analyses/actions.ts (addition)
export async function getEnhancedGapAnalysis(
  analysisId: string
): Promise<ApiResponse<EnhancedGapAnalysisResult>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID")
  }

  const { db, tenantId } = await withTenant()

  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: {
      gapAnalysis: true,
      status: true,
    },
  })

  if (!analysis) return err("NOT_FOUND", "Analysis not found")
  if (analysis.status !== "completed") {
    return err("CONFLICT", `Gap analysis not available. Status: ${analysis.status}`)
  }

  const gapData = analysis.gapAnalysis as EnhancedGapAnalysisResult | null
  if (!gapData) {
    return ok({
      gaps: [],
      coverageSummary: { totalCategories: 0, presentCount: 0, missingCount: 0, incompleteCount: 0, coveragePercent: 0 },
      presentCategories: [],
      weakClauses: [],
      hypothesisCoverage: [],
      gapScore: 0,
    })
  }

  return ok(gapData)
}
```

### Example 3: Gap Severity Badge (Following riskConfig Pattern)
```typescript
// components/artifact/analysis-view.tsx (addition)
const gapSeverityConfig: Record<GapSeverity, {
  label: string
  bgColor: string
  textColor: string
  borderColor: string
  icon: React.ElementType
}> = {
  critical: {
    label: "Critical",
    bgColor: "oklch(0.90 0.08 25)",
    textColor: "oklch(0.50 0.14 25)",
    borderColor: "oklch(0.85 0.10 25)",
    icon: AlertCircleIcon,
  },
  important: {
    label: "Important",
    bgColor: "oklch(0.90 0.08 65)",
    textColor: "oklch(0.50 0.14 65)",
    borderColor: "oklch(0.85 0.10 65)",
    icon: AlertTriangleIcon,
  },
  informational: {
    label: "Info",
    bgColor: "oklch(0.92 0.01 280)",
    textColor: "oklch(0.45 0.01 280)",
    borderColor: "oklch(0.88 0.02 280)",
    icon: HelpCircleIcon,
  },
}

const gapStatusConfig: Record<GapStatusType, {
  label: string
  bgColor: string
  textColor: string
  borderColor: string
}> = {
  missing: {
    label: "Missing",
    bgColor: "oklch(0.90 0.08 25)",
    textColor: "oklch(0.50 0.14 25)",
    borderColor: "oklch(0.85 0.10 25)",
  },
  incomplete: {
    label: "Incomplete",
    bgColor: "oklch(0.90 0.08 65)",
    textColor: "oklch(0.50 0.14 65)",
    borderColor: "oklch(0.85 0.10 65)",
  },
}
```

## State of the Art

| Old Approach (Current) | New Approach (Phase 8) | What Changes |
|------------------------|------------------------|--------------|
| Binary present/absent gap detection | Two-tier: Missing vs. Incomplete | More nuanced gap identification |
| Hardcoded CRITICAL/IMPORTANT categories | `cuadCategories.isNdaRelevant` + `riskWeight` from DB | Data-driven, configurable |
| Optional `suggestedLanguage` (brief) | Full clause drafts with template source attribution | Actionable, insertable output |
| Gap score as opaque number | Coverage summary with breakdown | More interpretable |
| Gap data only in agent output | Persisted and queryable via server action | Independent UI fetching |
| No gap-specific UI | Gaps tab with expandable cards + copy/export | Full user experience |

**Deprecated/outdated:**
- The existing `GapAnalysisResult` type in `analyses/actions.ts` (lines 63-73) uses `missingClauses: string[]` which is too simple. The enhanced version replaces this with structured gap objects.
- The existing `GAP_SCORE_WEIGHTS` constants in `gap-analyst.ts` should be adjusted to incorporate `riskWeight` from the database.

## Key Codebase Integration Points

### Existing Code to Modify

1. **`agents/gap-analyst.ts`** - Core agent logic. Currently 315 lines. Needs: enhanced schema, template retrieval, two-tier detection, coverage summary calculation.

2. **`agents/prompts/gap-analyst.ts`** - System and user prompts. Currently 114 lines. Needs: enhanced system prompt with template context section, style matching instructions, source attribution format.

3. **`agents/types.ts`** - Shared types. Needs: enhanced gap types (`GapSeverity`, `GapStatusType`, `EnhancedGapAnalysis`).

4. **`inngest/functions/analyze-nda.ts`** - Pipeline orchestration. Lines 598-607. The gap analyst step already exists. May need minor changes to pass additional data (classifications, assessments) to the enhanced agent.

5. **`components/artifact/analysis-view.tsx`** - UI. Currently 940 lines. Needs: `GapsView` component, `CoverageSummary`, `GapCard`, severity/status badges.

6. **`app/(main)/(dashboard)/analyses/actions.ts`** - Server actions. Needs: `getEnhancedGapAnalysis` action and updated `GapAnalysisResult` type.

### Existing Code to Reuse (No Modification)

1. **`agents/tools/vector-search.ts`** - `findTemplateBaselines()` already fetches Bonterms/CommonAccord templates with LRU caching.

2. **`db/schema/reference.ts`** - `cuadCategories` table with `isNdaRelevant` and `riskWeight` fields.

3. **`db/schema/analyses.ts`** - `analyses.gapAnalysis` JSONB column already stores gap data.

4. **`lib/ai/config.ts`** - `getAgentModel('gapAnalyst')` returns `claude-sonnet-4.5`.

5. **`lib/ai/budget.ts`** - `BudgetTracker` already used by the gap analyst.

## Recommendations on Claude's Discretion Items

### Gap Detection Threshold Method
**Recommendation: Confidence-based with secondary classification check.**
- A category is "Missing" if zero classifications (primary or secondary) reference it.
- A category is "Incomplete" if:
  - Only secondary classifications reference it (no primary), OR
  - All primary classifications for it have confidence < 0.7 (LOW_CONFIDENCE threshold from `agents/types.ts`), OR
  - All risk assessments for the category are "aggressive" or "unknown"
- This aligns with the existing `CLASSIFICATION_THRESHOLDS.LOW_CONFIDENCE = 0.7` constant.
- **Confidence: HIGH** - Uses existing constants and patterns.

### CUAD Category Filtering
**Recommendation: Use `cuadCategories.isNdaRelevant` from the database, with fallback.**
- Query `cuadCategories WHERE isNdaRelevant = true` to get the NDA-relevant subset.
- If the table is empty (bootstrap not run), fall back to existing `CRITICAL_CATEGORIES` + `IMPORTANT_CATEGORIES` from `agents/prompts/gap-analyst.ts` (9 categories total), supplemented by a reasonable hardcoded list of ~20 NDA-relevant categories.
- This avoids reporting gaps for categories like "Volume Restriction" or "Revenue/Profit Sharing" that are irrelevant to NDAs.
- **Confidence: HIGH** - Database flag already exists and is maintained by bootstrap.

### Severity Tier Count and Ordering
**Recommendation: 3 tiers (critical / important / informational), ordered by severity.**
- Map from `riskWeight`: >= 1.5 = critical, >= 1.0 = important, < 1.0 = informational.
- Display order: critical first, then important, then informational.
- This gives sufficient granularity without overwhelming. Two tiers (just critical/important) loses the "nice to have" items. Three tiers match the Bonterms baseline comparison well.
- **Confidence: HIGH** - riskWeight data is already in the schema.

### Perspective-Aware Gap Severity
**Recommendation: Do NOT make gap severity perspective-aware.**
- Gaps are structural (category present or not). They don't change based on receiving vs. disclosing party perspective.
- The explanations can mention perspective implications ("As the receiving party, the absence of indemnification is particularly concerning"), but the severity tier itself should be static.
- Adding perspective toggles to gaps would duplicate the risk scorer's perspective toggle complexity without commensurate value.
- **Confidence: HIGH** - Avoids scope creep while still being useful.

### Individual Gap Card UI Pattern
**Recommendation: Expandable cards (matching existing `ClauseCard` / `Collapsible` pattern).**
- Default collapsed state shows: category name, status badge (Missing/Incomplete), severity badge, and 1-2 line explanation.
- Expanded state shows: full explanation, recommended language as a blockquote, template source attribution, copy-to-clipboard button.
- This follows the established pattern in `analysis-view.tsx` where `ClauseCard` and `ClassificationCard` both use `Collapsible` from shadcn/ui.
- **Confidence: HIGH** - Consistent with existing UI patterns.

## Open Questions

1. **Export format for "all gaps as document"**
   - What we know: CONTEXT.md says "full export option for all gaps as document". The existing `exportAnalysisPdf` action is a stub (TODO).
   - What's unclear: Should this be a separate DOCX/markdown export, or bundled into the future PDF export?
   - Recommendation: Implement a simple "Copy All" button that copies all gap recommended language as formatted text (markdown). Defer full document export to the PDF export phase. This gives immediate value without building export infrastructure.

2. **ContractNLI hypothesis coverage integration with gaps**
   - What we know: The existing gap analyst already tests ContractNLI hypotheses. The enhanced agent should preserve this.
   - What's unclear: Should hypothesis results appear in the Gaps tab or remain separate?
   - Recommendation: Include hypothesis coverage results in the Gaps tab as a separate "NLI Verification" sub-section below the category gaps. They provide complementary information about NDA completeness.

3. **Token budget allocation for recommended language**
   - What we know: PRD allocates ~12K tokens for gap analyst (10K input, 2K output).
   - What's unclear: Generating full clause drafts (1-3 paragraphs) for 10+ gaps may exceed 2K output tokens.
   - Recommendation: Increase output token allowance for gap analyst to ~4K (still within overall document budget) or limit clause drafts to top 5-7 highest-severity gaps. The existing BudgetTracker will flag overruns.

## Sources

### Primary (HIGH confidence)
- `/Users/medelman/GitHub/medelman17/vibedocs/agents/gap-analyst.ts` - Current gap analyst implementation
- `/Users/medelman/GitHub/medelman17/vibedocs/agents/prompts/gap-analyst.ts` - Current gap prompts and constants
- `/Users/medelman/GitHub/medelman17/vibedocs/agents/types.ts` - Agent type definitions including CUAD categories
- `/Users/medelman/GitHub/medelman17/vibedocs/inngest/functions/analyze-nda.ts` - Pipeline orchestration
- `/Users/medelman/GitHub/medelman17/vibedocs/db/schema/analyses.ts` - Analysis and clause extraction schemas
- `/Users/medelman/GitHub/medelman17/vibedocs/db/schema/reference.ts` - Reference database including cuadCategories
- `/Users/medelman/GitHub/medelman17/vibedocs/agents/tools/vector-search.ts` - Vector search with template baselines
- `/Users/medelman/GitHub/medelman17/vibedocs/components/artifact/analysis-view.tsx` - Existing analysis UI
- `/Users/medelman/GitHub/medelman17/vibedocs/app/(main)/(dashboard)/analyses/actions.ts` - Server actions
- `/Users/medelman/GitHub/medelman17/vibedocs/db/queries/classifications.ts` - Classification queries
- `/Users/medelman/GitHub/medelman17/vibedocs/db/queries/risk-scoring.ts` - Risk scoring queries
- `/Users/medelman/GitHub/medelman17/vibedocs/lib/ai/config.ts` - Model configuration
- `/Users/medelman/GitHub/medelman17/vibedocs/.planning/phases/08-gap-analysis/08-CONTEXT.md` - User decisions

### Secondary (MEDIUM confidence)
- `/Users/medelman/GitHub/medelman17/vibedocs/docs/PRD.md` - Product requirements (gap analysis sections)
- `/Users/medelman/GitHub/medelman17/vibedocs/CLAUDE.md` - Project conventions

### Tertiary (LOW confidence)
- None. All research was based on local codebase analysis.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; all existing
- Architecture: HIGH - All patterns verified against existing codebase
- Pitfalls: HIGH - Based on observed patterns and edge cases in existing code
- Discretion recommendations: HIGH - Data-driven from existing database schema and UI patterns

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (stable codebase, no external dependency concerns)
