/**
 * @fileoverview Organization settings page
 *
 * Displays organization details and allows owners/admins to update settings.
 */

import { withTenant } from "@/lib/dal"
import { db } from "@/db"
import { organizations } from "@/db/schema"
import { eq } from "drizzle-orm"
import { OrganizationSettingsForm } from "./organization-settings-form"
import { NotFoundError } from "@/lib/errors"

export default async function OrganizationSettingsPage() {
  const ctx = await withTenant()

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, ctx.tenantId as string),
  })

  if (!organization) {
    throw new NotFoundError("Organization not found")
  }

  const canManage = ["owner", "admin"].includes(ctx.role)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization details and settings
        </p>
      </div>

      <OrganizationSettingsForm
        organization={organization}
        canManage={canManage}
        isOwner={ctx.role === "owner"}
      />
    </div>
  )
}
