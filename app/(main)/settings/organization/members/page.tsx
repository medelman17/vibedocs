/**
 * @fileoverview Organization members management page
 */

import { withTenant } from "@/lib/dal"
import { MembersManagement } from "./members-management"

export default async function OrganizationMembersPage() {
  const ctx = await withTenant()

  const canManage = ["owner", "admin"].includes(ctx.role)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Members</h1>
        <p className="text-muted-foreground">
          Manage organization members and invitations
        </p>
      </div>

      <MembersManagement
        canManage={canManage}
        currentUserRole={ctx.role}
        currentUserId={ctx.userId as string}
      />
    </div>
  )
}
