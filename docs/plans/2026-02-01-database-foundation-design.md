# Database Foundation Design

**Date:** 2026-02-01
**Status:** Approved
**Author:** Claude + Mike

---

## Overview

This document defines the database foundation for NDA Analyst, including Drizzle ORM setup, Auth.js integration, multi-tenancy with RLS, and testing infrastructure.

---

## Architecture Decisions

### 1. Single Database with Schema Separation

Use one Neon database for MVP with logical separation between shared reference data and tenant-scoped data. Split into two physical databases later.

**Rationale:**
- Faster MVP velocity
- Avoids provisioning complexity
- Split is mechanical if queries stay isolated

**Constraints:**
- Keep shared/tenant queries in separate files
- Avoid cross-schema JOINs (use application-level joins)
- Prefix tables: `shared.*` for reference, `tenant.*` for user data

### 2. Multi-Org Tenancy via Junction Table

Users can belong to multiple organizations. Differs from original `schema.md` which had single org per user.

**Schema:**
- `organizations` — tenant boundary
- `organization_members` — junction (user_id, org_id, role)
- `users` — no direct org reference

**Session:** Includes `activeOrganizationId` for tenant context switching.

### 3. Auth.js with Database Sessions

Use Auth.js v5 with Drizzle adapter and database session strategy (not JWT). Required for RLS + multi-tenancy.

**Providers:**
- Google OAuth (primary for lawyers)
- Email/Password with bcrypt

**Email:** Resend for password reset and verification.

### 4. Next.js 16 Patterns

- `proxy.ts` (not `middleware.ts`) — renamed in v16
- Data Access Layer (DAL) with `verifySession()` and `withTenant()`
- React `cache()` for request memoization

### 5. Vercel Blob for Storage

Document uploads stored in Vercel Blob with private access and signed URLs.

### 6. PGlite for Testing

Production-grade testing with Vitest + PGlite (WASM Postgres). E2E deferred.

---

## Directory Structure

```
src/
├── proxy.ts                    # Next.js 16 auth redirects
├── db/
│   ├── index.ts               # Exports db client + schema
│   ├── client.ts              # Neon serverless client
│   ├── schema/
│   │   ├── index.ts           # Barrel export
│   │   ├── auth.ts            # users, accounts, sessions, verification_tokens
│   │   ├── organizations.ts   # organizations, organization_members
│   │   ├── documents.ts       # documents, document_chunks
│   │   ├── analyses.ts        # analyses, clause_extractions
│   │   ├── comparisons.ts     # comparisons
│   │   ├── generated.ts       # generated_ndas
│   │   ├── audit.ts           # audit_logs
│   │   └── shared.ts          # reference_documents, reference_embeddings
│   └── relations.ts           # Drizzle relations
├── lib/
│   ├── auth.ts                # Auth.js config
│   ├── dal.ts                 # Data Access Layer
│   ├── email.ts               # Resend client
│   └── storage.ts             # Vercel Blob helpers
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   └── upload/route.ts
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   └── (dashboard)/
│       └── ...
└── test/
    └── setup.ts               # PGlite test setup
```

---

## Schema Details

### Auth Tables (src/db/schema/auth.ts)

```typescript
// users - Auth.js required + password support
users: {
  id: uuid (pk)
  name: text
  email: text (unique, not null)
  emailVerified: timestamp
  image: text
  passwordHash: text              // null for OAuth-only
  createdAt: timestamp
  updatedAt: timestamp
}

// Standard Auth.js tables
accounts: { userId, type, provider, providerAccountId, ... }
sessions: { userId, sessionToken, expires }
verification_tokens: { identifier, token, expires }
```

### Organization Tables (src/db/schema/organizations.ts)

```typescript
organizations: {
  id: uuid (pk)
  name: text (not null)
  slug: text (unique, not null)
  plan: text (default 'free')
  createdAt: timestamp
  updatedAt: timestamp
  deletedAt: timestamp            // soft delete
}

organization_members: {
  id: uuid (pk)
  organizationId: uuid (fk, not null)
  userId: uuid (fk, not null)
  role: text (not null)           // 'owner' | 'admin' | 'member' | 'viewer'
  invitedBy: uuid (fk)
  invitedAt: timestamp
  acceptedAt: timestamp
  createdAt: timestamp

  unique(organizationId, userId)
}
```

### Tenant Tables

All tenant tables include `tenantId: uuid (fk → organizations, not null)` for RLS.

See `docs/schema.md` for full definitions of:
- `documents`, `document_chunks`
- `analyses`, `clause_extractions`
- `comparisons`
- `generated_ndas`
- `audit_logs`

---

