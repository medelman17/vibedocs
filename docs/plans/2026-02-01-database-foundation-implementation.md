# Database Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Drizzle ORM, Auth.js v5, multi-tenant organizations, and testing infrastructure for NDA Analyst.

**Architecture:** Single Neon database with schema separation (shared/tenant). Auth.js with database sessions. DAL pattern for tenant-scoped queries. PGlite for testing.

**Tech Stack:** Drizzle ORM, Neon PostgreSQL, Auth.js v5, bcryptjs, Resend, Vitest, PGlite

**Design Document:** `docs/plans/2026-02-01-database-foundation-design.md`

---

## Phase 1: Dependencies & Project Structure

### Task 1.1: Install Database Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Drizzle and Neon packages**

```bash
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit
```

**Step 2: Verify installation**

Run: `pnpm list drizzle-orm @neondatabase/serverless drizzle-kit`
Expected: All three packages listed with versions

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add drizzle-orm and neon serverless driver"
```

---

### Task 1.2: Install Auth Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Auth.js and related packages**

```bash
pnpm add next-auth@beta @auth/drizzle-adapter bcryptjs
pnpm add -D @types/bcryptjs
```

**Step 2: Verify installation**

Run: `pnpm list next-auth @auth/drizzle-adapter bcryptjs`
Expected: All packages listed

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add auth.js v5 with drizzle adapter and bcrypt"
```

---

### Task 1.3: Install Email and Testing Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Resend and Vitest packages**

```bash
pnpm add resend
pnpm add -D vitest @electric-sql/pglite @vitest/coverage-v8
```

**Step 2: Verify installation**

Run: `pnpm list resend vitest @electric-sql/pglite`
Expected: All packages listed

**Step 3: Add test script to package.json**

Modify `package.json` scripts section to add:
```json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  }
}
```

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add resend, vitest, and pglite for testing"
```

---

### Task 1.4: Create Directory Structure

**Files:**
- Create: `src/db/schema/.gitkeep`
- Create: `src/lib/.gitkeep`
- Create: `src/test/.gitkeep`

**Step 1: Create all directories**

```bash
mkdir -p src/db/schema src/lib src/test
touch src/db/schema/.gitkeep src/lib/.gitkeep src/test/.gitkeep
```

**Step 2: Verify structure**

Run: `find src -type f`
Expected:
```
src/db/schema/.gitkeep
src/lib/.gitkeep
src/test/.gitkeep
```

**Step 3: Commit**

```bash
git add src/
git commit -m "chore: create src directory structure"
```

---

## Phase 2: Database Schema

### Task 2.1: Create Column Helpers

**Files:**
- Create: `src/db/_columns.ts`

**Step 1: Create the columns helper file**

```typescript
// src/db/_columns.ts
import { timestamp, uuid } from "drizzle-orm/pg-core"

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}

export const tenantId = {
  tenantId: uuid("tenant_id").notNull(),
}

export const primaryId = {
  id: uuid("id").primaryKey().defaultRandom(),
}
```

**Step 2: Commit**

```bash
git add src/db/_columns.ts
git commit -m "feat(db): add column helper utilities"
```

---

### Task 2.2: Create Auth Schema

**Files:**
- Create: `src/db/schema/auth.ts`

**Step 1: Create the auth schema file**

```typescript
// src/db/schema/auth.ts
import {
  pgTable,
  text,
  timestamp,
  uuid,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps } from "../_columns"

export const users = pgTable("users", {
  ...primaryId,
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  passwordHash: text("password_hash"),
  ...timestamps,
})

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
)

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
  activeOrganizationId: uuid("active_organization_id"),
})

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
)
```

**Step 2: Commit**

```bash
git add src/db/schema/auth.ts
git commit -m "feat(db): add auth schema (users, accounts, sessions, verification_tokens)"
```

---

### Task 2.3: Create Organizations Schema

**Files:**
- Create: `src/db/schema/organizations.ts`

**Step 1: Create the organizations schema file**

```typescript
// src/db/schema/organizations.ts
import { pgTable, text, uuid, unique, index, timestamp } from "drizzle-orm/pg-core"
import { primaryId, timestamps, softDelete } from "../_columns"
import { users } from "./auth"

