# Codebase Structure

**Analysis Date:** 2026-02-04

## Directory Layout

```
vibedocs/
├── app/                          # Next.js App Router
│   ├── api/                      # Server-side endpoints
│   │   ├── auth/[...nextauth]/   # Auth.js OAuth handlers
│   │   ├── chat/                 # Chat streaming endpoint
│   │   ├── inngest/              # Inngest webhook handler
│   │   ├── word-addin/           # Word Add-in API endpoints
│   │   ├── admin/                # Admin endpoints (bootstrap, etc.)
│   │   └── sentry-example-api/   # Error tracking demo
│   ├── (main)/                   # Main application (auth required)
│   │   ├── layout.tsx            # Main layout wrapper
│   │   ├── page.tsx              # Landing/waitlist page
│   │   ├── chat/                 # Chat interface
│   │   ├── actions/              # Server actions
│   │   ├── (auth)/               # Auth pages (login, signup, reset password)
│   │   ├── (dashboard)/          # Dashboard route group
│   │   │   ├── documents/        # Document list
│   │   │   ├── analyses/         # Analysis results
│   │   │   ├── comparisons/      # NDA comparison
│   │   │   ├── generate/         # NDA generation
│   │   │   ├── reference/        # Reference corpus
│   │   │   └── settings/         # User/org settings
│   │   └── (admin)/              # Admin panel
│   │       └── audit/            # Audit logs
│   ├── (word-addin)/             # Word Add-in layout
│   │   ├── word-addin/           # Task pane pages
│   │   │   ├── taskpane/         # Main task pane
│   │   │   └── auth/             # OAuth callback pages
│   │   └── layout.tsx            # Word Add-in wrapper layout
│   ├── layout.tsx                # Root layout (fonts, global styles)
│   ├── sentry-example-page/      # Error tracking demo
│   └── demo/                     # Demo pages
│
├── agents/                       # LLM agent definitions
│   ├── parser.ts                 # Document parsing & chunking
│   ├── classifier.ts             # CUAD category classification
│   ├── risk-scorer.ts            # Risk assessment
│   ├── gap-analyst.ts            # Gap analysis
│   ├── types.ts                  # Type definitions & schemas
│   ├── prompts/                  # System prompts for each agent
│   ├── tools/                    # Vector search tool for RAG
│   ├── testing/                  # Mock AI responses for tests
│   ├── comparison/               # Comparison pipeline
│   └── README.md                 # Agent architecture overview
│
├── components/                   # React components
│   ├── ui/                       # shadcn/ui components (auto-generated)
│   ├── ai-elements/              # AI SDK components (shimmer, tool, etc.)
│   ├── chat/                     # Chat-specific components
│   ├── artifact/                 # Artifact panel (document viewer, analysis view)
│   ├── shell/                    # Layout shells (sidebar, header)
│   ├── navigation/               # Navigation components
│   ├── error-boundary.tsx        # Error boundary wrapper
│   └── index.ts                  # NOT a barrel export (avoid per CONCERNS.md)
│
├── db/                           # Database layer
│   ├── client.ts                 # Drizzle client instance
│   ├── index.ts                  # Barrel export for convenience
│   ├── _columns.ts               # Reusable column helpers (timestamps, tenantId)
│   ├── schema/                   # Table definitions
│   │   ├── auth.ts               # Auth.js tables (users, sessions, accounts)
│   │   ├── organizations.ts      # Multi-tenancy schema
│   │   ├── documents.ts          # Document metadata & status
│   │   ├── analyses.ts           # Analysis results & progress
│   │   ├── conversations.ts      # Chat conversations & messages
│   │   ├── comparisons.ts        # NDA comparison data
│   │   ├── generated.ts          # Generated NDA documents
│   │   ├── reference.ts          # CUAD/ContractNLI reference data
│   │   ├── index.ts              # Schema barrel export
│   │   ├── relations.ts          # Drizzle table relations
│   │   ├── bootstrap.ts          # Bootstrap process tracking
│   │   └── *.test.ts             # Schema tests
│   ├── queries/                  # Pre-built query functions
│   │   ├── documents.ts          # Document CRUD + filters
│   │   ├── analyses.ts           # Analysis queries with joins
│   │   ├── similarity.ts         # Vector similarity search
│   │   ├── index.ts              # Query barrel export
│   │   └── *.test.ts             # Query tests
│   ├── migrations/               # Drizzle migrations (generated)
│   ├── helpers/                  # Database helper utilities
│   ├── types/                    # Type definitions for schema
│   └── tenant-isolation.test.ts  # RLS integration tests
│
├── inngest/                      # Workflow orchestration
│   ├── client.ts                 # Inngest client config
│   ├── index.ts                  # Barrel export (functions NOT included - see #43)
│   ├── types.ts                  # Event type definitions
│   ├── functions/                # Inngest function implementations
│   │   ├── analyze-nda.ts        # Main NDA analysis pipeline
│   │   ├── bootstrap/            # Reference data ingestion
│   │   ├── demo.ts               # Demo function
│   │   ├── index.ts              # Function registry
│   │   └── *.test.ts             # Function tests
│   ├── utils/                    # Utility functions
│   │   ├── rate-limit.ts         # Rate limiting (Claude 60 RPM, Voyage 300 RPM)
│   │   ├── tenant-context.ts     # Tenant context wrapper
│   │   ├── concurrency.ts        # Concurrency & retry config
│   │   ├── errors.ts             # Inngest-specific error classes
│   │   ├── test-helpers.ts       # Mock event/step helpers for testing
│   │   └── *.test.ts             # Utility tests
│   └── README.md                 # Inngest patterns & best practices
│
├── lib/                          # Shared utilities
│   ├── auth.ts                   # Auth.js configuration
│   ├── dal.ts                    # Data Access Layer (session, tenant, role checks)
│   ├── errors.ts                 # Custom error classes
│   ├── logger.ts                 # Structured logging
│   ├── metrics.ts                # Performance metrics
│   ├── audit.ts                  # Security event logging
│   ├── api-utils.ts              # HTTP response wrappers
│   ├── api-response.ts           # Response types
│   ├── password.ts               # Password hashing/validation
│   ├── password-reset.ts         # Password reset flow
│   ├── rate-limit.ts             # Login attempt rate limiting
│   ├── document-processing.ts    # PDF/DOCX extraction & chunking
│   ├── embeddings.ts             # Voyage AI client & batch embedding
│   ├── blob.ts                   # Vercel Blob integration
│   ├── email.ts                  # Resend email provider
│   ├── word-addin-auth.ts        # Word Add-in OAuth flow
│   ├── auth-code-cache.ts        # Redis token caching
│   ├── clause-alignment.ts       # Hungarian algorithm for clause matching
│   ├── template-service.ts       # Bonterms/CommonAccord template retrieval
│   ├── utils.ts                  # Misc utilities (cn, etc.)
│   ├── cache/                    # LRU caching
│   │   ├── embedding-cache.ts    # Embedding cache (1hr TTL, 10K entries)
│   │   └── response-cache.ts     # Response cache placeholder
│   ├── datasets/                 # Dataset parsing utilities
│   │   ├── cuad.ts               # CUAD dataset parsing
│   │   ├── contractnli.ts        # ContractNLI parsing
│   │   └── *.test.ts             # Dataset tests
│   ├── ai/                       # AI configuration
│   │   ├── config.ts             # Model selection & budgeting
│   │   ├── budget.ts             # Token usage tracking
│   │   └── gateway.ts            # API gateway config
│   ├── stores/                   # Zustand stores (client state)
│   │   └── shell-store.ts        # Sidebar, artifact panel state
│   ├── types.ts                  # Global type definitions
│   └── *.test.ts                 # Utility tests
│
├── types/                        # TypeScript type definitions
│   ├── index.ts                  # Global types export
│   ├── database.ts               # Database entity types
│   ├── api.ts                    # API request/response types
│   ├── analysis.ts               # Analysis domain types
│   └── *.test.ts                 # Type tests
│
├── hooks/                        # React hooks
│   ├── use-shell.ts              # Shell state hook
│   ├── use-chat.ts               # Chat integration hook (wraps @ai-sdk/react)
│   ├── use-conversation.ts       # Conversation management
│   └── *.test.ts                 # Hook tests
│
├── test/                         # Test setup & utilities
│   ├── setup.ts                  # PGlite schema setup
│   ├── db.ts                     # Test database client
│   ├── fixtures.ts               # Common test data
│   └── helpers.ts                # Test utility functions
│
├── public/                       # Static assets
│   ├── images/                   # Image assets
│   ├── fonts/                    # Custom fonts
│   └── icons/                    # Icon assets
│
├── scripts/                      # Build & utility scripts
│   ├── generate-api-index.ts     # Generate API documentation index
│   ├── seed-db.ts                # Database seeding
│   └── bootstrap-data.ts         # Reference data loading
│
├── docs/                         # Project documentation
│   ├── PRD.md                    # Product requirements document
│   ├── PRD-word-addin.md         # Word Add-in specification
│   ├── schema.md                 # Database schema details
│   ├── agents.md                 # Agent architecture specs
│   ├── api-patterns.md           # API design patterns
│   ├── embedding-strategy.md     # Vector embedding approach
│   └── plans/                    # Implementation plans (18+)
│
├── proxy.ts                      # Next.js 16 auth middleware (replaces middleware.ts)
├── instrumentation.ts            # Sentry server-side setup
├── instrumentation-client.ts     # Sentry client-side setup
├── sentry.*.config.ts            # Sentry configuration files
├── tsconfig.json                 # TypeScript configuration
├── next.config.ts                # Next.js configuration
├── drizzle.config.ts             # Drizzle ORM configuration
├── vitest.config.ts              # Vitest configuration (integration tests)
├── vitest.unit.config.ts         # Vitest unit test config
├── package.json                  # Dependencies & scripts
├── pnpm-workspace.yaml           # pnpm workspace config
├── CLAUDE.md                     # Claude Code instructions
└── .env.example                  # Environment variables template
```

