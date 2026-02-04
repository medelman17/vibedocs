# Codebase Reorganization Design

> **Status:** ✅ COMPLETE (audited 2026-02-04)
> Already in target state (no src/ directory).

**Date:** 2026-02-03
**Status:** Approved
**Author:** Claude (with user input)

## Overview

Reorganize the VibeDocs codebase from a split `src/` + root structure to a unified root-level structure, following the Next.js "Store project files outside of `app`" pattern.

## Problem Statement

The current codebase has a "split-brain" architecture:

| Location | Contents | Origin |
|----------|----------|--------|
| `lib/utils.ts` | Single `cn()` helper | shadcn default |
| `hooks/use-mobile.ts` | Single mobile hook | shadcn default |
| `components/` | ~100 UI components | shadcn default |
| `src/lib/` | 30+ files (auth, dal, errors, cache, etc.) | Domain code |
| `src/db/` | Database layer | Domain code |
| `src/inngest/` | Workflow functions | Domain code |
| `src/agents/` | AI agent placeholders | Domain code |

### Issues

1. **Confusing path alias**: `@/*` resolves to both `./*` and `./src/*`, so `@/lib/utils` goes to root while `@/lib/dal` goes to `src/lib/`

2. **Inconsistent mental model**: No clear rule for what goes at root vs in `src/`

3. **Against Next.js guidance**: Docs suggest either all-in-src OR all-at-root, not a mix

## Design Decisions

### Decision 1: Flatten to Root (Option B)

Move all `src/` contents to root level. This follows the Next.js documented pattern "Store project files outside of `app`".

**Rationale:**
- shadcn already placed `components/`, `hooks/`, `lib/` at root
- Simpler mental model: everything is at root
- Shorter import paths

### Decision 2: Keep Domain Directories Separate

Keep `db/`, `inngest/`, `agents/` as separate top-level directories, NOT nested inside `lib/`.

**Rationale:**
- Semantic clarity: each is a distinct domain with different concerns
- Cleaner imports: `@/db/schema` vs `@/lib/db/schema`
- `lib/` stays focused on shared utilities without a clear domain home
- Each domain can grow independently

### Decision 3: Keep Word Add-in Self-Contained

Leave `app/(word-addin)/word-addin/taskpane/` structure intact with its own `components/`, `hooks/`, `lib/`, `store/`.

**Rationale:**
- Different runtime context (Office.js iframe)
- Tight coupling between its components, hooks, and stores
- Clear boundary: "everything Office-related is here"
- The "shared" code isn't actually reusable elsewhere

### Decision 4: Hybrid Test Organization

Keep unit tests co-located with source files (`*.test.ts` next to `*.ts`). Keep test infrastructure in dedicated `test/` directory.

**Rationale:**
- Industry standard pattern
- Easy to find tests (right next to source)
- Tests move with source when refactoring
- Test utilities (setup, factories, mocks) are separate concerns

### Decision 5: Simplify Path Alias

Change tsconfig paths from dual resolution to single root:

```json
// Before
"paths": { "@/*": ["./*", "./src/*"] }

// After
"paths": { "@/*": ["./*"] }
```

**Rationale:**
- Removes ambiguity
- All imports predictably resolve to root
- TypeScript compiler catches broken imports immediately

### Decision 6: Big Bang Migration in Worktree

Execute the migration in a single commit using an isolated git worktree.

**Rationale:**
- Changes are mechanical (moves + import updates)
- Incremental migration means living with inconsistent state
- Worktree isolates risk
- TypeScript compiler validates all imports
- Estimated effort: 30-60 minutes

## Target Structure

