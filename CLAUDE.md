# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeDocs is an LLM-powered NDA analysis tool. See `docs/PRD.md` for full specification.

Core features: upload NDAs → clause extraction (CUAD 41-category taxonomy) → risk scoring with cited evidence → gap analysis → side-by-side comparison → NDA generation from templates.

## Commands

```bash
# Development
pnpm dev          # Start development server (http://localhost:3000)
pnpm dev:inngest  # Start Inngest dev server (http://localhost:8288)
pnpm dev:all      # Start both Next.js and Inngest dev servers
pnpm build        # Production build
pnpm lint         # ESLint
pnpm start        # Production server

# Database
pnpm db:push      # Push Drizzle schema to database
pnpm db:generate  # Generate Drizzle migrations (output: ./drizzle/)
pnpm db:migrate   # Run migrations
pnpm db:studio    # Open Drizzle Studio

# Testing
pnpm test         # Run Vitest tests
pnpm test:coverage # Run with coverage report

# Worktree Setup
pnpm install      # Required after creating worktree (node_modules not shared)
```

## Architecture

### Database Model (Current: Single DB with Schema Separation)

Single Neon database for MVP with logical separation:
- **Shared tables**: reference_documents, reference_embeddings (future: CUAD, ContractNLI, templates)
- **Tenant tables**: documents, analyses, comparisons, generated_ndas (RLS-enforced via `tenant_id`)

Will split into two physical databases later. Keep shared/tenant queries in separate files.

### Auth & Multi-Tenancy

- **Auth.js v5** with DrizzleAdapter, database sessions (not JWT)
- **Providers**: Google OAuth, GitHub OAuth, Microsoft Entra ID + Email/Password (bcryptjs)
- **Multi-org**: Users can belong to multiple organizations via `organization_members` junction table
- **Session**: Includes `activeOrganizationId` for tenant context switching

**CRITICAL: Auth.js DrizzleAdapter Column Naming**
Auth.js v5 DrizzleAdapter expects **camelCase** column names for specific fields:
- `users.emailVerified` (NOT `email_verified`)
- `accounts.userId` (NOT `user_id`)
- `accounts.providerAccountId` (NOT `provider_account_id`)
- `sessions.sessionToken` (NOT `session_token`)
- `sessions.userId` (NOT `user_id`)

Using snake_case for these columns causes `AdapterError` (PostgreSQL 42703: undefined column) on OAuth callback. See `src/db/schema/auth.ts` for the correct schema definition.

### Data Access Layer (DAL)

```typescript
import { verifySession, withTenant, requireRole } from "@/lib/dal"

// In Server Components:
const { userId, user } = await verifySession()           // Redirects if not auth'd
const { db, tenantId, role } = await withTenant()        // Sets RLS context
const ctx = await requireRole(["owner", "admin"])        // Role-based access
```

### Next.js 16 Patterns

- **Proxy file**: `src/proxy.ts` (renamed from middleware.ts in v16)
- **DAL**: Uses React `cache()` for request memoization
- **Server-only**: Import `"server-only"` in DAL to prevent client bundling

### Agent Pipeline (Inngest + AI SDK 6)

```
Parser Agent → Classifier Agent → Risk Scorer Agent → Gap Analyst Agent
```

Each agent runs inside an `inngest step.run()` for durability. AI SDK 6 `generateObject()` for structured output.

**Risk Levels (PRD-aligned):** `standard` | `cautious` | `aggressive` | `unknown` (not low/medium/high)

**Token Budget:** ~212K tokens per document (~$1.10 at Sonnet pricing)

### Stack
- Next.js 16 (App Router, RSC), React 19, TypeScript (strict)
- Tailwind CSS v4 (`@theme inline`, oklch colors)
- Drizzle ORM with Neon PostgreSQL + pgvector (HNSW indexes)
- Voyage AI voyage-law-2 embeddings (1024 dims, 16K context)
- Claude Sonnet 4.5 (structured output, 0.0 temperature for classification)
- Inngest for durable workflows (rate limiting: Voyage 300 RPM, Claude 60 RPM)
- Auth.js v5 with Drizzle adapter
- @dsnp/parquetjs for Parquet parsing (`cursor.next()` returns `unknown`, needs type assertion)

### Path Aliases
```
@/*  →  ./*  (e.g., @/components, @/lib/utils, @/hooks)
```

### Key Directories
- `app/` - Next.js App Router (pages, API routes)
  - `/api/auth/[...nextauth]` - Auth.js routes
  - `/api/comparisons/` - NDA comparison endpoints
  - `/api/generate/` - NDA generation endpoints (includes `/[id]/export`)
- `src/db/` - Drizzle schema and client
  - `schema/` - Table definitions (auth, organizations, documents, analyses, etc.)
  - `queries/` - Prepared queries (documents, analyses, similarity)
  - `_columns.ts` - Reusable column helpers (timestamps, tenantId, etc.)
  - `client.ts` - Neon serverless connection
