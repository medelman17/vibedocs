# Analysis Pipeline Design

> **Status:** COMPLETE (audited 2026-02-04)
>
> Full 4-agent pipeline implemented. See agents/, inngest/functions/analyze-nda.ts.

**Date**: 2026-02-03
**Status**: Approved
**Supersedes**: `2026-02-01-inngest-analysis-pipeline.md` (path updates, Word Add-in support)
**Depends On**: `2026-02-03-agent-foundation-design.md`

## Overview

The Analysis Pipeline processes uploaded NDAs through four specialized agents: Parser, Classifier, Risk Scorer, and Gap Analyst. It supports two entry points (web upload and Word Add-in) and provides real-time progress updates for the Word Add-in task pane.

## Goals

- Process NDAs from web upload (blob) and Word Add-in (direct text)
- Preserve position information for Word Add-in content controls
- Real-time progress events for SSE streaming
- Partial persistence for resume-on-failure
- PRD-aligned risk levels (`standard | cautious | aggressive | unknown`)
- Evidence-based assessments with citations and statistics

## Architecture

```
                    ┌─────────────────┐
                    │  Web Upload     │
                    │  (Blob URL)     │
                    └────────┬────────┘
                             │
                             ▼
┌─────────────────┐    ┌─────────────────────────────────────────────────────┐
│  Word Add-in    │    │                  Inngest Pipeline                    │
│  (Direct Text   │───▶│                                                     │
│   + Paragraphs) │    │  Parser ──▶ Classifier ──▶ Risk Scorer ──▶ Gap     │
└─────────────────┘    │    │            │              │          Analyst   │
                       │    ▼            ▼              ▼             │      │
                       │  Chunks     Clauses      Assessments     Analysis   │
                       │    │            │              │             │      │
                       │    └────────────┴──────────────┴─────────────┘      │
                       │                         │                           │
                       │                    Progress Events (SSE)            │
                       └─────────────────────────────────────────────────────┘
```

---

## Entry Points

Two Inngest events trigger analysis, converging at the Parser stage:

```typescript
// Web upload - file in Blob storage
interface WebAnalysisEvent {
  name: "nda/analysis.requested"
  data: {
    documentId: string
    tenantId: string
    source: "web"
  }
}

// Word Add-in - structured content from Office.js
interface WordAddinAnalysisEvent {
  name: "nda/analysis.requested"
  data: {
    documentId: string
    tenantId: string
    source: "word-addin"
    content: {
      rawText: string
      paragraphs: Array<{
        text: string
        style: string        // "Heading1", "Normal", etc.
        isHeading: boolean
      }>
    }
    metadata: {
      title: string
      author?: string
    }
  }
}
```

**Source handling:**
- `web`: Parser downloads from Blob, extracts text via pdf-parse/mammoth
- `word-addin`: Parser uses provided `rawText` and `paragraphs` for section detection

---

## Component Specifications

### 1. Parser Agent

First stage: extract text, chunk with position tracking, generate embeddings.

**Input:**

```typescript
interface ParserInput {
  documentId: string
  tenantId: string
  source: "web" | "word-addin"

  // For word-addin only
  content?: {
    rawText: string
    paragraphs: Array<{
      text: string
      style: string
      isHeading: boolean
    }>
  }
  metadata?: { title: string; author?: string }
}
```

**Output:**

```typescript
interface ParserOutput {
  document: {
    documentId: string
    title: string
    rawText: string
    chunks: Array<{
      id: string
      index: number
      content: string
      sectionPath: string[]      // ["Article I", "Section 1.2"]
      tokenCount: number
      startPosition: number      // Character offset for Word Add-in
      endPosition: number
      embedding: number[]
    }>
  }
  tokenUsage: { embeddingTokens: number }
}
```

**Section detection:**

| Source | Method |
|--------|--------|
| Web | Regex patterns: `ARTICLE\s+[IVX\d]+`, `Section\s+\d+` |
| Word Add-in | Paragraph styles (Heading1, Heading2) + fallback to regex |

**Dependencies:**
- `pdf-parse` - PDF text extraction (web only)
- `mammoth` - DOCX text extraction (web only)
- `lib/embeddings.ts` - Voyage AI embeddings
- `lib/cache/` - Embedding cache

