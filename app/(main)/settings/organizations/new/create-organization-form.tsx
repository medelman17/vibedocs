"use client"

/**
 * @fileoverview Create organization form component
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
import { createOrganization, switchOrganization } from "@/app/actions/organizations"

export function CreateOrganizationForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [creating, setCreating] = useState(false)

  // Auto-generate slug from name
  function handleNameChange(value: string) {
    setName(value)
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value))
    }
  }

  function generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name || !slug) {
      toast.error("Please fill in all fields")
      return
    }

    setCreating(true)
    const result = await createOrganization({ name, slug })

    if (result.success) {
      toast.success("Organization created")

      // Switch to the new organization
      const switchResult = await switchOrganization(result.data.id)
      if (switchResult.success) {
        router.push("/dashboard")
        router.refresh()
      } else {
        router.push("/settings/organizations")
      }
    } else {
      toast.error(result.error.message)
      setCreating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>
            Choose a name and URL for your new organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Corporation"
              required
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(generateSlug(e.target.value))}
              placeholder="acme-corp"
              pattern="[a-z0-9-]+"
              required
              maxLength={50}
            />
            <p className="text-sm text-muted-foreground">
              Lowercase letters, numbers, and hyphens only. This will be used in URLs.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={creating || !name || !slug}>
            {creating ? "Creating..." : "Create Organization"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
