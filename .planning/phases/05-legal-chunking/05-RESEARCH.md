# Phase 5: Legal Chunking - Research

**Researched:** 2026-02-04
**Domain:** Legal document chunking, Voyage AI embedding, token counting, database schema
**Confidence:** HIGH

## Summary

This phase transforms extracted text (from Phase 3/4) into legal-aware chunks with Voyage AI embeddings stored in the tenant database. The existing codebase already has a basic `chunkDocument()` function in `lib/document-processing.ts` and a `documentChunks` table in `db/schema/documents.ts`, but the current implementation is simplistic -- it splits on paragraph boundaries with basic section header regex detection. Phase 5 replaces this with legal-structure-aware chunking that leverages the `DocumentStructure` output from Phase 3's `detectStructure()`.

The primary work involves: (1) building a new legal-aware chunker that respects clause/definition/sub-clause boundaries from the structure detector, (2) extending the `documentChunks` schema with position tracking and chunk metadata columns, (3) batching Voyage AI embedding generation with proper rate limiting, and (4) wiring everything into the Inngest pipeline as a durable step.

**Primary recommendation:** Replace `chunkDocument()` with a new `chunkLegalDocument()` that consumes `DocumentStructure` from Phase 3, producing legal-aware chunks. Use `llama-tokenizer-js` for accurate Voyage AI token counting. Store chunks and embeddings via bulk insert with `ON CONFLICT` idempotency, following the existing batch-processor pattern from bootstrap.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Voyage AI API | voyage-law-2 | Legal embeddings (1024 dims) | Already integrated in `lib/embeddings.ts`; specialized for legal text |
| llama-tokenizer-js | latest | Accurate token counting for voyage-law-2 | Voyage AI's voyage-law-2 uses Llama 2 tokenizer (confirmed via official docs) |
| Drizzle ORM | existing | DB operations + pgvector | Already in stack; `cosineDistance()` for similarity |
| Inngest | existing | Durable workflow orchestration | Already handles pipeline steps with rate limiting |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| gpt-tokenizer | 3.4.0 (installed) | Fallback/comparison token counting | Already used in existing `chunkDocument()`; keep for budget validation |
| lru-cache | existing | Embedding cache | Already integrated in `lib/cache/embedding-cache.ts` |
| zod | existing | Schema validation for chunk metadata | Already used throughout project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| llama-tokenizer-js | gpt-tokenizer (already installed) | gpt-tokenizer undercounts by ~10-20% vs Llama 2 tokenizer. Voyage docs say their token counts are 1.1-1.2x tiktoken. For chunk sizing this matters -- a 512-token chunk by gpt-tokenizer could be 560-615 tokens to Voyage AI. |
| Custom legal chunker | LangChain RecursiveCharacterTextSplitter | LangChain splitter is format-agnostic; we already have structure detection output to leverage. Custom is better here. |
| voyage-context-3 | voyage-law-2 | voyage-context-3 offers contextualized embeddings (+5.5% retrieval) but is a different model from what the project standardized on. Stick with voyage-law-2 per architecture decisions. |

**Installation:**
```bash
pnpm add llama-tokenizer-js
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── document-processing.ts        # EXISTING - deprecate chunkDocument(), keep types
├── document-chunking/            # NEW - legal-aware chunking module
│   ├── legal-chunker.ts          # Main entry: chunkLegalDocument()
│   ├── chunk-strategies.ts       # Strategy implementations (definitions, clauses, fallback)
│   ├── chunk-merger.ts           # Short chunk merging + oversized splitting
│   ├── cross-reference.ts        # Cross-reference annotation extraction
│   ├── token-counter.ts          # Llama 2 tokenizer wrapper for Voyage AI
│   ├── chunk-map.ts              # Chunk map summary generator
│   └── types.ts                  # LegalChunk, ChunkMetadata, ChunkStats types
├── embeddings.ts                 # EXISTING - VoyageAIClient (unchanged)
db/schema/
├── documents.ts                  # EXISTING - extend documentChunks table
inngest/functions/
├── analyze-nda.ts                # EXISTING - add chunking + embedding step
```

### Pattern 1: Structure-Driven Chunking

**What:** Use the `DocumentStructure` (sections with types, levels, positions) from Phase 3 to create legal-aware chunks instead of naive paragraph splitting.
**When to use:** All documents that have structure detection results.

