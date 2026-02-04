# Phase 2: Budget Protection - Research

**Researched:** 2026-02-04
**Domain:** Token estimation, upload validation, cost tracking, document truncation
**Confidence:** HIGH

## Summary

This phase implements two-stage budget protection: quick size checks at upload (50 pages / 10MB) and token budget enforcement after parsing (~200K tokens). The codebase already has a 10MB file size limit and a `BudgetTracker` class. The main work is adding page count validation at upload, post-parse token estimation, section-boundary truncation for oversized documents, and an admin-only usage API.

Token estimation can use the existing `gpt-tokenizer` library (already used in `lib/document-processing.ts` for chunking) as a proxy for Claude token counts. While Claude uses a different tokenizer, GPT tokenizers provide a reasonable ~10-15% accurate estimate for English text, sufficient for budget enforcement. The Anthropic API offers an official token counting endpoint, but using it would add latency and API calls - the local estimate after parsing is the pragmatic choice per CONTEXT.md decisions.

**Primary recommendation:** Add page count extraction during upload validation, count tokens after text extraction using `gpt-tokenizer`, truncate at section boundaries when exceeding budget, persist estimated/actual tokens plus cost to the `analyses` table, and expose a simple admin API for usage queries.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gpt-tokenizer` | In project | Token counting | Already used in chunking, fast local estimation |
| `pdf-parse` | In project | PDF metadata (page count) | Already used for text extraction |
| `mammoth` | In project | DOCX processing | Already used for text extraction |
| `drizzle-orm` | In project | Database queries | Already used throughout |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/lib/ai/budget` | In project | BudgetTracker class | Already tracks token usage per agent |
| `@/agents/validation` | In project | Validation gates | Existing pattern for pipeline validation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gpt-tokenizer | Anthropic API `/v1/messages/count_tokens` | Accurate but adds latency/API calls; local estimate is sufficient for budget enforcement |
| gpt-tokenizer | `@xenova/transformers` with claude-tokenizer | More accurate but heavier dependency; marginal improvement not worth complexity |

**No new dependencies required.** Everything needed is already in the project.

**Installation:** N/A - all libraries already installed.

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── budget/                  # NEW: Budget protection utilities
│   ├── index.ts            # Barrel export
│   ├── limits.ts           # Constants: MAX_FILE_SIZE, MAX_PAGES, TOKEN_BUDGET
│   ├── validation.ts       # Upload validators: validateFileSize, validatePageCount
│   ├── estimation.ts       # Token estimation: estimateTokens, isWithinBudget
│   └── truncation.ts       # Section-boundary truncation: truncateToTokenBudget

app/api/admin/
├── usage/                   # NEW: Admin usage API
│   └── route.ts            # GET /api/admin/usage - query usage stats

agents/
├── parser.ts               # MODIFY: Add token count to output
├── validation/
│   ├── gates.ts            # MODIFY: Add token budget validation gate

db/schema/
├── analyses.ts             # MODIFY: Add estimatedTokens, actualTokens, estimatedCost fields

inngest/functions/
├── analyze-nda.ts          # MODIFY: Add post-parse budget check, truncation logic
```

### Pattern 1: Two-Stage Upload Validation

**What:** Quick validation at upload time before storing the document

**When to use:** In `uploadDocument` server action before blob upload

**Example:**
```typescript
// lib/budget/limits.ts
export const BUDGET_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024,  // 10MB (existing)
  MAX_PAGES: 50,                     // New: page limit
  TOKEN_BUDGET: 200_000,             // Post-parse limit
} as const

// lib/budget/validation.ts
export interface UploadValidationResult {
  valid: boolean
  error?: {
    code: 'FILE_TOO_LARGE' | 'TOO_MANY_PAGES'
    message: string
    limit: number
    actual: number
  }
}

