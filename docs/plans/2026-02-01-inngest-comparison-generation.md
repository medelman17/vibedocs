# Comparison & Generation Pipelines Implementation Plan

> **Status:** ❌ NOT STARTED (audited 2026-02-04)
>
> Comparison and generation Inngest functions not yet implemented.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement NDA comparison (clause alignment, side-by-side diff) and NDA generation (Bonterms/CommonAccord templates) pipelines as Inngest functions with full database persistence, progress events, and caching.

**Architecture:** Two separate Inngest functions handle comparison and generation workflows. Both use AI SDK 6 `generateObject()` for structured output, emit progress events for real-time UI, leverage the caching layer from Plan 4, and persist partial results for resume capability.

**Tech Stack:** Inngest 3.x, AI SDK 6, Claude API, Voyage AI, Drizzle ORM, LRU Cache, docx (DOCX export), @react-pdf/renderer (PDF export)

**Prerequisite Plans:**
- Plan 1: Inngest Infrastructure ✓
- Plan 2: Bootstrap Pipeline ✓
- Plan 3: Agent Foundation ✓
- Plan 4: Analysis Pipeline ✓ (provides caching layer, progress events pattern)

---

## Overview

### Comparison Pipeline
```
Select 2 Documents → Emit "retrieving" → Retrieve Embeddings (cached) → Emit "aligning" →
Hungarian Alignment → Emit "analyzing" → Claude Diff Analysis → Emit "persisting" →
Persist Results → Emit "completed"
```

### Generation Pipeline
```
User Parameters → Emit "retrieving" → Retrieve Template Sections → Emit "assembling" →
Claude Assembly → Emit "rendering" → HTML Render → Emit "persisting" →
Persist Draft → Emit "completed"
```

Both pipelines:
1. Are triggered via Inngest events
2. Use step-based durability for retry/resume
3. Emit progress events at each stage for real-time UI
4. Use AI SDK 6 `generateObject()` with Zod schemas
5. Leverage caching layer (embeddings, LLM responses)
6. Persist partial results for resume capability
7. Use PRD-aligned risk levels: `standard | cautious | aggressive | unknown`

---

## Phase 1: Dependencies & Event Types

### Task 1: Install Export Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install libraries**

Run: `pnpm add docx @react-pdf/renderer marked`

**Step 2: Install types**

Run: `pnpm add -D @types/marked`

**Step 3: Verify**

Run: `pnpm list docx @react-pdf/renderer marked`

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add document export dependencies"
```

---

### Task 2a: Write Comparison Event Types Test

**Files:**
- Create: `src/inngest/events/comparison.test.ts`

```typescript
// src/inngest/events/comparison.test.ts
import { describe, it, expect } from "vitest"
import {
  comparisonRequestedSchema,
  comparisonProgressSchema,
  comparisonCompletedSchema,
  type ComparisonStage,
} from "./comparison"

describe("comparisonRequestedSchema", () => {
  it("validates a valid comparison request", () => {
    const data = {
      comparisonId: "550e8400-e29b-41d4-a716-446655440000",
      documentAId: "550e8400-e29b-41d4-a716-446655440001",
      documentBId: "550e8400-e29b-41d4-a716-446655440002",
      tenantId: "550e8400-e29b-41d4-a716-446655440003",
    }
    expect(comparisonRequestedSchema.safeParse(data).success).toBe(true)
  })

  it("rejects when documentAId equals documentBId", () => {
    const data = {
      comparisonId: "550e8400-e29b-41d4-a716-446655440000",
      documentAId: "550e8400-e29b-41d4-a716-446655440001",
      documentBId: "550e8400-e29b-41d4-a716-446655440001",
      tenantId: "550e8400-e29b-41d4-a716-446655440003",
    }
    expect(comparisonRequestedSchema.safeParse(data).success).toBe(false)
  })
})

describe("comparisonProgressSchema", () => {
  it("validates all stage values", () => {
    const stages: ComparisonStage[] = [
      "queued", "retrieving", "aligning", "analyzing", "persisting", "completed", "failed"
    ]
    for (const stage of stages) {
      const data = { comparisonId: "550e8400-e29b-41d4-a716-446655440000", stage }
      expect(comparisonProgressSchema.safeParse(data).success).toBe(true)
    }
  })
})
```

**Step: Run test**

Run: `pnpm test src/inngest/events/comparison.test.ts`
Expected: FAIL - Cannot find module

---

### Task 2b: Implement Comparison Event Types

**Files:**
- Create: `src/inngest/events/comparison.ts`

```typescript
// src/inngest/events/comparison.ts
/**
 * @fileoverview Comparison Pipeline Event Types
 *
 * Includes progress events for real-time UI updates.
 */