---

### 2. Classifier Agent

Categorizes each chunk into CUAD 41-category taxonomy.

**Input:**

```typescript
interface ClassifierInput {
  parsedDocument: ParserOutput['document']
  budgetTracker: BudgetTracker
}
```

**Output:**

```typescript
interface ClassifierOutput {
  clauses: Array<{
    chunkId: string
    clauseText: string
    category: CuadCategory
    secondaryCategories: CuadCategory[]
    confidence: number
    reasoning: string
    startPosition: number
    endPosition: number
  }>
  tokenUsage: { inputTokens: number; outputTokens: number }
}
```

**Process:**
1. For each chunk, fetch 3-5 similar references via `vectorSearchTool`
2. Build prompt using `createClassifierPrompt` (from Agent Foundation)
3. Call Claude Sonnet 4 via `generateObject` with `classificationSchema`
4. Filter out "Unknown" classifications with confidence < 0.5
5. Record token usage in shared `budgetTracker`

**Model:** `AGENT_MODELS.classifier` (Sonnet 4) - good balance for pattern matching

---

### 3. Risk Scorer Agent

Evaluates each classified clause for risk level with evidence.

**Input:**

```typescript
interface RiskScorerInput {
  clauses: ClassifierOutput['clauses']
  budgetTracker: BudgetTracker
}
```

**Output:**

```typescript
interface RiskScorerOutput {
  assessments: Array<{
    clauseId: string
    clause: ClassifierOutput['clauses'][0]
    riskLevel: RiskLevel
    confidence: number
    explanation: string
    evidence: {
      citations: string[]       // Quotes from clause
      comparisons: string[]     // vs reference corpus
      statistic?: string        // "Exceeds 87% of NDAs"
    }
    startPosition: number
    endPosition: number
  }>
  overallRiskScore: number      // 0-100
  overallRiskLevel: RiskLevel
  tokenUsage: { inputTokens: number; outputTokens: number }
}
```

**Overall risk calculation:**

```typescript
function calculateOverallRisk(assessments: Assessment[]): { score: number; level: RiskLevel } {
  const weights = { aggressive: 3, cautious: 1.5, standard: 0, unknown: 0.5 }

  const totalWeight = assessments.reduce((sum, a) => sum + weights[a.riskLevel], 0)
  const maxWeight = assessments.length * 3
  const score = Math.round((totalWeight / maxWeight) * 100)

  const level = score >= 60 ? 'aggressive'
              : score >= 30 ? 'cautious'
              : 'standard'

  return { score, level }
}
```

**Model:** `AGENT_MODELS.riskScorer` (Sonnet 4.5) - nuanced judgment required

---

### 4. Gap Analyst Agent

Identifies missing clauses and tests ContractNLI hypotheses.

**Input:**

```typescript
interface GapAnalystInput {
  clauses: ClassifierOutput['clauses']
  assessments: RiskScorerOutput['assessments']
  documentSummary: string
  budgetTracker: BudgetTracker
}
```

**Output:**

```typescript
interface GapAnalystOutput {
  gapAnalysis: {
    presentCategories: CuadCategory[]
    missingCategories: Array<{
      category: CuadCategory
      importance: 'critical' | 'important' | 'optional'
      explanation: string
      suggestedLanguage?: string    // From templates
    }>
    weakClauses: Array<{
      clauseId: string
      category: CuadCategory
      issue: string
      recommendation: string
    }>
    gapScore: number                // 0-100, higher = more gaps
  }
  hypothesisCoverage: Array<{
    hypothesisId: string
    category: ContractNLICategory
    status: 'entailment' | 'contradiction' | 'not_mentioned'
    supportingClauseId?: string
    explanation: string
  }>
  tokenUsage: { inputTokens: number; outputTokens: number }
}
```

**Gap score calculation:**

| Condition | Points |
|-----------|--------|
| Missing critical category | +15 |
| Missing important category | +8 |
| Weak critical clause | +10 |
| Weak important clause | +5 |
| Critical hypothesis not_mentioned | +10 |
| Hypothesis contradicted | +15 |

Cap at 100. Lower score = more complete NDA.

**Template suggestions:**
- Query `findTemplateSections()` for missing categories
- Returns example language from Bonterms/CommonAccord in reference corpus

