# Phase 6: CUAD Classification - Research

**Researched:** 2026-02-05
**Domain:** LLM-powered multi-label legal clause classification with RAG retrieval
**Confidence:** HIGH (existing codebase + established patterns)

## Summary

Phase 6 enhances the existing classifier agent to meet all CLS-01 through CLS-06 requirements. The codebase already has a working classifier agent (`agents/classifier.ts`) with prompt, vector search, and pipeline integration. The main work is: (1) creating a new `chunkClassifications` table for multi-label results separate from the existing `clauseExtractions` table, (2) enhancing the classifier to use surrounding chunk context and both CUAD/ContractNLI references, (3) implementing two-stage RAG retrieval (embed then narrow), (4) adding document-level aggregation with dual-view support, and (5) adding confidence flagging in the UI.

The existing infrastructure is solid. The `findSimilarClauses` function, `findMatchingCategories` query, Voyage AI embeddings, and Inngest pipeline orchestration are all in place. The changes are primarily refinements to the classifier agent, a new database table, and UI additions.

**Primary recommendation:** Evolve the existing classifier agent incrementally. Create a new `chunkClassifications` junction table for clean multi-label storage. Use a two-stage approach: vector search narrows candidate categories, then Claude classifies with context from 1-2 neighbor chunks. Batch classification calls (3-5 chunks per LLM call) to reduce API round-trips while staying within output token limits.

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| AI SDK 6 (`ai`) | 6.x | `generateText` with `Output.object` for structured classification | Already used by classifier agent |
| Drizzle ORM | latest | New `chunkClassifications` table, query composition | Project ORM |
| Inngest | latest | Pipeline orchestration, `step.run()` for durable classification steps | Project workflow engine |
| Voyage AI (voyage-law-2) | - | Embedding generation for RAG retrieval | Project embedding model |
| Claude Sonnet 4 | - | Classification model (`AGENT_MODELS.classifier = balanced`) | Already configured |
| zod | 4.x | Schema validation for classification output | Project validation |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lru-cache | latest | Vector search result caching | Already configured (5-min TTL, 500 entries) |
| pgvector | - | HNSW-indexed cosine similarity search | Already set up for reference_embeddings |

### No New Dependencies Needed
This phase requires zero new npm packages. Everything needed is already in the project.

## Architecture Patterns

### Current vs Target Data Flow

**Current flow (in `analyze-nda.ts`):**
```
chunks -> classifier agent (1 per chunk) -> ClassifiedClause[] -> persist to clauseExtractions
```

**Target flow:**
```
chunks -> retrieve neighbors -> batch vector search -> batch classify (3-5 per call)
  -> ChunkClassification[] -> persist to chunkClassifications table
  -> aggregate to document-level clause list -> expose via server actions
```

### Recommended Changes to Existing Files

```
agents/
  classifier.ts          # MODIFY: batch classification, neighbor context, two-stage RAG
  prompts/classifier.ts  # MODIFY: enhanced prompt with neighbor context, rationale output
  types.ts               # MODIFY: new schema for multi-label output
db/
  schema/analyses.ts     # MODIFY: add chunkClassifications table
  schema/index.ts        # MODIFY: export new table
  queries/               # ADD: classification queries (by-category, by-document-order)
inngest/
  functions/analyze-nda.ts  # MODIFY: replace classifier step with enhanced version
app/(main)/
  (dashboard)/analyses/actions.ts  # MODIFY: add classification query actions
components/
  artifact/analysis-view.tsx       # MODIFY: add classification view with toggle
```

### Pattern 1: Separate Classification Junction Table

**What:** Store classifications in a dedicated `chunkClassifications` table instead of on `clauseExtractions`.

**When to use:** When a single chunk can have multiple category labels (multi-label classification).

**Why:** The CONTEXT.md decision explicitly states "Classification results stored in a separate table (not on chunk records) -- supports multi-label cleanly." The existing `clauseExtractions` table conflates classification with risk scoring. Phase 6 only handles classification; risk scoring is a separate concern already handled by the risk-scorer agent.

