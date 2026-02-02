# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NDA Analyst is an LLM-powered NDA analysis tool. See `docs/PRD.md` for full specification.

Core features: upload NDAs → clause extraction (CUAD 41-category taxonomy) → risk scoring with cited evidence → gap analysis → side-by-side comparison → NDA generation from templates.

## Commands

```bash
# Development
pnpm dev          # Start development server (http://localhost:3000)
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
- **Providers**: Google OAuth, GitHub OAuth + Email/Password (bcryptjs)
- **Multi-org**: Users can belong to multiple organizations via `organization_members` junction table
- **Session**: Includes `activeOrganizationId` for tenant context switching

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

### Agent Pipeline (Inngest + LangGraph.js)

```
Parser Agent → Classifier Agent → Risk Scorer Agent → Gap Analyst Agent
```

Each agent runs inside an `inngest step.run()` for durability. LangGraph handles intra-agent state.

### Stack
- Next.js 16 (App Router, RSC), React 19, TypeScript (strict)
- Tailwind CSS v4 (`@theme inline`, oklch colors)
- Drizzle ORM with Neon PostgreSQL + pgvector (HNSW indexes)
- Voyage AI voyage-law-2 embeddings (1024 dims, 16K context)
- Claude Sonnet 4.5 (structured output, 0.0 temperature for classification)
- Inngest for durable workflows (rate limiting: Voyage 300 RPM, Claude 60 RPM)
- Auth.js v5 with Drizzle adapter

### Path Aliases
```
@/*  →  ./*  (e.g., @/components, @/lib/utils, @/hooks)
```

### Key Directories
- `app/` - Next.js App Router (pages, API routes including `/api/auth/[...nextauth]`)
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
- `src/proxy.ts` - Next.js 16 auth redirects (formerly middleware.ts)
- `src/test/` - Test setup (PGlite)
- `src/inngest/` - Inngest client and pipeline functions (future)
- `src/agents/` - LangGraph agent definitions (future)
- `components/` - shadcn/ui + AI SDK Elements

## Conventions

### Database (Drizzle)
- All tenant tables use `...tenantId` spread from `src/db/_columns.ts`
- Use column helpers: `primaryId`, `timestamps`, `softDelete`, `tenantId`
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
- Setup file: `src/test/setup.ts` creates schema before each test
- Run: `pnpm test` or `pnpm test:coverage`
- Use `vi.resetModules()` in `beforeEach` when mocks need fresh state between tests

### Inngest Patterns
- Wrap each LangGraph agent in `step.run()` for durability
- Use `step.sleep()` for rate limiting between API calls
- Concurrency limits: 5 analyses, 3 embedding batches

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

## Claude Code Automations

Project-level automations in `.claude/` (shared via git):

### Skills
- `/drizzle-migration <description>` - Create Drizzle migrations following project conventions
- `/inngest-function <description>` - Create durable Inngest workflows with rate limiting

### Agents
- `security-reviewer` - Reviews auth, multi-tenancy, and data protection

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

## Environment Variables

See `.env.example` for required variables:
- `DATABASE_URL` - Neon PostgreSQL connection string
- `AUTH_SECRET` - Auth.js session secret
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` - Google OAuth credentials
- `RESEND_API_KEY` - Email provider for password reset
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob for file uploads
