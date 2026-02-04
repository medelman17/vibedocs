# Technology Stack

**Analysis Date:** 2026-02-04

## Languages

**Primary:**
- TypeScript 5.9.3 - Entire codebase (strict mode)
- JSX/TSX - React components and Server Components

**Secondary:**
- JavaScript - Configuration files (ESLint, PostCSS)

## Runtime

**Environment:**
- Node.js (no specific version pinned, determined by deployment platform)

**Package Manager:**
- pnpm (workspace with single package, `packages: []` for GitHub Actions cache)
- Lockfile: `pnpm-lock.yaml` (committed)

## Frameworks

**Core:**
- Next.js 16.1.6 - Full-stack web framework with App Router (RSC, server/client)
- React 19.2.3 - UI library
- TypeScript 5.9.3 - Static typing

**UI Components:**
- Radix UI 1.4.3 - Accessible primitives (Accordion, Dialog, Select, Tabs, etc.)
- shadcn/ui - Component library (auto-generated in `components/ui/`, excluded from linting)
- Tailwind CSS 4.1.18 - Utility-first CSS with PostCSS v4
- Motion 12.29.2 - Animation library (import from `motion/react`)

**Form Handling:**
- React Hook Form 7.71.1 - Form state management
- Zod 4.3.6 - TypeScript-first schema validation (uses `.issues` not `.errors`)

**State Management:**
- Zustand 5.0.11 - Lightweight client state

**Data Visualization:**
- Recharts 2.15.4 - React charting library
- XYFlow 12.10.0 - Node graph rendering

**AI/Chat:**
- AI SDK 6.0.67 - Vercel AI framework with `streamText`, `generateObject`, `useChat`
- @ai-sdk/react 3.0.69 - React hooks for AI SDK

**Document Processing:**
- pdf-parse 2.4.5 - PDF parsing (server-side only)
- @dsnp/parquetjs 1.8.7 - Parquet file parsing
- mammoth 1.11.0 - DOCX/document conversion
- shiki 3.22.0 - Syntax highlighting for code blocks
- Streamdown 2.1.0 - Markdown rendering with CJK, Code, Math, Mermaid support

**Word Add-in:**
- Office JS types 1.0.569 - Microsoft Office JavaScript API types

## Testing

**Framework:**
- Vitest 4.0.18 - Unit and integration test runner
- @electric-sql/pglite 0.3.15 - In-memory WASM PostgreSQL (no Docker needed)
- @testing-library/react 16.3.2 - React component testing utilities
- @vitest/coverage-v8 4.0.18 - Code coverage reporting

**Configuration:**
- `vitest.config.ts` - Main test config
- `vitest.unit.config.ts` - Unit-only test config
- `test/setup.ts` - Schema setup before each test (PGlite)

## Database & ORM

**Primary Database:**
- Neon PostgreSQL (serverless, HTTP driver via `@neondatabase/serverless`)
- Single database for MVP with logical separation (shared tables vs tenant tables via RLS)

**ORM:**
- Drizzle ORM 0.45.1 - Type-safe query builder
- `db/schema/index.ts` - Table definitions across 12 schema files
- `db/queries/` - Prepared queries for specific domains
- `db/_columns.ts` - Reusable column helpers (timestamps, tenantId, softDelete)

**Vector Search:**
- pgvector extension (PostgreSQL) - 1024-dimensional embeddings
- HNSW indexes for similarity search
- Voyage AI voyage-law-2 model generates embeddings

## Authentication

**Framework:**
- Auth.js v5.0.0-beta.30 - Next.js authentication with DrizzleAdapter
- Session strategy: database (not JWT)
- Session lifetime: 30 days max, 24-hour update window