```typescript
// Source: Project architecture + CONTEXT.md decisions
interface LegalChunk {
  id: string
  index: number                    // Sequential ordering (for document reconstruction)
  content: string                  // The chunk text
  sectionPath: string[]            // e.g., ["Article 5", "Section 5.2", "(a)"]
  tokenCount: number               // Voyage AI token count (Llama 2 tokenizer)
  startPosition: number            // Character offset in original extracted text
  endPosition: number              // Character offset end (exclusive)
  chunkType: ChunkType             // 'definition' | 'clause' | 'sub-clause' | 'recital' | ...
  metadata: ChunkMetadata
}

interface ChunkMetadata {
  parentClauseIntro?: string       // Intro text from parent clause (if sub-chunk)
  references: string[]             // Cross-references: ["3.1", "7.4"]
  isOverlap: boolean               // Whether this chunk has overlap text prepended
  overlapTokens: number            // How many tokens are overlap
  structureSource: 'regex' | 'llm' // How the structure was detected
}

type ChunkType =
  | 'definition'       // Individual definition entries
  | 'clause'           // Standard clause/section
  | 'sub-clause'       // Lettered items (a), (b), (c)
  | 'recital'          // Whereas/recital clauses
  | 'boilerplate'      // Signature blocks, notices, etc.
  | 'exhibit'          // Exhibit/schedule content
  | 'merged'           // Result of merging short chunks
  | 'split'            // Result of splitting oversized clause
  | 'fallback'         // Created by fallback strategy

function chunkLegalDocument(
  text: string,
  structure: DocumentStructure,
  options: LegalChunkOptions
): LegalChunk[] {
  const chunks: LegalChunk[] = []

  for (const section of structure.sections) {
    switch (section.type) {
      case 'definitions':
        chunks.push(...chunkDefinitions(section, text, options))
        break
      case 'clause':
      case 'heading':
        chunks.push(...chunkClause(section, text, options))
        break
      case 'signature':
        chunks.push(...chunkBoilerplate(section, text, options))
        break
      case 'exhibit':
        chunks.push(...chunkExhibit(section, text, options))
        break
      default:
        chunks.push(...chunkGeneric(section, text, options))
    }
  }

  // Post-processing: merge short chunks, annotate cross-references
  return postProcess(chunks, options)
}
```

### Pattern 2: Definition Section Chunking

**What:** Each definition becomes its own standalone chunk for independent retrieval.
**When to use:** Definitions sections (detected via `type: 'definitions'`).

```typescript
// Source: CONTEXT.md decision - "each definition becomes its own standalone chunk"
const DEFINITION_PATTERN = /^[""]([^""]+)[""]\s+(?:means|shall mean|refers to|has the meaning)/im

function chunkDefinitions(
  section: PositionedSection,
  fullText: string,
  options: LegalChunkOptions
): LegalChunk[] {
  const definitions: LegalChunk[] = []
  const content = fullText.slice(section.startOffset, section.endOffset)

  // Split on definition patterns
  const defMatches = content.matchAll(
    /[""]([^""]+)[""]\s+(?:means|shall mean|refers to|has the meaning)[^.]+\./gim
  )

  for (const match of defMatches) {
    definitions.push({
      content: match[0],
      chunkType: 'definition',
      sectionPath: [...section.sectionPath, `Definition: ${match[1]}`],
      startPosition: section.startOffset + match.index!,
      endPosition: section.startOffset + match.index! + match[0].length,
      // ... other fields
    })
  }

  return definitions
}
```

### Pattern 3: Sub-Clause Chunking

**What:** Each lettered sub-clause (a), (b), (c) becomes its own chunk.
**When to use:** Clauses with lettered sub-items for granular obligation analysis.

