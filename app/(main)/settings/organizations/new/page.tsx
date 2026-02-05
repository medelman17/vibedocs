/**
 * @fileoverview Create new organization page
 */

import { verifySession } from "@/lib/dal"
import { CreateOrganizationForm } from "./create-organization-form"

export default async function NewOrganizationPage() {
  await verifySession() // Ensure user is authenticated

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Organization</h1>
        <p className="text-muted-foreground">
          Create a new organization to collaborate with your team
        </p>
      </div>

      <CreateOrganizationForm />
    </div>
  )
}