**Model:** `AGENT_MODELS.gapAnalyst` (Sonnet 4.5) - complex reasoning about what's missing

---

## Inngest Orchestration

Durable pipeline with progress events and partial persistence.

```typescript
export const analyzeNda = inngest.createFunction(
  {
    id: "analyze-nda",
    concurrency: { limit: 3 },
    retries: 3,
  },
  { event: "nda/analysis.requested" },
  async ({ event, step }) => {
    const { documentId, tenantId, source, content, metadata } = event.data
    const budgetTracker = new BudgetTracker()
    const startTime = Date.now()

    // Create analysis record
    const analysisId = await step.run("create-analysis", async () => {
      return createAnalysisRecord(documentId, tenantId)
    })

    // Step 1: Parser
    const parserResult = await step.run("parser-agent", () =>
      runParserAgent({ documentId, tenantId, source, content, metadata })
    )
    await emitProgress(step, { analysisId, stage: "parsing", progress: 20 })

    // Step 2: Classifier
    const classifierResult = await step.run("classifier-agent", () =>
      runClassifierAgent({ parsedDocument: parserResult.document, budgetTracker })
    )
    await step.run("persist-clauses", () =>
      persistPartial(analysisId, { clauses: classifierResult.clauses })
    )
    await emitProgress(step, { analysisId, stage: "classifying", progress: 45 })

    // Step 3: Risk Scorer
    const riskResult = await step.run("risk-scorer-agent", () =>
      runRiskScorerAgent({ clauses: classifierResult.clauses, budgetTracker })
    )
    await step.run("persist-assessments", () =>
      persistPartial(analysisId, { assessments: riskResult.assessments })
    )
    await emitProgress(step, { analysisId, stage: "scoring", progress: 70 })

    // Step 4: Gap Analyst
    const gapResult = await step.run("gap-analyst-agent", () =>
      runGapAnalystAgent({
        clauses: classifierResult.clauses,
        assessments: riskResult.assessments,
        documentSummary: generateSummary(classifierResult.clauses),
        budgetTracker
      })
    )
    await emitProgress(step, { analysisId, stage: "analyzing_gaps", progress: 90 })

    // Step 5: Persist final results
    await step.run("persist-final", () =>
      persistFinalResults(analysisId, {
        overallRiskScore: riskResult.overallRiskScore,
        overallRiskLevel: riskResult.overallRiskLevel,
        gapAnalysis: gapResult.gapAnalysis,
        hypothesisCoverage: gapResult.hypothesisCoverage,
        tokenUsage: budgetTracker.getUsage(),
        processingTimeMs: Date.now() - startTime
      })
    )

    await emitProgress(step, { analysisId, stage: "complete", progress: 100 })

    return { analysisId, success: true }
  }
)
```

**Progress events:**

```typescript
interface ProgressEvent {
  name: "nda/analysis.progress"
  data: {
    documentId: string
    analysisId: string
    tenantId: string
    stage: "parsing" | "classifying" | "scoring" | "analyzing_gaps" | "complete" | "failed"
    progress: number        // 0-100
    message: string
    metadata?: {
      chunksProcessed?: number
      totalChunks?: number
      clausesClassified?: number
    }
  }
}
```

**Partial persistence:**
- After each agent, persist intermediate results
- On retry, check completion flags and skip done stages
- Enables resume-from-failure rather than restart

---

## Word Add-in Integration

The pipeline supports Word Add-in with:

**Input:**
- Structured `paragraphs[]` with styles for better section detection
- No blob download needed - text provided directly

**Output:**
- `startPosition` / `endPosition` on every clause
- Positions are character offsets in `rawText`
- Word Add-in uses positions for content control insertion

**Progress:**
- SSE endpoint subscribes to `nda/analysis.progress` events
- Real-time stage updates in task pane

**Results endpoint returns:**

```typescript
interface WordAddinResults {
  analysisId: string
  overallRiskScore: number
  overallRiskLevel: RiskLevel
  clauses: Array<{
    id: string
    category: string
    text: string
    textPreview: string       // First 100 chars
    startPosition: number     // For content control
    endPosition: number       // For navigation
    riskLevel: RiskLevel
    riskExplanation: string
    evidence: { ... }
  }>
  gapAnalysis: { ... }
}
```

