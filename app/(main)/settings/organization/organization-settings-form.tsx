"use client"

/**
 * @fileoverview Organization settings form component
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { updateOrganization, deleteOrganization } from "@/app/actions/organizations"

interface Organization {
  id: string
  name: string
  slug: string
  plan: string
  createdAt: Date
}

interface OrganizationSettingsFormProps {
  organization: Organization
  canManage: boolean
  isOwner: boolean
}

export function OrganizationSettingsForm({
  organization,
  canManage,
  isOwner,
}: OrganizationSettingsFormProps) {
  const router = useRouter()
  const [name, setName] = useState(organization.name)
  const [slug, setSlug] = useState(organization.slug)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSave() {
    setSaving(true)
    const result = await updateOrganization({ name, slug })

    if (result.success) {
      toast.success("Organization updated")
      router.refresh()
    } else {
      toast.error(result.error.message)
    }
    setSaving(false)
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteOrganization()

    if (!result.success) {
      toast.error(result.error.message)
      setDeleting(false)
    }
    // On success, user is redirected to onboarding
  }

  const hasChanges = name !== organization.name || slug !== organization.slug

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General Information</CardTitle>
          <CardDescription>
            Update your organization name and URL slug
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage}
              placeholder="Acme Corporation"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              disabled={!canManage}
              placeholder="acme-corp"
              pattern="[a-z0-9-]+"
            />
            <p className="text-sm text-muted-foreground">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>
          <div className="space-y-2">
            <Label>Plan</Label>
            <div className="text-sm font-medium capitalize">{organization.plan}</div>
          </div>
          <div className="space-y-2">
            <Label>Created</Label>
            <div className="text-sm text-muted-foreground">
              {new Date(organization.createdAt).toLocaleDateString()}
            </div>
          </div>
        </CardContent>
        {canManage && (
          <CardFooter>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        )}
      </Card>

      {isOwner && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Permanently delete this organization and all associated data
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  Delete Organization
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the
                    organization &quot;{organization.name}&quot; and remove all
                    associated documents, analyses, and data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? "Deleting..." : "Delete Organization"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
