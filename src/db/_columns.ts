/**
 * @fileoverview Reusable column helper objects for Drizzle ORM schema composition.
 *
 * This module provides pre-configured column definitions that can be spread into
 * Drizzle table definitions using the object spread syntax. This promotes consistency
 * across the database schema and reduces boilerplate when defining common patterns
 * like timestamps, soft deletes, and multi-tenant identifiers.
 *
 * @example
 * // Basic usage in a table definition
 * import { pgTable, text } from "drizzle-orm/pg-core"
 * import { primaryId, timestamps, tenantId, softDelete } from "./_columns"
 *
 * export const documents = pgTable("documents", {
 *   ...primaryId,      // Adds: id (UUID, primary key, auto-generated)
 *   ...timestamps,     // Adds: createdAt, updatedAt (auto-managed)
 *   ...tenantId,       // Adds: tenantId (UUID, required for RLS)
 *   ...softDelete,     // Adds: deletedAt (nullable timestamp)
 *   title: text("title").notNull(),
 *   content: text("content"),
 * })
 *
 * @module db/_columns
 * @see {@link https://orm.drizzle.team/docs/column-types} Drizzle column types documentation
 */

import { timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * Standard timestamp columns for tracking record creation and modification times.
 *
 * Provides two columns:
 * - `createdAt`: Set automatically when a record is inserted (via `defaultNow()`)
 * - `updatedAt`: Set on insert and automatically updated on every modification
 *   via Drizzle's `$onUpdate()` hook
 *
 * Both columns use timezone-aware timestamps (`timestamptz` in PostgreSQL) to ensure
 * correct handling across different server and client timezones.
 *
 * @remarks
 * The `updatedAt` column uses Drizzle's `$onUpdate()` callback which triggers
 * automatically when using Drizzle's update operations. Note that raw SQL updates
 * bypassing Drizzle will NOT trigger this callback - consider using a database
 * trigger if you need guaranteed updates in all scenarios.
 *
 * @example
 * // In a table definition
 * export const users = pgTable("users", {
 *   ...primaryId,
 *   ...timestamps,
 *   email: text("email").notNull().unique(),
 * })
 *
 * // The table will have these columns:
 * // - id: uuid (primary key)
 * // - created_at: timestamptz (auto-set on insert)
 * // - updated_at: timestamptz (auto-set on insert, auto-updated on modification)
 * // - email: text
 *
 * @example
 * // Querying with timestamps
 * const recentDocs = await db
 *   .select()
 *   .from(documents)
 *   .where(gte(documents.createdAt, thirtyDaysAgo))
 *   .orderBy(desc(documents.updatedAt))
 */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

/**
 * Soft delete column for marking records as deleted without physical removal.
 *
 * Provides a nullable `deletedAt` timestamp column. When populated, the record
 * is considered "soft deleted" and should be excluded from normal queries.
 *
 * @remarks
 * Soft deletes are preferred over hard deletes for:
 * - Audit trails and compliance requirements
 * - Accidental deletion recovery
 * - Maintaining referential integrity with historical data
 * - Legal hold requirements
 *
 * Remember to add a filter condition to exclude soft-deleted records in your
 * queries, or create a database view that automatically excludes them.
 *
 * @example
 * // In a table definition
 * export const documents = pgTable("documents", {
 *   ...primaryId,
 *   ...timestamps,
 *   ...softDelete,
 *   title: text("title").notNull(),
 * })
 *
 * @example
 * // Soft delete a record
 * await db
 *   .update(documents)
 *   .set({ deletedAt: new Date() })
 *   .where(eq(documents.id, documentId))
 *
 * @example
 * // Query excluding soft-deleted records
 * const activeDocuments = await db
 *   .select()
 *   .from(documents)
 *   .where(isNull(documents.deletedAt))
 *
 * @example
 * // Restore a soft-deleted record
 * await db
 *   .update(documents)
 *   .set({ deletedAt: null })
 *   .where(eq(documents.id, documentId))
 */
export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}

/**
 * Tenant identifier column for multi-tenant data isolation.
 *
 * Provides a required UUID column that references the owning organization/tenant.
 * This column is essential for Row-Level Security (RLS) policies that restrict
 * data access to authorized tenants only.
 *
 * @remarks
 * In this application's architecture:
 * - Each tenant corresponds to an organization
 * - The `tenantId` should match the user's `activeOrganizationId` from their session
 * - RLS policies in PostgreSQL use this column to enforce data isolation
 * - All tenant-scoped queries should use `withTenant()` from the DAL to set context
 *
 * @important
 * This column is marked as `notNull()` because every tenant-scoped record MUST
 * belong to a tenant. Records without a tenant ID would be orphaned and potentially
 * inaccessible or visible to all users (security risk).
 *
 * @example
 * // In a table definition
 * export const analyses = pgTable("analyses", {
 *   ...primaryId,
 *   ...timestamps,
 *   ...tenantId,  // Required for all tenant-scoped tables
 *   documentId: uuid("document_id").notNull(),
 *   riskScore: integer("risk_score"),
 * })
 *
 * @example
 * // Using with the DAL for tenant-scoped queries
 * import { withTenant } from "@/lib/dal"
 *
 * const { db, tenantId } = await withTenant()
 * const docs = await db
 *   .select()
 *   .from(documents)
 *   .where(eq(documents.tenantId, tenantId))
 *
 * @see {@link file://../lib/dal.ts} Data Access Layer with tenant context
 */
export const tenantId = {
  tenantId: uuid("tenant_id").notNull(),
}

/**
 * Primary key column using UUID v4 with automatic random generation.
 *
 * Provides a UUID primary key column that automatically generates a random
 * UUID v4 value when a new record is inserted (via PostgreSQL's `gen_random_uuid()`).
 *
 * @remarks
 * UUIDs are preferred over sequential integers for primary keys because they:
 * - Are globally unique across tables and databases
 * - Don't leak information about record count or creation order
 * - Can be generated client-side without database round-trips
 * - Are safe for distributed systems and database sharding
 * - Prevent enumeration attacks on API endpoints
 *
 * The `defaultRandom()` function maps to PostgreSQL's `gen_random_uuid()`,
 * which generates cryptographically random UUID v4 values.
 *
 * @example
 * // In a table definition
 * export const users = pgTable("users", {
 *   ...primaryId,  // Adds: id uuid PRIMARY KEY DEFAULT gen_random_uuid()
 *   ...timestamps,
 *   email: text("email").notNull().unique(),
 * })
 *
 * @example
 * // Inserting a record (id is auto-generated)
 * const [newUser] = await db
 *   .insert(users)
 *   .values({ email: "user@example.com" })
 *   .returning()
 *
 * console.log(newUser.id) // "550e8400-e29b-41d4-a716-446655440000"
 *
 * @example
 * // You can also provide your own UUID if needed
 * await db.insert(users).values({
 *   id: "custom-uuid-value-here",
 *   email: "user@example.com",
 * })
 */
export const primaryId = {
  id: uuid("id").primaryKey().defaultRandom(),
}