## Auth.js Configuration

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import { users, accounts, sessions, verificationTokens } from "@/db/schema"
import bcrypt from "bcryptjs"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const user = await db.query.users.findFirst({
          where: eq(users.email, credentials.email as string),
        })
        if (!user?.passwordHash) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )
        return valid ? user : null
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
  events: {
    createUser: async ({ user }) => {
      await createDefaultOrganization(user.id, user.name ?? user.email)
    },
  },
})
```

---

## Proxy + DAL Pattern

### Proxy (src/proxy.ts)

```typescript
import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const protectedRoutes = ["/dashboard", "/documents", "/analysis"]
const publicRoutes = ["/login", "/signup", "/"]

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isProtectedRoute = protectedRoutes.some(r => path.startsWith(r))
  const isPublicRoute = publicRoutes.includes(path)

  // Optimistic check - just verify cookie exists
  const sessionToken = (await cookies()).get("authjs.session-token")?.value

  if (isProtectedRoute && !sessionToken) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  if (isPublicRoute && sessionToken && path !== "/") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}
```

### Data Access Layer (src/lib/dal.ts)

```typescript
import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { auth } from "./auth"
import { db } from "@/db"
import { redirect } from "next/navigation"
import { sql } from "drizzle-orm"

export const verifySession = cache(async () => {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  return {
    userId: session.user.id,
    activeOrganizationId: session.activeOrganizationId,
  }
})

export const withTenant = cache(async () => {
  const { userId, activeOrganizationId } = await verifySession()

  if (!activeOrganizationId) {
    redirect("/onboarding")
  }

  // Set RLS context
  await db.execute(
    sql`SELECT set_config('app.tenant_id', ${activeOrganizationId}, true)`
  )

  return { db, tenantId: activeOrganizationId, userId }
})
```

---

## File Storage

```typescript
// src/lib/storage.ts
import { put, del } from "@vercel/blob"

export async function uploadDocument(
  file: File,
  tenantId: string
): Promise<{ url: string; pathname: string }> {
  const pathname = `${tenantId}/${crypto.randomUUID()}-${file.name}`

  const blob = await put(pathname, file, {
    access: "private",
    addRandomSuffix: false,
  })

  return { url: blob.url, pathname }
}

export async function deleteDocument(url: string): Promise<void> {
  await del(url)
}
```

---

## Testing Setup

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.ts"],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

### PGlite Setup

```typescript
// test/setup.ts
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { sql } from "drizzle-orm"
import { beforeEach, afterEach, afterAll, vi } from "vitest"
import * as schema from "@/db/schema"
import { migrate } from "drizzle-orm/pglite/migrator"

const client = new PGlite()
const testDb = drizzle(client, { schema })

vi.mock("@/db/client", () => ({
  db: testDb,
}))

beforeEach(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" })
})

afterEach(async () => {
  await testDb.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
  await testDb.execute(sql`CREATE SCHEMA public`)
  await testDb.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
})

afterAll(async () => {
  await client.close()
})

export { testDb }
```

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
        env:
          NODE_ENV: test
```

### Coverage Targets

| Area | Target |
|------|--------|
| DB queries | 90%+ |
| Auth flows | 90%+ |
| API routes | 80%+ |
| Utils/helpers | 70%+ |
| UI components | Defer |

---

## Dependencies

```bash
# Auth
pnpm add next-auth@beta @auth/drizzle-adapter bcryptjs
pnpm add -D @types/bcryptjs

# Database
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit

# Email
pnpm add resend

# Testing
pnpm add -D vitest @electric-sql/pglite
```

---

## Implementation Order

| Phase | Tasks |
|-------|-------|
| **1. Database** | Install deps → Drizzle schema → `drizzle-kit push` → verify tables |
| **2. Auth** | Auth.js config → route handler → login/signup pages → test OAuth + credentials |
| **3. Tenant** | DAL (verifySession, withTenant) → proxy.ts → auto-create org on signup |
| **4. Upload** | Storage helpers → upload API → documents table integration |
| **5. UI Shell** | Dashboard layout → document list → upload component |
| **6. Tests** | Vitest + PGlite setup → DB query tests → auth flow tests |

---

## Open Items for Future Breakdown

Multi-org features requiring separate task breakdown:
- Organization CRUD (create, rename, delete)
- Invite flow (email invite, accept/decline)
- Role system (owner, admin, member, viewer)
- Org switcher UI
- Default org creation on signup
- Org settings page
- Member management UI

---

## References

- [Auth.js v5 Drizzle Adapter](https://authjs.dev/getting-started/adapters/drizzle)
- [Next.js 16 Proxy Migration](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Drizzle + PGlite Testing](https://github.com/rphlmr/drizzle-vitest-pg)
- [PGlite Documentation](https://pglite.dev/)