**Schema:**
```typescript
// db/schema/analyses.ts - NEW TABLE
export const chunkClassifications = pgTable(
  "chunk_classifications",
  {
    ...primaryId,
    ...tenantId,
    analysisId: uuid("analysis_id").notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id").notNull()
      .references(() => documentChunks.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    // Classification
    category: text("category").notNull(),          // CUAD category or "Uncategorized"
    confidence: real("confidence").notNull(),       // 0.0 - 1.0
    isPrimary: boolean("is_primary").notNull().default(true),
    rationale: text("rationale"),                   // Brief explanation

    // Position (denormalized from chunk for query efficiency)
    chunkIndex: integer("chunk_index").notNull(),   // For document-order view
    startPosition: integer("start_position"),
    endPosition: integer("end_position"),

    ...timestamps,
  },
  (table) => [
    index("idx_chunk_class_analysis").on(table.analysisId),
    index("idx_chunk_class_category").on(table.analysisId, table.category),
    index("idx_chunk_class_chunk").on(table.chunkId),
    index("idx_chunk_class_document_order").on(table.analysisId, table.chunkIndex),
    // A chunk can have multiple classifications, but only one primary per analysis
    unique("chunk_class_primary").on(table.analysisId, table.chunkId, table.category),
  ]
)
```

**Key design decisions:**
- `isPrimary` boolean distinguishes primary (highest confidence) from secondary labels
- `chunkIndex` denormalized for efficient document-order queries without join
- Unique constraint on (analysisId, chunkId, category) prevents duplicate labels
- Cascading deletes from both analysis and chunk

### Pattern 2: Two-Stage RAG Retrieval

**What:** First use vector search to narrow candidate categories, then use full classification prompt with retrieved examples.

**When to use:** For every chunk classification to reduce LLM context window usage.