**Providers:**
- Google OAuth (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`)
- GitHub OAuth (`AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`)
- Microsoft Entra ID (`AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`)
- Credentials (Email/Password with bcryptjs hashing)

## AI & LLM

**Model Access:**
- Vercel AI Gateway (`gateway()` function) - Router to Claude models
- Models available:
  - `anthropic/claude-haiku-4.5` (fast tier, parser agent)
  - `anthropic/claude-sonnet-4` (balanced tier, classifier agent)
  - `anthropic/claude-sonnet-4.5` (best tier, risk scorer & gap analyst)
  - `anthropic/claude-opus-4.5` (premium tier)

**API Configuration:**
- AI SDK 6 with structured output via `generateObject()`
- Temperature: 0.0 (deterministic for classification)
- Max tokens: 4096 per request
- Token budget: ~212K tokens per document (~$1.10 at Sonnet pricing)

## External Services

**File Storage:**
- Vercel Blob - Document uploads (`BLOB_READ_WRITE_TOKEN`)

**Email:**
- Resend (`RESEND_API_KEY`) - Transactional emails (invitations, password resets, notifications)

**Vector Embeddings:**
- Voyage AI voyage-law-2 model (`VOYAGE_API_KEY`)
  - 1024 dimensions
  - 16K max context
  - Rate limit: 300 RPM (batched in Inngest)

**Caching:**
- lru-cache 11.2.5 - In-memory LRU caching (not Redis for MVP)
  - Embedding cache: 1-hour TTL, 10K entries
  - Vector search cache: 5-min TTL, 500 entries
  - Response cache: 30-min TTL, 1K entries

**Redis (Upstash):**
- @upstash/redis 1.36.1 - Distributed Redis for Word Add-in auth code flow
  - `KV_REST_API_URL`, `KV_REST_API_TOKEN` env vars

**Workflow Orchestration:**
- Inngest 3.50.0 - Durable workflow engine
  - Rate limiting: Claude 60 RPM, Voyage 300 RPM
  - Event-driven pipeline: Parser → Classifier → Risk Scorer → Gap Analyst
  - Progress events for real-time UI updates

**Error Tracking & Monitoring:**
- @sentry/nextjs 10.x - Error tracking, performance monitoring, distributed tracing
  - Configured in `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
  - Browser tracing with long task detection
  - 10% trace sampling in production

## Build & Dev Tools

**Build:**
- Next.js 16 build system (webpack-based)
- Memory optimizations: `onDemandEntries` (15s timeout, 2-page buffer)

**Formatting & Linting:**
- ESLint 9.39.2 with `eslint-config-next` (flat config format)
- Husky 9.1.7 - Git hooks (`prepare` script)
- lint-staged 16.2.7 - Pre-commit linting (`.{ts,tsx,js,jsx}` files)

**Development:**
- tsx 4.21.0 - TypeScript executor for scripts
- Concurrently 9.2.1 - Parallel dev server runner (`pnpm dev:all`)

**Database Migrations:**
- Drizzle Kit 0.31.8 - Schema management
  - `db:push` - Sync schema to database
  - `db:generate` - Create migration files (output: `drizzle/`)
  - `db:migrate` - Run migrations
  - `db:studio` - Drizzle Studio UI

## Configuration

**Environment Variables:**
```bash
# Database
DATABASE_URL="postgresql://..."

# Auth.js
AUTH_SECRET="openssl-generated-32-bytes"
AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
AUTH_GITHUB_ID, AUTH_GITHUB_SECRET
AUTH_MICROSOFT_ENTRA_ID_ID, AUTH_MICROSOFT_ENTRA_ID_SECRET

# Inngest
INNGEST_DEV=1                    # Local development flag
INNGEST_EVENT_KEY=local-dev-key
INNGEST_SIGNING_KEY=local-signing-key

# External APIs
VOYAGE_API_KEY=pa-...            # Voyage AI embeddings
RESEND_API_KEY=re_...            # Email provider
BLOB_READ_WRITE_TOKEN=...        # Vercel Blob

# Upstash Redis (Word Add-in)
KV_REST_API_URL=...
KV_REST_API_TOKEN=...

# Sentry (optional, disabled in dev)
NEXT_PUBLIC_SENTRY_DSN=...
```

**TypeScript Configuration:**
- Target: ES2017
- Strict mode enabled
- Path alias: `@/*` → `./` (import from `@/components`, `@/lib`, etc.)
- Isolated modules for better IDE performance

**Drizzle Configuration:**
- Dialect: PostgreSQL
- Schema: `db/schema/index.ts`
- Migrations output: `drizzle/` directory
- Credential source: `DATABASE_URL` env var

## Platform Requirements

**Development:**
- Node.js (any recent LTS version)
- pnpm (for workspace setup and GitHub Actions caching)
- PostgreSQL 14+ (via Neon serverless or local dev setup)
- pgvector extension (must be enabled manually on Neon: `CREATE EXTENSION IF NOT EXISTS vector;`)

**Production:**
- Vercel (Next.js hosting with serverless functions)
- Neon PostgreSQL (serverless database)
- Sentry.io (error tracking)
- Voyage AI (embeddings API)
- Resend (email provider)
- Vercel Blob (file storage)
- Upstash Redis (distributed session cache for Word Add-in)

---

*Stack analysis: 2026-02-04*
