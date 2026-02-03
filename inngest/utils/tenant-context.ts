// src/inngest/utils/tenant-context.ts
/**
 * @fileoverview Tenant Context Utilities for Inngest Functions
 *
 * Provides tenant isolation for Inngest functions. Unlike src/lib/dal.ts
 * (React Server Components with redirects), these work in Inngest context.
 *
 * Key differences:
 * - No React cache() - Inngest functions aren't React components
 * - No redirect() - Inngest handles errors via retry/fail
 * - No membership verification - event payloads are trusted
 *
 * @module inngest/utils/tenant-context
 */

import { db } from "@/db"
import { sql } from "drizzle-orm"
import { NonRetriableError, NotFoundError } from "./errors"

/**
 * Tenant context with database and tenant ID.
 */
export interface TenantContext {
  /** Database instance with RLS context set */
  db: typeof db
  /** The tenant ID that was set */
  tenantId: string
}

/**
 * Set RLS context for database session.
 *
 * Call at start of any Inngest step accessing tenant-scoped data.
 *
 * @throws {NonRetriableError} If tenantId is missing or invalid UUID
 *
 * @example
 * const result = await step.run("load-document", async () => {
 *   const { db } = await setTenantContext(event.data.tenantId)
 *   return await db.query.documents.findFirst({
 *     where: eq(documents.id, event.data.documentId)
 *   })
 * })
 */
export async function setTenantContext(tenantId: string): Promise<TenantContext> {
  if (!tenantId) {
    throw new NonRetriableError("tenantId is required for tenant-scoped operations")
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(tenantId)) {
    throw new NonRetriableError(`Invalid tenantId format: ${tenantId}`)
  }

  // Set RLS context (transaction-local via 'true' parameter)
  await db.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)

  return { db, tenantId }
}

/**
 * Execute function with tenant context.
 *
 * @example
 * const result = await step.run("process", async () => {
 *   return withTenantContext(event.data.tenantId, async ({ db }) => {
 *     const doc = await db.query.documents.findFirst({ ... })
 *     await db.insert(analyses).values({ ... })
 *     return { doc }
 *   })
 * })
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (ctx: TenantContext) => Promise<T>
): Promise<T> {
  const ctx = await setTenantContext(tenantId)
  return fn(ctx)
}

/**
 * Verify resource belongs to tenant. Defense-in-depth check.
 *
 * @throws {NotFoundError} If resource doesn't exist or belongs to different tenant
 */
export async function verifyTenantOwnership(
  tableName: string,
  resourceId: string,
  tenantId: string
): Promise<void> {
  const result = await db.execute(
    sql`SELECT tenant_id FROM ${sql.identifier(tableName)} WHERE id = ${resourceId}`
  )

  const rows = result.rows as Array<{ tenant_id: string }>
  if (rows.length === 0) {
    throw new NotFoundError(tableName, resourceId)
  }

  if (rows[0].tenant_id !== tenantId) {
    console.error(
      `Tenant ownership mismatch: ${tableName}/${resourceId} belongs to ${rows[0].tenant_id}, not ${tenantId}`
    )
    throw new NotFoundError(tableName, resourceId)
  }
}
