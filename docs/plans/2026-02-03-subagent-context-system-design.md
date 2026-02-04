# Subagent Context System Design

> **Status:** DEFERRED (audited 2026-02-04)
>
> Explicitly marked as Phase 2 work. Auxiliary developer tooling, not core functionality.

**Date**: 2026-02-03
**Status**: Draft
**Goal**: Enable cheap/fast LLM subagents to work autonomously by providing minimal, targeted context packages

## Problem Statement

As the VibeDocs codebase grows, autonomous subagents face two challenges:

1. **Stale docs**: Documentation in `docs/` drifts from actual code
2. **Missing context**: Agents don't know which files exist or which to read first

Current approach (loading full CLAUDE.md) is:
- Token-expensive (~4K+ tokens)
- Contains irrelevant context for specific tasks
- Requires expensive models to "figure out" what's relevant

## Design Goals

- **Minimal context**: <1000 tokens per task type
- **Cheap agent compatible**: Explicit patterns, not inference-heavy
- **Self-maintaining**: Auto-generated where possible
- **Evaluable**: Clear success criteria

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Context System                           │
├─────────────────┬─────────────────┬─────────────────────────┤
│  API Index      │  Task Contexts  │  Task Router            │
│  (auto-gen)     │  (curated)      │  (future)               │
├─────────────────┼─────────────────┼─────────────────────────┤
│  ~800 tokens    │  ~500-800 each  │  Phase 2                │
│  Regenerated    │  Stable         │                         │
│  on commit      │  Manual updates │                         │
└─────────────────┴─────────────────┴─────────────────────────┘
```

## Phase 1 Scope (This Plan)

**Build:**
- `db-task.md` context (~700 tokens)
- `api-task.md` context (~600 tokens)
- `api-index.md` generator script
- Manual evaluation with 10 test tasks

**Defer to Phase 2:**
- Remaining 5 task contexts (auth, inngest, agent, ui, test)
- Automatic task routing
- CI integration for index regeneration
- Automated evaluation framework

## Component Specifications

### 1. Task Context Files

Location: `.claude/contexts/`

#### db-task.md

**Purpose**: Context for database schema, queries, and migration tasks

**Target token count**: ~700 tokens

**Structure**:
```markdown
# Database Task Context

## When to Use
Schema changes, query functions, migrations, database tests

## Files to Read First
- db/_columns.ts - Column helpers (MUST use these)
- db/schema/*.ts - Existing table definitions
- db/queries/*.ts - Query function patterns
- db/index.ts - Barrel export structure

## Required Patterns

### Column Helpers (ALWAYS use)
```typescript
import { primaryId, timestamps, softDelete, tenantId } from "@/db/_columns"

export const myTable = pgTable("my_table", {
  ...primaryId,
  ...tenantId,      // Required for tenant-scoped tables
  ...timestamps,
  ...softDelete,    // If soft delete needed
  // your columns here
})
```

### Query Naming Convention
- `get*` - Fetch single/multiple records
- `create*` - Insert new records
- `update*` - Modify existing records
- `find*` - Search with filters
- `soft*` - Soft delete operations

### Tenant Isolation
All tenant-scoped queries MUST filter by tenantId:
```typescript
export async function getDocumentById(
  documentId: string,
  tenantId: string
) {
  return db.query.documents.findFirst({
    where: and(
      eq(documents.id, documentId),
      eq(documents.tenantId, tenantId),
      isNull(documents.deletedAt)
    )
  })
}
```

## Checklist Before Completing
□ Used column helpers from db/_columns.ts?
□ Added tenantId for tenant-scoped table?
□ Followed query naming convention?
□ Created colocated test file (*.test.ts)?
□ Updated db/index.ts barrel export?
□ Used title case for CUAD categories if applicable?
```

#### api-task.md

**Purpose**: Context for API route handlers and error handling

**Target token count**: ~600 tokens

**Structure**:
```markdown
# API Task Context

## When to Use
Creating/modifying API routes, error handling, request validation

## Files to Read First
- lib/api-utils.ts - Handler wrappers and response helpers
- lib/errors.ts - Custom error classes
- lib/dal.ts - Auth and tenant context functions
- app/api/*/route.ts - Existing route patterns

