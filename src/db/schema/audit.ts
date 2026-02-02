/**
 * @fileoverview Audit logging schema for compliance tracking and debugging.
 *
 * This module defines the audit trail infrastructure for the VibeDocs application.
 * The audit log captures all data changes (INSERT, UPDATE, DELETE) to tenant-scoped
 * tables, providing a complete Change Data Capture (CDC) style history that supports:
 *
 * - **Compliance Requirements**: SOC 2, HIPAA, GDPR, and other regulatory frameworks
 *   require demonstrable audit trails of who accessed or modified sensitive data.
 *
 * - **Debugging & Troubleshooting**: When issues arise, the audit log provides a
 *   detailed timeline of changes to help identify root causes.
 *
 * - **Data Recovery**: In cases of accidental modification, the oldValues field
 *   preserves the previous state for potential recovery operations.
 *
 * - **User Activity Monitoring**: Track which users made changes and when, supporting
 *   security reviews and access auditing.
 *
 * @remarks
 * The audit log is designed to be append-only. Records should never be updated or
 * deleted (except by automated retention policies). This immutability is critical
 * for maintaining audit integrity and compliance.
 *
 * Audit records are typically created via database triggers or application middleware
 * rather than direct inserts, ensuring consistent capture of all changes.
 *
 * @example
 * // Typical audit log entry for an UPDATE operation
 * {
 *   id: "550e8400-e29b-41d4-a716-446655440000",
 *   tenantId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
 *   tableName: "documents",
 *   recordId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
 *   action: "UPDATE",
 *   oldValues: { title: "Draft NDA", status: "pending" },
 *   newValues: { title: "Final NDA v2", status: "approved" },
 *   userId: "12345678-1234-1234-1234-123456789012",
 *   ipAddress: "192.168.1.100",
 *   performedAt: "2024-01-15T14:30:00.000Z"
 * }
 *
 * @module db/schema/audit
 * @see {@link https://orm.drizzle.team/docs/column-types} Drizzle column types
 * @see {@link https://www.postgresql.org/docs/current/functions-json.html} PostgreSQL JSONB functions
 */

import { pgTable, text, uuid, jsonb, timestamp, index } from "drizzle-orm/pg-core"
import { primaryId, tenantId } from "../_columns"