- `src/lib/` - Core utilities
  - `auth.ts` - Auth.js configuration
  - `dal.ts` - Data Access Layer (verifySession, withTenant, requireRole)
  - `errors.ts` - Custom error classes (AppError, NotFoundError, etc.)
  - `api-utils.ts` - API response helpers (success, error, withErrorHandling)
  - `password.ts` - Password hashing/validation
  - `clause-alignment.ts` - Hungarian algorithm for clause matching
  - `document-export.ts` - DOCX/PDF export utilities
  - `template-service.ts` - Bonterms/CommonAccord template retrieval
- `src/proxy.ts` - Next.js 16 auth redirects (formerly middleware.ts)
- `src/test/` - Test setup (PGlite)
- `src/inngest/` - Inngest client and pipeline functions
- `src/agents/` - AI SDK 6 agent definitions
  - `prompts/` - System prompts for each agent
  - `tools/` - Vector search and other agent tools
  - `testing/` - Mock AI and fixtures for agent tests
  - `comparison/` - Comparison pipeline schemas and prompts
- `src/lib/cache/` - LRU caching (embeddings, responses, search)
- `components/` - shadcn/ui + AI SDK Elements

## Conventions

### Database (Drizzle)
- All tenant tables use `...tenantId` spread from `src/db/_columns.ts`
- Use column helpers: `primaryId`, `timestamps`, `softDelete`, `tenantId`
- **CUAD Categories**: Use title case for abbreviations (e.g., `"Ip Ownership Assignment"` not `"IP Ownership Assignment"`)
- Use `cosineDistance()` for vector similarity queries
- HNSW indexes created AFTER bulk data load
- Idempotent ingestion via `content_hash` + `ON CONFLICT DO NOTHING`
- **pgvector**: Enable manually on Neon before `db:push`: `CREATE EXTENSION IF NOT EXISTS vector;`

### Auth Patterns
- Use `verifySession()` in Server Components for auth check
- Use `withTenant()` for tenant-scoped queries (sets RLS context)
- Use `requireRole(["owner", "admin"])` for role-based access
- Password utilities: `hashPassword()`, `verifyPassword()`, `validatePassword()`
- **Zod 4 Compatibility** (IMPORTANT):
  - Use `.issues` not `.errors` for error arrays: `parsed.error.issues[0]`
  - `ValidationError.fromZodError()` expects `{ issues: [...] }` not `{ errors: [...] }`
  - Zod 4 renamed `ZodError.errors` → `ZodError.issues` for clarity

### Error Handling
- Use custom errors from `src/lib/errors.ts`: `NotFoundError`, `ValidationError`, `ForbiddenError`, etc.
- API routes: Wrap with `withErrorHandling()` from `src/lib/api-utils.ts`
- Server actions: Use `withActionErrorHandling()` or return `ActionResult<T>` type
- Convert Zod errors: `ValidationError.fromZodError(zodError)`

### Testing (Vitest + PGlite)
- Tests use in-memory PGlite (WASM Postgres) - no Docker needed
- Test files: `*.test.ts` in `src/` directory
- ContractNLI parser tests require Parquet fixtures (use `ParquetWriter` from `@dsnp/parquetjs`)
- Setup file: `src/test/setup.ts` creates schema before each test
- Run: `pnpm test` or `pnpm test:coverage`
- Use `vi.resetModules()` in `beforeEach` when mocks need fresh state between tests

### Inngest Patterns

**Imports**: Use the barrel export for all Inngest utilities:
```typescript
import {
  inngest,
  CONCURRENCY,
  RATE_LIMITS,
  RETRY_CONFIG,
  withTenantContext,
  withRateLimit,
  RetriableError,
  NonRetriableError,
} from "@/inngest"
```

**Function Creation**:
```typescript
export const analyzeNda = inngest.createFunction(
  {
    id: "nda-analyze",
    concurrency: CONCURRENCY.analysis,
    retries: RETRY_CONFIG.default.retries,
  },
  { event: "nda/analysis.requested" },
  async ({ event, step }) => {
    const { tenantId, documentId, analysisId } = event.data

    await withTenantContext(tenantId, async (ctx) => {
      const result = await step.run("process-document", async () => {
        return await processDocument(ctx, documentId)
      })

      await step.sleep("rate-limit", getRateLimitDelay("claude"))

      await step.run("analyze-clauses", async () => {
        return await analyzeClauses(ctx, result)
      })
    })
  }
)
```

**Rate Limiting**: Use `step.sleep()` with `getRateLimitDelay()`:
- Claude: 60 RPM → 1000ms delay
- Voyage AI: 300 RPM → 200ms delay, batch size 128

