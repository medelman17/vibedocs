# External Integrations

**Analysis Date:** 2026-02-04

## APIs & External Services

**AI Model Inference:**
- Claude Sonnet 4, Claude Sonnet 4.5, Claude Opus 4.5 (via Vercel AI Gateway)
  - SDK: `ai` package with `gateway()` router
  - Configuration: `lib/ai/config.ts` with model tier mapping
  - Usage: NDA analysis pipeline, chat interface, structured output generation
  - Rate limit: 60 RPM enforced by Inngest rate limiting

**Legal Document Embeddings:**
- Voyage AI voyage-law-2 (1024 dimensions, 16K context)
  - SDK: `@voyageai/ai-sdk` (REST API calls in `lib/embeddings.ts`)
  - Auth: `VOYAGE_API_KEY` env var
  - Usage: Convert NDA clauses and reference documents to vectors
  - Rate limit: 300 RPM, batched in Inngest with 128-item batch size
  - Caching: LRU cache (1-hour TTL, 10K entries) in `lib/cache/embedding-cache.ts`

**Email Delivery:**
- Resend
  - SDK: `resend` v6.9.1
  - Auth: `RESEND_API_KEY` env var
  - From address: Environment-configurable, defaults to `VibeDocs <noreply@vibedocs.app>`
  - Templates supported: organization-invitation, password-reset, analysis-complete, welcome
  - Client initialized in: `lib/email.ts`

## Data Storage

**Databases:**
- Neon PostgreSQL (serverless)
  - Connection: `DATABASE_URL` env var (HTTP/serverless driver)
  - Client: Drizzle ORM `db/client.ts` with `@neondatabase/serverless` driver
  - Extension: pgvector (must be enabled manually via `CREATE EXTENSION IF NOT EXISTS vector;`)
  - Tables organized in `db/schema/`:
    - Auth: `users`, `accounts`, `sessions`, `verificationTokens` (Auth.js required camelCase columns)
    - Multi-tenancy: `organizations`, `organizationMembers`
    - Data: `documents`, `analyses`, `comparisons`, `generated_ndas`, `conversations`, `messages`
    - References: `reference_documents`, `reference_embeddings` (CUAD, ContractNLI, Bonterms, CommonAccord)
    - Audit: `audit_logs`, `security_events`, `login_attempts`
  - RLS (Row-Level Security): Tenant isolation via `tenant_id` column
  - Prepared queries: `db/queries/` with domain-specific helpers

**File Storage:**
- Vercel Blob (for document uploads and exports)
  - Auth: `BLOB_READ_WRITE_TOKEN` env var
  - Usage: Document files, PDF/DOCX exports
  - Access: Server-only (`"use server"` in `lib/blob.ts`)
  - Pathname structure: `{folder}/{uuid}/{filename}` (collision-proof)
  - URL format: `https://{project}.public.blob.vercel-storage.com/{pathname}`

**Vector Storage:**
- PostgreSQL pgvector extension
  - Embedding dimension: 1024 (Voyage AI voyage-law-2)
  - Storage: `reference_embeddings` and `document_embeddings` columns
  - Indexes: HNSW for cosine similarity search (created after bulk data load)
  - Query: `cosineDistance()` function in Drizzle queries

**Caching:**
- In-memory LRU (lru-cache package, not Redis for MVP)
  - Embedding cache: 1-hour TTL, 10K entries (prevents duplicate API calls)
  - Vector search cache: 5-min TTL, 500 entries (recent searches)
  - Response cache: 30-min TTL, 1K entries (placeholder for future)
  - Implementations: `lib/cache/embedding-cache.ts`, `agents/tools/vector-search.ts`

**Session Cache (Distributed):**
- Upstash Redis (for Word Add-in OAuth flow)
  - Auth: `KV_REST_API_URL`, `KV_REST_API_TOKEN` env vars
  - SDK: `@upstash/redis` v1.36.1
  - Usage: Store auth codes (5-min TTL, one-time use) during Word Add-in OAuth callback
  - Client: `lib/auth-code-cache.ts`

## Authentication & Identity

**Auth Provider:**
- Auth.js v5 (next-auth) with custom configuration
  - Adapter: DrizzleAdapter (database sessions, not JWT)
  - Session strategy: database (30-day max age, 24-hour update window)
  - Session table: `sessions` in PostgreSQL
  - User table: `users` with email, passwordHash, emailVerified fields

**OAuth Providers:**
- Google
  - Credentials: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
  - Configuration: `lib/auth.ts` lines 39-42
  - Use case: Primary login method

- GitHub
  - Credentials: `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
  - Configuration: `lib/auth.ts` lines 43-45
  - Use case: Developer-friendly login

- Microsoft Entra ID (for Word Add-in)
  - Credentials: `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`
  - Issuer: `https://login.microsoftonline.com/common/v2.0`
  - Configuration: `lib/auth.ts` lines 47-51
  - Use case: Office ecosystem integration

**Password-Based Auth:**
- Credentials provider (email/password)
  - Hashing: bcryptjs v3.0.3 (10 salt rounds)
  - Verification: `lib/password.ts` with constant-time comparison
  - Rate limiting: `lib/rate-limit.ts` (max 5 attempts per 15 minutes)
  - Audit logging: Security events tracked in `audit_logs`
  - Configuration: `lib/auth.ts` lines 52-98

**Word Add-in Authentication:**
- Bearer token validation via `lib/word-addin-auth.ts`
  - Token source: Auth.js session tokens
  - Lookup method: Direct database query on `sessions` table
  - Context: `AddInAuthContext` with userId, user, tenantId, role
  - Used in: `app/(word-addin)/` routes

## Workflow Orchestration

