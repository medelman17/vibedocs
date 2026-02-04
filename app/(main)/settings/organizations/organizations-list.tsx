"use client"

/**
 * @fileoverview Organizations list component
 */

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2, Mail, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  getUserOrganizations,
  getUserInvitations,
  acceptInvitation,
  declineInvitation,
} from "@/app/actions/organizations"

interface Organization {
  id: string
  name: string
  slug: string
  role: string
  memberCount: number
}

interface Invitation {
  id: string
  token: string
  organizationName: string
  organizationSlug: string
  role: string
  expiresAt: Date
  inviterName: string | null
}

export function OrganizationsList() {
  const router = useRouter()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [orgsResult, invitesResult] = await Promise.all([
      getUserOrganizations(),
      getUserInvitations(),
    ])

    if (orgsResult.success) {
      setOrganizations(orgsResult.data)
    }
    if (invitesResult.success) {
      setInvitations(invitesResult.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Data fetching on mount is a valid pattern
    loadData()
  }, [loadData])

  async function handleAccept(token: string) {
    setProcessing(token)
    const result = await acceptInvitation(token)

    if (result.success) {
      toast.success("Invitation accepted")
      loadData()
      router.refresh()
    } else {
      toast.error(result.error.message)
    }
    setProcessing(null)
  }

  async function handleDecline(token: string) {
    setProcessing(token)
    const result = await declineInvitation(token)

    if (result.success) {
      toast.success("Invitation declined")
      loadData()
    } else {
      toast.error(result.error.message)
    }
    setProcessing(null)
  }

  return (
    <div className="space-y-6">
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              You have {invitations.length} pending invitation
              {invitations.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{invitation.organizationName}</p>
                    <p className="text-sm text-muted-foreground">
                      Invited as{" "}
                      <span className="capitalize">{invitation.role}</span>
                      {invitation.inviterName && ` by ${invitation.inviterName}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleAccept(invitation.token)}
                    disabled={processing === invitation.token}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDecline(invitation.token)}
                    disabled={processing === invitation.token}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Your Organizations</CardTitle>
            <CardDescription>
              {organizations.length} organization
              {organizations.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
          <Button onClick={() => router.push("/settings/organizations/new")}>
            <Building2 className="mr-2 h-4 w-4" />
            Create Organization
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading organizations...
            </div>
          ) : organizations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No organizations yet
            </div>
          ) : (
            <div className="space-y-3">
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer"
                  onClick={() => router.push("/settings/organization")}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{org.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {org.memberCount} member{org.memberCount !== 1 ? "s" : ""} ·{" "}
                        <span className="capitalize">{org.role}</span>
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {org.role}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