**Tenant Context**: Always wrap tenant-scoped operations:
```typescript
await withTenantContext(tenantId, async (ctx) => {
  // ctx.db has RLS context set
  // ctx.tenantId for reference
})
```

**Error Classes**: Use Inngest-specific errors (different from `src/lib/errors.ts`):
- `RetriableError` - Inngest will retry (network issues, rate limits)
- `NonRetriableError` - No retry (validation, not found)
- `ApiError` - Auto-determines retriability from HTTP status

**Event Naming**: `nda/<domain>.<action>` (e.g., `nda/analysis.requested`)

**Progress Events**: Emit for real-time UI updates:
```typescript
await step.sendEvent("emit-progress", {
  name: "nda/analysis.progress",
  data: { analysisId, step: "parsing", percent: 25 }
})
```

**Testing**: Import test helpers directly (not from barrel):
```typescript
import { createMockEvent, createMockStep, testEventData } from "@/inngest/utils/test-helpers"
```

### Caching (LRU)
- **Embedding cache**: 1-hour TTL, 10K entries - `src/lib/cache/embedding-cache.ts`
- **Response cache**: 30-min TTL, 1K entries - `src/lib/cache/response-cache.ts`
- **Vector search cache**: 5-min TTL, 500 entries - `src/agents/tools/vector-search.ts`
- Package: `lru-cache` (not Redis for MVP)

### Component Patterns
- UI components use `data-slot` attributes for styling hooks
- Use `cva` (class-variance-authority) for component variants
- Use `cn()` from `@/lib/utils` for conditional classNames
- **Motion**: Import from `motion/react` (not `framer-motion`)

### Adding Components
```bash
pnpm dlx shadcn@latest add <component-name>
pnpm dlx shadcn@latest add <component-name> -r @ai-elements
```

### ESLint
- `components/ui/**` and `components/ai-elements/**` are excluded (shadcn-generated)
- Underscore prefix (`_var`) marks intentionally unused variables

### pnpm Workspace
- Single-package projects need `packages: []` in `pnpm-workspace.yaml` for `actions/setup-node` cache to work

## GitHub Actions

- Claude Code action needs `write` permissions for `contents`, `pull-requests`, `issues`
- Test workflow needs dummy env vars (modules like `db/client.ts` evaluate at load time)

## MCP Servers

Project uses `.mcp.json` for MCP server configuration:
- `shadcn` - Component management via `npx shadcn@latest mcp`
- `context7` - Live documentation lookup for libraries (Drizzle, Next.js, Auth.js, etc.)

## Claude Code Automations

Project-level automations in `.claude/` (shared via git):

### Skills
- `/drizzle-migration <description>` - Create Drizzle migrations following project conventions
- `/inngest-function <description>` - Create durable Inngest workflows with rate limiting
- `error-response` (Claude-only) - Automatically apply error handling conventions

### Agents
- `security-reviewer` - Reviews auth, multi-tenancy, and data protection
- `test-writer` - Generates tests following Vitest + PGlite patterns

### Hooks (automatic)
- Auto-lint: Runs `pnpm lint --fix` after editing TS/JS files
- Block .env: Prevents direct edits to `.env*` files

Note: `.claude/settings.local.json` is gitignored (user-specific permissions)

## Ignored Files

- `.serena/` - Serena MCP local project cache (do not commit)
- `.claude/settings.local.json` - User-specific Claude permissions (do not commit)

## Documentation

Detailed specs in `docs/`:
- `PRD.md` - Full product requirements (authoritative source)
- `schema.md` - Database schema details
- `agents.md` - Agent architecture specs
- `api-patterns.md` - API design patterns
- `embedding-strategy.md` - Vector embedding approach

Implementation plans in `docs/plans/`:
- `2026-02-01-database-foundation-design.md` - Database architecture decisions
- `2026-02-01-database-foundation-implementation.md` - Step-by-step implementation
- `2026-02-01-inngest-infrastructure.md` - Inngest setup (Plan 1)
- `2026-02-01-inngest-bootstrap.md` - Bootstrap pipeline for reference data (Plan 2)
- `2026-02-01-inngest-agents-foundation.md` - AI SDK 6 base patterns (Plan 3)
- `2026-02-01-inngest-analysis-pipeline.md` - Full analysis pipeline (Plan 4)
- `2026-02-01-inngest-comparison-generation.md` - Comparison & generation pipelines (Plan 5)

## Environment Variables

See `.env.example` for required variables:
- `DATABASE_URL` - Neon PostgreSQL connection string
- `AUTH_SECRET` - Auth.js session secret
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` - Google OAuth credentials
- `RESEND_API_KEY` - Email provider for password reset
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob for file uploads
- `INNGEST_EVENT_KEY` - Inngest event key for sending events
- `INNGEST_SIGNING_KEY` - Inngest webhook signature verification
