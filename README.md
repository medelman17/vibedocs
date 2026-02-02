# NDA Analyst

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-green)](https://orm.drizzle.team/)
[![Neon](https://img.shields.io/badge/Neon-PostgreSQL-green?logo=postgresql)](https://neon.tech/)
[![Claude](https://img.shields.io/badge/Claude-API-orange)](https://anthropic.com/)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-blue?logo=tailwindcss)](https://tailwindcss.com/)

[![Build Status](https://img.shields.io/github/actions/workflow/status/medelman17/vibedocs/ci.yml?branch=main)](https://github.com/medelman17/vibedocs/actions)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/medelman17/vibedocs/pulls)

**Production-grade AI agent system for NDA analysis** — featuring durable multi-agent orchestration, two-tier RAG architecture, and row-level security multi-tenancy.

A portfolio project demonstrating modern AI application architecture: LangGraph.js agents wrapped in Inngest durable workflows, querying 33K legal embeddings across isolated database tiers, with Claude providing structured reasoning over the CUAD 41-category taxonomy.

## Architecture

### System Overview

Upload an NDA → durable agent pipeline extracts clauses → risk scoring with cited evidence → gap analysis against industry templates → side-by-side comparison → NDA generation.

**Core architectural patterns:**

| Pattern | Implementation | Why It Matters |
|---------|---------------|----------------|
| **Two-tier data model** | Shared reference DB (read-only) + tenant DB (RLS-enforced) | 33K reference vectors never duplicated; tenant isolation without per-tenant infra |
| **Durable agent orchestration** | Inngest steps wrapping LangGraph.js graphs | Pipeline survives failures; agents manage internal state; rate limits respected |
| **Multi-granularity RAG** | Clause, span, section, and template-level embeddings | Right retrieval granularity for each task (classification vs. generation) |
| **Query-time merge** | Parallel fetch from both DBs, merge before LLM | Reference context + user context in single prompt without data duplication |

<details>
<summary><strong>Tech Stack</strong></summary>

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | Next.js 16, React 19 | App Router, RSC, server actions |
| Database | Neon PostgreSQL + pgvector | Serverless, HNSW indexes, scale-to-zero |
| ORM | Drizzle | Native vector types, 7kb bundle, typed RLS policies |
| Embeddings | Voyage AI voyage-law-2 | Legal-specific, 1024 dims, 16K context |
| LLM | Claude Sonnet 4.5 | Structured output, 0.0 temp for classification |
| Orchestration | Inngest | Durable steps, rate limiting, observability |
| Auth | Auth.js v5 | Drizzle adapter, OAuth + magic links |

</details>

## Agent Pipeline

Four specialized agents orchestrated as durable Inngest steps, each using LangGraph.js for internal state:

```
Parser Agent → Classifier Agent → Risk Scorer Agent → Gap Analyst Agent
     ↓              ↓                   ↓                    ↓
  Chunks +      CUAD category      Risk level +         Missing clause
  sections      + confidence       cited evidence       recommendations
```

<details>
<summary><strong>Agent Details</strong></summary>

| Agent | Responsibility | RAG Context | LLM Calls |
|-------|---------------|-------------|-----------|
| **Parser** | Section detection, legal-aware chunking | — | 1-2 |
| **Classifier** | Map chunks to CUAD 41-category taxonomy | Top-5 similar CUAD annotations | ~15 |
| **Risk Scorer** | Assess risk level with evidence citations | ContractNLI spans + template baselines | ~15 |
| **Gap Analyst** | Identify missing protections | Full taxonomy + extracted categories | 1 |

**~$1.10 per document** (~212K tokens across ~33 LLM calls)

</details>

<details>
<summary><strong>Inngest + LangGraph Integration Pattern</strong></summary>

```typescript
// Inngest provides durability; LangGraph manages agent state
const analyzeNDA = inngest.createFunction(
  { id: "nda-analyze", concurrency: { limit: 5 } },
  { event: "nda/analyze.requested" },
  async ({ event, step }) => {
    const parsed = await step.run("parse-document", () =>
      runParserAgent(event.data.documentId)
    );

    const classified = await step.run("classify-clauses", () =>
      runClassifierAgent(parsed.chunks)
    );

    // Each step is independently retryable
    // LangGraph handles tool routing within each agent
  }
);
```

</details>

## Data Architecture

### Two-Tier Model

**Tier 1 — Shared Reference DB** (read-only, no RLS)
- CUAD: 510 contracts, 13K+ clause annotations across 41 categories
- ContractNLI: 607 NDAs with 17 NLI hypothesis labels
- Bonterms + CommonAccord: Battle-tested NDA templates
- **~33K vectors** at 1024 dimensions (voyage-law-2)

**Tier 2 — Tenant DB** (RLS-enforced via `tenant_id`)
- User documents, chunks, embeddings
- Analysis results, comparisons, generated NDAs
- Audit logs with full access tracking

<details>
<summary><strong>Query-Time Merge Pattern</strong></summary>

```typescript
// Parallel fetch from both tiers, merge before LLM context
const [referenceHits, tenantHits] = await Promise.all([
  sharedDb.select()
    .from(referenceEmbeddings)
    .where(lt(cosineDistance(embedding, queryVec), 0.3))
    .orderBy(cosineDistance(embedding, queryVec))
    .limit(8),

  tenantDb.select()
    .from(tenantEmbeddings)
    .where(and(
      eq(tenantEmbeddings.tenantId, ctx.tenantId),
      lt(cosineDistance(embedding, queryVec), 0.3)
    ))
    .limit(5)
]);

const mergedContext = deduplicateAndRank([...referenceHits, ...tenantHits]);
```

</details>

<details>
<summary><strong>Multi-Tenancy Implementation</strong></summary>

Defense-in-depth isolation:

1. **PostgreSQL RLS** — Policies enforce `tenant_id = current_setting('app.tenant_id')::uuid`
2. **Application layer** — Drizzle wrapper adds explicit `WHERE tenant_id = ?` to all queries
3. **Drizzle schema** — `pgPolicy` declarations generate policies during migration

```typescript
// RLS policy declared in Drizzle schema
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  // ...
}, (table) => ({
  tenantIsolation: pgPolicy("tenant_isolation", {
    using: sql`tenant_id = current_setting('app.tenant_id')::uuid`
  })
}));
```

</details>

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Neon account (free tier works)
- API keys: Anthropic, Voyage AI, Inngest

### Setup

```bash
git clone https://github.com/medelman17/vibedocs.git
cd vibedocs
pnpm install
cp .env.example .env.local  # Configure API keys
pnpm db:push                # Push schema to Neon
pnpm dev                    # http://localhost:3000
```

<details>
<summary><strong>Bootstrap Reference Data</strong></summary>

Populate the shared reference database with CUAD, ContractNLI, and templates:

```bash
# Triggers Inngest bootstrap pipeline (~33K embeddings, ~$12 one-time)
pnpm bootstrap
```

The pipeline is idempotent — safe to re-run. Progress visible in Inngest dashboard.

</details>

<details>
<summary><strong>Environment Variables</strong></summary>

```env
# Neon (two connection strings: shared + tenant)
SHARED_DATABASE_URL=postgresql://...
DATABASE_URL=postgresql://...

# APIs
ANTHROPIC_API_KEY=sk-ant-...
VOYAGE_API_KEY=pa-...
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# Auth.js
AUTH_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
```

See `.env.example` for full list.

</details>

## Key Decisions

<details>
<summary><strong>Drizzle over Prisma</strong></summary>

Prisma's `Unsupported("vector")` type infers as `never`, requiring raw SQL for all vector operations. Drizzle provides:

- Native `vector(1024)` column type with `number[]` inference
- Typed distance functions: `cosineDistance()`, `l2Distance()`
- Schema-declared HNSW indexes that survive migrations
- 7kb bundle vs Prisma's 1.6MB

Trade-off: Less LLM training data available (mitigated by comprehensive CLAUDE.md).

</details>

<details>
<summary><strong>Inngest wrapping LangGraph.js (not replacing)</strong></summary>

Both can orchestrate agents. We use both for complementary strengths:

- **Inngest**: Durability, retry, rate limiting, observability at the *pipeline* level
- **LangGraph.js**: State graphs, tool routing, checkpointing at the *agent* level

Pattern: Each LangGraph agent runs inside an `inngest step.run()`. Inngest handles inter-agent coordination; LangGraph handles intra-agent state.

</details>

<details>
<summary><strong>voyage-law-2 over general-purpose embeddings</strong></summary>

Legal retrieval requires domain-specific understanding. voyage-law-2:

- Trained on legal corpora, benchmarks higher on legal retrieval tasks
- 1024 dimensions (vs 3072 for OpenAI large) — lower storage/query cost
- 16K token context handles long legal sections without truncation

</details>

<details>
<summary><strong>Shared DB + RLS over project-per-tenant</strong></summary>

MVP uses single shared database with Row-Level Security:

- Simplest deployment (one connection string, one migration target)
- PostgreSQL-native isolation at row level
- 33K reference vectors never duplicated across tenants
- Clear migration path to project-per-tenant post-MVP (documented by Neon)

</details>

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/inngest/        # Durable workflow endpoint
│   └── (dashboard)/        # Protected routes
├── src/
│   ├── agents/             # LangGraph agent definitions
│   ├── db/
│   │   ├── shared/         # Reference DB schema + client
│   │   └── tenant/         # Tenant DB schema + RLS policies
│   ├── inngest/functions/  # Pipeline definitions
│   └── lib/                # Embeddings, chunker, Claude client
└── docs/
    ├── PRD.md              # Full product requirements
    ├── schema.md           # Database schema details
    └── agents.md           # Agent architecture specs
```

## Documentation

| Document | Description |
|----------|-------------|
| [PRD.md](docs/PRD.md) | Complete product requirements, architecture decisions, roadmap |
| [CLAUDE.md](CLAUDE.md) | AI assistant context — conventions, patterns, commands |

## License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built as a portfolio project demonstrating production-grade AI application architecture.</sub>
</p>