import { z } from "zod"

// Progress stages for comparison pipeline
export const comparisonStages = [
  "queued",
  "retrieving",
  "aligning",
  "analyzing",
  "persisting",
  "completed",
  "failed",
] as const

export type ComparisonStage = (typeof comparisonStages)[number]

export const comparisonRequestedSchema = z
  .object({
    comparisonId: z.string().uuid(),
    documentAId: z.string().uuid(),
    documentBId: z.string().uuid(),
    tenantId: z.string().uuid(),
  })
  .refine((data) => data.documentAId !== data.documentBId, {
    message: "Cannot compare a document with itself",
    path: ["documentBId"],
  })

export type ComparisonRequestedData = z.infer<typeof comparisonRequestedSchema>

export const comparisonProgressSchema = z.object({
  comparisonId: z.string().uuid(),
  stage: z.enum(comparisonStages),
  message: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
})

export type ComparisonProgressData = z.infer<typeof comparisonProgressSchema>

export const comparisonCompletedSchema = z.object({
  comparisonId: z.string().uuid(),
  status: z.enum(["completed", "error"]),
  matchedPairs: z.number().int().nonnegative().optional(),
  keyDifferencesCount: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
})

export type ComparisonCompletedData = z.infer<typeof comparisonCompletedSchema>

export type ComparisonEvents = {
  "comparison/requested": { data: ComparisonRequestedData }
  "comparison/progress": { data: ComparisonProgressData }
  "comparison/completed": { data: ComparisonCompletedData }
}
```

**Step: Run test**

Run: `pnpm test src/inngest/events/comparison.test.ts`
Expected: PASS

**Step: Commit**

```bash
git add src/inngest/events/comparison.ts src/inngest/events/comparison.test.ts
git commit -m "feat(inngest): add comparison event types with progress stages"
```

---

### Task 3a: Write Generation Event Types Test

**Files:**
- Create: `src/inngest/events/generation.test.ts`

```typescript
// src/inngest/events/generation.test.ts
import { describe, it, expect } from "vitest"
import {
  ndaParametersSchema,
  generationRequestedSchema,
  generationProgressSchema,
  type GenerationStage,
} from "./generation"

describe("ndaParametersSchema", () => {
  it("validates minimal parameters", () => {
    const params = {
      disclosingParty: { name: "Acme Corp", jurisdiction: "Delaware" },
      receivingParty: { name: "Beta Inc", jurisdiction: "California" },
      effectiveDate: "2026-02-01",
      termYears: 2,
      governingLaw: "Delaware",
      mutual: true,
    }
    expect(ndaParametersSchema.safeParse(params).success).toBe(true)
  })

  it("rejects invalid term years", () => {
    const params = {
      disclosingParty: { name: "Acme", jurisdiction: "DE" },
      receivingParty: { name: "Beta", jurisdiction: "CA" },
      effectiveDate: "2026-02-01",
      termYears: 0,
      governingLaw: "Delaware",
      mutual: true,
    }
    expect(ndaParametersSchema.safeParse(params).success).toBe(false)
  })
})

describe("generationProgressSchema", () => {
  it("validates all stage values", () => {
    const stages: GenerationStage[] = [
      "queued", "retrieving", "assembling", "rendering", "persisting", "completed", "failed"
    ]
    for (const stage of stages) {
      const data = { generatedNdaId: "550e8400-e29b-41d4-a716-446655440000", stage }
      expect(generationProgressSchema.safeParse(data).success).toBe(true)
    }
  })
})
```

**Step: Run test**

Run: `pnpm test src/inngest/events/generation.test.ts`
Expected: FAIL - Cannot find module

---

### Task 3b: Implement Generation Event Types

**Files:**
- Create: `src/inngest/events/generation.ts`

```typescript
// src/inngest/events/generation.ts
/**
 * @fileoverview Generation Pipeline Event Types
 *
 * Includes progress events and NDA parameter schemas.
 */

import { z } from "zod"

export const generationStages = [
  "queued",
  "retrieving",
  "assembling",
  "rendering",
  "persisting",
  "completed",
  "failed",
] as const

export type GenerationStage = (typeof generationStages)[number]

export const partySchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  jurisdiction: z.string().min(1),
  signerName: z.string().optional(),
  signerTitle: z.string().optional(),
})

