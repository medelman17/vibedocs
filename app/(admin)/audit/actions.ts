"use server"

/**
 * @fileoverview Audit Server Actions
 *
 * This module provides Server Actions for viewing audit logs.
 * Audit logs track all data changes (INSERT, UPDATE, DELETE) to tenant-scoped
 * tables for compliance, debugging, and security monitoring.
 *
 * ## Available Actions
 *
 * - **getAuditLogs**: View paginated audit log history with optional filters
 *
 * ## Role Requirements
 *
 * | Action       | Required Role(s)    |
 * |--------------|---------------------|
 * | getAuditLogs | admin or owner      |
 *
 * @module app/(admin)/audit/actions
 */

import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { ok, err, wrapError, type ApiResponse } from "@/lib/api-response"
import { auditLogs } from "@/db/schema"
import { eq, and, desc, sql } from "drizzle-orm"

// ============================================================================
// Types
// ============================================================================

/**
 * Valid audit action types matching the database schema.
 */
export type AuditAction = "INSERT" | "UPDATE" | "DELETE"

/**
 * Audit log record type for API responses.
 * Uses string dates for JSON serialization compatibility.
 */
export type AuditLogResponse = {
  id: string
  tenantId: string
  tableName: string
  recordId: string
  action: string
  oldValues: unknown
  newValues: unknown
  userId: string | null
  ipAddress: string | null
  performedAt: string
}

/**
 * Paginated audit logs response.
 */
export type AuditLogsResult = {
  logs: AuditLogResponse[]
  total: number
}

// ============================================================================
// Schemas
// ============================================================================

/**
 * Schema for getAuditLogs input validation.
 * All fields are optional for flexible querying.
 */
const getAuditLogsSchema = z.object({
  /** Filter by table name (e.g., "documents", "analyses") */
  tableName: z.string().optional(),
  /** Filter by action type */
  action: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
  /** Filter by user who performed the action */
  userId: z.string().uuid("Invalid user ID").optional(),
  /** Maximum number of records to return (1-100, default 50) */
  limit: z.number().int().min(1).max(100).default(50),
  /** Number of records to skip for pagination (default 0) */
  offset: z.number().int().min(0).default(0),
})

/**
 * Input type for getAuditLogs action.
 */
export type GetAuditLogsInput = z.input<typeof getAuditLogsSchema>

// ============================================================================
// Actions
// ============================================================================

/**
 * Retrieves paginated audit logs for the current tenant.
 *
 * This action requires `admin` or `owner` role. Audit logs are scoped to the
 * current tenant via RLS and include optional filtering by table name,
 * action type, and user ID.
 *
 * The results are ordered by most recent first (descending by performedAt).
 *
 * @param input - Optional filter and pagination parameters
 * @param input.tableName - Filter logs by table name (e.g., "documents")
 * @param input.action - Filter by action type ("INSERT", "UPDATE", "DELETE")
 * @param input.userId - Filter by user who performed the action
 * @param input.limit - Maximum records to return (1-100, default 50)
 * @param input.offset - Records to skip for pagination (default 0)
 *
 * @returns Success with paginated logs and total count, or error response
 *
 * @example
 * ```typescript
 * // Get recent audit logs (default pagination)
 * const result = await getAuditLogs()
 *
 * // Get document changes only
 * const result = await getAuditLogs({ tableName: "documents" })
 *
 * // Get all DELETE operations
 * const result = await getAuditLogs({ action: "DELETE" })
 *
 * // Get changes by a specific user with pagination
 * const result = await getAuditLogs({
 *   userId: "user-uuid-here",
 *   limit: 20,
 *   offset: 40, // Page 3 of 20
 * })
 *
 * if (result.success) {
 *   const { logs, total } = result.data
 *   console.log(`Showing ${logs.length} of ${total} logs`)
 * }
 * ```
 */
export async function getAuditLogs(
  input?: GetAuditLogsInput
): Promise<ApiResponse<AuditLogsResult>> {
  try {
    // Requires admin or owner role
    const { db, tenantId } = await requireRole(["admin", "owner"])

    // Validate and parse input with defaults
    const parsed = getAuditLogsSchema.safeParse(input ?? {})
    if (!parsed.success) {
      return err(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid input"
      )
    }

    const { tableName, action, userId, limit, offset } = parsed.data

    // Build where conditions - always filter by tenant
    const conditions = [eq(auditLogs.tenantId, tenantId)]

    if (tableName) {
      conditions.push(eq(auditLogs.tableName, tableName))
    }
    if (action) {
      conditions.push(eq(auditLogs.action, action))
    }
    if (userId) {
      conditions.push(eq(auditLogs.userId, userId))
    }

    // Get logs with pagination, ordered by most recent first
    const logs = await db.query.auditLogs.findMany({
      where: and(...conditions),
      orderBy: desc(auditLogs.performedAt),
      limit,
      offset,
    })

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(and(...conditions))

    const total = countResult?.count ?? 0

    // Transform logs for JSON serialization (convert dates to ISO strings)
    const logsResponse: AuditLogResponse[] = logs.map((log) => ({
      id: log.id,
      tenantId: log.tenantId,
      tableName: log.tableName,
      recordId: log.recordId,
      action: log.action,
      oldValues: log.oldValues,
      newValues: log.newValues,
      userId: log.userId,
      ipAddress: log.ipAddress,
      performedAt: log.performedAt.toISOString(),
    }))

    return ok({
      logs: logsResponse,
      total,
    })
  } catch (error) {
    return wrapError(error)
  }
}