```typescript
// Source: CONTEXT.md decision - "each lettered item becomes its own chunk"
const SUB_CLAUSE_PATTERN = /\n\s*\(([a-z])\)\s+/g

function chunkClause(
  section: PositionedSection,
  fullText: string,
  options: LegalChunkOptions
): LegalChunk[] {
  const content = fullText.slice(section.startOffset, section.endOffset)
  const subClauses = content.split(SUB_CLAUSE_PATTERN)

  if (subClauses.length <= 1) {
    // No sub-clauses -- chunk as single unit (may need splitting if oversized)
    return [createChunk(section, content, 'clause', options)]
  }

  // Extract intro text (before first sub-clause)
  const introText = content.slice(0, content.indexOf(subClauses[0]))
  const chunks: LegalChunk[] = []

  for (let i = 0; i < subClauses.length; i += 2) {
    const letter = subClauses[i]       // "a", "b", etc.
    const subContent = subClauses[i + 1]  // sub-clause text

    chunks.push({
      content: subContent,
      chunkType: 'sub-clause',
      sectionPath: [...section.sectionPath, `(${letter})`],
      metadata: {
        parentClauseIntro: introText.slice(0, 200), // Truncated intro for context
        references: extractCrossReferences(subContent),
      },
      // ... position tracking
    })
  }

  return chunks
}
```

### Pattern 4: Embedding Batch Within Inngest Pipeline

**What:** Generate embeddings in Voyage AI batches of 128 after all chunks are created.
**When to use:** Within the Inngest pipeline after chunking completes.

```typescript
// Source: Existing patterns in analyze-nda.ts + batch-processor.ts
async function embedChunksBatched(
  chunks: LegalChunk[],
  step: InngestStep
): Promise<EmbeddedChunk[]> {
  const voyageClient = getVoyageAIClient()
  const batchSize = RATE_LIMITS.voyageAi.batchSize // 128
  const embedded: EmbeddedChunk[] = []

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const texts = batch.map(c => c.content)

    const result = await step.run(`embed-batch-${Math.floor(i / batchSize)}`, async () => {
      return voyageClient.embedBatch(texts, 'document')
    })

    for (let j = 0; j < batch.length; j++) {
      embedded.push({
        ...batch[j],
        embedding: result.embeddings[j],
      })
    }

    // Rate limit between batches
    if (i + batchSize < chunks.length) {
      await step.sleep(
        `voyage-rate-limit-${Math.floor(i / batchSize)}`,
        getRateLimitDelay('voyageAi')
      )
    }
  }

  return embedded
}
```

### Pattern 5: Chunk Map Summary

**What:** Generate a summary of all chunks per document for debugging/admin view.
**When to use:** After chunking completes, before embedding.

```typescript
// Source: CONTEXT.md decision - "Persist a chunk map summary per document"
interface ChunkMapEntry {
  index: number
  sectionPath: string[]
  type: ChunkType
  tokenCount: number
  preview: string  // First 100 chars
}

interface ChunkMap {
  documentId: string
  totalChunks: number
  avgTokens: number
  minTokens: number
  maxTokens: number
  distribution: Record<ChunkType, number>
  entries: ChunkMapEntry[]
}

function generateChunkMap(chunks: LegalChunk[], documentId: string): ChunkMap {
  const tokenCounts = chunks.map(c => c.tokenCount)
  const typeDistribution: Record<string, number> = {}
  chunks.forEach(c => {
    typeDistribution[c.chunkType] = (typeDistribution[c.chunkType] || 0) + 1
  })

  return {
    documentId,
    totalChunks: chunks.length,
    avgTokens: Math.round(tokenCounts.reduce((a, b) => a + b, 0) / chunks.length),
    minTokens: Math.min(...tokenCounts),
    maxTokens: Math.max(...tokenCounts),
    distribution: typeDistribution as Record<ChunkType, number>,
    entries: chunks.map(c => ({
      index: c.index,
      sectionPath: c.sectionPath,
      type: c.chunkType,
      tokenCount: c.tokenCount,
      preview: c.content.slice(0, 100),
    })),
  }
}
```