export type Party = z.infer<typeof partySchema>

export const ndaParametersSchema = z.object({
  disclosingParty: partySchema,
  receivingParty: partySchema,
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  termYears: z.number().int().positive().max(10),
  mutual: z.boolean(),
  governingLaw: z.string().min(1),
  disputeResolution: z.enum(["litigation", "arbitration", "mediation"]).optional(),
  venue: z.string().optional(),
  purposeDescription: z.string().optional(),
  excludedCategories: z.array(z.string()).optional(),
  returnOrDestroy: z.enum(["return", "destroy", "certify"]).optional(),
  includeNonSolicit: z.boolean().optional(),
  includeNonCompete: z.boolean().optional(),
  includeIpAssignment: z.boolean().optional(),
})

export type NdaParameters = z.infer<typeof ndaParametersSchema>

export const generationRequestedSchema = z.object({
  generatedNdaId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  templateSource: z.enum(["bonterms", "commonaccord", "custom"]),
  parameters: ndaParametersSchema,
})

export type GenerationRequestedData = z.infer<typeof generationRequestedSchema>

export const generationProgressSchema = z.object({
  generatedNdaId: z.string().uuid(),
  stage: z.enum(generationStages),
  message: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
})

export type GenerationProgressData = z.infer<typeof generationProgressSchema>

export const generationCompletedSchema = z.object({
  generatedNdaId: z.string().uuid(),
  status: z.enum(["completed", "error"]),
  wordCount: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
})

export type GenerationCompletedData = z.infer<typeof generationCompletedSchema>

export type GenerationEvents = {
  "generation/requested": { data: GenerationRequestedData }
  "generation/progress": { data: GenerationProgressData }
  "generation/completed": { data: GenerationCompletedData }
}
```

**Step: Run test**

Run: `pnpm test src/inngest/events/generation.test.ts`
Expected: PASS

**Step: Commit**

```bash
git add src/inngest/events/generation.ts src/inngest/events/generation.test.ts
git commit -m "feat(inngest): add generation event types with progress stages"
```

---

## Phase 2: Clause Alignment Algorithm

### Task 4a: Write Clause Alignment Test

**Files:**
- Create: `src/lib/clause-alignment.test.ts`

```typescript
// src/lib/clause-alignment.test.ts
import { describe, it, expect } from "vitest"
import {
  computeSimilarityMatrix,
  hungarianAlignment,
  alignClauses,
  type ClauseEmbedding,
} from "./clause-alignment"

describe("computeSimilarityMatrix", () => {
  it("computes cosine similarity between embedding sets", () => {
    const clausesA: ClauseEmbedding[] = [
      { id: "a1", embedding: [1, 0, 0] },
      { id: "a2", embedding: [0, 1, 0] },
    ]
    const clausesB: ClauseEmbedding[] = [
      { id: "b1", embedding: [1, 0, 0] },
      { id: "b2", embedding: [0, 0, 1] },
    ]

    const matrix = computeSimilarityMatrix(clausesA, clausesB)
    expect(matrix[0][0]).toBeCloseTo(1.0)
    expect(matrix[0][1]).toBeCloseTo(0.0)
  })
})

describe("hungarianAlignment", () => {
  it("finds optimal one-to-one matching", () => {
    const matrix = [
      [0.3, 0.9],
      [0.8, 0.2],
    ]
    const assignments = hungarianAlignment(matrix, 0.5)
    expect(assignments).toContainEqual({ rowIdx: 0, colIdx: 1, score: 0.9 })
    expect(assignments).toContainEqual({ rowIdx: 1, colIdx: 0, score: 0.8 })
  })

  it("respects similarity threshold", () => {
    const matrix = [[0.3, 0.4], [0.2, 0.3]]
    const assignments = hungarianAlignment(matrix, 0.7)
    expect(assignments).toHaveLength(0)
  })
})

