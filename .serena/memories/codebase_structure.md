# Codebase Structure

## Current Structure (Post-Reorganization)
```
vibedocs/
├── app/                    # Next.js App Router
│   ├── (main)/             # Main app routes (dashboard, documents, etc.)
│   ├── (word-addin)/       # Word Add-in specific routes
│   ├── api/                # API routes
│   │   ├── auth/[...nextauth]/ # Auth.js routes
│   │   ├── comparisons/    # NDA comparison endpoints
│   │   ├── generate/       # NDA generation endpoints
│   │   ├── inngest/        # Inngest serve handler
│   │   └── word-addin/     # Word Add-in API
│   ├── layout.tsx          # Root layout
│   └── globals.css         # Tailwind v4 theme
├── db/                     # Drizzle ORM
│   ├── schema/             # Table definitions
│   ├── queries/            # Prepared queries
│   ├── _columns.ts         # Column helpers
│   └── client.ts           # Neon serverless client
├── lib/                    # Core utilities
│   ├── auth.ts             # Auth.js configuration
│   ├── dal.ts              # Data Access Layer
│   ├── errors.ts           # Custom error classes
│   ├── api-utils.ts        # API response helpers
│   ├── cache/              # LRU caching
│   ├── datasets/           # Dataset parsers (CUAD, ContractNLI)
│   └── embeddings.ts       # Voyage AI utilities
├── inngest/                # Durable workflows
│   ├── client.ts           # Inngest client
│   ├── functions/          # Function definitions
│   └── utils/              # Rate limiting, tenant context
├── agents/                 # AI SDK 6 agent definitions
│   ├── prompts/            # System prompts
│   ├── tools/              # Vector search tools
│   └── comparison/         # Comparison pipeline
├── test/                   # Test setup (PGlite)
├── types/                  # TypeScript type definitions
├── components/             # shadcn/ui + AI SDK Elements
├── hooks/                  # React hooks
├── proxy.ts                # Next.js 16 auth redirects
├── drizzle/                # Generated migrations (committed)
└── docs/                   # Documentation
    ├── PRD.md              # Product specification
    └── plans/              # Implementation plans
```

## Path Alias
```
@/* → ./* (e.g., @/lib/utils, @/db/client, @/components)
```

## Key Files
- `CLAUDE.md` - Claude Code development guidance (authoritative)
- `docs/PRD.md` - Complete product specification
- `components.json` - shadcn/ui config with AI Elements registry
- `app/globals.css` - Tailwind v4 theme with oklch colors