## Directory Purposes

**app/**
- Purpose: Next.js App Router pages, layouts, and API routes
- Contains: Route handlers, page components, middleware
- Key files: `layout.tsx` (root), `proxy.ts` (auth middleware), `page.tsx` (landing)

**agents/**
- Purpose: AI agent definitions for the analysis pipeline
- Contains: Parser, classifier, risk scorer, gap analyst, prompts, tools
- Key files: `parser.ts`, `classifier.ts`, `risk-scorer.ts`, `gap-analyst.ts`

**components/**
- Purpose: Reusable React components
- Contains: UI components (shadcn), chat components, artifact viewers, shell layouts
- Key files: `chat/page.tsx` integration, `artifact/` for document/analysis display

**db/**
- Purpose: Database layer with Drizzle ORM
- Contains: Schema definitions, query builders, client configuration
- Key files: `schema/` (table definitions), `queries/` (pre-built queries)

**inngest/**
- Purpose: Durable workflow orchestration
- Contains: Event-driven functions, rate limiting, tenant context, error handling
- Key files: `functions/analyze-nda.ts` (main pipeline), `utils/` (helpers)

**lib/**
- Purpose: Shared utilities and business logic
- Contains: Auth, DAL, errors, logging, document processing, embeddings, caching
- Key files: `auth.ts`, `dal.ts`, `errors.ts`, `document-processing.ts`

**types/**
- Purpose: Global TypeScript type definitions
- Contains: Database entity types, API types, domain types
- Key files: `index.ts` (main export)

**hooks/**
- Purpose: React hooks for component logic
- Contains: Chat hooks, shell state hooks, conversation management
- Key files: `use-chat.ts`, `use-shell.ts`

**test/**
- Purpose: Test setup and utilities
- Contains: PGlite schema setup, test fixtures, test helpers
- Key files: `setup.ts` (database initialization)

**public/**
- Purpose: Static assets served by Next.js
- Contains: Images, fonts, icons, manifests
- Not committed: Dynamic assets only

**scripts/**
- Purpose: Build scripts, data seeding, utilities
- Contains: API documentation generator, database seeders
- Run via: `pnpm run [script-name]`

**docs/**
- Purpose: Project documentation and specifications
- Contains: PRD, architecture specs, implementation plans
- Authority: Single source of truth for project direction

## Key File Locations

**Entry Points:**
- `app/layout.tsx`: Root layout with fonts, global styles, metadata
- `app/(main)/chat/page.tsx`: Chat interface (requires auth via proxy.ts)
- `app/(main)/page.tsx`: Landing page with waitlist signup
- `app/(word-addin)/word-addin/taskpane/page.tsx`: Word Add-in task pane

**Configuration:**
- `proxy.ts`: Auth redirects (replaces middleware.ts in Next.js 16)
- `next.config.ts`: Next.js optimizations (package import optimization, Sentry)
- `tsconfig.json`: Path aliases (`@/*` → `./`)
- `drizzle.config.ts`: Drizzle ORM database connection

**Core Logic:**
- `lib/dal.ts`: Session verification, tenant context, role checks
- `lib/auth.ts`: Auth.js configuration with OAuth providers
- `agents/parser.ts`: Document extraction and chunking
- `inngest/functions/analyze-nda.ts`: Main analysis pipeline orchestration
- `app/api/chat/route.ts`: Chat endpoint with RAG integration

**Testing:**
- `test/setup.ts`: PGlite database initialization (runs before each test)
- `vitest.config.ts`: Integration test configuration
- `vitest.unit.config.ts`: Unit test configuration

## Naming Conventions

**Files:**

- **Route handlers**: `route.ts` in `api/` directories
- **Page components**: `page.tsx` in route directories
- **Layout components**: `layout.tsx`
- **Server actions**: `actions.ts` in route directories (e.g., `app/(main)/chat/actions.ts`)
- **Components**: `ComponentName.tsx` (PascalCase)
- **Utilities**: `kebab-case.ts` (e.g., `document-processing.ts`)
- **Types**: `kebab-case.ts` or colocated with implementation
- **Tests**: `*.test.ts` colocated with source
- **Tests**: `*.test.tsx` for component tests

**Directories:**

- **Route groups**: `(route-name)` - not included in URL path
- **Dynamic routes**: `[param]` - single segment, `[...param]` - catch-all
- **Feature directories**: `kebab-case` (e.g., `word-addin`)
- **Type directories**: `types/`
- **API endpoints**: `api/feature/endpoint/route.ts`

**TypeScript:**

- **Types/Interfaces**: `PascalCase` (e.g., `ParserInput`, `ClassifiedClause`)
- **Enums**: `PascalCase` (e.g., `RiskLevel`)
- **Functions**: `camelCase` (e.g., `runParserAgent`)
- **Variables**: `camelCase` (e.g., `documentId`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `RATE_LIMITS`)
- **Schema types**: `camelCase` (Zod) or derived from schema

## Where to Add New Code

**New Feature:**
1. **Pages**: `app/(main)/(dashboard)/[feature]/page.tsx`
2. **API routes**: `app/api/[feature]/route.ts`
3. **Components**: `components/[feature]/ComponentName.tsx`
4. **Hooks**: `hooks/use-[feature].ts` if component-specific, or in `lib/stores/`
5. **Queries**: `db/queries/[feature].ts` for data access
6. **Tests**: Colocated `*.test.ts` files

**Example: New document comparison feature**
```
app/api/comparisons/compare/route.ts
app/(main)/(dashboard)/comparisons/page.tsx
components/comparisons/ComparisonView.tsx
db/queries/comparisons.ts
lib/comparison-service.ts (business logic)
hooks/use-comparison.ts
types/comparison.ts
test/fixtures/comparison-fixtures.ts
```

**New Component/Module:**
1. Create in `components/[feature]/ComponentName.tsx`
2. If needs state: use `hooks/use-[component].ts` or `lib/stores/`
3. If needs data: create query in `db/queries/` and consume in Server Component
4. Export from `components/[feature]/index.ts` (NOT barrel exports)
5. Add tests: `components/[feature]/ComponentName.test.tsx`

**New Utility:**
1. Determine scope:
   - **App-wide utility**: `lib/[feature].ts`
   - **Database utility**: `db/queries/[feature].ts` or `db/helpers/[feature].ts`
   - **Type definitions**: `lib/types.ts` or `types/[feature].ts`
2. Add tests colocated
3. Export from appropriate barrel (`lib/` has central export in index.ts comments)

**New Agent/Tool:**
1. Agent: `agents/[agent-name].ts` with input/output types
2. Prompts: `agents/prompts/[agent-name].ts`
3. Tools: `agents/tools/[tool-name].ts`
4. Types: Add to `agents/types.ts`
5. Tests: `agents/[agent-name].test.ts`
6. Register: Add to `inngest/functions/analyze-nda.ts` orchestration

**New Inngest Function:**
1. Create: `inngest/functions/[function-name].ts`
2. Register event type: `inngest/types.ts`
3. Export from: `inngest/functions/index.ts`
4. Import in webhook: `app/api/inngest/route.ts` (via `functions` array)
5. Add tests: `inngest/functions/[function-name].test.ts`
6. Use test helpers: `import { createMockEvent, createMockStep } from "@/inngest/utils/test-helpers"`

**New Database Table:**
1. Define schema: `db/schema/[feature].ts`
2. Export from: `db/schema/index.ts`
3. Create migrations: `pnpm db:generate` (generates to `drizzle/`)
4. Push: `pnpm db:push`
5. Add relations: `db/schema/relations.ts`
6. Create queries: `db/queries/[feature].ts`
7. Add tests: `db/schema/[feature].test.ts`, `db/queries/[feature].test.ts`

## Special Directories

**db/migrations/**
- Purpose: Drizzle ORM migration files (auto-generated)
- Generated: Yes (via `pnpm db:generate`)
- Committed: Yes (track schema changes)
- Manual edits: Not recommended (regenerate via schema changes)

**drizzle/**
- Purpose: Drizzle ORM generated code
- Generated: Yes (via `pnpm db:generate`)
- Committed: Yes (includes snapshots)
- Manual edits: No

**.next/**
- Purpose: Next.js build output
- Generated: Yes (via `pnpm build`)
- Committed: No (.gitignore)
- Manual edits: No

**node_modules/**
- Purpose: npm/pnpm dependencies
- Generated: Yes (via `pnpm install`)
- Committed: No (.gitignore)
- Manual edits: No

**.planning/**
- Purpose: GSD orchestrator planning documents
- Generated: Yes (via `/gsd:*` commands)
- Committed: Yes (tracks planning history)
- Manual edits: No (auto-generated)

---

*Structure analysis: 2026-02-04*
