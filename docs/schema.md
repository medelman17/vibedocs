# Database Schema Reference

> **Source of truth for all database definitions.** Imported by CLAUDE.md for database-related tasks.
> For narrative context on data architecture decisions, see [PRD §7](./PRD.md#7-data-architecture) and [PRD §20 ADR-004](./PRD.md#20-technical-decision-log).

---

## Two-Tier Overview

| Tier | Purpose | Connection | Driver | RLS |
|------|---------|------------|--------|-----|
| **Shared Reference** | CUAD, ContractNLI, Bonterms, CommonAccord, Kleister | Read-only | `neon-http` (Edge-compatible) | None — public reads |
| **Tenant-Scoped** | User documents, analyses, generated NDAs | Read/write | `neon-serverless` (WebSocket) | Yes — `tenant_id` isolation |

> **Current Implementation:** Single Neon database with logical schema separation for MVP. Will split into two physical databases when scaling requires it. See `docs/plans/2026-02-01-database-foundation-design.md` for architecture decisions.

---

## Shared Reference Database

### reference_documents

Legal corpora documents (CUAD contracts, ContractNLI NDAs, templates).

```sql
CREATE TABLE reference_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,            -- 'cuad' | 'contract_nli' | 'bonterms' | 'commonaccord' | 'kleister'
  source_id TEXT,                  -- Original ID from dataset
  title TEXT NOT NULL,
  raw_text TEXT,
  metadata JSONB DEFAULT '{}',     -- Source-specific metadata
  content_hash TEXT UNIQUE,        -- SHA-256 for idempotent ingestion
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### reference_embeddings

Multi-granularity embeddings for reference corpora.

```sql
CREATE TABLE reference_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES reference_documents(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES reference_embeddings(id),  -- Hierarchical: section → clause
  granularity TEXT NOT NULL,        -- 'document' | 'section' | 'clause' | 'span' | 'template'
  content TEXT NOT NULL,
  section_path TEXT[],              -- e.g., ARRAY['Article 5', 'Section 5.2']
  category TEXT,                    -- CUAD category label (for clause-level)
  hypothesis_id INTEGER,           -- ContractNLI hypothesis ID (for span-level)
  nli_label TEXT,                   -- 'entailment' | 'contradiction' | 'not_mentioned'
  embedding VECTOR(1024) NOT NULL,  -- voyage-law-2
  metadata JSONB DEFAULT '{}',
  content_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### cuad_categories

CUAD category taxonomy (41 categories with descriptions).

```sql
CREATE TABLE cuad_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  risk_weight REAL DEFAULT 1.0,     -- Relative importance for risk scoring
  is_nda_relevant BOOLEAN DEFAULT true
);
```

### contract_nli_hypotheses

ContractNLI hypothesis definitions.

```sql
CREATE TABLE contract_nli_hypotheses (
  id INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  category TEXT                     -- Grouping for related hypotheses
);
```

### Shared DB Indexes

Created AFTER bulk data load for optimal build performance:

```sql
CREATE INDEX idx_ref_embed_hnsw ON reference_embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_ref_embed_granularity ON reference_embeddings (granularity);
CREATE INDEX idx_ref_embed_category ON reference_embeddings (category);
CREATE INDEX idx_ref_embed_document ON reference_embeddings (document_id);
CREATE INDEX idx_ref_docs_source ON reference_documents (source);
```

---

## Tenant-Scoped Database

All tenant tables include `tenant_id UUID NOT NULL` with RLS policies.

### users

Auth.js required table, extended with organization membership.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT UNIQUE,
  email_verified TIMESTAMPTZ,
  image TEXT,
  organization_id UUID REFERENCES organizations(id),
  role TEXT DEFAULT 'member',       -- 'admin' | 'member' | 'viewer'
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### organizations

Tenant boundary. All RLS flows through `organization.id → tenant_id`.

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT DEFAULT 'free',         -- 'free' | 'pro' | 'enterprise'
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ            -- Soft delete
);
```

### documents

User-uploaded NDA documents.

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  uploaded_by UUID REFERENCES users(id),
  title TEXT NOT NULL,
  file_type TEXT NOT NULL,           -- 'pdf' | 'docx'
  file_size INTEGER,
  raw_text TEXT,
  status TEXT DEFAULT 'uploaded',    -- 'uploaded' | 'parsing' | 'embedding' | 'analyzing' | 'complete' | 'failed'
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  content_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);
```

### document_chunks

Document chunks with voyage-law-2 embeddings.

```sql
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  section_path TEXT[],
  embedding VECTOR(1024),            -- voyage-law-2
  token_count INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### analyses

Analysis results (one per document).

```sql
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',     -- 'pending' | 'running' | 'complete' | 'failed'
  overall_risk_score REAL,           -- 0.0 (safe) to 1.0 (aggressive)
  overall_risk_level TEXT,           -- 'standard' | 'cautious' | 'aggressive'
  summary TEXT,                      -- LLM-generated executive summary
  gap_analysis JSONB,                -- Missing categories with explanations
  token_usage JSONB,                 -- { input: N, output: N, cost_usd: N }
  processing_time_ms INTEGER,
  version INTEGER DEFAULT 1,         -- Optimistic locking
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### clause_extractions

Individual clause extractions within an analysis.

```sql
CREATE TABLE clause_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES document_chunks(id),
  category TEXT NOT NULL,            -- CUAD category name
  secondary_categories TEXT[],       -- Additional applicable categories
  clause_text TEXT NOT NULL,
  start_position INTEGER,
  end_position INTEGER,
  confidence REAL NOT NULL,          -- 0.0 to 1.0
  risk_level TEXT NOT NULL,          -- 'standard' | 'cautious' | 'aggressive' | 'unknown'
  risk_explanation TEXT,
  evidence JSONB,                    -- Cited reference clauses supporting the assessment
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### comparisons

NDA comparison snapshots.

```sql
CREATE TABLE comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  document_a_id UUID NOT NULL REFERENCES documents(id),
  document_b_id UUID NOT NULL REFERENCES documents(id),
  status TEXT DEFAULT 'pending',
  summary TEXT,
  clause_alignments JSONB,           -- Matched clause pairs with diff descriptions
  key_differences JSONB,             -- Summarized differences with risk implications
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### generated_ndas

Generated NDA drafts.

```sql
CREATE TABLE generated_ndas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  title TEXT NOT NULL,
  template_source TEXT NOT NULL,     -- 'bonterms' | 'commonaccord'
  parameters JSONB NOT NULL,         -- User-specified generation parameters
  content TEXT NOT NULL,             -- Full generated NDA text
  content_html TEXT,                 -- Rendered HTML for preview
  status TEXT DEFAULT 'draft',       -- 'draft' | 'finalized' | 'exported'
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### audit_logs

Audit trail for compliance.

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,              -- 'INSERT' | 'UPDATE' | 'DELETE' | 'ACCESS' | 'DOWNLOAD' | 'EXPORT'
  old_values JSONB,
  new_values JSONB,
  user_id UUID,
  ip_address TEXT,
  performed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### Row-Level Security

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE clause_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_ndas ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy pattern (applied to each table above)
-- Uses session variable set by application middleware
CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

**Defense in depth:** Application layer wraps all queries with explicit `WHERE tenant_id = ?` via a tenant-scoped Drizzle wrapper, independent of RLS.

### Tenant DB Indexes

```sql
CREATE INDEX idx_docs_tenant ON documents (tenant_id, created_at DESC);
CREATE INDEX idx_chunks_document ON document_chunks (document_id, chunk_index);
CREATE INDEX idx_chunks_tenant ON document_chunks (tenant_id);
CREATE INDEX idx_chunks_hnsw ON document_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_analyses_document ON analyses (document_id);
CREATE INDEX idx_clauses_analysis ON clause_extractions (analysis_id);
CREATE INDEX idx_clauses_category ON clause_extractions (category);
CREATE INDEX idx_audit_tenant ON audit_logs (tenant_id, table_name, performed_at DESC);
```

---

## Drizzle Schema Organization

```
src/db/
├── index.ts                    # Database client exports (shared + tenant)
├── shared/
│   ├── schema.ts               # Reference database schema
│   └── client.ts               # neon-http client (read-only)
├── tenant/
│   ├── schema/
│   │   ├── index.ts            # Barrel export
│   │   ├── auth.ts             # Auth.js tables (users, accounts, sessions)
│   │   ├── documents.ts        # Documents + chunks
│   │   ├── analyses.ts         # Analyses + clause extractions
│   │   ├── comparisons.ts      # Comparison results
│   │   ├── generated.ts        # Generated NDA drafts
│   │   └── audit.ts            # Audit logs
│   ├── relations.ts            # Centralized Drizzle relations
│   └── client.ts               # neon-serverless client (read/write)
├── queries/
│   ├── similarity.ts           # Vector search helpers
│   ├── documents.ts            # Document CRUD
│   └── analyses.ts             # Analysis CRUD
└── _columns.ts                 # Reusable column definitions (timestamps, soft delete, etc.)
```

### Connection Patterns

| Database  | Driver            | Use Case                          |
| --------- | ----------------- | --------------------------------- |
| Shared    | `neon-http`       | Edge-compatible, read-only, no TX |
| Tenant    | `neon-serverless` | WebSocket, transactions, RLS      |

### Key Conventions

- All tenant tables require `tenant_id UUID NOT NULL` with an RLS policy
- Use `cosineDistance()` for vector similarity (not `l2Distance()`)
- HNSW indexes: `m=16, ef_construction=64` — created AFTER bulk data load
- Idempotent ingestion via `content_hash` + `ON CONFLICT (content_hash) DO NOTHING`
- Soft delete via `deleted_at TIMESTAMPTZ` (30-day retention before hard purge)
- Optimistic locking via `version INTEGER` on mutable records
