// src/lib/dal.ts
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