describe("alignClauses", () => {
  it("returns matched and unmatched clauses", () => {
    const clausesA: ClauseEmbedding[] = [
      { id: "a1", embedding: [1, 0, 0], categoryCode: "confidentiality" },
      { id: "a2", embedding: [0, 1, 0], categoryCode: "term" },
    ]
    const clausesB: ClauseEmbedding[] = [
      { id: "b1", embedding: [0.99, 0.1, 0], categoryCode: "confidentiality" },
    ]

    const result = alignClauses(clausesA, clausesB, 0.7)
    expect(result.matched.length).toBe(1)
    expect(result.unmatchedA.length).toBe(1)
    expect(result.unmatchedB.length).toBe(0)
  })
})
```

**Step: Run test**

Run: `pnpm test src/lib/clause-alignment.test.ts`
Expected: FAIL - Cannot find module

---

### Task 4b: Implement Clause Alignment Algorithm

**Files:**
- Create: `src/lib/clause-alignment.ts`

```typescript
// src/lib/clause-alignment.ts
/**
 * @fileoverview Clause Alignment Algorithm
 *
 * Uses cosine similarity and greedy Hungarian-style matching.
 */

export interface ClauseEmbedding {
  id: string
  embedding: number[]
  categoryCode?: string
  content?: string
}

export interface Assignment {
  rowIdx: number
  colIdx: number
  score: number
}

export interface MatchedPair {
  clauseAId: string
  clauseBId: string
  similarityScore: number
  categoryCode: string | null
}

