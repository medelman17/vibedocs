# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NDA Analyst is an LLM-powered NDA analysis tool. See `docs/PRD.md` for full specification.

Core features: upload NDAs → clause extraction (CUAD 41-category taxonomy) → risk scoring with cited evidence → gap analysis → side-by-side comparison → NDA generation from templates.

## Commands

```bash
pnpm dev          # Start development server (http://localhost:3000)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm start        # Production server
pnpm db:push      # Push Drizzle schema to database
pnpm db:generate  # Generate Drizzle migrations
pnpm db:studio    # Open Drizzle Studio
```

## Architecture

### Two-Tier Database Model

- **Shared Reference DB** (`neon-http`, read-only): CUAD clauses, ContractNLI, Bonterms/CommonAccord templates, ~33K vectors
- **Tenant DB** (`neon-serverless`, RLS-enforced): user documents, analyses, comparisons, generated NDAs

Query pattern: parallel fetch from both DBs, merge results before passing to Claude.

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

### Key Directories (per PRD Appendix C)
- `app/` - Next.js App Router (auth, dashboard, API routes)
- `src/db/` - Drizzle schema (shared/ and tenant/ subdirs)
- `src/inngest/` - Inngest client and pipeline functions
- `src/agents/` - LangGraph agent definitions
- `src/lib/` - Core utilities (embeddings, chunker, claude client, tenant context)
- `components/` - shadcn/ui + AI SDK Elements

## Conventions

### Database (Drizzle)
- All tenant tables require `tenant_id UUID NOT NULL` with RLS policy
- Use `cosineDistance()` for vector similarity queries
- HNSW indexes created AFTER bulk data load
- Idempotent ingestion via `content_hash` + `ON CONFLICT DO NOTHING`

### Inngest Patterns
- Wrap each LangGraph agent in `step.run()` for durability
- Use `step.sleep()` for rate limiting between API calls
- Concurrency limits: 5 analyses, 3 embedding batches

### Component Patterns
- UI components use `data-slot` attributes for styling hooks
- Use `cva` (class-variance-authority) for component variants
- Use `cn()` from `@/lib/utils` for conditional classNames

### Adding Components
```bash
pnpm dlx shadcn@latest add <component-name>
pnpm dlx shadcn@latest add <component-name> -r @ai-elements
```

## MCP Servers

Project uses `.mcp.json` for MCP server configuration:
- `shadcn` - Component management via `npx shadcn@latest mcp`

## Ignored Files

- `.serena/` - Serena MCP local project cache (do not commit)

## Documentation

Detailed specs in `docs/`:
- `PRD.md` - Full product requirements (authoritative source)
- `schema.md` - Database schema details
- `agents.md` - Agent architecture specs
- `api-patterns.md` - API design patterns
- `embedding-strategy.md` - Vector embedding approach
