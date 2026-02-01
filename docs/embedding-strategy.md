# Embedding Strategy

> Extracted from [PRD §8](./PRD.md#8-bootstrap-pipeline). This is the authoritative reference for embedding model configuration, multi-granularity strategy, chunking parameters, dataset sources, and the bootstrap pipeline.

## Voyage AI Configuration

| Parameter              | Value                                     |
| ---------------------- | ----------------------------------------- |
| Model                  | `voyage-law-2`                            |
| Dimensions             | 1024 (fixed)                              |
| Max input tokens       | 16,000                                    |
| Pricing                | $0.12 per million tokens                  |
| Batch limit            | 1,000 texts or 120,000 tokens per request |
| inputType for indexing | `"document"`                              |
| inputType for search   | `"query"`                                 |

---

## Multi-Granularity Embedding Strategy

Each document is embedded at multiple levels to support different retrieval use cases:

| Granularity    | Source                         | ~Vectors | Use Case                                        |
| -------------- | ------------------------------ | -------- | ----------------------------------------------- |
| Clause-level   | CUAD annotations               | ~13K     | Precise clause matching, category classification |
| Evidence span  | ContractNLI spans per hypothesis | ~10K   | NLI-grounded risk assessment                     |
| Section-level  | Full contract text paragraphs   | ~8K     | Broad contextual retrieval, gap analysis          |
| Template-level | Bonterms/CommonAccord sections  | ~150    | NDA generation clause selection                   |

**Total estimated vectors:** ~33K at 1024 dimensions each.

---

## Chunking Parameters

| Parameter      | Value                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| Max tokens     | 512 per chunk                                                                         |
| Overlap        | 50 tokens                                                                             |
| Split strategy | Legal section patterns first (`ARTICLE`, `Section`, numbered clauses), then sentence boundaries as fallback |
| Metadata       | Each chunk preserves a `section_path` (e.g., `["Article 5", "Section 5.2", "Clause (b)"]`) for hierarchical retrieval |

---

## Dataset Sources

### CUAD (Contract Understanding Atticus Dataset)

| Property    | Value                                                             |
| ----------- | ----------------------------------------------------------------- |
| Source URL  | `https://huggingface.co/datasets/theatticusproject/cuad-qa`       |
| Format      | SQuAD 2.0 JSON (question/answer pairs)                           |
| ID format   | `ContractName__CategoryName__Index`                               |
| Categories  | 41 (see [PRD Appendix A](./PRD.md#appendix-a-cuad-41-category-taxonomy)) |
| Records     | 510 contracts, 13K+ annotations                                   |

**Extraction:** Contract full text, clause text with character positions, category label, answerable/unanswerable flag.

### ContractNLI

| Property    | Value                                                            |
| ----------- | ---------------------------------------------------------------- |
| Source URL  | `https://huggingface.co/datasets/kiddothe2b/contract-nli`        |
| Format      | JSON with documents, spans, annotation_sets, hypotheses          |
| Hypotheses  | 17 (see [PRD Appendix B](./PRD.md#appendix-b-contractnli-17-hypotheses)) |
| Labels      | Entailment / Contradiction / NotMentioned                         |
| Records     | 607 NDAs                                                          |

**Extraction:** Evidence spans with character offsets per hypothesis per document.

### Bonterms Mutual NDA

| Property    | Value                                       |
| ----------- | ------------------------------------------- |
| Source URL  | `https://github.com/Bonterms/Mutual-NDA`    |
| Format      | Markdown                                     |
| License     | CC BY 4.0                                    |

**Extraction:** Section structure, defined terms, clause text, section numbering.

### CommonAccord NDA Templates

| Property    | Value                                                                            |
| ----------- | -------------------------------------------------------------------------------- |
| Source URLs | `https://github.com/CommonAccord/NW-NDA`, `CooleyGo-NDA`, `Agt-NDA-CmA`        |
| Format      | Prose Objects (key-value markdown)                                                |
| License     | CC0 public domain                                                                 |

**Extraction:** Modular clause components, variable slots, section hierarchy.

### Kleister-NDA

| Property    | Value                                              |
| ----------- | -------------------------------------------------- |
| Source URL  | `https://github.com/applicaai/kleister-nda`         |
| Format      | Plain text NDAs with metadata annotations           |
| License     | Public domain                                       |
| Records     | 540 NDAs (254 train / 83 dev / 203 test)            |

**Extraction:** Full document text, structured metadata (parties, dates, terms).

---

## Bootstrap Pipeline Architecture

The bootstrap pipeline ingests all reference corpora into the shared reference database using Inngest for durability, rate-limit handling, and observability. Runs once during initial setup; re-triggerable idempotently when datasets are updated.

```
┌──────────────────┐
│  nda/bootstrap    │   Orchestrator event
│  .start           │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Step: Download   │   HuggingFace Datasets Server API
│  datasets         │   → Parquet files via HTTP
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Step: Parse      │   parquet-wasm + apache-arrow
│  CUAD             │   → Extract 13K+ clause annotations
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Step: Parse      │   JSON processing
│  ContractNLI      │   → Extract evidence spans per hypothesis
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Step: Parse      │   marked (markdown parser)
│  Templates        │   → Extract clause structure from Bonterms/CommonAccord
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────┐
│  Fan-out: Generate Embeddings │   Voyage AI voyage-law-2
│  (batches of 128 texts)       │   Throttled: 300 RPM
│  → Inngest concurrency: 3     │   Retries: 5 with exponential backoff
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────┐
│  Step: Bulk       │   Multi-row INSERT (500 rows/batch)
│  Insert to Neon   │   Via neon-serverless driver
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Step: Create     │   HNSW indexes built AFTER data load
│  Indexes          │   m=16, ef_construction=64
└──────────────────┘
```

---

## Idempotency

Every document is assigned a `content_hash` (SHA-256 of normalized text). The pipeline uses `ON CONFLICT (content_hash) DO NOTHING` to prevent duplicate insertions on re-runs. Inngest's built-in step memoization ensures successfully completed steps are not re-executed on retry.

---

## Query-Time Merge Pattern

RAG retrieval queries both databases in parallel and merges results before passing context to Claude:

```typescript
const [referenceHits, tenantHits] = await Promise.all([
  sharedDb
    .select(/* ... */)
    .from(referenceEmbeddings)
    .where(lt(cosineDistance(embedding, queryVec), 0.3))
    .orderBy(cosineDistance(embedding, queryVec))
    .limit(8),
  tenantDb
    .select(/* ... */)
    .from(tenantEmbeddings)
    .where(
      and(
        eq(tenantEmbeddings.tenantId, ctx.tenantId),
        lt(cosineDistance(embedding, queryVec), 0.3),
      ),
    )
    .orderBy(cosineDistance(embedding, queryVec))
    .limit(5),
]);

const mergedContext = deduplicateAndRank([...referenceHits, ...tenantHits]);
```

---

## Cost Estimates

### Bootstrap (One-Time)

| Resource                                | Cost      |
| --------------------------------------- | --------- |
| Voyage AI embeddings (~100M tokens)     | ~$12      |
| Inngest step executions (~5K)           | Free tier |
| Neon storage (~33K vectors × 1024 dims) | Free tier |
| **Total one-time**                      | **~$12**  |

### Per-Document (Runtime)

| Resource                               | Cost       |
| -------------------------------------- | ---------- |
| Voyage AI embeddings (document chunks) | ~$0.01     |
| Claude Sonnet 4.5 (analysis pipeline)  | ~$1.10     |
| Neon storage (marginal)                | ~$0.001    |
| Inngest steps (~10 per analysis)       | Free tier  |
| **Total per document**                 | **~$1.11** |

---

## HNSW Index Parameters

| Parameter          | Value | Rationale                                            |
| ------------------ | ----- | ---------------------------------------------------- |
| `m`                | 16    | Good recall/speed balance for ~33K vectors            |
| `ef_construction`  | 64    | Standard build quality                                |
| Distance function  | Cosine | Normalized similarity for text embeddings             |

Indexes created post-load to avoid index maintenance overhead during bulk insert.