---

## Dependencies on Agent Foundation

This pipeline uses components from `2026-02-03-agent-foundation-design.md`:

| Component | Usage |
|-----------|-------|
| `lib/ai/config.ts` | `AGENT_MODELS.classifier`, `AGENT_MODELS.riskScorer`, `AGENT_MODELS.gapAnalyst` |
| `lib/ai/budget.ts` | `BudgetTracker` shared across all agents |
| `agents/types.ts` | `RiskLevel`, `CuadCategory`, `ContractNLICategory`, Zod schemas |
| `agents/tools/vector-search.ts` | `vectorSearchTool`, `findSimilarClauses` |
| `agents/prompts/classifier.ts` | `CLASSIFIER_SYSTEM_PROMPT`, `createClassifierPrompt` |
| `agents/prompts/risk-scorer.ts` | `RISK_SCORER_SYSTEM_PROMPT`, `createRiskScorerPrompt` |
| `agents/prompts/gap-analyst.ts` | `GAP_ANALYST_SYSTEM_PROMPT`, `createGapAnalystPrompt`, `CONTRACT_NLI_HYPOTHESES` |
| `agents/testing/*` | `mockGenerateObject`, `mockVectorSearch`, fixtures |

---

## New Dependencies

```bash
pnpm add pdf-parse mammoth
pnpm add -D @types/pdf-parse
```

---

## Testing Strategy

### Unit Tests (per agent)

```typescript
// Mock AI SDK and vector search
vi.mock('ai', () => ({ generateObject: mockGenerateObject(...) }))
vi.mock('./tools/vector-search', () => ({ vectorSearchTool: { execute: mockVectorSearch(...) } }))

// Test each agent in isolation
describe('Classifier Agent', () => {
  it('classifies governing law clause', async () => { ... })
  it('preserves position information', async () => { ... })
  it('records token usage', async () => { ... })
})
```

### Integration Tests (pipeline flow)

```typescript
// Mock all agents, test orchestration
describe('Analysis Pipeline', () => {
  it('runs all agents in sequence', async () => { ... })
  it('emits progress events at each stage', async () => { ... })
  it('handles word-addin source correctly', async () => { ... })
})
```

### E2E Tests (real Inngest dev server)

```bash
pnpm dev:all
# Upload test NDA, monitor Inngest dashboard, verify results
```

---

## File Structure

```
lib/
└── document-processing.ts     # PDF/DOCX extraction, chunking

agents/
├── parser.ts                  # Parser Agent
├── parser.test.ts
├── classifier.ts              # Classifier Agent
├── classifier.test.ts
├── risk-scorer.ts             # Risk Scorer Agent
├── risk-scorer.test.ts
├── gap-analyst.ts             # Gap Analyst Agent
└── gap-analyst.test.ts

inngest/
├── events/
│   └── analysis.ts            # Event types
└── functions/
    ├── analyze-nda.ts         # Main pipeline
    └── analyze-nda.test.ts

app/api/word-addin/
├── analyze/route.ts           # POST - start analysis
├── status/[id]/route.ts       # GET - SSE progress
└── results/[id]/route.ts      # GET - final results
```

---

## Success Criteria

- [ ] Web upload triggers analysis correctly
- [ ] Word Add-in triggers analysis with paragraph structure
- [ ] Position info preserved through entire pipeline
- [ ] Progress events emitted at each stage (SSE works)
- [ ] Partial persistence enables resume on failure
- [ ] All agents use Agent Foundation components
- [ ] Budget tracking across pipeline (~212K limit)
- [ ] Tests pass without hitting real APIs

---

## Next Steps

After this plan is implemented:
1. **Comparison Pipeline** - Side-by-side NDA comparison
2. **Generation Pipeline** - NDA generation from templates
3. **Word Add-in UI** - Task pane React components

---

## References

- Agent Foundation: `docs/plans/2026-02-03-agent-foundation-design.md`
- Word Add-in PRD: `docs/PRD-word-addin.md`
- Main PRD: `docs/PRD.md`
- Previous plan: `docs/plans/2026-02-01-inngest-analysis-pipeline.md`