```
vibedocs/
├── app/                     # Next.js App Router (routing only)
│   ├── (main)/              # Main web app
│   │   ├── (auth)/          # Auth pages
│   │   ├── (dashboard)/     # Dashboard pages
│   │   ├── (admin)/         # Admin pages
│   │   └── actions/         # Shared actions
│   ├── (word-addin)/        # Word add-in (self-contained)
│   ├── api/                 # API routes
│   └── demo/                # Demo pages
│
├── components/              # UI components
│   ├── ui/                  # shadcn/ui components
│   └── ai-elements/         # AI SDK Elements
│
├── hooks/                   # React hooks
│   └── use-mobile.ts        # (existing)
│
├── lib/                     # Shared utilities (MERGED)
│   ├── utils.ts             # cn() helper (from root lib/)
│   ├── auth.ts              # Auth.js config
│   ├── dal.ts               # Data Access Layer
│   ├── errors.ts            # Error classes
│   ├── api-utils.ts         # API response helpers
│   ├── api-response.ts      # Result types
│   ├── password.ts          # Password utilities
│   ├── password-reset.ts    # Password reset flow
│   ├── email.ts             # Email utilities
│   ├── blob.ts              # Vercel Blob utilities
│   ├── audit.ts             # Audit logging
│   ├── rate-limit.ts        # Rate limiting
│   ├── result.ts            # Result type utilities
│   ├── embeddings.ts        # Voyage AI embeddings
│   ├── auth-code-cache.ts   # Word add-in auth cache
│   ├── word-addin-auth.ts   # Word add-in auth
│   ├── cache/               # LRU caching
│   ├── datasets/            # Dataset parsers
│   ├── actions/             # Server action utilities
│   ├── api/                 # API middleware
│   └── types/               # Shared type definitions
│
├── db/                      # Database layer (from src/db/)
│   ├── client.ts            # Drizzle client
│   ├── index.ts             # Barrel export
│   ├── _columns.ts          # Column helpers
│   ├── schema/              # Table definitions
│   ├── queries/             # Prepared queries
│   ├── helpers/             # DB helpers
│   ├── types/               # DB-specific types
│   └── migrations/          # SQL migrations
│
├── inngest/                 # Durable workflows (from src/inngest/)
│   ├── client.ts            # Inngest client
│   ├── index.ts             # Barrel export
│   ├── types.ts             # Event types
│   ├── functions/           # Workflow functions
│   └── utils/               # Workflow utilities
│
├── agents/                  # AI agents (from src/agents/)
│   ├── README.md            # Overview
│   ├── prompts/             # System prompts
│   ├── tools/               # Agent tools
│   ├── testing/             # Test fixtures
│   └── comparison/          # Comparison pipeline
│
├── test/                    # Test infrastructure (from src/test/)
│   ├── setup.ts             # Vitest setup
│   ├── factories.ts         # Test data factories
│   └── mocks/               # Shared mocks
│
├── proxy.ts                 # Next.js proxy (from src/proxy.ts)
│
├── docs/                    # Documentation (unchanged)
├── scripts/                 # Utility scripts (unchanged)
├── public/                  # Static assets (unchanged)
├── drizzle/                 # Generated migrations (unchanged)
│
└── [Config files at root]
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── drizzle.config.ts
    ├── vitest.config.ts
    ├── eslint.config.mjs
    ├── postcss.config.mjs
    ├── components.json
    ├── pnpm-workspace.yaml
    └── .env.* files
```

## Migration Steps

### Phase 1: Setup
1. Create isolated worktree: `git worktree add .worktrees/reorganize -b refactor/codebase-reorganization`
2. Change to worktree directory

### Phase 2: Move Directories
```bash
# Move domain directories from src/ to root
mv src/db ./db
mv src/inngest ./inngest
mv src/agents ./agents
mv src/test ./test

# Merge lib directories
mv src/lib/* ./lib/
rmdir src/lib

# Move proxy file
mv src/proxy.ts ./proxy.ts

# Move types (merge into lib/types or keep separate)
mv src/types/* ./lib/types/

# Clean up empty src directory
rmdir src
```

### Phase 3: Update Configuration

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

**vitest.config.ts:**
- Update any `src/` references in test configuration

**drizzle.config.ts:**
- Update schema path from `src/db/schema` to `db/schema`

**tailwind.config.ts (if applicable):**
- Remove `/src` from content paths

### Phase 4: Fix Imports

Run TypeScript compiler to find broken imports:
```bash
pnpm tsc --noEmit
```

Fix import patterns:
- `@/src/lib/auth` → `@/lib/auth` (one file had this)
- Any remaining `src/` references

### Phase 5: Validate

```bash
# Type check
pnpm tsc --noEmit

# Lint
pnpm lint

# Run tests
pnpm test

# Build
pnpm build
```

### Phase 6: Commit and Merge

```bash
git add -A
git commit -m "refactor: flatten src/ to root-level structure

- Move db/, inngest/, agents/, test/ to root
- Merge src/lib/ into lib/
- Move proxy.ts to root
- Simplify tsconfig paths to single root resolution
- Update all imports

Follows Next.js 'Store project files outside of app' pattern.
Resolves split-brain architecture between shadcn defaults and domain code."

# Switch to main and merge
cd /path/to/main/repo
git merge refactor/codebase-reorganization
```

## Files Requiring Import Updates

Based on exploration, these files import from `@/lib/*` and will need path validation:

- All `app/api/**/*.ts` route handlers
- All `app/(main)/**/actions.ts` server actions
- All `components/**/*.tsx` (import `cn()` from `@/lib/utils`)
- All `src/inngest/**/*.ts` → `inngest/**/*.ts`
- All `src/db/**/*.ts` → `db/**/*.ts`
- All `src/lib/**/*.ts` → `lib/**/*.ts`

The TypeScript compiler will catch any missed imports.

## Rollback Plan

If issues are discovered post-merge:
```bash
git revert <commit-sha>
```

Or if caught before merge, simply delete the worktree:
```bash
git worktree remove .worktrees/reorganize
git branch -D refactor/codebase-reorganization
```

## CLAUDE.md Updates Required

After migration, update CLAUDE.md:
- Remove all `src/` prefixes from directory descriptions
- Update path alias documentation
- Update Key Directories section

## Not In Scope

- Reorganizing `app/` directory structure (already well-organized)
- Moving Word Add-in's local structure (keeping self-contained)
- Changing test file co-location pattern
- Adding new abstractions or consolidating code

## References

- [Next.js Project Structure Docs](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js src Folder Convention](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder)