export const organizations = pgTable("organizations", {
  ...primaryId,
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  plan: text("plan").notNull().default("free"),
  ...timestamps,
  ...softDelete,
})

export const organizationMembers = pgTable(
  "organization_members",
  {
    ...primaryId,
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    invitedBy: uuid("invited_by").references(() => users.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("org_member_unique").on(table.organizationId, table.userId),
    index("idx_org_members_user").on(table.userId),
    index("idx_org_members_org").on(table.organizationId),
  ]
)
```

**Step 2: Commit**

```bash
git add src/db/schema/organizations.ts
git commit -m "feat(db): add organizations and organization_members schema"
```

---

### Task 2.4: Create Documents Schema

**Files:**
- Create: `src/db/schema/documents.ts`

**Step 1: Create the documents schema file**

```typescript
// src/db/schema/documents.ts
import {
  pgTable,
  text,
  uuid,
  integer,
  index,
  unique,
  vector,
  jsonb,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId } from "../_columns"
import { organizations } from "./organizations"
import { users } from "./auth"

export const documents = pgTable(
  "documents",
  {
    ...primaryId,
    ...tenantId,
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    fileSize: integer("file_size"),
    fileUrl: text("file_url"),
    contentHash: text("content_hash"),
    rawText: text("raw_text"),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").default({}),
    ...timestamps,
  },
  (table) => [
    index("idx_docs_tenant").on(table.tenantId, table.createdAt),
    index("idx_docs_status").on(table.tenantId, table.status),
  ]
)

export const documentChunks = pgTable(
  "document_chunks",
  {
    ...primaryId,
    ...tenantId,
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    sectionPath: text("section_path").array(),
    embedding: vector("embedding", { dimensions: 1024 }),
    tokenCount: integer("token_count"),
    metadata: jsonb("metadata").default({}),
    ...timestamps,
  },
  (table) => [
    unique("chunk_doc_index").on(table.documentId, table.chunkIndex),
    index("idx_chunks_document").on(table.documentId, table.chunkIndex),
    index("idx_chunks_tenant").on(table.tenantId),
  ]
)
```

**Step 2: Commit**

```bash
git add src/db/schema/documents.ts
git commit -m "feat(db): add documents and document_chunks schema"
```

---

### Task 2.5: Create Analyses Schema

**Files:**
- Create: `src/db/schema/analyses.ts`

**Step 1: Create the analyses schema file**

```typescript
// src/db/schema/analyses.ts
import {
  pgTable,
  text,
  uuid,
  integer,
  real,
  index,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId } from "../_columns"
import { documents, documentChunks } from "./documents"

export const analyses = pgTable(
  "analyses",
  {
    ...primaryId,
    ...tenantId,
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    overallRiskScore: real("overall_risk_score"),
    overallRiskLevel: text("overall_risk_level"),
    summary: text("summary"),
    gapAnalysis: jsonb("gap_analysis"),
    tokenUsage: jsonb("token_usage"),
    processingTimeMs: integer("processing_time_ms"),
    inngestRunId: text("inngest_run_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("idx_analyses_document").on(table.documentId),
    index("idx_analyses_tenant").on(table.tenantId, table.status),
  ]
)

export const clauseExtractions = pgTable(
  "clause_extractions",
  {
    ...primaryId,
    ...tenantId,
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id").references(() => documentChunks.id),
    category: text("category").notNull(),
    secondaryCategories: text("secondary_categories").array(),
    clauseText: text("clause_text").notNull(),
    startPosition: integer("start_position"),
    endPosition: integer("end_position"),
    confidence: real("confidence").notNull(),
    riskLevel: text("risk_level").notNull(),
    riskExplanation: text("risk_explanation"),
    evidence: jsonb("evidence"),
    metadata: jsonb("metadata").default({}),
    ...timestamps,
  },
  (table) => [
    index("idx_clauses_analysis").on(table.analysisId),
    index("idx_clauses_category").on(table.category),
    index("idx_clauses_tenant").on(table.tenantId),
  ]
)
```

**Step 2: Commit**

```bash
git add src/db/schema/analyses.ts
git commit -m "feat(db): add analyses and clause_extractions schema"
```

---

### Task 2.6: Create Comparisons and Generated NDAs Schema

**Files:**
- Create: `src/db/schema/comparisons.ts`
- Create: `src/db/schema/generated.ts`

**Step 1: Create comparisons schema**

```typescript
// src/db/schema/comparisons.ts
import { pgTable, text, uuid, jsonb, index } from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId } from "../_columns"
import { documents } from "./documents"

export const comparisons = pgTable(
  "comparisons",
  {
    ...primaryId,
    ...tenantId,
    documentAId: uuid("document_a_id")
      .notNull()
      .references(() => documents.id),
    documentBId: uuid("document_b_id")
      .notNull()
      .references(() => documents.id),
    status: text("status").notNull().default("pending"),
    summary: text("summary"),
    clauseAlignments: jsonb("clause_alignments"),
    keyDifferences: jsonb("key_differences"),
    ...timestamps,
  },
  (table) => [
    index("idx_comparisons_tenant").on(table.tenantId),
    index("idx_comparisons_docs").on(table.documentAId, table.documentBId),
  ]
)
```

**Step 2: Create generated NDAs schema**

```typescript
// src/db/schema/generated.ts
import { pgTable, text, uuid, jsonb, index } from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId } from "../_columns"
import { users } from "./auth"

