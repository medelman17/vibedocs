# Architecture

**Analysis Date:** 2026-02-04

## Pattern Overview

**Overall:** Hybrid event-driven + request-response architecture for NDA analysis

**Key Characteristics:**
- Multi-tenant SaaS with tenant isolation via RLS (Row-Level Security)
- Asynchronous agent pipeline orchestrated by Inngest for durable execution
- Synchronous chat interface with RAG (retrieval-augmented generation) using vector search
- Separation of concerns: UI layer (Next.js React), business logic (agents), persistence (Drizzle ORM)
- Server-side rendered layouts with client-side interactive components (App Router)

## Layers

**Presentation Layer:**
- Purpose: Next.js App Router pages and client components using React 19
- Location: `app/` (route handlers, layouts, pages)
- Contains: Route handlers (`route.ts`), page components (`page.tsx`), form components, chat UI
- Depends on: AI SDK 6, chat components, artifact viewers, vector search tools
- Used by: End users via HTTP/WebSocket

**API Layer:**
- Purpose: Server-side endpoints for authentication, chat, file operations, Inngest webhooks
- Location: `app/api/`
- Contains:
  - `chat/route.ts` - Streaming text responses with RAG integration
  - `auth/[...nextauth]/route.ts` - Auth.js OAuth handlers
  - `inngest/route.ts` - Webhook handler for Inngest events
  - `word-addin/` - Word Add-in specific endpoints (exchange, analyze, results)
  - `admin/bootstrap/route.ts` - Reference data ingestion
- Depends on: AI SDK 6 (`streamText`), Inngest client, database queries
- Used by: Browser clients, Word Add-in, external webhooks

**Agent Pipeline Layer:**
- Purpose: LLM-powered analysis agents with structured output and token budgeting
- Location: `agents/`
- Contains: Four-stage analysis pipeline with few-shot prompting via vector search
  - `parser.ts` - Extracts text from PDFs/DOCX, chunks with section detection
  - `classifier.ts` - Categorizes chunks into CUAD 41-category taxonomy
  - `risk-scorer.ts` - Assigns risk levels with evidence citations
  - `gap-analyst.ts` - Identifies missing or inadequate clauses
- Depends on: Claude Sonnet 4.5, Voyage AI embeddings, document processing
- Used by: Inngest function `analyze-nda` for durable orchestration

**Orchestration Layer:**
- Purpose: Durable workflow execution with rate limiting, retries, and progress tracking
- Location: `inngest/`
- Contains:
  - `functions/analyze-nda.ts` - Main pipeline function triggered by `nda/analysis.requested` event
  - `utils/` - Rate limiting, tenant context, error handling, test helpers
  - `types.ts` - Event type definitions
  - `client.ts` - Inngest client configuration
- Depends on: Agent functions, database client, event system
- Used by: API routes to trigger analysis, webhook handler for event processing

**Data Access Layer (DAL):**
- Purpose: Authenticated, tenant-scoped database access with RLS enforcement
- Location: `lib/dal.ts`
- Contains:
  - `verifySession()` - Session validation with redirect
  - `withTenant()` - Tenant context + RLS setup via `SET app.tenant_id`
  - `requireRole()` - Role-based access control
- Depends on: Auth.js, Drizzle ORM, session state
- Used by: All Server Components and API routes

**Persistence Layer:**
- Purpose: Multi-tenant database schema with tenant isolation via RLS
- Location: `db/schema/`
- Contains: 25+ table definitions including:
  - Shared tables: `reference_documents`, `reference_embeddings`, `conversations`
  - Tenant tables: `documents`, `analyses`, `comparisons`, `generated_ndas`
- Depends on: Neon PostgreSQL with pgvector extension
- Used by: All application logic via Drizzle queries

**Query Layer:**
- Purpose: Pre-built, type-safe queries with tenant filtering
- Location: `db/queries/`
- Contains:
  - `documents.ts` - Document CRUD and status queries
  - `analyses.ts` - Analysis retrieval with progress and risk scores
  - `similarity.ts` - Vector similarity search via `cosineDistance()`
- Depends on: Schema definitions, Drizzle ORM
- Used by: API routes, agent pipeline, DAL

**Cache Layer:**
- Purpose: In-memory LRU caching for embeddings and responses to reduce API calls
- Location: `lib/cache/`
- Contains:
  - `embedding-cache.ts` - 1-hour TTL, 10K entries
  - `vector-search.ts` - 5-min TTL, 500 entries (used in chat RAG)
- Depends on: `lru-cache` package
- Used by: Voyage AI client, vector search tool

