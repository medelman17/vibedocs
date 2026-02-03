# Database Foundation - IMPLEMENTED ✅

**Status:** Complete (2026-02-01)
**Plan:** `docs/plans/2026-02-01-database-foundation-implementation.md`

---

## Architecture Decisions

### Single DB with Schema Separation
- One Neon database with logical `shared`/`tenant` separation for MVP
- Split into two databases later when needed
- Keep shared/tenant queries in separate files

### Authentication
- Auth.js v5 with DrizzleAdapter
- Database sessions (not JWT) for RLS + multi-tenancy
- Providers: Google OAuth, GitHub OAuth, Microsoft Entra ID + Email/Password (bcryptjs)
- Email: Resend for transactional emails

### Multi-Tenancy
- Organizations with junction table (`organization_members`)
- Users can belong to multiple orgs
- Session includes `activeOrganizationId`
- DAL functions: `verifySession()`, `withTenant()`, `requireRole()`

### Next.js 16 Patterns
- `proxy.ts` (renamed from middleware.ts)
- DAL pattern with React `cache()` memoization
- `server-only` imports for server components

### Testing
- Vitest + PGlite (WASM Postgres)
- No Docker required
- GitHub Actions CI

---

## Key Files

```
├── db/
│   ├── _columns.ts           # timestamps, softDelete, tenantId, primaryId
│   ├── client.ts             # Neon serverless client
│   ├── index.ts              # Exports db + schema
│   └── schema/
│       ├── auth.ts           # users, accounts, sessions, verification_tokens
│       ├── organizations.ts  # organizations, organization_members
│       ├── documents.ts      # documents, document_chunks (with vectors)
│       ├── analyses.ts       # analyses, clause_extractions
│       ├── comparisons.ts    # comparison results
│       ├── generated.ts      # generated_ndas
│       ├── audit.ts          # audit_logs
│       └── index.ts          # Barrel export
├── lib/
│   ├── auth.ts               # Auth.js config with DrizzleAdapter
│   ├── dal.ts                # verifySession, withTenant, requireRole
│   └── password.ts           # hashPassword, verifyPassword, validatePassword
├── proxy.ts                  # Next.js 16 auth redirects
└── test/
    └── setup.ts              # PGlite setup with schema creation
```

---

## Commands

```bash
pnpm test              # Run Vitest tests
pnpm test:coverage     # Run with coverage
pnpm db:push           # Push schema to Neon
pnpm db:generate       # Generate migrations
pnpm db:studio         # Open Drizzle Studio
```

---

## Environment Variables

See `.env.example`:
- `DATABASE_URL` - Neon connection string
- `AUTH_SECRET` - Auth.js secret
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` - Google OAuth
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` - GitHub OAuth
- `AUTH_MICROSOFT_ENTRA_ID_ID` / `AUTH_MICROSOFT_ENTRA_ID_SECRET` - Microsoft Entra ID
- `RESEND_API_KEY` - Email provider
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob

---

## Setup Notes

1. **pgvector**: Must enable manually on Neon before `db:push`:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. **drizzle-kit**: Loads env from `.env.local` via dotenv config

3. **Path aliases**: `@/*` maps to `./`
