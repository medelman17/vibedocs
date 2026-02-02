/**
 * @fileoverview Data Access Layer (DAL) for authenticated session and tenant context.
 *
 * This module provides cached, request-scoped functions for:
 * - Session verification (`verifySession`)
 * - Tenant context with isolation (`withTenant`)
 * - Role-based access control (`requireRole`)
 *
 * ## IMPORTANT: RLS Limitation with Neon HTTP Driver
 *
 * The current implementation uses the Neon HTTP driver (`neon-http`), which executes
 * each query as an independent HTTP request. This means:
 *
 * 1. **RLS session variables do not persist across queries.** The `set_config('app.tenant_id', ...)`
 *    call in `withTenant()` only affects the connection for that single request.
 *    Subsequent queries may execute on different connections without the RLS context.
 *
 * 2. **Tenant isolation is enforced via application-layer filtering (defense-in-depth).**
 *    All query functions in `src/db/queries/*.ts` include explicit `WHERE tenant_id = ?`
 *    clauses, providing actual isolation regardless of RLS state.
 *
 * 3. **The `set_config` call is preserved for forward compatibility.** If we migrate to
 *    the `neon-serverless` WebSocket driver (which maintains connection state), RLS
 *    policies will automatically begin enforcing as a secondary protection layer.
 *
 * This is a known limitation documented in the architecture. For production-grade RLS
 * enforcement, migrate to `neon-serverless` driver with transaction-wrapped queries.
 *
 * @see {@link https://neon.com/docs/serverless/serverless-driver} Neon driver options
 * @see {@link file://../db/queries/documents.ts} Example of defense-in-depth pattern
 *
 * @module lib/dal
 */

import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"
import { auth } from "./auth"
import { db } from "@/db"
import { organizationMembers } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { sql } from "drizzle-orm"
import {
  asTenantId,
  asUserId,
  type TenantId,
  type UserId,
  type SessionContext,
  type TenantContext,
  type RoleContext,
  type Role,
  isAllowedRole,
} from "./types"

export type { SessionContext, TenantContext, RoleContext, Role }
export { asTenantId, asUserId, type TenantId, type UserId }

export const verifySession = cache(async (): Promise<SessionContext> => {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  return {
    userId: asUserId(session.user.id),
    user: session.user,
    activeOrganizationId: session.activeOrganizationId
      ? asTenantId(session.activeOrganizationId)
      : null,
  }
})

export const withTenant = cache(async (): Promise<TenantContext> => {
  const session = await verifySession()

  if (!session.activeOrganizationId) {
    redirect("/onboarding")
  }

  const tenantId = session.activeOrganizationId

  // Verify user is member of this organization
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, session.userId as string),
      eq(organizationMembers.organizationId, tenantId as string)
    ),
  })

  if (!membership) {
    redirect("/onboarding")
  }

  // Set RLS context for the current request
  await db.execute(
    sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
  )

  return {
    ...session,
    activeOrganizationId: tenantId,
    tenantId,
    role: membership.role as Role,
    db,
  }
})

export const requireRole = cache(
  async <R extends Role>(
    allowedRoles: readonly R[]
  ): Promise<RoleContext<R>> => {
    const ctx = await withTenant()

    if (!isAllowedRole(ctx.role, allowedRoles)) {
      redirect("/dashboard?error=unauthorized")
    }

    return ctx as RoleContext<R>
  }
)