**Utilities Layer:**
- Purpose: Cross-cutting concerns and shared business logic
- Location: `lib/`
- Contains:
  - `auth.ts` - Auth.js configuration with OAuth + email/password
  - `errors.ts` - Custom error hierarchy for structured error handling
  - `api-utils.ts` - HTTP response wrappers (`success()`, `error()`)
  - `document-processing.ts` - PDF/DOCX extraction and chunking
  - `embeddings.ts` - Voyage AI client and batch embedding
  - `password.ts` - bcryptjs utilities
  - `audit.ts` - Security event logging
  - `logger.ts`, `metrics.ts` - Observability
- Depends on: Various third-party APIs
- Used by: Everywhere

## Data Flow

**NDA Upload → Analysis:**

1. User uploads NDA via `/chat` (web) or Word Add-in
2. File stored in Vercel Blob (`lib/blob.ts`)
3. Server action creates `documents` record with blob URL
4. API triggers Inngest event `nda/analysis.requested`
5. Inngest function `analyzeNda` orchestrates pipeline:
   - **Parser**: Downloads blob, extracts text, chunks with section detection, generates embeddings
   - **Classifier**: For each chunk, retrieves similar CUAD/ContractNLI examples, uses few-shot prompt to classify
   - **Risk Scorer**: Scores classified clauses with evidence and confidence
   - **Gap Analyst**: Identifies missing or weak clauses against NDA best practices
6. Results persisted to `analyses` table
7. Frontend polls/SSE watches progress, displays results in artifact panel

**Chat with RAG:**

1. User sends message in `/chat`
2. `POST /api/chat` receives messages array + `conversationId`
3. `streamText()` from AI SDK 6 executes chat:
   - System prompt explains VibeDocs capabilities
   - `search_references` tool calls `findSimilarClauses()` when user asks about NDA clauses
   - Vector search queries CUAD/ContractNLI embeddings (Voyage AI voyage-law-2)
   - Results cached for 5 minutes
4. Response streamed as `UIMessageStreamResponse`
5. `onFinish` callback persists conversation + messages to `conversations`/`messages` tables
6. Client-side tool `showArtifact` displays analysis results in side panel

**Auth Flow:**

1. User navigates to protected route (e.g., `/chat`, `/dashboard`)
2. `proxy.ts` (Next.js 16 auth middleware) checks for session cookie
3. If absent, redirects to `/login`
4. OAuth provider selected (Google, GitHub, Microsoft Entra) OR credentials provider
5. Auth.js calls `authorize()` callback (Credentials) or provider OAuth flow
6. User record created/updated via Drizzle adapter
7. Session created with `activeOrganizationId` for multi-org switching
8. Session cookie set, user redirected to callback URL

**Word Add-in → Analysis:**

1. Word Add-in sends auth code to `/api/word-addin/exchange`
2. Code validated, OAuth token cached in Upstash Redis (5-min TTL, one-time use)
3. User accesses task pane at `/word-addin/taskpane`
4. Task pane calls `/api/word-addin/analyze` with document paragraphs
5. Analysis triggered with `source: 'word-addin'` and inline content (no blob download)
6. Results accessible via `/api/word-addin/results/[id]`
7. Task pane polls for completion, displays inline annotations

## State Management

**Request-level State:**
- Auth/session: React `cache()` in DAL functions for request memoization
- Tenant context: `app.tenant_id` PostgreSQL session variable set via RLS
- Temporary state: Stored in Inngest steps for durable execution

**Application State:**
- User sessions: Database-backed (Auth.js strategy: "database")
- Tenant membership: `organization_members` junction table
- Document analysis progress: `analyses` table with `progressStage`, `progressPercent`
- Conversations: `conversations` and `messages` tables for persistence

**Client State:**
- Chat messages: `useChat()` hook from AI SDK 6 (in-memory, persisted on backend)
- UI state: Local component state (sidebar open/close, modal state, etc.)
- Shell state: Zustand store (`lib/stores/shell-store`) for sidebar, artifact panel

## Key Abstractions

**Analysis Document (Core Domain Model):**
- Purpose: Represents an NDA being analyzed through the pipeline
- Examples: `db/schema/documents.ts`, `db/queries/documents.ts`, `db/schema/analyses.ts`
- Pattern: Drizzle table with tenant isolation, status tracking, embedding storage

**Classified Clause:**
- Purpose: A section of an NDA mapped to CUAD taxonomy with risk assessment
- Examples: `agents/types.ts` (ClassifiedClause, CuadCategory)
- Pattern: Type-safe zod schema for LLM output validation

**Analysis Result (Risk Assessment):**
- Purpose: Complete analysis with overall risk score and per-clause assessments
- Examples: `agents/risk-scorer.ts`, `db/schema/analyses.ts`
- Pattern: Aggregates classifier + risk scorer + gap analyst outputs

**Tenant Context:**
- Purpose: Encapsulates tenant ID, user, role, and DB instance for request scope
- Examples: `lib/dal.ts`, `inngest/utils/tenant-context.ts`
- Pattern: Cache wrapper for request memoization, RLS enforcement