export const generatedNdas = pgTable(
  "generated_ndas",
  {
    ...primaryId,
    ...tenantId,
    createdBy: uuid("created_by").references(() => users.id),
    title: text("title").notNull(),
    templateSource: text("template_source").notNull(),
    parameters: jsonb("parameters").notNull(),
    content: text("content").notNull(),
    contentHtml: text("content_html"),
    status: text("status").notNull().default("draft"),
    ...timestamps,
  },
  (table) => [
    index("idx_generated_tenant").on(table.tenantId),
    index("idx_generated_status").on(table.tenantId, table.status),
  ]
)
```

**Step 3: Commit**

```bash
git add src/db/schema/comparisons.ts src/db/schema/generated.ts
git commit -m "feat(db): add comparisons and generated_ndas schema"
```

---

### Task 2.7: Create Audit Log Schema

**Files:**
- Create: `src/db/schema/audit.ts`

**Step 1: Create audit log schema**

```typescript
// src/db/schema/audit.ts
import { pgTable, text, uuid, jsonb, timestamp, index } from "drizzle-orm/pg-core"
import { primaryId, tenantId } from "../_columns"

export const auditLogs = pgTable(
  "audit_logs",
  {
    ...primaryId,
    ...tenantId,
    tableName: text("table_name").notNull(),
    recordId: uuid("record_id").notNull(),
    action: text("action").notNull(),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    userId: uuid("user_id"),
    ipAddress: text("ip_address"),
    performedAt: timestamp("performed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_audit_tenant").on(table.tenantId, table.tableName, table.performedAt),
    index("idx_audit_record").on(table.tableName, table.recordId),
  ]
)
```

**Step 2: Commit**

```bash
git add src/db/schema/audit.ts
git commit -m "feat(db): add audit_logs schema"
```

---

### Task 2.8: Create Schema Barrel Export

**Files:**
- Create: `src/db/schema/index.ts`

**Step 1: Create barrel export**

```typescript
// src/db/schema/index.ts
export * from "./auth"
export * from "./organizations"
export * from "./documents"
export * from "./analyses"
export * from "./comparisons"
export * from "./generated"
export * from "./audit"
```

**Step 2: Commit**

```bash
git add src/db/schema/index.ts
rm src/db/schema/.gitkeep 2>/dev/null || true
git add -A src/db/schema/
git commit -m "feat(db): add schema barrel export"
```

---

### Task 2.9: Create Database Client

**Files:**
- Create: `src/db/client.ts`
- Create: `src/db/index.ts`

**Step 1: Create database client**

```typescript
// src/db/client.ts
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