export function validateFileSize(sizeBytes: number): UploadValidationResult {
  if (sizeBytes > BUDGET_LIMITS.MAX_FILE_SIZE) {
    return {
      valid: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `File exceeds ${BUDGET_LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
        limit: BUDGET_LIMITS.MAX_FILE_SIZE,
        actual: sizeBytes,
      }
    }
  }
  return { valid: true }
}

export async function validatePageCount(
  buffer: Buffer,
  mimeType: string
): Promise<UploadValidationResult> {
  // PDF: Use pdf-parse to get page count
  if (mimeType === 'application/pdf') {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    const pageCount = result.pages.length

    if (pageCount > BUDGET_LIMITS.MAX_PAGES) {
      return {
        valid: false,
        error: {
          code: 'TOO_MANY_PAGES',
          message: `Document exceeds ${BUDGET_LIMITS.MAX_PAGES} page limit`,
          limit: BUDGET_LIMITS.MAX_PAGES,
          actual: pageCount,
        }
      }
    }
  }
  // DOCX: Can't reliably count pages before rendering, skip page check
  // (size limit provides sufficient protection)

  return { valid: true }
}
```

### Pattern 2: Post-Parse Token Estimation

**What:** Count tokens after text extraction, before expensive agent calls

**When to use:** In parser agent output or as validation gate after parser step

**Example:**
```typescript
// lib/budget/estimation.ts
import { encode } from 'gpt-tokenizer'

export interface TokenEstimate {
  tokenCount: number
  withinBudget: boolean
  budgetRemaining: number
  truncationNeeded: boolean
}

/**
 * Estimates token count for document text.
 * Uses gpt-tokenizer as proxy - Claude tokenizer may differ by ~10-15%
 * but this is sufficient for budget enforcement.
 */
export function estimateTokens(text: string): number {
  return encode(text).length
}

export function checkTokenBudget(
  text: string,
  budget: number = BUDGET_LIMITS.TOKEN_BUDGET
): TokenEstimate {
  const tokenCount = estimateTokens(text)
  const withinBudget = tokenCount <= budget

  return {
    tokenCount,
    withinBudget,
    budgetRemaining: Math.max(0, budget - tokenCount),
    truncationNeeded: !withinBudget,
  }
}
```

### Pattern 3: Section-Boundary Truncation

**What:** Truncate document at legal section boundaries when exceeding token budget

**When to use:** After parsing, when document exceeds token budget

**Example:**
```typescript
// lib/budget/truncation.ts
import { encode } from 'gpt-tokenizer'
import type { DocumentChunk } from '@/lib/document-processing'

export interface TruncationResult {
  text: string
  chunks: DocumentChunk[]
  truncated: boolean
  originalTokens: number
  truncatedTokens: number
  removedSections: string[]  // Section names that were removed
}

/**
 * Truncates document at section boundaries to fit within token budget.
 *
 * Strategy:
 * 1. Work with existing chunks (already split at section boundaries)
 * 2. Include chunks from start until budget exhausted
 * 3. Stop at the last complete section boundary
 * 4. Record which sections were removed
 */
export function truncateToTokenBudget(
  rawText: string,
  chunks: DocumentChunk[],
  budget: number = BUDGET_LIMITS.TOKEN_BUDGET
): TruncationResult {
  const originalTokens = encode(rawText).length

  if (originalTokens <= budget) {
    return {
      text: rawText,
      chunks,
      truncated: false,
      originalTokens,
      truncatedTokens: originalTokens,
      removedSections: [],
    }
  }

  // Accumulate chunks until we exceed budget
  let accumulatedTokens = 0
  let lastIncludedIndex = -1

  for (let i = 0; i < chunks.length; i++) {
    const chunkTokens = chunks[i].tokenCount
    if (accumulatedTokens + chunkTokens > budget) {
      break
    }
    accumulatedTokens += chunkTokens
    lastIncludedIndex = i
  }

  // Handle edge case: even first chunk exceeds budget
  if (lastIncludedIndex < 0) {
    lastIncludedIndex = 0  // Include at least one chunk
    accumulatedTokens = chunks[0].tokenCount
  }

  const includedChunks = chunks.slice(0, lastIncludedIndex + 1)
  const removedChunks = chunks.slice(lastIncludedIndex + 1)

  // Build truncated text from included chunks
  const truncatedText = includedChunks.map(c => c.content).join('\n\n')

  // Extract section names from removed chunks
  const removedSections = [...new Set(
    removedChunks
      .flatMap(c => c.sectionPath)
      .filter(Boolean)
  )]

  return {
    text: truncatedText,
    chunks: includedChunks,
    truncated: true,
    originalTokens,
    truncatedTokens: accumulatedTokens,
    removedSections,
  }
}
```

### Pattern 4: Token Budget Validation Gate

**What:** Validation gate that checks token budget after parsing

**When to use:** After parser step, before classifier step

**Example:**
```typescript
// agents/validation/gates.ts - addition
import { checkTokenBudget, truncateToTokenBudget } from '@/lib/budget'

export interface TokenBudgetValidation {
  passed: boolean
  estimate: TokenEstimate
  truncation?: TruncationResult
  warning?: {
    code: 'DOCUMENT_TRUNCATED'
    message: string
    removedSections: string[]
  }
}

export function validateTokenBudget(
  rawText: string,
  chunks: DocumentChunk[]
): TokenBudgetValidation {
  const estimate = checkTokenBudget(rawText)

  if (estimate.withinBudget) {
    return { passed: true, estimate }
  }

  // Document exceeds budget - truncate at section boundaries
  const truncation = truncateToTokenBudget(rawText, chunks)

  return {
    passed: true,  // Truncated version passes
    estimate,
    truncation,
    warning: {
      code: 'DOCUMENT_TRUNCATED',
      message: `Document exceeded ${BUDGET_LIMITS.TOKEN_BUDGET.toLocaleString()} token limit. Analysis will cover the first ${truncation.truncatedTokens.toLocaleString()} tokens.`,
      removedSections: truncation.removedSections,
    }
  }
}
```

### Pattern 5: Cost Tracking in Analysis Record

**What:** Persist token counts and estimated cost per analysis

**When to use:** Update analysis record with budget tracking data

**Example:**
```typescript
// db/schema/analyses.ts - additions to existing table
{
  // ... existing fields ...

  /**
   * Estimated input tokens before analysis (post-parse count).
   * Uses gpt-tokenizer as proxy for Claude tokens (~10-15% variance).
   */
  estimatedTokens: integer("estimated_tokens"),

  /**
   * Actual tokens used (sum of all agent calls).
   * Populated from AI SDK usage data after completion.
   */
  actualTokens: integer("actual_tokens"),

  /**
   * Estimated cost in dollars (input + output at Claude pricing).
   * Updated as agents complete.
   */
  estimatedCost: real("estimated_cost"),

  /**
   * Whether the document was truncated to fit token budget.
   */
  wasTruncated: boolean("was_truncated").default(false),
}
```

### Pattern 6: Admin Usage API

**What:** Admin-only endpoint to query usage statistics

**When to use:** For internal monitoring, future dashboard

**Example:**
```typescript
// app/api/admin/usage/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { organizationMembers, analyses } from "@/db/schema"
import { eq, and, gte, lte, sql, sum } from "drizzle-orm"

interface UsageQueryParams {
  organizationId?: string  // Filter by org (admin can query any)
  startDate?: string       // ISO date
  endDate?: string         // ISO date
  groupBy?: 'day' | 'week' | 'month'  // For time series
}

export async function GET(request: Request) {
  // Auth check (owner/admin only - same pattern as bootstrap)
  const session = await auth()

  if (!session?.user?.id || !session.activeOrganizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, session.user.id),
      eq(organizationMembers.organizationId, session.activeOrganizationId)
    ),
  })

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
  }

  // Parse query params
  const url = new URL(request.url)
  const organizationId = url.searchParams.get('organizationId') || session.activeOrganizationId
  const startDate = url.searchParams.get('startDate')
  const endDate = url.searchParams.get('endDate')

  // Build query conditions
  const conditions = [eq(analyses.tenantId, organizationId)]
  if (startDate) conditions.push(gte(analyses.createdAt, new Date(startDate)))
  if (endDate) conditions.push(lte(analyses.createdAt, new Date(endDate)))

  // Query aggregate usage
  const [usage] = await db
    .select({
      totalAnalyses: sql<number>`count(*)`,
      completedAnalyses: sql<number>`count(*) filter (where ${analyses.status} = 'completed')`,
      failedAnalyses: sql<number>`count(*) filter (where ${analyses.status} = 'failed')`,
      totalEstimatedTokens: sum(analyses.estimatedTokens),
      totalActualTokens: sum(analyses.actualTokens),
      totalEstimatedCost: sum(analyses.estimatedCost),
      truncatedDocuments: sql<number>`count(*) filter (where ${analyses.wasTruncated} = true)`,
    })
    .from(analyses)
    .where(and(...conditions))

  return NextResponse.json({
    organizationId,
    period: { startDate, endDate },
    usage: {
      analyses: {
        total: Number(usage.totalAnalyses),
        completed: Number(usage.completedAnalyses),
        failed: Number(usage.failedAnalyses),
        truncated: Number(usage.truncatedDocuments),
      },
      tokens: {
        estimated: Number(usage.totalEstimatedTokens ?? 0),
        actual: Number(usage.totalActualTokens ?? 0),
      },
      cost: {
        estimated: Number(usage.totalEstimatedCost ?? 0),
      }
    }
  })
}
```

### Anti-Patterns to Avoid

- **Don't use Anthropic API for pre-flight estimation:** Adds latency and API calls; local estimate is sufficient
- **Don't hard-fail on token budget exceeded:** Truncate gracefully instead
- **Don't truncate in the middle of sections:** Always stop at section boundaries
- **Don't expose cost data to regular users:** Admin-only per CONTEXT.md
- **Don't track Voyage AI costs separately (MVP):** Claude is the dominant cost; simplify tracking

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Character-based heuristics | `gpt-tokenizer` encode() | Already in project, accurate for estimates |
| Page counting for PDF | Manual PDF parsing | pdf-parse library | Already used for text extraction |
| Section detection | Custom regex patterns | Existing chunk sectionPath | Already implemented in document-processing.ts |
| Budget enforcement | Custom budget class | Extend existing BudgetTracker | Already tracks per-agent usage |

**Key insight:** Most of the building blocks exist. The work is orchestrating them: page count at upload, token count after parse, truncation using existing chunks, and schema additions for tracking.

## Common Pitfalls

### Pitfall 1: Token Count Mismatch Between Estimate and Actual

**What goes wrong:** Estimated tokens differ significantly from actual API usage

**Why it happens:** gpt-tokenizer uses OpenAI's encoding, Claude uses a different tokenizer

**How to avoid:** Document that estimate is ~10-15% approximate. Use estimate for budgeting decisions but track actual for analytics. The variance is acceptable for budget enforcement - a 200K budget with 10% error still prevents 300K+ runaway costs.

**Warning signs:** `actualTokens` consistently higher/lower than `estimatedTokens` by >20%

### Pitfall 2: Page Count Unavailable for DOCX

**What goes wrong:** Can't reject oversized DOCX files before upload

**Why it happens:** DOCX page count requires rendering (word processor calculates pages based on styles, fonts, margins)

**How to avoid:** For DOCX, rely on file size limit (10MB) and post-parse token count. The token budget validation catches oversized DOCX after parsing. Document this limitation.

**Warning signs:** Large DOCX files pass upload but fail token budget

### Pitfall 3: Truncation Loses Critical Clauses

**What goes wrong:** Important clauses at end of document get truncated

**Why it happens:** Legal documents often have critical provisions (indemnification, liability) toward the end

**How to avoid:** Include a clear warning message in analysis results listing which sections were removed. The `removedSections` array provides transparency. Consider future enhancement: priority-based section selection (not MVP).

**Warning signs:** Users complain about missing clause analysis

### Pitfall 4: Budget Check Before Parsing is Inaccurate

**What goes wrong:** File size/page count doesn't predict token count well

**Why it happens:** OCR'd PDFs, images-as-pages, and formatting vary wildly

**How to avoid:** CONTEXT.md already decided: check tokens AFTER parsing, not before. File size and page count are quick sanity checks, not accurate predictors.

**Warning signs:** Documents passing upload validation but wildly exceeding token budget

### Pitfall 5: Admin API Leaks Cross-Tenant Data

**What goes wrong:** Admin can query any organization's usage

**Why it happens:** Missing tenant isolation in admin queries

**How to avoid:** For MVP, restrict admin API to current organization only. The query defaults to `session.activeOrganizationId`. Future: add system-admin role for cross-org visibility.

**Warning signs:** Security audit finds admin can access other orgs

## Code Examples

### Complete Upload Validation Flow

```typescript
// app/(main)/(dashboard)/documents/actions.ts
import { validateFileSize, validatePageCount } from '@/lib/budget'

export async function uploadDocument(formData: FormData): Promise<ApiResponse<Document>> {
  const { db, tenantId, userId } = await withTenant()

  const file = formData.get("file")
  if (!file || !(file instanceof File)) {
    return err("VALIDATION_ERROR", "No file provided")
  }

  // Stage 1: Quick size check (existing, extracted to utility)
  const sizeValidation = validateFileSize(file.size)
  if (!sizeValidation.valid) {
    return err("VALIDATION_ERROR", sizeValidation.error!.message)
  }

  // Stage 1b: Page count check for PDFs
  if (file.type === 'application/pdf') {
    const buffer = Buffer.from(await file.arrayBuffer())
    const pageValidation = await validatePageCount(buffer, file.type)
    if (!pageValidation.valid) {
      return err("VALIDATION_ERROR", pageValidation.error!.message)
    }
  }

  // ... rest of upload flow (blob storage, db insert)
}
```

### Complete Pipeline Integration with Token Budget

```typescript
// inngest/functions/analyze-nda.ts - modified parser section
const parserResult = await step.run('parser-agent', () =>
  runParserAgent({ documentId, tenantId, source, content, metadata })
)

// Parser validation gate (existing)
const parserValidation = validateParserOutput(
  parserResult.document.rawText,
  parserResult.document.chunks
)
if (!parserValidation.valid) {
  // ... existing failure handling
}

// NEW: Token budget validation gate
const budgetValidation = validateTokenBudget(
  parserResult.document.rawText,
  parserResult.document.chunks
)

// Store estimate and handle truncation
let workingDocument = parserResult.document
let wasTruncated = false

if (budgetValidation.truncation) {
  // Document was truncated
  workingDocument = {
    ...parserResult.document,
    rawText: budgetValidation.truncation.text,
    chunks: budgetValidation.truncation.chunks,
  }
  wasTruncated = true

  // Log truncation for observability
  console.log('[Budget] Document truncated', {
    analysisId,
    originalTokens: budgetValidation.estimate.tokenCount,
    truncatedTokens: budgetValidation.truncation.truncatedTokens,
    removedSections: budgetValidation.truncation.removedSections,
  })
}

// Update analysis record with estimate and truncation status
await step.run('record-estimate', async () => {
  await ctx.db
    .update(analyses)
    .set({
      estimatedTokens: budgetValidation.estimate.tokenCount,
      wasTruncated,
      metadata: {
        ...(wasTruncated && {
          truncationWarning: budgetValidation.warning?.message,
          removedSections: budgetValidation.truncation?.removedSections,
        })
      },
    })
    .where(eq(analyses.id, analysisId))
})

await emitProgress(
  'parsing',
  20,
  wasTruncated
    ? `Parsed and truncated to ${workingDocument.chunks.length} chunks`
    : `Parsed ${workingDocument.chunks.length} chunks`
)

// Continue with truncated document for classifier...
const classifierResult = await step.run('classifier-agent', () =>
  runClassifierAgent({
    parsedDocument: workingDocument,  // Use truncated version
    budgetTracker,
  })
)
```

### Persisting Actual Tokens After Completion

```typescript
// inngest/functions/analyze-nda.ts - final persist step
await step.run('persist-final', async () => {
  const usage = budgetTracker.getUsage()

  await ctx.db
    .update(analyses)
    .set({
      status: 'completed',
      overallRiskScore: riskResult.overallRiskScore,
      overallRiskLevel: riskResult.overallRiskLevel,
      gapAnalysis: gapResult.gapAnalysis,
      tokenUsage: usage,  // Existing: full breakdown by agent
      actualTokens: usage.total.total,  // NEW: aggregate for easy querying
      estimatedCost: usage.total.estimatedCost,  // NEW: cost tracking
      processingTimeMs: Date.now() - startTime,
      completedAt: new Date(),
    })
    .where(eq(analyses.id, analysisId))
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Character count heuristics | BPE tokenizers | 2023+ | Accurate token estimation |
| Pre-flight API token count | Post-parse local estimation | Decision | Avoids API call overhead |
| Hard rejection on budget | Graceful truncation | Decision | Better UX per CONTEXT.md |

**Deprecated/outdated:**
- N/A - this is a new feature area

## Open Questions

### 1. Include Voyage AI Costs in Tracking?

**What we know:** Voyage AI is used for embeddings in the parser agent. Cost is ~$0.12 per 1M tokens.

**What's unclear:** Should we track this separately or roll it into the Claude cost estimate?

**Recommendation (Claude's Discretion):** Don't track separately for MVP. Claude is the dominant cost (~$3 input + $15 output per 1M vs $0.12 embedding). Add a note in the BudgetTracker that embedding costs are not included. Can add later if users request granular cost breakdown.

### 2. Token Tracking Granularity

**What we know:** CONTEXT.md says "Claude determines appropriate granularity"

**What's unclear:** Track per-stage (parser, classifier, risk, gap) or just total?

**Recommendation:** Keep existing BudgetTracker per-agent breakdown in `tokenUsage` JSONB, but add `actualTokens` integer for easy aggregate queries. This gives both detailed breakdown for debugging and simple totals for the admin API.

### 3. Error Message Tone

**What we know:** CONTEXT.md says "Claude's discretion on tone"

**What's unclear:** How technical should rejection/truncation messages be?

**Recommendation:** Keep messages factual and helpful:
- Size rejection: "File exceeds 10MB limit. Please upload a smaller document."
- Page rejection: "Document exceeds 50 page limit. Please upload a shorter document."
- Truncation warning: "This document was too large to analyze completely. The analysis covers the first X pages/sections. See details below for what was excluded."

## Sources

### Primary (HIGH confidence)
- Codebase: `lib/document-processing.ts` - Existing chunking with tokenCount and sectionPath
- Codebase: `lib/ai/budget.ts` - Existing BudgetTracker class
- Codebase: `app/(main)/(dashboard)/documents/actions.ts` - Existing upload validation
- Codebase: `agents/validation/gates.ts` - Existing validation gate pattern
- Context7 `/niieani/gpt-tokenizer` - Token counting API documentation

### Secondary (MEDIUM confidence)
- [Anthropic Token Counting API](https://platform.claude.com/docs/en/api/messages-count-tokens) - Official but not used per decision
- [Token Counting Best Practices](https://platform.claude.com/docs/en/build-with-claude/token-counting) - Anthropic guidance
- Codebase: `app/api/admin/bootstrap/route.ts` - Admin API pattern

### Tertiary (LOW confidence)
- WebSearch: Claude vs GPT tokenizer variance estimates (~10-15%) - needs validation

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH - All libraries already in use
- Architecture: HIGH - Patterns derived from existing codebase
- Pitfalls: MEDIUM - Some based on general knowledge, not verified in this specific context

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable approach)