**Vector Search Tool:**
- Purpose: RAG retrieval for similar clauses from embedding corpus
- Examples: `agents/tools/vector-search.ts`
- Pattern: AI SDK 6 tool definition with optional execute function (client-side in chat)

## Entry Points

**Web Application:**
- Location: `app/(main)/layout.tsx` → `app/(main)/chat/page.tsx`
- Triggers: User visits `/chat` after authentication
- Responsibilities: Render chat interface, stream responses, manage conversation state

**API - Chat Endpoint:**
- Location: `app/api/chat/route.ts`
- Triggers: POST request with messages array and conversationId
- Responsibilities: Execute streamText with RAG, persist to database, return streamed response

**API - Inngest Webhook:**
- Location: `app/api/inngest/route.ts`
- Triggers: Inngest event published (e.g., `nda/analysis.requested`)
- Responsibilities: Route event to handler function, execute agent pipeline with durable steps

**Word Add-in:**
- Location: `app/(word-addin)/word-addin/taskpane/page.tsx`
- Triggers: Word Add-in task pane loaded
- Responsibilities: Render analysis interface, call word-addin API routes

**Admin Bootstrap:**
- Location: `app/api/admin/bootstrap/route.ts`
- Triggers: Manual API call or scheduled job
- Responsibilities: Ingest CUAD/ContractNLI reference documents and embeddings

## Error Handling

**Strategy:** Structured error classes with HTTP status codes and domain-specific error codes

**Patterns:**

**Custom Error Hierarchy** (`lib/errors.ts`):
```typescript
AppError (base) extends Error
├── BadRequestError (400)
├── ValidationError (400, includes field details)
├── UnauthorizedError (401)
├── ForbiddenError (403)
├── NotFoundError (404)
├── ConflictError (409)
├── DuplicateError (409)
├── RateLimitError (429)
└── InternalError (500)
```

**API Response Wrapping** (`lib/api-utils.ts`):
```typescript
export async function withErrorHandling(handler) {
  try {
    return success(await handler())
  } catch (error) {
    if (error instanceof AppError) {
      return error.toJSON()
    }
    return internalError()
  }
}
```

**Inngest Error Handling** (`inngest/utils/errors.ts`):
- `RetriableError` - Network failures, rate limits (Inngest will retry)
- `NonRetriableError` - Validation errors, not found (fail immediately)
- `ApiError` - HTTP responses auto-determine retriability from status code

**Zod Validation:**
```typescript
try {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw ValidationError.fromZodError(parsed.error)
  }
} catch (error) {
  if (error instanceof ValidationError) {
    return NextResponse.json(error.toJSON(), { status: 400 })
  }
}
```

## Cross-Cutting Concerns

**Logging:**
- Implementation: `lib/logger.ts` provides structured logging
- Usage: `logger.info()`, `logger.error()` for observability
- Integration: Connected to Sentry via `instrumentation.ts`

**Validation:**
- Implementation: Zod schemas with custom error handling
- Pattern: `schema.safeParse()` with `ValidationError.fromZodError()`
- Usage: API routes, server actions, agent inputs

**Authentication:**
- Implementation: Auth.js v5 with Drizzle adapter, database sessions
- Providers: Google, GitHub, Microsoft Entra ID, Email/Password (bcrypt)
- Session data includes: `userId`, `user` object, `activeOrganizationId`
- Protected routes: Enforced by `proxy.ts` middleware

**Multi-Tenancy:**
- Implementation: RLS via PostgreSQL `app.tenant_id` session variable
- Pattern: DAL `withTenant()` sets context, Drizzle queries filter by `tenant_id`
- Auth: Verified membership in `organization_members` table
- Isolation: Separate cloud resources planned (currently single DB with logical separation)

**Rate Limiting:**
- Voyage AI: 300 RPM → `step.sleep('rate-limit', 200ms)` after calls
- Claude API: 60 RPM → `step.sleep('rate-limit', 1000ms)` after calls
- Login attempts: Tracked in `login_attempts` table, threshold-based blocking
- Implementation: `inngest/utils/rate-limit.ts`, `lib/rate-limit.ts`

**Caching:**
- Embeddings: LRU cache with 1-hour TTL, 10K entries (Voyage responses)
- Vector search: LRU cache with 5-min TTL, 500 entries (similar clauses for RAG)
- Response cache: Placeholder for response caching (30-min TTL planned)
- Implementation: `lru-cache` package (not Redis for MVP)

**Observability:**
- Error tracking: Sentry integration via `@sentry/nextjs`
- Performance metrics: Custom `lib/metrics.ts` for token usage, processing time
- Audit logging: `lib/audit.ts` for security-relevant events
- Client instrumentation: `instrumentation-client.ts` for frontend errors

---

*Architecture analysis: 2026-02-04*
