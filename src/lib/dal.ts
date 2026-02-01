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