export interface AlignmentResult {
  matched: MatchedPair[]
  unmatchedA: ClauseEmbedding[]
  unmatchedB: ClauseEmbedding[]
  metadata: {
    algorithmUsed: "hungarian"
    matchingThreshold: number
    totalClausesA: number
    totalClausesB: number
    matchedPairs: number
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vector length mismatch")
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export function computeSimilarityMatrix(
  clausesA: ClauseEmbedding[],
  clausesB: ClauseEmbedding[]
): number[][] {
  return clausesA.map((a) => clausesB.map((b) => cosineSimilarity(a.embedding, b.embedding)))
}

export function hungarianAlignment(matrix: number[][], threshold: number): Assignment[] {
  if (matrix.length === 0) return []

  const assignments: Assignment[] = []
  const assignedRows = new Set<number>()
  const assignedCols = new Set<number>()

  const candidates: { row: number; col: number; score: number }[] = []
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[0].length; j++) {
      if (matrix[i][j] >= threshold) {
        candidates.push({ row: i, col: j, score: matrix[i][j] })
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  for (const c of candidates) {
    if (!assignedRows.has(c.row) && !assignedCols.has(c.col)) {
      assignments.push({ rowIdx: c.row, colIdx: c.col, score: c.score })
      assignedRows.add(c.row)
      assignedCols.add(c.col)
    }
  }

  return assignments
}

export function alignClauses(
  clausesA: ClauseEmbedding[],
  clausesB: ClauseEmbedding[],
  threshold: number = 0.7
): AlignmentResult {
  const matrix = computeSimilarityMatrix(clausesA, clausesB)
  const assignments = hungarianAlignment(matrix, threshold)

  const matchedAIdx = new Set<number>()
  const matchedBIdx = new Set<number>()
  const matched: MatchedPair[] = []

  for (const a of assignments) {
    matched.push({
      clauseAId: clausesA[a.rowIdx].id,
      clauseBId: clausesB[a.colIdx].id,
      similarityScore: a.score,
      categoryCode: clausesA[a.rowIdx].categoryCode || clausesB[a.colIdx].categoryCode || null,
    })
    matchedAIdx.add(a.rowIdx)
    matchedBIdx.add(a.colIdx)
  }

  return {
    matched,
    unmatchedA: clausesA.filter((_, i) => !matchedAIdx.has(i)),
    unmatchedB: clausesB.filter((_, i) => !matchedBIdx.has(i)),
    metadata: {
      algorithmUsed: "hungarian",
      matchingThreshold: threshold,
      totalClausesA: clausesA.length,
      totalClausesB: clausesB.length,
      matchedPairs: matched.length,
    },
  }
}
```

**Step: Run test**

Run: `pnpm test src/lib/clause-alignment.test.ts`
Expected: PASS

**Step: Commit**

```bash
git add src/lib/clause-alignment.ts src/lib/clause-alignment.test.ts
git commit -m "feat: add clause alignment algorithm with Hungarian matching"
```

---

## Phase 3: Database Queries

### Task 5a: Write Comparison Queries Test

**Files:**
- Create: `src/db/queries/comparisons.test.ts`

```typescript
// src/db/queries/comparisons.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "@/db"
import { organizations } from "@/db/schema/organizations"
import { documents } from "@/db/schema/documents"
import {
  createComparison,
  getComparisonById,
  updateComparisonStatus,
  updateComparisonResults,
} from "./comparisons"

describe("comparison queries", () => {
  let tenantId: string
  let documentAId: string
  let documentBId: string

  beforeEach(async () => {
    const [org] = await db.insert(organizations).values({ name: "Test Org" }).returning()
    tenantId = org.id

    const [docA] = await db.insert(documents).values({
      tenantId, title: "Doc A", contentType: "pdf",
      originalFilename: "a.pdf", storagePath: "/test/a.pdf",
      textContent: "A", status: "completed",
    }).returning()
    documentAId = docA.id

    const [docB] = await db.insert(documents).values({
      tenantId, title: "Doc B", contentType: "pdf",
      originalFilename: "b.pdf", storagePath: "/test/b.pdf",
      textContent: "B", status: "completed",
    }).returning()
    documentBId = docB.id
  })

  it("creates comparison with pending status", async () => {
    const comp = await createComparison({ tenantId, documentAId, documentBId })
    expect(comp.status).toBe("pending")
  })

  it("updates comparison status", async () => {
    const comp = await createComparison({ tenantId, documentAId, documentBId })
    await updateComparisonStatus(comp.id, "processing")
    const updated = await getComparisonById(comp.id, tenantId)
    expect(updated?.status).toBe("processing")
  })
})
```

**Step: Run test**

Run: `pnpm test src/db/queries/comparisons.test.ts`
Expected: FAIL - Cannot find module

---

### Task 5b: Implement Comparison Queries

**Files:**
- Create: `src/db/queries/comparisons.ts`

```typescript
// src/db/queries/comparisons.ts
/**
 * @fileoverview Comparison database queries with partial persistence support.
 */

import { db } from "@/db"
import { comparisons } from "@/db/schema"
import { eq, and } from "drizzle-orm"

export async function createComparison(data: {
  tenantId: string
  documentAId: string
  documentBId: string
}) {
  const [comparison] = await db
    .insert(comparisons)
    .values({
      ...data,
      status: "pending",
    })
    .returning()
  return comparison
}

export async function getComparisonById(id: string, tenantId: string) {
  const [comparison] = await db
    .select()
    .from(comparisons)
    .where(and(eq(comparisons.id, id), eq(comparisons.tenantId, tenantId)))
  return comparison
}

export async function updateComparisonStatus(
  id: string,
  status: "pending" | "processing" | "completed" | "error"
) {
  await db.update(comparisons).set({ status, updatedAt: new Date() }).where(eq(comparisons.id, id))
}

export async function updateComparisonResults(
  id: string,
  results: {
    status: "completed" | "error"
    summary?: string
    clauseAlignments?: unknown
    keyDifferences?: unknown
    error?: string
  }
) {
  await db
    .update(comparisons)
    .set({
      status: results.status,
      summary: results.summary,
      clauseAlignments: results.clauseAlignments,
      keyDifferences: results.keyDifferences,
      error: results.error,
      completedAt: results.status === "completed" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(comparisons.id, id))
}

// Partial persistence for resume capability
export async function updateComparisonPartial(
  id: string,
  partialData: {
    clauseAlignments?: unknown
    keyDifferences?: unknown
    lastCompletedStep?: string
  }
) {
  await db
    .update(comparisons)
    .set({ ...partialData, updatedAt: new Date() })
    .where(eq(comparisons.id, id))
}
```

**Step: Run test**

Run: `pnpm test src/db/queries/comparisons.test.ts`
Expected: PASS

**Step: Commit**

```bash
git add src/db/queries/comparisons.ts src/db/queries/comparisons.test.ts
git commit -m "feat(db): add comparison queries with partial persistence"
```

---

### Task 6: Create Generation Database Queries

**Files:**
- Create: `src/db/queries/generated.ts`
- Create: `src/db/queries/generated.test.ts`

Follow same TDD pattern as Task 5. Include:
- `createGeneratedNda()`
- `getGeneratedNdaById()`
- `updateGeneratedNdaContent()`
- `updateGeneratedNdaPartial()` - for partial persistence
- `finalizeGeneratedNda()`

**Step: Commit**

```bash
git add src/db/queries/generated.ts src/db/queries/generated.test.ts
git commit -m "feat(db): add generated NDA queries with partial persistence"
```

---

## Phase 4: Comparison Pipeline

### Task 7a: Create Comparison Output Schemas

**Files:**
- Create: `src/agents/comparison/schemas.ts`

```typescript
// src/agents/comparison/schemas.ts
/**
 * @fileoverview Zod schemas for AI SDK 6 generateObject() in comparison pipeline.
 * Uses PRD-aligned risk levels: standard | cautious | aggressive | unknown
 */

import { z } from "zod"

// PRD-aligned risk levels
export const riskLevelSchema = z.enum(["standard", "cautious", "aggressive", "unknown"])

export const clauseDifferenceSchema = z.object({
  hasDifference: z.boolean(),
  description: z.string().describe("1-2 sentence description of the difference"),
  significance: riskLevelSchema.describe("Risk level per PRD terminology"),
})

export type ClauseDifference = z.infer<typeof clauseDifferenceSchema>

export const keyDifferenceSchema = z.object({
  categoryCode: z.string(),
  title: z.string(),
  description: z.string(),
  riskLevel: riskLevelSchema,
  recommendation: z.string(),
})

export const comparisonSummarySchema = z.object({
  differences: z.array(keyDifferenceSchema),
  overallAssessment: z.string(),
  overallRisk: riskLevelSchema,
})

export type ComparisonSummary = z.infer<typeof comparisonSummarySchema>
```

**Step: Commit**

```bash
git add src/agents/comparison/schemas.ts
git commit -m "feat(agents): add comparison schemas with PRD risk levels"
```

---

### Task 7b: Create Comparison Prompts

**Files:**
- Create: `src/agents/comparison/prompts.ts`

```typescript
// src/agents/comparison/prompts.ts
/**
 * @fileoverview Prompts for comparison pipeline.
 */

export const CLAUSE_DIFFERENCE_PROMPT = `Compare these two NDA clauses and identify any substantive differences.

Clause A ({categoryCode}):
{clauseA}

Clause B:
{clauseB}

Analyze the differences and their risk implications using these levels:
- standard: Normal business terms, typical in most NDAs
- cautious: More protective than typical, may limit flexibility
- aggressive: Unusually restrictive or one-sided
- unknown: Cannot determine risk level from context`

export const COMPARISON_SUMMARY_PROMPT = `Analyze these differences between two NDAs and provide a comprehensive risk assessment.

Differences found:
{differences}

For each difference, assess the risk level using PRD terminology:
- standard: Normal business terms
- cautious: More protective than typical
- aggressive: Unusually restrictive or one-sided
- unknown: Cannot determine

Provide actionable recommendations for each difference.`
```

**Step: Commit**

```bash
git add src/agents/comparison/prompts.ts
git commit -m "feat(agents): add comparison prompts"
```

---

### Task 8a: Write Comparison Function Test

**Files:**
- Create: `src/inngest/functions/compare.test.ts`

```typescript
// src/inngest/functions/compare.test.ts
import { describe, it, expect, vi } from "vitest"
import { compareNdaFunction } from "./compare"

vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((config, trigger, handler) => ({ config, trigger, handler })),
  },
}))