**Rationale (Claude's discretion from CONTEXT.md):** The two-stage approach is recommended over full-taxonomy because:
- Sending all 41 CUAD categories in every prompt wastes tokens
- Vector search effectively narrows to 5-8 candidate categories
- The LLM can focus attention on the most relevant categories
- Reference examples from both CUAD and ContractNLI provide better grounding

**Implementation:**
```typescript
// Stage 1: Vector search narrows candidates
const references = await findSimilarClauses(chunk.content, { limit: 7 })
// This returns results from BOTH CUAD and ContractNLI (both are in reference_embeddings)

// Stage 2: Extract unique candidate categories from references
const candidateCategories = [...new Set(references.map(r => r.category))]

// Stage 3: LLM classifies with focused context
const result = await generateText({
  model: getAgentModel('classifier'),
  system: CLASSIFIER_SYSTEM_PROMPT,
  prompt: createClassifierPrompt(chunk.content, neighborContext, references, candidateCategories),
  output: Output.object({ schema: multiLabelClassificationSchema }),
})
```

### Pattern 3: Neighbor Chunk Context

**What:** Include 1-2 surrounding chunks when classifying to handle boundary-spanning clauses.

**When to use:** Always. The CONTEXT.md explicitly requires this.

**Implementation:**
```typescript
// Build neighbor context map before classification loop
function buildNeighborMap(chunks: ParsedChunk[]): Map<string, { prev?: string; next?: string }> {
  const map = new Map()
  for (let i = 0; i < chunks.length; i++) {
    map.set(chunks[i].id, {
      prev: i > 0 ? chunks[i - 1].content.slice(-200) : undefined,  // Last 200 chars
      next: i < chunks.length - 1 ? chunks[i + 1].content.slice(0, 200) : undefined,  // First 200 chars
    })
  }
  return map
}
```

**Prompt integration:** Include neighbor context as "[PRECEDING CONTEXT]" and "[FOLLOWING CONTEXT]" sections in the classification prompt. Truncate to ~200 characters each to keep token usage manageable.

### Pattern 4: Batch Classification Calls

**What:** Send 3-5 chunks per LLM call instead of 1 chunk per call.

**When to use:** To reduce API round-trips and cost. The classifier agent budget is 60K tokens.

**Rationale (Claude's discretion from CONTEXT.md):** Individual classification calls are wasteful because:
- System prompt (41 categories, ~2000 tokens) is resent every call
- API latency dominates for small requests
- Anthropic prompt caching can help but batching is more efficient

**Implementation with `Output.object`:**
```typescript
// Batch schema - array of classifications
const batchClassificationSchema = z.object({
  classifications: z.array(z.object({
    chunkIndex: z.number(),        // Which chunk in the batch
    primary: z.object({
      category: cuadCategorySchema,
      confidence: z.number().min(0).max(1),
      rationale: z.string().max(150),
    }),
    secondary: z.array(z.object({
      category: cuadCategorySchema,
      confidence: z.number().min(0).max(1),
    })).max(2).default([]),
  }))
})
```

**Batch size:** 3-5 chunks per call. At ~400 tokens/chunk + ~200 tokens neighbor context + ~500 tokens references = ~1100 tokens/chunk input. A batch of 5 = ~5500 tokens input + ~2000 tokens system = ~7500 tokens per call. Well within budget.

### Pattern 5: Document-Level Aggregation

**What:** Aggregate chunk classifications into a document-level clause list with two views.

**When to use:** After all classifications are persisted, before completing the analysis.

**Views (per CONTEXT.md):**
1. **Grouped by category:** All chunks classified under each CUAD category, with all instances (not just highest confidence)
2. **Document order:** All classifications sorted by chunk position in the document

**Query patterns:**
```typescript
// View 1: Grouped by category
const byCategory = await db
  .select()
  .from(chunkClassifications)
  .where(eq(chunkClassifications.analysisId, analysisId))
  .orderBy(chunkClassifications.category, desc(chunkClassifications.confidence))

// View 2: Document order
const byPosition = await db
  .select()
  .from(chunkClassifications)
  .where(eq(chunkClassifications.analysisId, analysisId))
  .orderBy(chunkClassifications.chunkIndex, desc(chunkClassifications.isPrimary))
```

### Anti-Patterns to Avoid

- **Storing multi-label results as JSON array on chunk:** Makes querying by category expensive and prevents proper indexing. Use the junction table.
- **Classifying boilerplate chunks:** The existing pipeline already filters out boilerplate before classification. Continue this pattern.
- **Full taxonomy in every prompt:** 41 categories + descriptions bloats every call. Use two-stage RAG to narrow.
- **One LLM call per chunk:** Wastes system prompt tokens and adds latency. Batch 3-5 chunks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity search | Custom cosine distance | Existing `findSimilarClauses()` | Already optimized with HNSW, caching |
| Embedding generation | Custom Voyage API calls | Existing `VoyageAIClient` | Already handles batching, caching |
| Rate limiting | Custom delay logic | Existing `getRateLimitDelay()` + `step.sleep()` | Project convention |
| Pipeline orchestration | Custom retry/durability | Inngest `step.run()` | Project convention |
| Structured output parsing | Manual JSON parsing | AI SDK `Output.object({ schema })` | Handles validation, retries |
| Budget tracking | Custom token counting | Existing `BudgetTracker` | Already wired into pipeline |

## Common Pitfalls

### Pitfall 1: clauseExtractions Table Confusion
**What goes wrong:** Attempting to modify `clauseExtractions` for multi-label classification when it's designed for risk-scored clauses.
**Why it happens:** `clauseExtractions` already has `category` and `secondaryCategories` columns, making it seem like the right place.
**How to avoid:** Create the new `chunkClassifications` table as specified in CONTEXT.md. The `clauseExtractions` table continues to serve the risk-scorer agent (Phase 7). The classifier will populate `chunkClassifications`, and the risk-scorer will read from it.
**Warning signs:** If you're adding columns to `clauseExtractions`, you're in the wrong table.

### Pitfall 2: "Uncategorized" vs "Unknown" Category Confusion
**What goes wrong:** Using the existing `Unknown` CUAD category for chunks that don't match any category.
**Why it happens:** The `CUAD_CATEGORIES` array already includes `'Unknown'` as the 41st entry.
**How to avoid:** Per CONTEXT.md, chunks matching no category above threshold should be labeled "Uncategorized" (explicitly visible). This is different from `Unknown` which is a CUAD category meaning "unable to classify." Add `'Uncategorized'` as a valid value for the classification output, distinct from `'Unknown'`.
**Warning signs:** If uncategorized chunks are being dropped/hidden, you're violating the CONTEXT.md decision.

### Pitfall 3: Serialization Issues with Inngest step.run()
**What goes wrong:** Returning non-serializable data from `step.run()` (e.g., class instances, functions).
**Why it happens:** Inngest serializes step results to JSON for durability. Complex objects lose their prototype chain.
**How to avoid:** Always return plain objects/arrays from `step.run()`. The existing code already handles this with type assertions after steps.
**Warning signs:** `TypeError: X is not a function` after a step boundary.

### Pitfall 4: Vector Search Cache Invalidation
**What goes wrong:** Stale search cache returns outdated results during classification.
**Why it happens:** The LRU cache in `vector-search.ts` has a 5-minute TTL. If classification runs for multiple minutes, cached results may not reflect the best matches.
**How to avoid:** This is actually fine for classification since reference embeddings don't change during a classification run. The cache key includes query hash + category + limit, so different chunks get different cache entries.
**Warning signs:** Not a real concern for this phase.

### Pitfall 5: Token Budget Overrun
**What goes wrong:** Batch classification with neighbor context exceeds the 60K classifier agent budget.
**Why it happens:** Neighbor context (200 chars x 2) + references (500 chars x 7) + chunk content (400-1000 tokens) per chunk. A batch of 5 could use 7-10K input tokens per call.
**How to avoid:** Track token usage via `BudgetTracker` and adjust batch size dynamically. Start with batches of 3 and increase if budget allows. For a typical 30-chunk NDA, 10 LLM calls x ~3K output tokens = ~30K output tokens + ~30K input tokens = within 60K budget.
**Warning signs:** `BudgetTracker.isWarning` returns true before classification is complete.

### Pitfall 6: Downstream Risk Scorer Compatibility
**What goes wrong:** The risk-scorer agent expects `ClassifiedClause[]` from the classifier. Changing the output shape breaks the pipeline.
**Why it happens:** The risk-scorer is tightly coupled to `ClassifiedClause` type.
**How to avoid:** After classification, build a compatibility layer that transforms `ChunkClassification[]` into `ClassifiedClause[]` for the risk-scorer. Keep the risk-scorer's interface stable. Alternatively, have the risk-scorer read directly from the new `chunkClassifications` table.
**Warning signs:** Risk-scorer agent fails after classifier changes.

## Discretionary Decisions (Researcher Recommendations)

These address the "Claude's discretion" items from CONTEXT.md:

### 1. Primary/Secondary vs Flat List Approach
**Recommendation: Primary + up to 2 secondary labels.**
Rationale: The existing `classificationSchema` already uses this pattern. A flat list makes it unclear which category is most relevant. Primary/secondary is also what the PRD specifies (CLS-04).

### 2. Max Categories per Chunk
**Recommendation: 1 primary + max 2 secondary = 3 total.**
Rationale: NDA chunks rarely span more than 3 distinct legal concepts. More labels dilute confidence and add noise.

### 3. Confidence Threshold for Low-Confidence Flagging
**Recommendation: 0.7 (as suggested by roadmap).**
Rationale: The existing classifier prompt already defines 0.7-0.9 as "strong match with minor ambiguity" and 0.5-0.7 as "moderate confidence, recommend human review." The 0.7 threshold aligns with this scale. CUAD research uses precision-recall curves where ~0.7 confidence balances recall and precision well for 41-category taxonomy.

### 4. Minimum Confidence Floor (Below Which Classifications Are Dropped)
**Recommendation: 0.3.**
Rationale: Below 0.3, the model is essentially guessing. These chunks should be labeled "Uncategorized" rather than given a low-confidence wrong label. The existing classifier already drops Unknown categories below 0.5; applying a stricter floor of 0.3 for actual categories prevents noise.

### 5. Brief Rationale per Classification
**Recommendation: Yes, include a brief rationale (1-2 sentences, max 150 chars).**
Rationale: Rationale adds minimal token cost (~20 tokens per classification) but provides significant value for review. It helps users understand why a chunk was classified a certain way without requiring legal expertise. The existing classifier already outputs `reasoning`, so this is a natural extension.

### 6. Two-Stage vs Full Taxonomy
**Recommendation: Two-stage (embed -> narrow -> classify).**
Rationale: Reduces input tokens per call by ~1000 tokens (no need to list all 41 categories with descriptions). Vector search effectively narrows to 5-10 candidate categories. The system prompt still lists all 41 categories as a reference, but the user prompt only presents the top candidates.

### 7. Number of Retrieved Examples per Chunk
**Recommendation: 7 examples from reference corpus (up from current 3).**
Rationale: 7 examples provide better category coverage while staying within token limits. With two sources (CUAD + ContractNLI), 7 examples gives ~4 from CUAD and ~3 from ContractNLI on average. The current implementation uses 3, which is too few for reliable multi-label classification.

### 8. Individual vs Batch Classification Calls
**Recommendation: Batch 3-5 chunks per call.**
Rationale: Reduces API calls from ~30 (one per chunk) to ~8 (batches of 3-5). System prompt (~2000 tokens) is amortized. Claude handles batch classification well with structured output. Rate limiting between batches via `step.sleep()`.

### 9. Caching/Deduplication of Results
**Recommendation: Rely on existing infrastructure (LRU cache for vector search + idempotent DB inserts).**
Rationale: The vector search cache already handles repeated queries. Classification results should use `ON CONFLICT DO NOTHING` on the unique constraint. No additional caching layer needed.

### 10. Section Path in Classification Prompt
**Recommendation: Yes, include section path (headings) when available.**
Rationale: Section path provides structural context (e.g., "Article 5 / Confidentiality") that helps the classifier distinguish ambiguous clauses. The `sectionPath` field is already on `documentChunks`. Include it as a short prefix in the prompt.

### 11. Flagging UI Pattern
**Recommendation: Inline badge on each classification card.**
Rationale: A low-confidence badge (e.g., yellow "Review" badge) next to the confidence score is the most discoverable pattern. No separate section needed since the existing `ClauseCard` component already shows badges. Add a confidence badge alongside the risk badge.

### 12. User Override of Classifications
**Recommendation: View-only for this phase.**
Rationale: CONTEXT.md says "view-only is acceptable for this phase." User override adds significant complexity (optimistic UI, server persistence, conflict resolution) that should be deferred.

## Code Examples

### Enhanced Classification Schema (for batch output)
```typescript
// agents/types.ts - Enhanced schema for Phase 6
export const multiLabelClassificationSchema = z.object({
  classifications: z.array(z.object({
    chunkIndex: z.number().describe('Index of the chunk in the batch (0-based)'),
    primary: z.object({
      category: cuadCategorySchema.or(z.literal('Uncategorized')),
      confidence: z.number().min(0).max(1),
      rationale: z.string().max(200).describe('Brief 1-2 sentence explanation'),
    }),
    secondary: z.array(z.object({
      category: cuadCategorySchema,
      confidence: z.number().min(0).max(1),
    })).max(2).default([]),
  }))
})
```

### Enhanced Classifier Prompt
```typescript
// agents/prompts/classifier.ts - Enhanced for Phase 6
export function createBatchClassifierPrompt(
  chunks: Array<{
    index: number
    content: string
    sectionPath?: string[] | null
    prevContext?: string
    nextContext?: string
  }>,
  references: Array<{ content: string; category: string; similarity: number; source: string }>,
  candidateCategories: string[]
): string {
  const refBlock = references
    .map((r, i) => `[${i + 1}] ${r.category} (${r.source}, ${Math.round(r.similarity * 100)}%): ${r.content.slice(0, 200)}`)
    .join('\n')

  const chunkBlocks = chunks.map(c => {
    const sectionLabel = c.sectionPath?.length ? `[Section: ${c.sectionPath.join(' > ')}]\n` : ''
    const prevCtx = c.prevContext ? `[PRECEDING CONTEXT]: ...${c.prevContext}\n` : ''
    const nextCtx = c.nextContext ? `\n[FOLLOWING CONTEXT]: ${c.nextContext}...` : ''
    return `### Chunk ${c.index}\n${sectionLabel}${prevCtx}${c.content}${nextCtx}`
  }).join('\n\n')

  return `## Candidate Categories (most likely based on similarity)
${candidateCategories.join(', ')}

Note: You may also assign categories NOT in this list if the text clearly belongs elsewhere.
Use "Uncategorized" only if no CUAD category fits at all.

## Reference Examples
${refBlock}

## Chunks to Classify
${chunkBlocks}

Classify each chunk. Return JSON with classifications array.`
}
```

### Persist Classifications Pattern
```typescript
// In the Inngest pipeline, after batch classification
await step.run('persist-classifications', async () => {
  const values = allClassifications.flatMap(c => {
    const rows = [{
      tenantId,
      analysisId,
      chunkId: c.chunkId,
      documentId,
      category: c.primary.category,
      confidence: c.primary.confidence,
      isPrimary: true,
      rationale: c.primary.rationale,
      chunkIndex: c.chunkIndex,
      startPosition: c.startPosition,
      endPosition: c.endPosition,
    }]

    // Add secondary classifications
    for (const sec of c.secondary) {
      if (sec.confidence >= 0.3) {  // Minimum confidence floor
        rows.push({
          tenantId,
          analysisId,
          chunkId: c.chunkId,
          documentId,
          category: sec.category,
          confidence: sec.confidence,
          isPrimary: false,
          rationale: null,
          chunkIndex: c.chunkIndex,
          startPosition: c.startPosition,
          endPosition: c.endPosition,
        })
      }
    }

    return rows
  })

  // Batch insert with conflict handling
  for (let i = 0; i < values.length; i += 100) {
    const batch = values.slice(i, i + 100)
    await ctx.db.insert(chunkClassifications)
      .values(batch)
      .onConflictDoNothing()
  }
})
```

### Classification-to-ClauseExtraction Compatibility Shim
```typescript
// Transform new classifications to ClassifiedClause[] for risk-scorer
function toClassifiedClauses(
  classifications: ChunkClassificationRow[],
  chunks: ParsedChunk[]
): ClassifiedClause[] {
  const chunkMap = new Map(chunks.map(c => [c.id, c]))

  // Group by chunk, pick primary classification
  const primaryByChunk = classifications.filter(c => c.isPrimary)

  return primaryByChunk.map(c => {
    const chunk = chunkMap.get(c.chunkId)
    const secondaries = classifications
      .filter(s => s.chunkId === c.chunkId && !s.isPrimary)
      .map(s => s.category as CuadCategory)

    return {
      chunkId: c.chunkId,
      clauseText: chunk?.content ?? '',
      category: c.category as CuadCategory,
      secondaryCategories: secondaries,
      confidence: c.confidence,
      reasoning: c.rationale ?? '',
      startPosition: c.startPosition ?? 0,
      endPosition: c.endPosition ?? 0,
    }
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateObject()` | `generateText()` with `Output.object()` | AI SDK 6.0 | `generateObject` deprecated; use `generateText` + output |
| Single-chunk classification | Batch classification (3-5 per call) | Best practice | Reduces API calls by ~75%, amortizes system prompt |
| CUAD-only references | CUAD + ContractNLI references | Phase 6 design | Richer context for NDA-specific hypotheses |
| Unknown category for unmatched | Explicit "Uncategorized" label | Phase 6 design | Transparency, no hidden chunks |

**Deprecated/outdated:**
- `generateObject()` / `streamObject()` from AI SDK 5.x: Removed in favor of `generateText()` with `output` property
- Single `clauseExtractions` table for both classification and risk: Phase 6 introduces separate `chunkClassifications` table

## Integration with Existing Pipeline

### Current Pipeline Steps in `analyze-nda.ts`
```
1. create-analysis
2. parser-agent
3. parser validation gate
4. runChunkingPipeline (init-tokenizer, chunk-document, embed batches, persist-chunks)
5. rate-limit-parser
6. classifier-agent          <-- MODIFY THIS
7. classifier validation gate
8. rate-limit-classifier
9. risk-scorer-agent         <-- RECEIVES ClassifiedClause[] (keep compatible)
10. gap-analyst-agent
11. persist-final
```

### What Changes in Pipeline
- Step 6 (`classifier-agent`): Replace single `step.run` with multiple steps:
  - `build-neighbor-map`: Build neighbor context map from chunks
  - `classify-batch-0`, `classify-batch-1`, ...: Batch classification calls with rate limiting
  - `persist-classifications`: Save to new `chunkClassifications` table
  - `build-classifier-compat`: Transform classifications to `ClassifiedClause[]` for risk-scorer
- Step 7 (classifier validation): Continue using `validateClassifierOutput()` on the compat output
- Step 9-10: Risk scorer and gap analyst receive same interface, no changes needed

### Compatibility Strategy
The risk-scorer agent receives `ClassifiedClause[]` which has:
```typescript
{ chunkId, clauseText, category, secondaryCategories, confidence, reasoning, startPosition, endPosition }
```

After persisting to `chunkClassifications`, build this array from the persisted data. The risk-scorer and gap-analyst continue working unchanged. Only the classifier and its persistence layer change.

## Open Questions

1. **ContractNLI source filtering in vector search**
   - What we know: Both CUAD and ContractNLI are in `reference_embeddings` table, differentiated by `granularity` and `nliLabel` fields
   - What's unclear: Whether `findSimilarClauses()` already returns both sources or only clause-level (CUAD) embeddings. It currently uses no granularity filter, so it likely returns both.
   - Recommendation: Verify by checking the data. If needed, remove the granularity filter or add explicit source mixing to ensure both CUAD and ContractNLI results appear.

2. **Existing `clauseExtractions` table fate**
   - What we know: The new `chunkClassifications` table handles classification. `clauseExtractions` currently stores both classification and risk-scoring results.
   - What's unclear: Whether `clauseExtractions` should be deprecated or continue as the risk-scorer output table.
   - Recommendation: Keep `clauseExtractions` for the risk-scorer agent output. Phase 6 adds `chunkClassifications` alongside it. Eventually, `clauseExtractions` becomes the risk-scored version of the classifications.

3. **Inngest step naming for batch classification**
   - What we know: Each `step.run()` needs a unique name. Batch classification creates multiple steps.
   - What's unclear: Whether dynamic step names (`classify-batch-${n}`) cause any issues with Inngest's step memoization on retries.
   - Recommendation: Use deterministic batch indices (not dynamic content). `classify-batch-0`, `classify-batch-1`, etc. are fine since batch count is deterministic for a given chunk set.

## Sources

### Primary (HIGH confidence)
- Existing codebase files (agents/classifier.ts, db/schema/analyses.ts, inngest/functions/analyze-nda.ts, etc.) - read directly
- CONTEXT.md decisions - user-locked constraints
- AI SDK 6 documentation (ai-sdk.dev) - `Output.object`, `Output.array`, batch patterns

### Secondary (MEDIUM confidence)
- [CUAD Dataset](https://www.atticusprojectai.org/cuad) - Original paper confirms confidence threshold approaches
- [CUAD Paper (PDF)](https://www.worldcc.com/portals/iaccm/Resources/10045_0_CUADpaper.pdf) - Precision-recall curve analysis
- [Inngest Step Parallelism](https://www.inngest.com/docs/guides/step-parallelism) - Batch step patterns
- [Inngest Throttling](https://www.inngest.com/docs/guides/throttling) - Rate limiting patterns
- [AI SDK Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) - Output.object patterns

### Tertiary (LOW confidence)
- [LLM Legal Document Tagging](https://arxiv.org/html/2504.09309v1) - Multi-label classification with instruction prompts
- [Hierarchical Multi-Label Classification at Scale](https://arxiv.org/html/2412.05137v1) - Taxonomy abbreviation in prompts

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, no new dependencies
- Architecture: HIGH - Extending existing patterns, clear codebase conventions
- New table schema: HIGH - Follows existing column helpers, constraints, indexing patterns
- Batch classification: MEDIUM - Novel pattern for this project, but well-established technique
- Threshold values (0.7, 0.3): MEDIUM - Based on CUAD research + existing prompt scale, validated against roadmap suggestion
- Pitfalls: HIGH - Derived from direct codebase analysis

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (stable domain, no fast-moving dependencies)