### Anti-Patterns to Avoid
- **Splitting mid-sentence:** Always split at sentence or paragraph boundaries, never mid-word or mid-sentence within a clause
- **Ignoring structure detection output:** The `DocumentStructure` from Phase 3 exists precisely for this -- do not re-detect structure
- **Embedding before all chunks are finalized:** Chunk, post-process (merge/split), THEN embed in batch. Do not embed incrementally as you chunk.
- **Creating Inngest steps inside loops:** Use batch `step.run()` not individual steps per chunk (Inngest step overhead)
- **Ignoring token count accuracy:** Voyage AI bills by tokens and truncates at 16K. Using wrong tokenizer leads to unexpected truncation or wasted quota.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting for Voyage AI | Custom word-splitting heuristic | `llama-tokenizer-js` encode().length | Voyage AI's voyage-law-2 uses Llama 2 tokenizer. Custom heuristics are 15-30% off. |
| Embedding generation | Custom HTTP client | Existing `VoyageAIClient.embedBatch()` | Already handles caching, API errors, response validation |
| Batch rate limiting | Custom delay logic | `getRateLimitDelay('voyageAi')` + `step.sleep()` | Already configured for 300 RPM / 200ms delays |
| Vector storage | Raw SQL inserts | Drizzle `db.insert(documentChunks).values().onConflictDoNothing()` | Idempotent, type-safe, consistent with project patterns |
| Cross-reference detection | Full NLP parsing | Regex for section number patterns | NDAs use predictable reference formats ("Section 3.1", "Article VII") |
| UUID generation | Custom logic | Drizzle `defaultRandom()` in schema | Already handled by `primaryId` column helper |
| Document reconstruction from chunks | Custom sorting | `chunkIndex` column + `ORDER BY` | Schema already has unique constraint on (documentId, chunkIndex) |

**Key insight:** The heavy lifting (embedding, caching, rate limiting, DB operations) is already implemented. Phase 5 is primarily about the chunking logic itself -- how to transform `DocumentStructure` sections into right-sized chunks with proper metadata.

## Common Pitfalls

### Pitfall 1: Token Count Mismatch Between Tokenizers
**What goes wrong:** Chunks sized at 512 tokens by gpt-tokenizer are actually 560-615 tokens to Voyage AI, causing unexpected API behavior or wasted budget.
**Why it happens:** Voyage AI's voyage-law-2 uses Llama 2 tokenizer, which produces 1.1-1.2x more tokens than OpenAI's tiktoken on average. The project currently uses gpt-tokenizer (tiktoken-based).
**How to avoid:** Use `llama-tokenizer-js` for chunk sizing. Keep `gpt-tokenizer` for Claude budget estimation (separate concern). Create a `tokenCounter` abstraction that selects the right tokenizer per use case.
**Warning signs:** Chunks approaching the 16K token Voyage AI input limit get silently truncated.

### Pitfall 2: Inngest Step Explosion
**What goes wrong:** Creating one Inngest step per chunk (e.g., `step.run('chunk-0')`, `step.run('chunk-1')`, ...) causes massive step history and slow pipeline.
**Why it happens:** Inngest persists every step for durability. 100+ individual steps add overhead.
**How to avoid:** Batch operations: one step for chunking, one step per embedding batch (128 chunks), one step for DB insert. Follow existing `analyze-nda.ts` pattern.
**Warning signs:** Inngest dashboard shows hundreds of steps per run.

### Pitfall 3: Overlapping Character Positions
**What goes wrong:** Position offsets stored for chunks don't match the original text, breaking Phase 11 highlighting.
**Why it happens:** Overlap text is prepended to chunks, but the stored position should reference the original text offset, not the overlapped text.
**How to avoid:** Track `startPosition`/`endPosition` as offsets into the ORIGINAL extracted text. Overlap text is contextual -- store overlap metadata separately (which tokens are overlap vs. new content).
**Warning signs:** Highlighting in document viewer selects wrong text region.

### Pitfall 4: Empty Chunks from Boilerplate Sections
**What goes wrong:** Signature blocks, exhibits, or cover letters create chunks that waste embedding budget and pollute retrieval results.
**Why it happens:** Chunking all sections equally without filtering by relevance.
**How to avoid:** Mark chunks from `signature`, `exhibit`, `cover_letter` sections with distinct `chunkType`. Either skip embedding for these or flag them with lower retrieval priority. Per CONTEXT.md, structure detector already identifies these sections.
**Warning signs:** RAG queries return signature block text instead of relevant clauses.

### Pitfall 5: Re-Analysis Creates Duplicate Chunks
**What goes wrong:** Re-analyzing a document doubles the chunks in the database.
**Why it happens:** No cleanup of old chunks before inserting new ones.
**How to avoid:** DELETE existing chunks for the document+analysis pair before inserting new ones, OR use the `chunk_doc_index` unique constraint with `ON CONFLICT DO UPDATE`. The analyses table already has a `version` field for this.
**Warning signs:** Duplicate search results for the same document.