const sql = neon(process.env.DATABASE_URL!)

export const db = drizzle(sql, { schema })

export type Database = typeof db
```

**Step 2: Create db barrel export**

```typescript
// src/db/index.ts
export * from "./client"
export * from "./schema"
```

**Step 3: Commit**

```bash
git add src/db/client.ts src/db/index.ts
git commit -m "feat(db): add neon database client"
```

---

### Task 2.10: Create Drizzle Config

**Files:**
- Create: `drizzle.config.ts`

**Step 1: Create drizzle config**

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

**Step 2: Add drizzle scripts to package.json**

Add to scripts section:
```json
{
  "db:push": "drizzle-kit push",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

**Step 3: Add drizzle folder to .gitignore**

Append to `.gitignore`:
```
# Drizzle
drizzle/
```

**Step 4: Commit**

```bash
git add drizzle.config.ts package.json .gitignore
git commit -m "feat(db): add drizzle-kit configuration"
```

---

### Task 2.11: Push Schema to Database

**Files:**
- None (database operation)

**Step 1: Run drizzle push**

```bash
pnpm db:push
```

Expected: Schema pushed successfully, tables created

**Step 2: Verify tables exist**

Run: `pnpm db:studio` and check that all tables are visible in the Drizzle Studio UI.

**Step 3: Commit any generated files**

```bash
git add -A
git commit -m "chore(db): push initial schema to database" --allow-empty
```

---

## Phase 3: Testing Infrastructure

### Task 3.1: Create Vitest Config

**Files:**
- Create: `vitest.config.ts`

**Step 1: Create vitest configuration**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", ".next", "src/test/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

**Step 2: Commit**

```bash
git add vitest.config.ts
git commit -m "test: add vitest configuration"
```

---

### Task 3.2: Create PGlite Test Setup

**Files:**
- Create: `src/test/setup.ts`

**Step 1: Create test setup file**

```typescript
// src/test/setup.ts
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { sql } from "drizzle-orm"
import { beforeEach, afterEach, afterAll, vi } from "vitest"
import * as schema from "@/db/schema"

// Create in-memory PGlite instance
const client = new PGlite()
export const testDb = drizzle(client, { schema })

// Mock the db module
vi.mock("@/db/client", () => ({
  db: testDb,
}))

// Schema creation SQL (simplified for testing)
const createSchema = async () => {
  // Enable pgcrypto for gen_random_uuid()
  await testDb.execute(sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)

  // Create tables in order (respecting foreign keys)
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT,
      email TEXT UNIQUE NOT NULL,
      email_verified TIMESTAMPTZ,
      image TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ
    )
  `)

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS organization_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      invited_by UUID REFERENCES users(id),
      invited_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(organization_id, user_id)
    )
  `)

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      session_token TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires TIMESTAMPTZ NOT NULL,
      active_organization_id UUID
    )
  `)

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS accounts (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      PRIMARY KEY(provider, provider_account_id)
    )
  `)

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires TIMESTAMPTZ NOT NULL,
      PRIMARY KEY(identifier, token)
    )
  `)

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      uploaded_by UUID REFERENCES users(id),
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER,
      file_url TEXT,
      content_hash TEXT,
      raw_text TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

beforeEach(async () => {
  await createSchema()
})

afterEach(async () => {
  // Clean up tables in reverse order
  await testDb.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
  await testDb.execute(sql`CREATE SCHEMA public`)
})

afterAll(async () => {
  await client.close()
})
```

**Step 2: Commit**

```bash
git add src/test/setup.ts
rm src/test/.gitkeep 2>/dev/null || true
git add -A src/test/
git commit -m "test: add PGlite test setup with schema creation"
```

---

### Task 3.3: Create First Database Test

**Files:**
- Create: `src/db/schema/organizations.test.ts`

**Step 1: Write the test**

```typescript
// src/db/schema/organizations.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { users, organizations, organizationMembers } from "./index"
import { eq } from "drizzle-orm"