describe("compareNdaFunction", () => {
  it("has correct function configuration", () => {
    expect(compareNdaFunction.config.id).toBe("nda-compare")
    expect(compareNdaFunction.config.concurrency).toEqual({ limit: 3 })
  })

  it("triggers on comparison/requested event", () => {
    expect(compareNdaFunction.trigger.event).toBe("comparison/requested")
  })
})
```

**Step: Run test**

Run: `pnpm test src/inngest/functions/compare.test.ts`
Expected: FAIL

---

### Task 8b: Implement Comparison Function

**Files:**
- Create: `src/inngest/functions/compare.ts`

```typescript
// src/inngest/functions/compare.ts
/**
 * @fileoverview Comparison Pipeline with AI SDK 6, progress events, and caching.
 */

import { inngest } from "@/inngest/client"
import { generateObject } from "ai"
import { claude } from "@/lib/ai-sdk"
import { alignClauses, type ClauseEmbedding } from "@/lib/clause-alignment"
import { getResponseCache, setResponseCache } from "@/lib/cache/response-cache"
import { clauseDifferenceSchema, comparisonSummarySchema } from "@/agents/comparison/schemas"
import { CLAUSE_DIFFERENCE_PROMPT, COMPARISON_SUMMARY_PROMPT } from "@/agents/comparison/prompts"
import {
  getComparisonById,
  updateComparisonStatus,
  updateComparisonResults,
  updateComparisonPartial,
} from "@/db/queries/comparisons"
import { getClauseExtractionsByDocument } from "@/db/queries/analyses"
import { type ComparisonRequestedData } from "@/inngest/events/comparison"