### Pitfall 6: Definitions Without Context
**What goes wrong:** A standalone definition chunk like `"Confidential Information" means any data...` retrieves well but downstream classification can't determine which party's obligations it relates to.
**Why it happens:** Splitting definitions as standalone chunks loses document-level context.
**How to avoid:** Store `parentClauseIntro` in chunk metadata. Consider prepending a brief context prefix (e.g., "From NDA between [Party A] and [Party B]:") to the text before embedding. Voyage AI's `input_type: "document"` already prepends "Represent the document for retrieval:" which helps.
**Warning signs:** Classification agent misclassifies definition chunks.

### Pitfall 7: Dynamic Import Needed for llama-tokenizer-js
**What goes wrong:** Build or startup failure because llama-tokenizer-js bundles a large vocabulary file (670KB pre-minification).
**Why it happens:** SentencePiece vocabulary data is baked into the package.
**How to avoid:** Use dynamic import like the existing pdf-parse pattern: `const llamaTokenizer = await import('llama-tokenizer-js')`. Wrap in a lazy singleton. This avoids barrel export issues per CLAUDE.md conventions.
**Warning signs:** Slow cold start, large bundle size warnings.

## Code Examples

### Token Counter for Voyage AI (Llama 2)
```typescript
// Source: Voyage AI official docs (tokenization page) + llama-tokenizer-js README
// voyage-law-2 uses Llama 2 tokenizer per Voyage AI documentation

let _llamaTokenizer: { encode: (text: string) => number[] } | null = null

async function getLlamaTokenizer() {
  if (!_llamaTokenizer) {
    const mod = await import('llama-tokenizer-js')
    _llamaTokenizer = mod.default
  }
  return _llamaTokenizer
}

/** Count tokens using Voyage AI's tokenizer (Llama 2) */
export async function countVoyageTokens(text: string): Promise<number> {
  const tokenizer = await getLlamaTokenizer()
  return tokenizer.encode(text).length
}

/** Synchronous approximation for hot path (after first load) */
export function countVoyageTokensSync(text: string): number {
  if (!_llamaTokenizer) {
    // Fallback: rough estimate (1 token ~ 4.5 chars for legal text)
    return Math.ceil(text.length / 4.5)
  }
  return _llamaTokenizer.encode(text).length
}
```

### Schema Extension for documentChunks
```typescript
// Source: CONTEXT.md decisions + existing db/schema/documents.ts
// Fields to ADD to existing documentChunks table:

// startPosition: integer("start_position")   // Char offset into original text
// endPosition: integer("end_position")        // Char offset end (exclusive)
// chunkType: text("chunk_type")               // 'definition' | 'clause' | 'sub-clause' | ...
// analysisId: uuid("analysis_id")             // Link to specific analysis run
//   .references(() => analyses.id, { onDelete: "cascade" })
// overlapTokens: integer("overlap_tokens")    // How many tokens are overlap from prev chunk

// Also add to analyses table:
// chunkMap: jsonb("chunk_map")                // Summary of all chunks (for debugging)
// chunkStats: jsonb("chunk_stats")            // { total, avg, min, max, distribution }
```

### Bulk Chunk Insert with Idempotency
```typescript
// Source: Existing batch-processor.ts pattern
async function persistChunks(
  chunks: EmbeddedChunk[],
  documentId: string,
  analysisId: string,
  tenantId: string,
  ctx: TenantContext
): Promise<void> {
  // Delete old chunks for this document (replace strategy for re-analysis)
  await ctx.db
    .delete(documentChunks)
    .where(eq(documentChunks.documentId, documentId))

  // Bulk insert in batches of 100 (DB connection limits)
  const DB_BATCH_SIZE = 100
  for (let i = 0; i < chunks.length; i += DB_BATCH_SIZE) {
    const batch = chunks.slice(i, i + DB_BATCH_SIZE)
    await ctx.db.insert(documentChunks).values(
      batch.map(chunk => ({
        tenantId,
        documentId,
        chunkIndex: chunk.index,
        content: chunk.content,
        sectionPath: chunk.sectionPath,
        embedding: chunk.embedding,
        tokenCount: chunk.tokenCount,
        startPosition: chunk.startPosition,
        endPosition: chunk.endPosition,
        chunkType: chunk.chunkType,
        metadata: {
          references: chunk.metadata.references,
          parentClauseIntro: chunk.metadata.parentClauseIntro,
          overlapTokens: chunk.metadata.overlapTokens,
          structureSource: chunk.metadata.structureSource,
        },
      }))
    )
  }
}
```