**Inngest (Durable Workflows):**
- SDK: `inngest` v3.50.0
- Client: `inngest/client.ts` singleton with `EventSchemas` type safety
- Event key: `INNGEST_EVENT_KEY` env var
- Signing key: `INNGEST_SIGNING_KEY` env var (webhook verification)
- Dev mode: `INNGEST_DEV=1` for local development

**Pipeline:**
1. Parser Agent → Extract clauses from raw text
2. Classifier Agent → Categorize by CUAD 41-category taxonomy
3. Risk Scorer Agent → Assign risk levels (standard/cautious/aggressive/unknown)
4. Gap Analyst Agent → Identify missing protective clauses

**Key Features:**
- Rate limiting: `withRateLimit()` utility for Claude (60 RPM), Voyage (300 RPM)
- Tenant context: `withTenantContext()` wraps RLS-enabled queries
- Error handling: `RetriableError`, `NonRetriableError` (different from `lib/errors.ts`)
- Progress events: Real-time UI updates via `nda/analysis.progress` events
- Retry config: Exponential backoff with configurable retry counts
- Concurrency: Per-function limits (e.g., 5 concurrent analyses)

**Event Schema:**
- Event naming convention: `nda/{domain}.{action}` (e.g., `nda/analysis.requested`)
- Defined in: `inngest/types.ts`
- Validation: Zod schemas for all event payloads

**Serve Handler:**
- Route: `app/api/inngest/route.ts`
- Methods: GET, POST, PUT
- Functions: `inngest/functions/` directory

## Error Tracking & Observability

**Sentry:**
- SDK: `@sentry/nextjs` v10.x
- DSN: `NEXT_PUBLIC_SENTRY_DSN` env var
- Disabled in development (for faster HMR)
- Client-side config: `sentry.client.config.ts`
  - Integrations: Console logging, browser tracing with long task detection
  - Trace sampling: 10% in production, 100% in dev
  - Span filtering: Skip healthchecks and favicons

- Server-side config: `sentry.server.config.ts`
  - Session replay: Enabled (captures user interactions)
  - Source map upload: Enabled (widenClientFileUpload)

- Edge config: `sentry.edge.config.ts`
  - Used for Edge Runtime routes

- Integration: Wrapped in `next.config.ts` via `withSentryConfig()`
- Build optimization: Tree-shaking of debug logs enabled

## Monitoring & Observability

**Logging:**
- Console-based (structured JSON via Sentry in production)
- Audit logging: `lib/audit.ts` for security events
- Database logging: Available via Drizzle Studio (`pnpm db:studio`)

**Performance Metrics:**
- Sentry distributed tracing for API latency
- Inngest step duration tracking for pipeline performance
- LRU cache hit rates (embeddings, vector search)

## CI/CD & Deployment

**Hosting:**
- Vercel (Next.js platform)
- Deployment: Auto-deployed from GitHub (`main` branch)
- Functions: Serverless functions via `/api/` routes
- Edge Runtime: Supported for auth middleware (`proxy.ts`)

**Database Migrations:**
- Drizzle Kit (`drizzle-kit push|migrate`)
- Manual: Run `pnpm db:push` before deploying schema changes
- Idempotent: Uses content_hash for safe re-runs

## Environment Configuration

**Required Environment Variables:**

```bash
# Authentication (Auth.js)
AUTH_SECRET                              # Generated via: openssl rand -base64 32
AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET       # Google OAuth
AUTH_GITHUB_ID, AUTH_GITHUB_SECRET       # GitHub OAuth
AUTH_MICROSOFT_ENTRA_ID_ID, AUTH_MICROSOFT_ENTRA_ID_SECRET  # Microsoft Entra

# Database
DATABASE_URL                             # postgresql://user:pass@host:port/db

# AI & Embeddings
VOYAGE_API_KEY                           # Voyage AI (get from dash.voyageai.com)

# Email
RESEND_API_KEY                           # Resend (get from resend.com)

# File Storage
BLOB_READ_WRITE_TOKEN                    # Vercel Blob (auto-configured in Vercel)

# Inngest
INNGEST_DEV                              # Set to 1 for local dev
INNGEST_EVENT_KEY                        # Event key (dummy locally, real in prod)
INNGEST_SIGNING_KEY                      # Webhook signing key

# Upstash Redis (Word Add-in)
KV_REST_API_URL                          # Redis URL
KV_REST_API_TOKEN                        # Redis token

# Optional: Error Tracking
NEXT_PUBLIC_SENTRY_DSN                   # Sentry DSN (public, safe in browser)
```

**Secrets Location:**
- Local dev: `.env.local` (never committed)
- Production: Vercel Environment Variables (encrypted)
- Distributed cache: Upstash (managed separately)

## Webhooks & Callbacks

**Incoming Webhooks:**
- Inngest: `app/api/inngest/route.ts` (webhook for function execution)
- Auth callbacks: Next.js handles in `lib/auth.ts` callbacks

**Outgoing Webhooks:**
- Progress events: Emitted to frontend via Inngest progress events
- Email callbacks: None (Resend is fire-and-forget)

## Reference Data Integration

**CUAD (Contract Understanding Atticus Dataset):**
- 510 real NDAs with 41-category taxonomy
- Integration: Parsed and embedded during bootstrap pipeline
- Storage: `reference_documents`, `reference_embeddings` tables
- Usage: RAG context for chat, risk scoring reference

**ContractNLI:**
- Contract natural language inference examples
- Integration: Same as CUAD (bulk embedding)
- Usage: Training context for classification

**Bonterms & CommonAccord:**
- Template libraries
- Integration: Retrieved during NDA generation (`lib/template-service.ts`)
- Usage: User customization during generation flow

**Kleister:**
- Contract analysis examples
- Integration: Optional enhancement data (future)

---

*Integration audit: 2026-02-04*