export const compareNdaFunction = inngest.createFunction(
  {
    id: "nda-compare",
    concurrency: { limit: 3 },
    retries: 3,
  },
  { event: "comparison/requested" },
  async ({ event, step }) => {
    const { comparisonId, documentAId, documentBId, tenantId } = event.data as ComparisonRequestedData

    // Emit progress: queued
    await step.sendEvent("progress-queued", {
      name: "comparison/progress",
      data: { comparisonId, stage: "queued", progress: 0 },
    })

    // Step 1: Validate
    await step.run("validate", async () => {
      const comp = await getComparisonById(comparisonId, tenantId)
      if (!comp) throw new Error(`Comparison ${comparisonId} not found`)
      await updateComparisonStatus(comparisonId, "processing")
    })

    // Emit progress: retrieving
    await step.sendEvent("progress-retrieving", {
      name: "comparison/progress",
      data: { comparisonId, stage: "retrieving", progress: 10 },
    })

    // Step 2: Retrieve embeddings
    const { clausesA, clausesB } = await step.run("retrieve-embeddings", async () => {
      const extractionsA = await getClauseExtractionsByDocument(documentAId)
      const extractionsB = await getClauseExtractionsByDocument(documentBId)

      return {
        clausesA: extractionsA.map((e) => ({
          id: e.id,
          embedding: e.embedding as number[],
          categoryCode: e.categoryCode,
          content: e.content,
        })) as ClauseEmbedding[],
        clausesB: extractionsB.map((e) => ({
          id: e.id,
          embedding: e.embedding as number[],
          categoryCode: e.categoryCode,
          content: e.content,
        })) as ClauseEmbedding[],
      }
    })

    // Emit progress: aligning
    await step.sendEvent("progress-aligning", {
      name: "comparison/progress",
      data: { comparisonId, stage: "aligning", progress: 30 },
    })

    // Step 3: Align clauses
    const alignment = await step.run("align-clauses", async () => {
      return alignClauses(clausesA, clausesB, 0.7)
    })

    // Partial persistence after alignment
    await step.run("persist-alignment", async () => {
      await updateComparisonPartial(comparisonId, {
        clauseAlignments: alignment,
        lastCompletedStep: "align-clauses",
      })
    })

    // Emit progress: analyzing
    await step.sendEvent("progress-analyzing", {
      name: "comparison/progress",
      data: { comparisonId, stage: "analyzing", progress: 50 },
    })

    // Step 4: Analyze differences with AI SDK 6
    const differences = await step.run("analyze-differences", async () => {
      const results = []

      for (const match of alignment.matched) {
        const clauseA = clausesA.find((c) => c.id === match.clauseAId)
        const clauseB = clausesB.find((c) => c.id === match.clauseBId)
        if (!clauseA?.content || !clauseB?.content) continue

        // Check cache first
        const cacheKey = `diff:${match.clauseAId}:${match.clauseBId}`
        const cached = getResponseCache(cacheKey)
        if (cached) {
          results.push({ ...match, difference: cached })
          continue
        }

        const prompt = CLAUSE_DIFFERENCE_PROMPT
          .replace("{categoryCode}", match.categoryCode || "unknown")
          .replace("{clauseA}", clauseA.content)
          .replace("{clauseB}", clauseB.content)

        const { object } = await generateObject({
          model: claude("claude-sonnet-4-5-20250514"),
          schema: clauseDifferenceSchema,
          prompt,
          temperature: 0,
        })

        setResponseCache(cacheKey, object)
        results.push({ ...match, difference: object })
      }

      return results
    })

    // Emit progress: persisting
    await step.sendEvent("progress-persisting", {
      name: "comparison/progress",
      data: { comparisonId, stage: "persisting", progress: 80 },
    })

    // Step 5: Generate summary with AI SDK 6
    const summary = await step.run("generate-summary", async () => {
      const significantDiffs = differences.filter((d) => d.difference?.hasDifference)

      if (significantDiffs.length === 0) {
        return {
          differences: [],
          overallAssessment: "Documents are substantially identical",
          overallRisk: "standard" as const,
        }
      }

      const diffText = significantDiffs
        .map((d, i) => `${i + 1}. [${d.categoryCode}] ${d.difference.description}`)
        .join("\n")

      const { object } = await generateObject({
        model: claude("claude-sonnet-4-5-20250514"),
        schema: comparisonSummarySchema,
        prompt: COMPARISON_SUMMARY_PROMPT.replace("{differences}", diffText),
        temperature: 0,
      })

      return object
    })

    // Step 6: Final persistence
    await step.run("persist-final", async () => {
      await updateComparisonResults(comparisonId, {
        status: "completed",
        summary: summary.overallAssessment,
        clauseAlignments: { ...alignment, differences },
        keyDifferences: summary,
      })
    })

    // Emit completion
    await step.sendEvent("progress-completed", {
      name: "comparison/progress",
      data: { comparisonId, stage: "completed", progress: 100 },
    })

    await step.sendEvent("emit-completed", {
      name: "comparison/completed",
      data: {
        comparisonId,
        status: "completed",
        matchedPairs: alignment.metadata.matchedPairs,
        keyDifferencesCount: summary.differences.length,
      },
    })

    return { comparisonId, matchedPairs: alignment.metadata.matchedPairs }
  }
)
```

**Step: Run test**

Run: `pnpm test src/inngest/functions/compare.test.ts`
Expected: PASS

**Step: Commit**

```bash
git add src/inngest/functions/compare.ts src/inngest/functions/compare.test.ts
git commit -m "feat(inngest): add comparison function with AI SDK 6 and progress events"
```

---

## Phase 5: Generation Pipeline

### Task 9: Create Template Retrieval Service

**Files:**
- Create: `src/lib/template-service.ts`
- Create: `src/lib/template-service.test.ts`

Include:
- `getTemplateSections(source: "bonterms" | "commonaccord" | "custom")`
- `assembleTemplate(sections, parameters)`
- `getRecommendedSections(options)`

**Step: Commit**

```bash
git add src/lib/template-service.ts src/lib/template-service.test.ts
git commit -m "feat: add template retrieval service"
```

---

### Task 10: Create Generation Function

**Files:**
- Create: `src/inngest/functions/generate.ts`
- Create: `src/inngest/functions/generate.test.ts`

Follow same pattern as Task 8 with:
- AI SDK 6 `generateObject()` for template assembly
- Progress events at each stage
- Partial persistence for resume capability
- Response caching

**Step: Commit**

```bash
git add src/inngest/functions/generate.ts src/inngest/functions/generate.test.ts
git commit -m "feat(inngest): add generation function with AI SDK 6 and progress events"
```

---

## Phase 6: Export & API Routes

### Task 11: Create Document Export Utilities

**Files:**
- Create: `src/lib/document-export.ts`
- Create: `src/lib/document-export.test.ts`

Include:
- `exportToDocx(markdown, options)` - Returns Buffer
- `exportToPdf(markdown, options)` - Returns Buffer

**Step: Commit**

```bash
git add src/lib/document-export.ts src/lib/document-export.test.ts
git commit -m "feat: add DOCX and PDF export utilities"
```

---

### Task 12: Create Comparison API Routes

**Files:**
- Create: `app/api/comparisons/route.ts`
- Create: `app/api/comparisons/[id]/route.ts`

**Step: Commit**

```bash
git add app/api/comparisons
git commit -m "feat(api): add comparison routes"
```

---

### Task 13: Create Generation API Routes

**Files:**
- Create: `app/api/generate/route.ts`
- Create: `app/api/generate/[id]/route.ts`
- Create: `app/api/generate/[id]/export/route.ts`

**Step: Commit**

```bash
git add app/api/generate
git commit -m "feat(api): add generation routes with export"
```

---

### Task 14: Register Functions

**Files:**
- Modify: `src/inngest/functions/index.ts`
- Modify: `app/api/inngest/route.ts`

Add `compareNdaFunction` and `generateNdaFunction` to exports and serve handler.

**Step: Commit**

```bash
git add src/inngest/functions/index.ts app/api/inngest/route.ts
git commit -m "feat(inngest): register comparison and generation functions"
```

---

## Summary

This plan implements comparison and generation pipelines with:

| Feature | Implementation |
|---------|---------------|
| AI SDK 6 | `generateObject()` with Zod schemas |
| Progress Events | 6 stages per pipeline for real-time UI |
| Caching | Response cache for LLM calls |
| PRD Risk Levels | `standard \| cautious \| aggressive \| unknown` |
| Partial Persistence | Save after each step for resume |
| TDD | Test → Implement → Verify pattern |

### API Endpoints
- `POST /api/comparisons` - Create comparison
- `GET /api/comparisons/[id]` - Get comparison results
- `POST /api/generate` - Generate NDA
- `GET /api/generate/[id]` - Get generated NDA
- `POST /api/generate/[id]/export` - Export as DOCX/PDF

### Events
- `comparison/requested`, `comparison/progress`, `comparison/completed`
- `generation/requested`, `generation/progress`, `generation/completed`
