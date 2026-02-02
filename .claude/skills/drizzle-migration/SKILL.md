---
name: drizzle-migration
description: Create and manage Drizzle ORM migrations for schema changes. Use when adding tables, columns, indexes, or modifying the database schema.
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# Drizzle Migration Skill

Create a migration for: $ARGUMENTS

## Current Schema Context
- Schema files: !`ls src/db/schema/*.ts 2>/dev/null | head -10`
- Recent migrations: !`ls src/db/migrations/*.sql 2>/dev/null | tail -5`

## Workflow

1. **Understand the change**: Read relevant schema files in `src/db/schema/`

2. **Apply schema conventions** (from CLAUDE.md):
   - Use column helpers from `src/db/_columns.ts`: `primaryId`, `timestamps`, `softDelete`, `tenantId`
   - Tenant tables must use `...tenantId` spread
   - Use `cosineDistance()` for vector similarity queries
   - HNSW indexes should be created AFTER bulk data load

3. **Make schema changes**: Edit the appropriate file in `src/db/schema/`

4. **Generate migration**:
   ```bash
   pnpm db:generate
   ```

5. **Review generated SQL**: Check the new migration file in `src/db/migrations/`

6. **Test locally** (if possible):
   ```bash
   pnpm db:push
   ```

## Conventions

- Schema files are in `src/db/schema/`
- Export all tables from `src/db/schema/index.ts`
- Shared tables (reference data): No `tenantId`
- Tenant tables (user data): Must have `tenantId` with RLS

## Example: Adding a new tenant table

```typescript
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { primaryId, timestamps, tenantId } from "../_columns";

export const myNewTable = pgTable("my_new_table", {
  ...primaryId,
  ...tenantId,  // Required for tenant tables
  name: text("name").notNull(),
  ...timestamps,
});
```