### Cross-Reference Extraction
```typescript
// Source: Common NDA patterns
const CROSS_REF_PATTERNS = [
  /Section\s+(\d+(?:\.\d+)*)/gi,
  /Article\s+([IVX\d]+)/gi,
  /(?:paragraph|clause)\s+(\d+(?:\.\d+)*(?:\([a-z]\))?)/gi,
  /(?:as defined in|pursuant to|in accordance with|subject to)\s+Section\s+(\d+(?:\.\d+)*)/gi,
]

function extractCrossReferences(text: string): string[] {
  const refs = new Set<string>()
  for (const pattern of CROSS_REF_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      refs.add(match[1])
    }
  }
  return Array.from(refs)
}
```

## Discretion Recommendations

Based on research, here are recommendations for areas marked as Claude's discretion in CONTEXT.md:

### Optimal Chunk Token Size: 400 tokens (target), 512 tokens (hard max)
**Rationale:** Dense retrieval research shows 200-400 tokens is optimal for recall. Legal clauses in NDAs typically run 150-500 tokens. Setting target at 400 with hard max at 512 gives room for the full clause text without forcing splits. Voyage AI's 16K context means even the largest possible chunk is well within limits.

**Confidence:** MEDIUM -- based on RAG retrieval research, not Voyage AI-specific guidance (Voyage AI does not publish chunk size recommendations).

### Overlap: 50 tokens (consistent with existing implementation)
**Rationale:** The current `chunkDocument()` already uses 50-token overlap. 10-15% overlap is recommended for legal text where cross-references span chunk boundaries. At 400-token target, 50 tokens = 12.5% overlap. No reason to change.

**Confidence:** HIGH -- consistent with existing implementation and industry recommendations.

### Parent Clause Intro Prepend: Yes, truncated to 100 tokens
**Rationale:** When lettered sub-clauses (a), (b), (c) become standalone chunks, they lose the "The Receiving Party shall..." intro that gives them meaning. Prepending the first 100 tokens of the parent clause as metadata (stored in `parentClauseIntro`) preserves context. Do NOT embed this prefix as part of the chunk text -- store it as metadata that downstream agents can use for context.

**Confidence:** MEDIUM -- tradeoff between embedding quality and chunk independence. Storing as metadata (not in embedded text) is safer.

### Metadata Prefix for Embeddings: No explicit prefix beyond input_type
**Rationale:** Voyage AI's `input_type: "document"` already prepends "Represent the document for retrieval:" to chunk text. Adding additional metadata prefixes (e.g., "NDA Section 5.2:") showed marginal benefit in general retrieval research and Voyage AI's voyage-context-3 announcement showed only +5.5% improvement from contextualized embeddings. The existing `input_type` mechanism is sufficient. Section path is stored as structured data, not embedded in the text.

**Confidence:** MEDIUM -- based on Voyage AI documentation about input_type behavior.

### Oversized Clause Handling: Split at sentence boundaries
**Rationale:** When a clause exceeds 512 tokens (e.g., long exception lists or multi-obligation paragraphs), split at the nearest sentence boundary (period + space). Each resulting sub-chunk inherits the same `sectionPath` and gets `chunkType: 'split'` to indicate it's an artificial split. Prepend 50 tokens of overlap from the previous sub-chunk.

**Confidence:** HIGH -- sentence boundary splitting is the standard approach for legal text.

### Short Chunk Merging: Merge chunks under 50 tokens with adjacent sibling
**Rationale:** Very short chunks (e.g., a one-line sub-clause "(a) See above") create poor embeddings and waste API calls. Merge with the next sibling chunk if both are under the target size. Mark merged chunks with `chunkType: 'merged'`.

**Confidence:** MEDIUM -- the 50-token threshold is an educated guess. May need tuning based on real NDA data.

### Signature Blocks, Boilerplate, Exhibits: Chunk but skip embedding
**Rationale:** Signature blocks and boilerplate (notices, governing law boilerplate) should be chunked for completeness (document reconstruction, Phase 11 highlighting) but do NOT need embeddings. They waste embedding budget and pollute retrieval results. Exhibits should be chunked with embeddings if they contain substantive terms. Mark with `chunkType: 'boilerplate'` and set `embedding: null`.