describe("organizations schema", () => {
  it("creates an organization", async () => {
    const [org] = await testDb
      .insert(organizations)
      .values({
        name: "Test Org",
        slug: "test-org",
      })
      .returning()

    expect(org.id).toBeDefined()
    expect(org.name).toBe("Test Org")
    expect(org.slug).toBe("test-org")
    expect(org.plan).toBe("free")
  })

  it("creates organization membership", async () => {
    // Create user first
    const [user] = await testDb
      .insert(users)
      .values({
        email: "test@example.com",
        name: "Test User",
      })
      .returning()

    // Create org
    const [org] = await testDb
      .insert(organizations)
      .values({
        name: "Test Org",
        slug: "test-org",
      })
      .returning()

    // Create membership
    const [membership] = await testDb
      .insert(organizationMembers)
      .values({
        organizationId: org.id,
        userId: user.id,
        role: "owner",
      })
      .returning()

    expect(membership.organizationId).toBe(org.id)
    expect(membership.userId).toBe(user.id)
    expect(membership.role).toBe("owner")
  })

  it("enforces unique org membership per user", async () => {
    const [user] = await testDb
      .insert(users)
      .values({ email: "test@example.com" })
      .returning()

    const [org] = await testDb
      .insert(organizations)
      .values({ name: "Test Org", slug: "test-org" })
      .returning()

    // First membership should succeed
    await testDb.insert(organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: "member",
    })

    // Duplicate should fail
    await expect(
      testDb.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: "admin",
      })
    ).rejects.toThrow()
  })
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm test src/db/schema/organizations.test.ts`
Expected: All 3 tests pass

**Step 3: Commit**

```bash
git add src/db/schema/organizations.test.ts
git commit -m "test(db): add organization schema tests"
```

---

### Task 3.4: Create GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/test.yml`

**Step 1: Create workflow directory and file**

```bash
mkdir -p .github/workflows
```

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

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test
        env:
          NODE_ENV: test

      - name: Run linter
        run: pnpm lint
```

**Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add GitHub Actions test workflow"
```

---

## Phase 4: Auth.js Setup

### Task 4.1: Create Auth Configuration

**Files:**
- Create: `src/lib/auth.ts`

**Step 1: Create auth configuration**

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  organizations,
  organizationMembers,
} from "@/db/schema"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
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
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await db.query.users.findFirst({
          where: eq(users.email, credentials.email as string),
        })

        if (!user?.passwordHash) {
          return null
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id

        // Get active organization from session
        const dbSession = await db.query.sessions.findFirst({
          where: eq(sessions.userId, user.id),
        })

        if (dbSession?.activeOrganizationId) {
          session.activeOrganizationId = dbSession.activeOrganizationId
        } else {
          // Get first organization user belongs to
          const membership = await db.query.organizationMembers.findFirst({
            where: eq(organizationMembers.userId, user.id),
          })
          if (membership) {
            session.activeOrganizationId = membership.organizationId
          }
        }
      }
      return session
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id || !user.email) return

      // Create default organization for new user
      const slug = user.name
        ? user.name.toLowerCase().replace(/\s+/g, "-")
        : user.email.split("@")[0]

      const [org] = await db
        .insert(organizations)
        .values({
          name: user.name ? `${user.name}'s Workspace` : "My Workspace",
          slug: `${slug}-${Date.now()}`,
        })
        .returning()

      // Add user as owner
      await db.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: "owner",
        acceptedAt: new Date(),
      })
    },
  },
})

// Type augmentation for session
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
    }
    activeOrganizationId?: string
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/auth.ts
rm src/lib/.gitkeep 2>/dev/null || true
git add -A src/lib/
git commit -m "feat(auth): add Auth.js configuration with Google and Credentials"
```

---

### Task 4.2: Create Auth Route Handler

**Files:**
- Create: `app/api/auth/[...nextauth]/route.ts`

**Step 1: Create route handler**

```typescript
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth"

