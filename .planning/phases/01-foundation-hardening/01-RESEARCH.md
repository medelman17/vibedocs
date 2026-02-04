# Phase 1: Foundation Hardening - Research

**Researched:** 2026-02-04
**Domain:** AI SDK migration, pipeline validation, database idempotency
**Confidence:** HIGH

## Summary

This phase migrates three agents (classifier, risk-scorer, gap-analyst) from deprecated `generateObject` to `generateText` + `Output.object()` (AI SDK 6 pattern), adds validation gates between pipeline stages, and converts database writes to upsert patterns for safe retries.

The codebase already uses AI SDK 6.0.67. The migration is straightforward since the same Zod schemas work with both APIs. Validation gates require careful integration with Inngest error handling and user-facing error messages. The parser agent does NOT use `generateObject` and requires no AI SDK migration.

**Primary recommendation:** Migrate agents incrementally (classifier first as it's simplest), add validation gates as middleware functions invoked after each `step.run()`, implement upserts via `onConflictDoUpdate` with `documentId+tenantId` as conflict targets.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | ^6.0.67 | Structured LLM output | Already in project, `Output.object()` is the current pattern |
| `drizzle-orm` | In project | Database ORM | Native `onConflictDoUpdate` support |
| `zod` | v4 | Schema validation | Same schemas work for both validation gates and AI SDK output |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/inngest` | In project | Durable workflows | Already orchestrates pipeline, use `NonRetriableError` for validation failures |
| `@/lib/errors` | In project | Error classes | `AnalysisFailedError` for user-facing pipeline errors |

### No New Dependencies

This phase requires NO new npm dependencies. Everything needed is already in the stack.

## Architecture Patterns

### Recommended Project Structure

```
agents/
├── classifier.ts           # Migrate: generateObject -> generateText + Output.object()
├── risk-scorer.ts          # Migrate: same pattern
├── gap-analyst.ts          # Migrate: same pattern
├── parser.ts               # NO CHANGE: doesn't use generateObject
├── validation/             # NEW: validation gate functions
│   ├── index.ts            # Barrel export
│   ├── gates.ts            # Validation gate implementations
│   └── errors.ts           # Pipeline-specific error messages

inngest/functions/
├── analyze-nda.ts          # Add validation gates after each step
```

### Pattern 1: AI SDK 6 Migration

**What:** Replace deprecated `generateObject` with `generateText` + `Output.object()`

**When to use:** All agent files currently using `generateObject`

**Current code (deprecated):**
```typescript
import { generateObject } from 'ai'

const { object, usage } = await generateObject({
  model: getAgentModel('classifier'),
  system: CLASSIFIER_SYSTEM_PROMPT,
  prompt,
  schema: classificationSchema,
})
```

**Migrated code (AI SDK 6):**
```typescript
import { generateText, Output } from 'ai'

const { output, usage } = await generateText({
  model: getAgentModel('classifier'),
  system: CLASSIFIER_SYSTEM_PROMPT,
  prompt,
  output: Output.object({ schema: classificationSchema }),
})

// output is typed as z.infer<typeof classificationSchema>
```

**Key differences:**
- Import `Output` alongside `generateText`
- Return property is `output` not `object`
- Schema wrapped in `Output.object({ schema: ... })`
- Same Zod schema works unchanged

### Pattern 2: Validation Gates

**What:** Functions that validate agent output and halt pipeline on critical failures

**When to use:** After each agent step in the Inngest pipeline

**Example:**
```typescript
// agents/validation/gates.ts
import { NonRetriableError } from '@/inngest/utils/errors'

export interface ValidationResult {
  valid: boolean
  error?: {
    code: string           // For logging
    userMessage: string    // Plain language for UI
    stage: string          // Which stage failed
    suggestion?: string    // Actionable guidance
  }
}

/**
 * Validates classifier output - halts if 0 clauses detected
 */
export function validateClassifierOutput(
  clauses: ClassifiedClause[]
): ValidationResult {
  if (clauses.length === 0) {
    return {
      valid: false,
      error: {
        code: 'ZERO_CLAUSES',
        userMessage: "We couldn't find any clauses in this document.",
        stage: 'clause extraction',
        suggestion: "Try uploading a different file format or check that the PDF isn't encrypted.",
      }
    }
  }
  return { valid: true }
}

/**
 * Validates parser output - halts if text extraction failed
 */
export function validateParserOutput(
  rawText: string,
  chunks: ParsedChunk[]
): ValidationResult {
  if (!rawText || rawText.trim().length === 0) {
    return {
      valid: false,
      error: {
        code: 'EMPTY_DOCUMENT',
        userMessage: "We couldn't extract any text from this document.",
        stage: 'document parsing',
        suggestion: "The file may be empty, encrypted, or in an unsupported format.",
      }
    }
  }

  if (chunks.length === 0) {
    return {
      valid: false,
      error: {
        code: 'NO_CHUNKS',
        userMessage: "The document couldn't be processed into analyzable sections.",
        stage: 'document parsing',
        suggestion: "Try a different document or file format.",
      }
    }
  }

  return { valid: true }
}
```

**Usage in Inngest pipeline:**
```typescript
// In analyze-nda.ts
const parserResult = await step.run('parser-agent', () =>
  runParserAgent({ documentId, tenantId, source, content, metadata })
)

// Validation gate - runs after step completes
const parserValidation = validateParserOutput(
  parserResult.document.rawText,
  parserResult.document.chunks
)
if (!parserValidation.valid) {
  await step.run('mark-failed', () =>
    markAnalysisFailed(analysisId, parserValidation.error!)
  )
  throw new NonRetriableError(parserValidation.error!.userMessage)
}
```

### Pattern 3: Idempotent Database Writes

**What:** Upsert patterns that prevent duplicate records on retry

**When to use:** All database inserts in the pipeline that could be retried

**Example:**
```typescript
// Create or update analysis record
await db
  .insert(analyses)
  .values({
    id: analysisId,  // Pre-generated UUID
    documentId,
    tenantId,
    status: 'processing',
  })
  .onConflictDoUpdate({
    target: analyses.id,
    set: {
      status: 'processing',
      updatedAt: new Date(),
    },
  })
```

**For clause extractions (bulk upsert):**
```typescript
// Upsert clauses with composite key
for (const clause of classifierResult.clauses) {
  await db
    .insert(clauseExtractions)
    .values({
      analysisId,
      documentId,
      tenantId,
      chunkId: clause.chunkId,
      category: clause.category,
      clauseText: clause.clauseText,
      // ... other fields
    })
    .onConflictDoUpdate({
      target: [clauseExtractions.analysisId, clauseExtractions.chunkId],
      set: {
        category: clause.category,
        clauseText: clause.clauseText,
        confidence: clause.confidence,
        updatedAt: new Date(),
      },
    })
}
```

### Pattern 4: Error Message Separation

**What:** Technical logging vs user-facing messages

**When to use:** All validation failures and pipeline errors

**Example:**
```typescript
// In validation gate
if (!validation.valid) {
  // Full technical details for server logs
  console.error('[Pipeline Validation Failed]', {
    code: validation.error.code,
    stage: validation.error.stage,
    documentId,
    analysisId,
    tenantId,
    timestamp: new Date().toISOString(),
  })

  // Persist failure state with technical info
  await markAnalysisFailed(analysisId, {
    code: validation.error.code,
    stage: validation.error.stage,
  })

  // Throw with user-friendly message (what reaches the client)
  throw new NonRetriableError(validation.error.userMessage)
}
```

### Anti-Patterns to Avoid

- **Don't validate inside agents:** Keep agents focused on their task; validation is orchestration concern
- **Don't throw generic errors:** Always include stage name and actionable suggestions
- **Don't retry validation failures:** These are permanent - input won't magically improve
- **Don't use INSERT without conflict handling:** Pipeline steps can be retried by Inngest

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM output validation | Custom JSON parsing | `Output.object()` with Zod schema | AI SDK handles retries, type coercion, partial outputs |
| Database upserts | SELECT-then-INSERT logic | `onConflictDoUpdate` | Race conditions, atomic operations |
| Error classification | Custom error types | `NonRetriableError` from Inngest utils | Already integrated with retry logic |
| Garbled text detection | Complex NLP heuristics | Simple character ratio checks (see pitfalls) | Sufficient for MVP; downstream agents catch edge cases |

**Key insight:** The validation gates are lightweight - they don't need to catch everything. A garbled document that passes basic validation will likely produce 0 or very low-confidence clauses, which the classifier validation gate catches anyway.

## Common Pitfalls

### Pitfall 1: Forgetting to handle NoObjectGeneratedError

**What goes wrong:** AI SDK 6 throws `NoObjectGeneratedError` when structured output fails (schema mismatch, LLM refusal, etc.)

**Why it happens:** The model may not always produce valid JSON matching the schema

**How to avoid:**
```typescript
import { generateText, Output, NoObjectGeneratedError } from 'ai'

try {
  const { output, usage } = await generateText({
    model,
    output: Output.object({ schema }),
    prompt,
  })
  return output
} catch (error) {
  if (NoObjectGeneratedError.isInstance(error)) {
    // error.text contains raw model output
    // error.usage contains token counts for billing
    throw new AnalysisFailedError(
      `Classification failed: ${error.cause}`,
      [{ field: 'llm', message: error.text?.slice(0, 200) ?? 'Unknown' }]
    )
  }
  throw error
}
```

**Warning signs:** Tests pass with mocks but production fails silently

### Pitfall 2: Non-idempotent analysis creation

**What goes wrong:** Each retry creates a new analysis record, leaving orphaned records

**Why it happens:** Current code uses `insert().returning()` which always creates new rows

**How to avoid:** Pre-generate the analysis ID before the pipeline starts, pass it through steps:
```typescript
// Generate ID outside of step.run for consistency
const analysisId = crypto.randomUUID()

await step.run('create-analysis', async () => {
  await db
    .insert(analyses)
    .values({ id: analysisId, documentId, tenantId, status: 'processing' })
    .onConflictDoUpdate({
      target: analyses.id,
      set: { status: 'processing', updatedAt: new Date() },
    })
})
```

**Warning signs:** Multiple analysis records for one document after retries

### Pitfall 3: Validation inside step.run

**What goes wrong:** Validation failure causes step retry instead of pipeline halt

**Why it happens:** Errors inside `step.run` trigger Inngest retry logic

**How to avoid:** Validate AFTER step completes:
```typescript
// CORRECT: Validate outside step
const result = await step.run('classifier-agent', () => runClassifierAgent(...))
const validation = validateClassifierOutput(result.clauses)
if (!validation.valid) {
  throw new NonRetriableError(validation.error.userMessage)
}

// WRONG: Validation inside step (will retry)
const result = await step.run('classifier-agent', async () => {
  const output = await runClassifierAgent(...)
  if (output.clauses.length === 0) throw new Error('No clauses') // BAD!
  return output
})
```

**Warning signs:** Validation failures cause 3 retries before failing

### Pitfall 4: Losing position information through migration

**What goes wrong:** Word Add-in can't highlight clauses after migration

**Why it happens:** Changing agent output shape without updating downstream consumers

**How to avoid:** Keep output shapes identical - only change how LLM is called internally. The migration is:
```
// Only this line changes:
const { object, usage } = await generateObject(...)
// becomes:
const { output, usage } = await generateText({ output: Output.object(...) })

// All downstream code stays the same:
clauses.push({
  chunkId: chunk.id,
  clauseText: chunk.content,
  category: output.category,  // was: object.category
  // ... rest unchanged
})
```

**Warning signs:** Position-related tests fail after migration

### Pitfall 5: Overly aggressive garbled text detection

**What goes wrong:** Legitimate legal text with special formatting gets rejected

**Why it happens:** Legal documents often have unusual character sequences (section symbols, roman numerals, etc.)

**How to avoid:** Use conservative heuristics only for extreme cases:
```typescript
function hasMinimalTextQuality(text: string): boolean {
  // Only catch truly garbled text, not unusual formatting
  const alphanumericRatio = (text.match(/[a-zA-Z0-9]/g)?.length ?? 0) / text.length

  // Legal docs should be >40% alphanumeric (very conservative)
  // This catches binary data, completely broken encoding, empty content
  return alphanumericRatio > 0.4 && text.length > 100
}
```

**Warning signs:** Valid PDFs with unusual formatting fail validation

## Code Examples

### Complete AI SDK 6 Migration for Classifier

```typescript
// agents/classifier.ts - BEFORE
import { generateObject } from 'ai'
import { getAgentModel } from '@/lib/ai/config'
import { classificationSchema } from './types'

const { object, usage } = await generateObject({
  model: getAgentModel('classifier'),
  system: CLASSIFIER_SYSTEM_PROMPT,
  prompt,
  schema: classificationSchema,
})

// usage is { inputTokens: number, outputTokens: number }
// object is z.infer<typeof classificationSchema>
```

```typescript
// agents/classifier.ts - AFTER (AI SDK 6)
import { generateText, Output, NoObjectGeneratedError } from 'ai'
import { getAgentModel } from '@/lib/ai/config'
import { classificationSchema } from './types'

let result
try {
  result = await generateText({
    model: getAgentModel('classifier'),
    system: CLASSIFIER_SYSTEM_PROMPT,
    prompt,
    output: Output.object({ schema: classificationSchema }),
  })
} catch (error) {
  if (NoObjectGeneratedError.isInstance(error)) {
    // Log technical details
    console.error('[Classifier] Object generation failed', {
      cause: error.cause,
      text: error.text?.slice(0, 500),
      usage: error.usage,
    })
    throw new AnalysisFailedError(
      'Classification failed to produce valid output',
      [{ field: 'chunk', message: `Model output: ${error.text?.slice(0, 100) ?? 'empty'}` }]
    )
  }
  throw error
}

const { output, usage } = result
// output is z.infer<typeof classificationSchema>
// usage is { inputTokens: number, outputTokens: number } (same shape!)
```

### Complete Validation Gate Integration

```typescript
// inngest/functions/analyze-nda.ts - with validation gates
import { validateParserOutput, validateClassifierOutput } from '@/agents/validation'
import { NonRetriableError } from '@/inngest/utils/errors'

export const analyzeNda = inngest.createFunction(
  { id: 'analyze-nda', retries: 3 },
  { event: 'nda/analysis.requested' },
  async ({ event, step }) => {
    const { documentId, tenantId } = event.data
    const analysisId = crypto.randomUUID()

    await withTenantContext(tenantId, async (ctx) => {
      // Create/update analysis record (idempotent)
      await step.run('create-analysis', async () => {
        await ctx.db
          .insert(analyses)
          .values({ id: analysisId, documentId, tenantId, status: 'processing' })
          .onConflictDoUpdate({
            target: analyses.id,
            set: { status: 'processing', updatedAt: new Date() },
          })
      })

      // Parser step
      const parserResult = await step.run('parser-agent', () =>
        runParserAgent({ documentId, tenantId, ...event.data })
      )

      // Parser validation gate
      const parserValidation = validateParserOutput(
        parserResult.document.rawText,
        parserResult.document.chunks
      )
      if (!parserValidation.valid) {
        await step.run('mark-parser-failed', async () => {
          await ctx.db
            .update(analyses)
            .set({
              status: 'failed',
              progressStage: 'failed',
              metadata: {
                failedAt: 'parsing',
                errorCode: parserValidation.error!.code,
              },
            })
            .where(eq(analyses.id, analysisId))
        })
        throw new NonRetriableError(parserValidation.error!.userMessage)
      }

      await emitProgress('parsing', 20, `Parsed ${parserResult.document.chunks.length} chunks`)

      // Classifier step
      const classifierResult = await step.run('classifier-agent', () =>
        runClassifierAgent({ parsedDocument: parserResult.document, budgetTracker })
      )

      // Classifier validation gate - 0 clauses = always halt (per CONTEXT.md)
      const classifierValidation = validateClassifierOutput(classifierResult.clauses)
      if (!classifierValidation.valid) {
        await step.run('mark-classifier-failed', async () => {
          await ctx.db
            .update(analyses)
            .set({
              status: 'failed',
              progressStage: 'failed',
              metadata: {
                failedAt: 'classifying',
                errorCode: classifierValidation.error!.code,
              },
            })
            .where(eq(analyses.id, analysisId))
        })
        throw new NonRetriableError(classifierValidation.error!.userMessage)
      }

      await emitProgress('classifying', 45, `Classified ${classifierResult.clauses.length} clauses`)

      // ... continue with risk-scorer and gap-analyst
    })
  }
)
```

### User-Friendly Error Messages (per CONTEXT.md)

```typescript
// agents/validation/messages.ts

export const VALIDATION_MESSAGES = {
  ZERO_CLAUSES: {
    userMessage: "We couldn't find any clauses in this document.",
    suggestion: "Check that the file contains actual contract text, not just headers or images.",
  },
  EMPTY_DOCUMENT: {
    userMessage: "We couldn't extract any text from this document.",
    suggestion: "Try uploading a different file format or check that the PDF isn't encrypted.",
  },
  GARBLED_TEXT: {
    userMessage: "The document text appears to be corrupted or unreadable.",
    suggestion: "Try re-saving the document or using a different file format.",
  },
  LOW_QUALITY_TEXT: {
    userMessage: "The document quality is too low for reliable analysis.",
    suggestion: "If this is a scanned document, try a higher resolution scan or use searchable PDF format.",
  },
} as const

export function formatValidationError(
  code: keyof typeof VALIDATION_MESSAGES,
  stage: string
): ValidationResult['error'] {
  const message = VALIDATION_MESSAGES[code]
  return {
    code,
    stage,
    userMessage: message.userMessage,
    suggestion: message.suggestion,
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateObject()` | `generateText()` + `Output.object()` | AI SDK 6.0 | Unified API, better error handling |
| `maxSteps` in streamText | `stopWhen: stepCountIs(n)` | AI SDK 6.0 | More flexible stopping conditions |
| `maxTokens` | `maxOutputTokens` | AI SDK 6.0 | Naming clarity |
| `.errors` on ZodError | `.issues` on ZodError | Zod 4 | Already handled in codebase |

**Deprecated/outdated:**
- `generateObject()`: Still works but deprecated, removal planned in future AI SDK version
- `streamObject()`: Same - use `streamText()` with `Output.object()` instead

## Open Questions

### 1. Low-confidence classification handling (Claude's Discretion)

**What we know:** Current code filters out `Unknown` classifications with confidence < 0.5

**What's unclear:** Should other categories with low confidence be flagged but not blocked?

**Recommendation:** Keep current behavior (filter low-confidence Unknowns), add optional metadata flag for low-confidence (<0.7) classifications of known categories. Flag but don't block - downstream stages benefit from the classification even if uncertain.

### 2. Garbled text detection (Claude's Discretion)

**What we know:** Simple heuristics (alphanumeric ratio, minimum length) can catch extreme cases

**What's unclear:** How aggressive to be with detection

**Recommendation:** Use conservative heuristic (>40% alphanumeric, >100 chars) as first-pass filter. If document passes this but produces 0 clauses, the classifier validation gate handles it. Better to let questionable documents through and fail gracefully at classifier stage with "no clauses found" message than to over-filter at parser stage.

### 3. Clause extraction upsert key

**What we know:** Need composite key for idempotent clause inserts

**What's unclear:** Is `(analysisId, chunkId)` the right key?

**Recommendation:** Add unique constraint on `(analysisId, chunkId)` to `clauseExtractions` table. Each chunk should produce at most one extraction per analysis. If the classifier returns different categories on retry (unlikely), the upsert will update to the latest classification.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/ai-sdk_dev` - AI SDK 6 migration guide, Output.object() documentation
- Context7 `/websites/orm_drizzle_team` - Drizzle upsert patterns with onConflictDoUpdate
- Codebase: `agents/*.ts` - Current agent implementations using generateObject
- Codebase: `inngest/utils/errors.ts` - Inngest error handling patterns
- Codebase: `inngest/functions/analyze-nda.ts` - Current pipeline orchestration

### Secondary (MEDIUM confidence)
- [OCR Confidence-Aware Error Detection](https://arxiv.org/html/2409.04117v1) - Garbled text detection approaches
- Codebase: `lib/errors.ts` - AppError pattern for user-facing errors

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH - All libraries already in use, well-documented
- Architecture: HIGH - Patterns derived from existing codebase plus official AI SDK docs
- Pitfalls: MEDIUM - Some pitfalls based on common patterns, not all verified in this codebase

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable libraries)
