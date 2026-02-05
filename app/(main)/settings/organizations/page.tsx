/**
 * @fileoverview User's organizations page
 *
 * Shows all organizations the user belongs to and pending invitations.
 */

import { verifySession } from "@/lib/dal"
import { OrganizationsList } from "./organizations-list"

export default async function OrganizationsPage() {
  await verifySession() // Ensure user is authenticated

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your Organizations</h1>
        <p className="text-muted-foreground">
          Manage your organization memberships and invitations
        </p>
      </div>

      <OrganizationsList />
    </div>
  )
}