export const { GET, POST } = handlers
```

**Step 2: Commit**

```bash
mkdir -p app/api/auth/\[...nextauth\]
git add app/api/auth/
git commit -m "feat(auth): add Auth.js route handler"
```

---

### Task 4.3: Create Password Utilities

**Files:**
- Create: `src/lib/password.ts`
- Create: `src/lib/password.test.ts`

**Step 1: Create password utilities**

```typescript
// src/lib/password.ts
import bcrypt from "bcryptjs"

const SALT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function validatePassword(password: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters")
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter")
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter")
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
```

**Step 2: Write the test**

```typescript
// src/lib/password.test.ts
import { describe, it, expect } from "vitest"
import { hashPassword, verifyPassword, validatePassword } from "./password"

describe("password utilities", () => {
  describe("hashPassword", () => {
    it("hashes a password", async () => {
      const password = "SecurePass123"
      const hash = await hashPassword(password)

      expect(hash).not.toBe(password)
      expect(hash).toMatch(/^\$2[aby]?\$/)
    })
  })

  describe("verifyPassword", () => {
    it("verifies correct password", async () => {
      const password = "SecurePass123"
      const hash = await hashPassword(password)

      const isValid = await verifyPassword(password, hash)
      expect(isValid).toBe(true)
    })

    it("rejects incorrect password", async () => {
      const password = "SecurePass123"
      const hash = await hashPassword(password)

      const isValid = await verifyPassword("WrongPass456", hash)
      expect(isValid).toBe(false)
    })
  })

  describe("validatePassword", () => {
    it("accepts valid password", () => {
      const result = validatePassword("SecurePass123")
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("rejects short password", () => {
      const result = validatePassword("Short1A")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("Password must be at least 8 characters")
    })

    it("requires uppercase letter", () => {
      const result = validatePassword("lowercase123")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain(
        "Password must contain at least one uppercase letter"
      )
    })

    it("requires lowercase letter", () => {
      const result = validatePassword("UPPERCASE123")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain(
        "Password must contain at least one lowercase letter"
      )
    })

    it("requires number", () => {
      const result = validatePassword("NoNumbersHere")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain(
        "Password must contain at least one number"
      )
    })
  })
})
```

**Step 3: Run tests**

Run: `pnpm test src/lib/password.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/lib/password.ts src/lib/password.test.ts
git commit -m "feat(auth): add password hashing and validation utilities"
```

---

### Task 4.4: Create Proxy File

**Files:**
- Create: `src/proxy.ts`

**Step 1: Create proxy file**

```typescript
// src/proxy.ts
import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const protectedRoutes = ["/dashboard", "/documents", "/analysis", "/settings"]
const publicRoutes = ["/login", "/signup", "/"]
const authRoutes = ["/login", "/signup"]

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname

  const isProtectedRoute = protectedRoutes.some((route) =>
    path.startsWith(route)
  )
  const isPublicRoute = publicRoutes.includes(path)
  const isAuthRoute = authRoutes.includes(path)

  // Check for session cookie (optimistic check, no DB call)
  const cookieStore = await cookies()
  const sessionToken =
    cookieStore.get("authjs.session-token")?.value ||
    cookieStore.get("__Secure-authjs.session-token")?.value

  // Redirect unauthenticated users from protected routes to login
  if (isProtectedRoute && !sessionToken) {
    const loginUrl = new URL("/login", req.nextUrl)
    loginUrl.searchParams.set("callbackUrl", path)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users from auth routes to dashboard
  if (isAuthRoute && sessionToken) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (Auth.js routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*$).*)",
  ],
}
```

**Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(auth): add Next.js 16 proxy for auth redirects"
```

---

### Task 4.5: Create Data Access Layer

**Files:**
- Create: `src/lib/dal.ts`

**Step 1: Create DAL file**

```typescript
// src/lib/dal.ts
import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"
import { auth } from "./auth"
import { db } from "@/db"
import { organizationMembers } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { sql } from "drizzle-orm"

export const verifySession = cache(async () => {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  return {
    userId: session.user.id,
    user: session.user,
    activeOrganizationId: session.activeOrganizationId,
  }
})

export const withTenant = cache(async () => {
  const { userId, user, activeOrganizationId } = await verifySession()

  if (!activeOrganizationId) {
    redirect("/onboarding")
  }

  // Verify user is member of this organization
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.organizationId, activeOrganizationId)
    ),
  })

  if (!membership) {
    redirect("/onboarding")
  }

  // Set RLS context for the current request
  await db.execute(
    sql`SELECT set_config('app.tenant_id', ${activeOrganizationId}, true)`
  )

  return {
    db,
    userId,
    user,
    tenantId: activeOrganizationId,
    role: membership.role,
  }
})

export const requireRole = cache(
  async (allowedRoles: ("owner" | "admin" | "member" | "viewer")[]) => {
    const { role, ...rest } = await withTenant()

    if (!allowedRoles.includes(role as any)) {
      redirect("/dashboard?error=unauthorized")
    }

    return { role, ...rest }
  }
)
```

**Step 2: Commit**

```bash
git add src/lib/dal.ts
git commit -m "feat(auth): add Data Access Layer with tenant context"
```

---

## Phase 5: Final Integration

### Task 5.1: Update TypeScript Config for Path Aliases

**Files:**
- Modify: `tsconfig.json`

**Step 1: Verify path alias exists**

Check that `tsconfig.json` has the `@/*` path alias. If not, add it:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

**Step 2: Commit if changed**

```bash
git add tsconfig.json
git commit -m "chore: ensure path aliases in tsconfig" --allow-empty
```

---

### Task 5.2: Create Environment Template

**Files:**
- Create: `.env.example`

**Step 1: Create environment template**

```bash
# .env.example
# Database
DATABASE_URL="postgresql://..."

# Auth.js
AUTH_SECRET="generate-with-openssl-rand-base64-32"
AUTH_GOOGLE_ID="your-google-client-id"
AUTH_GOOGLE_SECRET="your-google-client-secret"

# Resend (email)
RESEND_API_KEY="re_..."

# Vercel Blob (already configured)
BLOB_READ_WRITE_TOKEN="..."
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add environment variable template"
```

---

### Task 5.3: Run Full Test Suite

**Files:**
- None (verification step)

**Step 1: Run all tests**

```bash
pnpm test
```

Expected: All tests pass

**Step 2: Run linter**

```bash
pnpm lint
```

Expected: No errors

**Step 3: Run build**

```bash
pnpm build
```

Expected: Build succeeds (may have warnings about unused exports, that's OK)

---

### Task 5.4: Final Commit and Summary

**Step 1: Check status**

```bash
git status
```

**Step 2: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: complete database foundation implementation" --allow-empty
```

**Step 3: Push to remote**

```bash
git push origin main
```

---

## Summary

After completing this plan, you will have:

1. **Database Layer**
   - Drizzle ORM configured with Neon PostgreSQL
   - Complete schema for auth, organizations, documents, analyses
   - Column helpers for timestamps, soft delete, tenant ID

2. **Auth System**
   - Auth.js v5 with Google OAuth + Email/Password
   - Database sessions with Drizzle adapter
   - Auto-create organization on signup

3. **Multi-Tenancy**
   - Organizations with junction table for multi-org support
   - Data Access Layer with `verifySession()` and `withTenant()`
   - Next.js 16 proxy for route protection

4. **Testing**
   - Vitest + PGlite for in-memory database testing
   - GitHub Actions CI pipeline
   - Password utility tests as example

---

## Next Steps (Future Plans)

- Login/Signup UI pages
- Document upload API with Vercel Blob
- Dashboard layout
- Organization settings UI