/**
 * Audit logs table for tracking all data changes across tenant-scoped tables.
 *
 * This table implements a CDC (Change Data Capture) pattern, recording every
 * INSERT, UPDATE, and DELETE operation on audited tables. Each record captures
 * the complete before/after state of the modified data, enabling full reconstruction
 * of data history and supporting compliance requirements.
 *
 * @description
 * The audit_logs table serves as an immutable ledger of all tenant data modifications.
 * It captures:
 * - **What changed**: Table name, record ID, and the specific field values
 * - **How it changed**: The action type (INSERT/UPDATE/DELETE) and before/after values
 * - **Who changed it**: User ID and IP address of the actor
 * - **When it changed**: Timestamp with timezone precision
 *
 * ## Field Details
 *
 * | Field | Type | Description |
 * |-------|------|-------------|
 * | `id` | UUID | Auto-generated primary key for the audit record |
 * | `tenantId` | UUID | Organization/tenant that owns the modified record |
 * | `tableName` | text | Name of the table where the change occurred |
 * | `recordId` | UUID | Primary key of the affected record |
 * | `action` | text | Operation type: `'INSERT'`, `'UPDATE'`, or `'DELETE'` |
 * | `oldValues` | JSONB | Previous field values (null for INSERT) |
 * | `newValues` | JSONB | New field values (null for DELETE) |
 * | `userId` | UUID | User who performed the action (null for system operations) |
 * | `ipAddress` | text | Client IP address (useful for security auditing) |
 * | `performedAt` | timestamptz | When the change occurred |
 *
 * ## Action Types
 *
 * The `action` field accepts one of three values:
 * - `'INSERT'`: A new record was created. `oldValues` will be null, `newValues` contains all fields.
 * - `'UPDATE'`: An existing record was modified. Both `oldValues` and `newValues` are populated
 *   with the changed fields (or full record, depending on implementation).
 * - `'DELETE'`: A record was removed. `oldValues` contains the deleted data, `newValues` is null.
 *
 * ## JSONB Diff Storage Strategy
 *
 * The `oldValues` and `newValues` columns use PostgreSQL's JSONB type for flexible
 * storage of arbitrary field data. Two strategies are common:
 *
 * 1. **Full Record Storage**: Store the complete record state before and after.
 *    Pros: Simple queries, easy reconstruction. Cons: More storage space.
 *
 * 2. **Diff-Only Storage**: Store only the fields that changed.
 *    Pros: Compact storage. Cons: Requires joining multiple records for full history.
 *
 * This schema supports either approach - the application layer determines what to store.
 *
 * ## Index Design
 *
 * Two indexes optimize common audit query patterns:
 *
 * ### `idx_audit_tenant` (tenantId, tableName, performedAt)
 * Composite index optimized for tenant-scoped queries that filter by table and time range.
 * This is the primary access pattern for audit dashboards and compliance reports.
 *
 * **Optimizes queries like:**
 * - "Show all document changes for this organization in the last 30 days"
 * - "Get all changes to analyses tables this month"
 * - "Export audit log for compliance review"
 *
 * ### `idx_audit_record` (tableName, recordId)
 * Composite index for looking up the complete history of a specific record.
 * Essential for debugging issues with individual records.
 *
 * **Optimizes queries like:**
 * - "Show me all changes ever made to this specific document"
 * - "Who modified this analysis and when?"
 * - "Reconstruct the state of this record at a specific point in time"
 *
 * @example
 * // Query: Get recent changes for a tenant (audit dashboard)
 * import { db } from "@/db"
 * import { auditLogs } from "@/db/schema/audit"
 * import { desc, eq, and, gte } from "drizzle-orm"
 *
 * const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
 *
 * const recentChanges = await db
 *   .select()
 *   .from(auditLogs)
 *   .where(
 *     and(
 *       eq(auditLogs.tenantId, currentTenantId),
 *       gte(auditLogs.performedAt, thirtyDaysAgo)
 *     )
 *   )
 *   .orderBy(desc(auditLogs.performedAt))
 *   .limit(100)
 *
 * @example
 * // Query: Get all changes made by a specific user
 * import { db } from "@/db"
 * import { auditLogs } from "@/db/schema/audit"
 * import { eq, and, desc } from "drizzle-orm"
 *
 * const userActivity = await db
 *   .select({
 *     tableName: auditLogs.tableName,
 *     action: auditLogs.action,
 *     recordId: auditLogs.recordId,
 *     performedAt: auditLogs.performedAt,
 *   })
 *   .from(auditLogs)
 *   .where(
 *     and(
 *       eq(auditLogs.tenantId, currentTenantId),
 *       eq(auditLogs.userId, targetUserId)
 *     )
 *   )
 *   .orderBy(desc(auditLogs.performedAt))
 *
 * @example
 * // Query: Get complete history of a specific record
 * import { db } from "@/db"
 * import { auditLogs } from "@/db/schema/audit"
 * import { eq, and, asc } from "drizzle-orm"
 *
 * const recordHistory = await db
 *   .select()
 *   .from(auditLogs)
 *   .where(
 *     and(
 *       eq(auditLogs.tableName, "documents"),
 *       eq(auditLogs.recordId, documentId)
 *     )
 *   )
 *   .orderBy(asc(auditLogs.performedAt))
 *
 * // Reconstruct state at any point by applying changes in order
 * let currentState = {}
 * for (const entry of recordHistory) {
 *   if (entry.action === "INSERT" || entry.action === "UPDATE") {
 *     currentState = { ...currentState, ...entry.newValues }
 *   } else if (entry.action === "DELETE") {
 *     currentState = null // Record was deleted
 *   }
 * }
 *
 * @example
 * // Query: Count changes by action type for compliance reporting
 * import { db } from "@/db"
 * import { auditLogs } from "@/db/schema/audit"
 * import { eq, and, gte, lte, count } from "drizzle-orm"
 *
 * const startDate = new Date("2024-01-01")
 * const endDate = new Date("2024-01-31")
 *
 * const actionCounts = await db
 *   .select({
 *     action: auditLogs.action,
 *     tableName: auditLogs.tableName,
 *     count: count(),
 *   })
 *   .from(auditLogs)
 *   .where(
 *     and(
 *       eq(auditLogs.tenantId, currentTenantId),
 *       gte(auditLogs.performedAt, startDate),
 *       lte(auditLogs.performedAt, endDate)
 *     )
 *   )
 *   .groupBy(auditLogs.action, auditLogs.tableName)
 *
 * @example
 * // Query: Find changes from a specific IP address (security investigation)
 * import { db } from "@/db"
 * import { auditLogs } from "@/db/schema/audit"
 * import { eq, and, desc } from "drizzle-orm"
 *
 * const suspiciousActivity = await db
 *   .select()
 *   .from(auditLogs)
 *   .where(
 *     and(
 *       eq(auditLogs.tenantId, currentTenantId),
 *       eq(auditLogs.ipAddress, suspiciousIp)
 *     )
 *   )
 *   .orderBy(desc(auditLogs.performedAt))
 *
 * @example
 * // Creating an audit log entry (typically done by triggers or middleware)
 * import { db } from "@/db"
 * import { auditLogs } from "@/db/schema/audit"
 *
 * await db.insert(auditLogs).values({
 *   tenantId: currentTenantId,
 *   tableName: "documents",
 *   recordId: documentId,
 *   action: "UPDATE",
 *   oldValues: { title: "Old Title", status: "draft" },
 *   newValues: { title: "New Title", status: "published" },
 *   userId: currentUserId,
 *   ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
 * })
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    /**
     * Auto-generated UUID primary key for the audit record.
     * Each audit entry has its own unique identifier, separate from the
     * `recordId` which references the audited table's primary key.
     */
    ...primaryId,

    /**
     * Organization/tenant identifier for multi-tenant isolation.
     * All audit queries should be scoped by tenant to ensure data isolation.
     * This enables RLS policies to restrict audit log access per organization.
     */
    ...tenantId,

    /**
     * Name of the database table where the change occurred.
     * Examples: 'documents', 'analyses', 'comparisons', 'generated_ndas'
     *
     * Combined with `recordId`, this uniquely identifies the affected record
     * across all audited tables.
     */
    tableName: text("table_name").notNull(),

    /**
     * Primary key (UUID) of the record that was modified.
     * References the `id` column of the table specified in `tableName`.
     *
     * Note: This is stored as a UUID but could be any type depending on
     * the audited table's primary key. UUID is used here as all tenant
     * tables use UUID primary keys (via the `primaryId` column helper).
     */
    recordId: uuid("record_id").notNull(),

    /**
     * Type of database operation that triggered this audit entry.
     *
     * Valid values:
     * - `'INSERT'` - A new record was created
     * - `'UPDATE'` - An existing record was modified
     * - `'DELETE'` - A record was removed (soft or hard delete)
     *
     * @remarks
     * For soft deletes (setting `deletedAt`), the action is typically `'UPDATE'`
     * since the record still exists. Use `'DELETE'` for hard/permanent deletes.
     */
    action: text("action").notNull(),

    /**
     * JSONB snapshot of field values BEFORE the change.
     *
     * - For `INSERT`: Always `null` (no previous state exists)
     * - For `UPDATE`: Contains previous values of modified fields
     * - For `DELETE`: Contains the complete record state before deletion
     *
     * @remarks
     * The exact contents depend on the auditing implementation:
     * - **Full snapshot**: All fields of the record before change
     * - **Diff only**: Only the fields that were actually modified
     *
     * Use PostgreSQL JSONB operators for efficient querying:
     * - `oldValues->>'fieldName'` extracts a text value
     * - `oldValues->'nested'->'path'` navigates nested objects
     * - `oldValues @> '{"status": "draft"}'` checks containment
     */
    oldValues: jsonb("old_values"),

    /**
     * JSONB snapshot of field values AFTER the change.
     *
     * - For `INSERT`: Contains all fields of the newly created record
     * - For `UPDATE`: Contains new values of modified fields
     * - For `DELETE`: Always `null` (record no longer exists)
     *
     * @remarks
     * Combined with `oldValues`, you can compute the exact diff:
     * ```sql
     * SELECT
     *   key,
     *   old_values->key as old_value,
     *   new_values->key as new_value
     * FROM audit_logs,
     *   jsonb_object_keys(
     *     COALESCE(old_values, '{}') || COALESCE(new_values, '{}')
     *   ) as key
     * WHERE (old_values->key) IS DISTINCT FROM (new_values->key)
     * ```
     */
    newValues: jsonb("new_values"),

    /**
     * UUID of the user who performed the action.
     *
     * Nullable to support:
     * - System-initiated changes (migrations, background jobs)
     * - Anonymous operations (if applicable)
     * - Changes made before user tracking was implemented
     *
     * References the `users` table but intentionally not a foreign key
     * to allow audit records to persist even if users are deleted.
     */
    userId: uuid("user_id"),

    /**
     * IP address of the client that initiated the change.
     *
     * Stored as text to support both IPv4 and IPv6 addresses.
     * Useful for:
     * - Security investigations (identifying suspicious access)
     * - Compliance reporting (proving access location)
     * - Debugging distributed system issues
     *
     * May be null for server-side operations or internal system changes.
     *
     * @remarks
     * Consider privacy regulations (GDPR) when storing and retaining
     * IP addresses. Implement appropriate retention policies.
     */
    ipAddress: text("ip_address"),

    /**
     * Timestamp when the change was recorded.
     *
     * Uses timezone-aware timestamp (`timestamptz`) for consistent
     * handling across different server locations and client timezones.
     * Defaults to the current time when the audit record is created.
     *
     * @remarks
     * This represents when the audit record was created, which should
     * be essentially the same as when the actual change occurred.
     * For systems with delayed audit capture, consider adding a
     * separate `changedAt` field.
     */
    performedAt: timestamp("performed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * Composite index for tenant-scoped audit queries with time filtering.
     *
     * Column order: (tenantId, tableName, performedAt)
     *
     * Optimizes the most common audit query pattern:
     * "Show me changes to [optional: specific table] for [tenant] in [time range]"
     *
     * The index supports queries that:
     * - Filter by tenantId only
     * - Filter by tenantId + tableName
     * - Filter by tenantId + tableName + time range
     *
     * @example
     * // All queries below use this index efficiently:
     * WHERE tenant_id = $1
     * WHERE tenant_id = $1 AND table_name = $2
     * WHERE tenant_id = $1 AND table_name = $2 AND performed_at >= $3
     * WHERE tenant_id = $1 AND performed_at BETWEEN $2 AND $3
     */
    index("idx_audit_tenant").on(table.tenantId, table.tableName, table.performedAt),

    /**
     * Composite index for record-specific history lookups.
     *
     * Column order: (tableName, recordId)
     *
     * Optimizes queries that retrieve the complete change history
     * of a specific record, regardless of tenant (though queries
     * should still filter by tenant for security).
     *
     * @example
     * // Query using this index:
     * WHERE table_name = 'documents' AND record_id = $1
     *
     * // Reconstruct record history:
     * SELECT * FROM audit_logs
     * WHERE table_name = 'documents' AND record_id = $1
     * ORDER BY performed_at ASC
     */
    index("idx_audit_record").on(table.tableName, table.recordId),
  ]
)

/**
 * Type representing valid audit action values.
 * Use this type when inserting audit records programmatically.
 */
export type AuditAction = "INSERT" | "UPDATE" | "DELETE"

/**
 * Type for the audit log record, inferred from the table schema.
 * Useful for typing function parameters and return values.
 */
export type AuditLog = typeof auditLogs.$inferSelect

/**
 * Type for inserting new audit log records.
 * Omits auto-generated fields (id, performedAt).
 */
export type NewAuditLog = typeof auditLogs.$inferInsert