## Required Patterns

### Route Handler Structure
```typescript
import { withErrorHandling, success } from "@/lib/api-utils"
import { verifySession, withTenant } from "@/lib/dal"
import { ValidationError } from "@/lib/errors"

export const GET = withErrorHandling(async (request: Request) => {
  const { userId } = await verifySession()
  const { db, tenantId } = await withTenant()

  // Your logic here

  return success(data)
})
```

### Error Handling
Use custom errors (never raw `throw new Error()`):
```typescript
import { NotFoundError, ValidationError, ForbiddenError } from "@/lib/errors"

// 404
throw new NotFoundError("Document not found")

// 400 with details
throw new ValidationError("Invalid input", { field: "email" })

// 400 from Zod
throw ValidationError.fromZodError(zodError)

// 403
throw new ForbiddenError("Not authorized")
```

### Request Validation
```typescript
import { z } from "zod"

const schema = z.object({
  title: z.string().min(1),
  content: z.string()
})

const body = await request.json()
const parsed = schema.safeParse(body)
if (!parsed.success) {
  throw ValidationError.fromZodError(parsed.error)
}
```

## Checklist Before Completing
□ Wrapped handler with withErrorHandling()?
□ Used verifySession() or withTenant() for auth?
□ Used custom error classes from lib/errors.ts?
□ Validated request body with Zod?
□ Created colocated test file (route.test.ts)?
```

### 2. API Index Generator

Location: `.claude/scripts/generate-api-index.ts`

**Purpose**: Auto-generate a compact index of exported functions/types from JSDoc

**Input**: TypeScript files in specified directories
**Output**: `.claude/generated/api-index.md`

**Algorithm**:
1. Parse each `.ts` file with TypeScript compiler API
2. Extract exported functions, classes, types
3. Extract first line of JSDoc comment (or infer from name)
4. Format as compact markdown
5. Write to output file

**Files to index (Phase 1)**:
- `db/_columns.ts`
- `db/queries/*.ts`
- `lib/errors.ts`
- `lib/api-utils.ts`
- `lib/dal.ts`

**Output format**:
```markdown
# API Index
Generated: 2026-02-03T12:00:00Z

## db/_columns.ts
- `primaryId` - UUID primary key with cuid2 default
- `timestamps` - createdAt/updatedAt with automatic defaults
- `softDelete` - deletedAt column for soft delete pattern
- `tenantId` - Tenant isolation column (required for tenant tables)

## db/queries/documents.ts
- `getDocumentById(id, tenantId)` - Fetch document by ID with tenant check
- `getDocumentsByTenant(tenantId, options?)` - List documents for tenant
- `createDocument(data)` - Insert new document record
- `updateDocumentStatus(id, status, tenantId)` - Update document status
- `softDeleteDocument(id, tenantId)` - Soft delete document

## lib/errors.ts
- `AppError` - Base error class with status code
- `NotFoundError` - 404 resource not found
- `ValidationError` - 400 invalid input (use .fromZodError())
- `ForbiddenError` - 403 access denied
- `UnauthorizedError` - 401 not authenticated
- `ConflictError` - 409 resource conflict

## lib/api-utils.ts
- `withErrorHandling(handler)` - Wrap route handler with error catching
- `success(data, status?)` - Create success JSON response
- `error(message, status)` - Create error JSON response

## lib/dal.ts
- `verifySession()` - Verify auth, redirect if unauthenticated
- `withTenant()` - Get tenant context with RLS setup
- `requireRole(roles)` - Require specific role(s)
```

**Token budget**: ~800 tokens for Phase 1 scope

### 3. File Structure

```
.claude/
├── contexts/
│   ├── db-task.md           # Curated, ~700 tokens
│   └── api-task.md          # Curated, ~600 tokens
├── generated/
│   └── api-index.md         # Auto-generated, ~800 tokens
└── scripts/
    └── generate-api-index.ts
```

## Evaluation Plan (Phase 1)

### Method: Manual Review

For Phase 1, manually run test tasks and review output. Automated evaluation deferred to Phase 2.

### Test Tasks

**db-task (5 tasks)**:
1. "Add a `priority` enum column to the `documents` table"
2. "Create a query function to find documents by status"
3. "Add soft delete support to the `analyses` table"
4. "Create a new `templates` table with tenant isolation"
5. "Write a test for the `getDocumentById` query"

**api-task (5 tasks)**:
1. "Create a GET endpoint at `/api/documents/:id`"
2. "Add Zod validation to the document upload route"
3. "Create an endpoint that requires admin role"
4. "Add proper error handling to an existing route"
5. "Write a test for the analyses API route"

### Evaluation Criteria

For each task, assess:

| Criterion | Pass | Fail |
|-----------|------|------|
| **Compiles** | No TypeScript errors | Has errors |
| **Pattern adherence** | Follows context patterns | Ignores patterns |
| **Completeness** | Task fully completed | Partial/missing |
| **Test included** | Colocated test created | No test |

### Success Criteria

- **8/10 tasks** pass all criteria
- **Pattern adherence** >80% across all tasks
- **Context sufficiency**: No task requires loading full CLAUDE.md

## Implementation Steps

### Step 1: Create Context Files

1. Create `.claude/contexts/` directory
2. Write `db-task.md` following spec above
3. Write `api-task.md` following spec above
4. Validate token counts (<800 each)

### Step 2: Build API Index Generator

1. Create `.claude/scripts/generate-api-index.ts`
2. Use TypeScript compiler API to parse files
3. Extract exports and JSDoc
4. Generate markdown output
5. Add `pnpm generate:api-index` script

### Step 3: Generate Initial Index

1. Run generator on Phase 1 files
2. Validate output format and accuracy
3. Check token count (~800)
4. Commit generated file

### Step 4: Manual Evaluation

1. Run each test task with Haiku + relevant context
2. Record results in evaluation spreadsheet
3. Identify failure patterns
4. Iterate on context files if needed

### Step 5: Document Usage

1. Add usage instructions to CLAUDE.md
2. Document when to use each context
3. Add examples of context loading

## Phase 2 Roadmap (Future)

After Phase 1 validation:

1. **Expand contexts**: auth-task, inngest-task, agent-task, ui-task, test-task
2. **Task router**: Automatic context selection based on task keywords
3. **CI integration**: Regenerate api-index on commit
4. **Automated eval**: Script to run test tasks and score results
5. **Context versioning**: Track context effectiveness over time

## Open Questions

1. **Context loading mechanism**: How does the subagent receive the context?
   - Option A: Prepend to prompt
   - Option B: Separate system message
   - Option C: Tool that returns context

2. **Index regeneration trigger**: When to regenerate?
   - Option A: Manual (`pnpm generate:api-index`)
   - Option B: Pre-commit hook
   - Option C: CI on main branch

3. **Context overlap**: What if task spans multiple domains?
   - Option A: Load multiple contexts
   - Option B: Create composite contexts
   - Option C: Fall back to full CLAUDE.md

## Success Metrics

| Metric | Phase 1 Target | Measurement |
|--------|----------------|-------------|
| Task completion rate | >80% | Manual review |
| Pattern adherence | >80% | Manual review |
| Context token usage | <1500 total | Token counter |
| Time to implement | 1-2 days | Calendar |

## Appendix: Token Counting

Rough token estimates (GPT-4 tokenizer, similar for Claude):
- db-task.md: ~700 tokens
- api-task.md: ~600 tokens
- api-index.md: ~800 tokens
- Total for db task: ~1500 tokens
- Total for api task: ~1400 tokens

Compare to full CLAUDE.md: ~4000+ tokens

**Savings**: 60-65% token reduction per task