**Confidence:** HIGH -- standard practice in legal RAG systems.

### Recitals/Whereas Clauses: Chunk as `recital` type, embed normally
**Rationale:** Recitals contain important context about the agreement's purpose, parties, and background. They should be embedded for retrieval (useful for "what is the purpose of this NDA?" queries). Chunk each "WHEREAS" paragraph as a standalone chunk with `chunkType: 'recital'`.

**Confidence:** HIGH -- recitals are semantically important for NDA analysis.

### OCR Text Adjustments: Same treatment with quality flag
**Rationale:** OCR text should be chunked with the same legal-aware strategy. OCR quality was already validated in Phase 4 (confidence thresholds). If structure detection falls back to LLM for OCR text, that's handled transparently by Phase 3's `detectStructure()`. Add `metadata.isOcr: true` flag so downstream agents know to be more lenient on formatting.

**Confidence:** HIGH -- OCR quality is already gated in Phase 4.

### Unstructured Document Fallback: Paragraph-based with LLM re-chunking trigger
**Rationale:** If structure detection returns zero sections (completely unstructured text), fall back to paragraph-based splitting at the target token size. Per CONTEXT.md decision, if chunks/page ratio is too low (< 2 chunks per page), trigger LLM-based re-chunking as a secondary pass. The LLM can identify clause boundaries even without formatting cues.

**Confidence:** MEDIUM -- the chunks/page threshold needs tuning.

### Re-Analysis Chunk Versioning: Replace strategy (delete and re-insert)
**Rationale:** The existing `analyses` table uses a `version` field for re-analysis. Chunks should follow the same pattern: delete existing chunks for the document, then insert new ones. This is simpler than versioning and consistent with how the pipeline creates new analysis records. The `ON CONFLICT` pattern on `(documentId, chunkIndex)` handles partial failures gracefully.

**Confidence:** HIGH -- consistent with existing re-analysis patterns in the codebase.

### Exception List Chunking: Keep together if under 512 tokens, split on item boundaries if over
**Rationale:** Exception lists (e.g., "Confidential Information does not include: (i) publicly known info; (ii) independently developed; (iii) received from third party...") should stay together as one chunk when possible because the list items are semantically linked. If the list exceeds 512 tokens, split on numbered/lettered item boundaries, with each sub-chunk getting a reference to the parent exception clause.

**Confidence:** MEDIUM -- depends on typical exception list lengths in NDAs.

### Multi-Party NDA Handling: No special sub-clause splitting by party
**Rationale:** Multi-party NDAs often use "each Party" language rather than party-specific clauses. When party-specific obligations exist (e.g., "Party A shall..." vs "Party B shall..."), they naturally fall into separate paragraphs or sub-clauses that the standard chunking handles. No special multi-party logic needed at the chunking level -- the classifier (Phase 6) handles party attribution.

**Confidence:** MEDIUM -- based on typical NDA structure, not verified against multi-party NDA corpus.

### Run-On Clauses: Split at sentence boundaries with context overlap
**Rationale:** Multi-obligation paragraphs (e.g., "The Receiving Party shall not disclose... shall return all materials... shall certify destruction...") should ideally stay together if under 512 tokens. If over, split at sentence boundaries that contain obligation markers ("shall", "must", "agrees to"). Each resulting chunk inherits the section path.

**Confidence:** MEDIUM -- sentence-level splitting of obligation paragraphs may separate related obligations.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed-size character splitting | Semantic/structure-aware chunking | 2024-2025 | 5-15% retrieval improvement |
| OpenAI tokenizer for all models | Model-specific tokenizers | 2024 | Accurate token budgeting |
| Flat chunk lists | Hierarchical chunks with section paths | 2024-2025 | Better context reconstruction |
| Embed everything equally | Selective embedding (skip boilerplate) | 2025 | Cost savings + cleaner retrieval |
| Overlap by word count | Overlap by token count | Current | More predictable boundaries |
| voyage-law-2 only | voyage-context-3 available | 2025 | Contextualized embeddings, but project stays with voyage-law-2 |

**Deprecated/outdated:**
- `chunkDocument()` in `lib/document-processing.ts`: Already marked with `@deprecated` comment on `extractText()`. The chunking function should also be deprecated in favor of the new legal-aware chunker.
- `gpt-tokenizer` for Voyage AI token counting: Still useful for Claude budget estimation but should not be used for Voyage AI chunk sizing.

## Open Questions

1. **Exact Token Variance Between Tokenizers**
   - What we know: Voyage AI docs say Llama 2 tokenizer produces 1.1-1.2x more tokens than tiktoken on average
   - What's unclear: The exact variance for legal text specifically (may be higher due to legal terminology)
   - Recommendation: Add a one-time calibration step in tests that compares gpt-tokenizer vs llama-tokenizer-js on sample NDA text to determine the actual ratio. Use this to set a conservative target.

2. **llama-tokenizer-js Async vs Sync Performance**
   - What we know: The library loads a 670KB vocabulary file on first import
   - What's unclear: Whether the encode() function is synchronous after initialization (README suggests yes)
   - Recommendation: Initialize once at module load (or first call), then use synchronously. Test in both Node.js and serverless (Vercel) environments.

3. **Optimal Chunks-Per-Page Threshold for Re-Chunking**
   - What we know: CONTEXT.md says "if chunks/page ratio too low, trigger LLM-based re-chunking"
   - What's unclear: What "too low" means quantitatively
   - Recommendation: Start with 2 chunks/page minimum. A typical NDA page has 3-6 clauses. If a 10-page document produces only 5 chunks, something went wrong.

4. **Existing Pipeline Integration Point**
   - What we know: Current `runParserAgent()` calls `chunkDocument()` and then `embedBatch()` inline
   - What's unclear: Whether to refactor the parser agent or add a new pipeline step
   - Recommendation: Add chunking+embedding as a new step AFTER the parser agent in `analyze-nda.ts`. The parser extracts text and detects structure; a new "chunker" step creates legal-aware chunks and embeds them. This separates concerns and allows independent retry.

## Sources

### Primary (HIGH confidence)
- [Voyage AI Tokenization Docs](https://docs.voyageai.com/docs/tokenization) - Confirmed voyage-law-2 uses Llama 2 tokenizer
- [Voyage AI Embeddings Docs](https://docs.voyageai.com/docs/embeddings) - 16K context, 120K total tokens per API call, 1000 texts max per call (project uses 128 batch limit)
- [Voyage AI Contextualized Chunks](https://docs.voyageai.com/docs/contextualized-chunk-embeddings) - voyage-context-3 model (not used, but informed metadata prefix decision)
- Existing codebase: `lib/embeddings.ts`, `lib/document-processing.ts`, `lib/document-extraction/structure-detector.ts`, `db/schema/documents.ts`, `agents/parser.ts`, `inngest/functions/analyze-nda.ts`

### Secondary (MEDIUM confidence)
- [llama-tokenizer-js GitHub](https://github.com/belladoreai/llama-tokenizer-js) - JS implementation of Llama 2 tokenizer, 0 deps, 670KB bundle
- [Weaviate Chunking Strategies](https://weaviate.io/blog/chunking-strategies-for-rag) - General RAG chunking best practices
- [Milvus Legal Document Chunking](https://milvus.io/ai-quick-reference/what-are-best-practices-for-chunking-lengthy-legal-documents-for-vectorization) - Legal-specific chunking guidance
- [Firecrawl Best Chunking Strategies](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025) - 200-400 token optimal range for dense retrieval

### Tertiary (LOW confidence)
- [NLLP Workshop 2025](https://aclanthology.org/2025.nllp-1.3.pdf) - Academic legal NLP research (referenced but not deeply verified)
- [Medium: Legal Document RAG](https://medium.com/enterprise-rag/legal-document-rag-multi-graph-multi-agent-recursive-retrieval-through-legal-clauses-c90e073e0052) - Multi-graph legal RAG architecture (informational)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Voyage AI docs confirm tokenizer choice; existing codebase provides all infrastructure
- Architecture: HIGH - Extends well-understood existing patterns (structure detection, batch processing, Inngest steps)
- Chunking logic: MEDIUM - Legal-specific chunking strategies are well-documented but optimal parameters need tuning on real NDA data
- Pitfalls: HIGH - Based on direct codebase analysis and documented issues (barrel exports, tokenizer mismatch)

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable domain, Voyage AI voyage-law-2 is a mature model)
