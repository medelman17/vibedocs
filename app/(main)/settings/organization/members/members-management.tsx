"use client"

/**
 * @fileoverview Members management component
 */

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { MoreHorizontal, Mail, UserPlus, Crown, Shield, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getOrganizationMembers,
  getOrganizationInvitations,
  inviteMember,
  updateMemberRole,
  removeMember,
  cancelInvitation,
} from "@/app/actions/organizations"

interface Member {
  id: string
  userId: string
  name: string | null
  email: string
  image: string | null
  role: string
  acceptedAt: Date | null
}

interface Invitation {
  id: string
  email: string
  role: string
  status: string
  expiresAt: Date
  inviterName: string | null
  createdAt: Date
}

interface MembersManagementProps {
  canManage: boolean
  currentUserRole: string
  currentUserId: string
}

const roleIcons = {
  owner: Crown,
  admin: Shield,
  member: User,
}

export function MembersManagement({
  canManage,
  currentUserRole,
  currentUserId,
}: MembersManagementProps) {
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"member" | "admin" | "owner">("member")
  const [inviting, setInviting] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)
  const [removing, setRemoving] = useState(false)
  const [invitationToCancel, setInvitationToCancel] = useState<Invitation | null>(null)
  const [canceling, setCanceling] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [membersResult, invitationsResult] = await Promise.all([
      getOrganizationMembers(),
      canManage ? getOrganizationInvitations() : Promise.resolve({ success: true, data: [] }),
    ])

    if (membersResult.success) {
      setMembers(membersResult.data)
    }
    if (invitationsResult.success) {
      setInvitations(invitationsResult.data)
    }
    setLoading(false)
  }

  async function handleInvite() {
    setInviting(true)
    const result = await inviteMember({ email: inviteEmail, role: inviteRole })

    if (result.success) {
      toast.success("Invitation sent")
      setInviteEmail("")
      setInviteRole("member")
      setInviteOpen(false)
      loadData()
    } else {
      toast.error(result.error.message)
    }
    setInviting(false)
  }

  async function handleUpdateRole(memberId: string, newRole: string) {
    const result = await updateMemberRole({ memberId, role: newRole as "owner" | "admin" | "member" })

    if (result.success) {
      toast.success("Role updated")
      loadData()
    } else {
      toast.error(result.error.message)
    }
  }

  async function handleRemove() {
    if (!memberToRemove) return

    setRemoving(true)
    const result = await removeMember(memberToRemove.id)

    if (result.success) {
      toast.success("Member removed")
      setMemberToRemove(null)
      loadData()
    } else {
      toast.error(result.error.message)
    }
    setRemoving(false)
  }

  async function handleCancelInvitation() {
    if (!invitationToCancel) return

    setCanceling(true)
    const result = await cancelInvitation(invitationToCancel.id)

    if (result.success) {
      toast.success("Invitation cancelled")
      setInvitationToCancel(null)
      loadData()
    } else {
      toast.error(result.error.message)
    }
    setCanceling(false)
  }

  function getRoleIcon(role: string) {
    const Icon = roleIcons[role as keyof typeof roleIcons] || User
    return <Icon className="h-4 w-4" />
  }

  function getInitials(name: string | null, email: string): string {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    }
    return email[0].toUpperCase()
  }

  const canModifyMember = (member: Member) => {
    if (!canManage) return false
    if (member.userId === currentUserId) return false // Can't modify yourself
    if (currentUserRole === "admin" && member.role === "owner") return false
    return true
  }

  return (
    <Tabs defaultValue="members" className="space-y-4">
      <TabsList>
        <TabsTrigger value="members">Members</TabsTrigger>
        {canManage && <TabsTrigger value="invitations">Invitations</TabsTrigger>}
      </TabsList>

      <TabsContent value="members" className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Organization Members</CardTitle>
              <CardDescription>
                {members.length} member{members.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            {canManage && (
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite Member</DialogTitle>
                    <DialogDescription>
                      Send an invitation to join your organization
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="user@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select
                        value={inviteRole}
                        onValueChange={(value) =>
                          setInviteRole(value as "member" | "admin" | "owner")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          {currentUserRole === "owner" && (
                            <SelectItem value="owner">Owner</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleInvite}
                      disabled={!inviteEmail || inviting}
                    >
                      {inviting ? "Sending..." : "Send Invitation"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading members...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    {canManage && <TableHead className="w-[50px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.image || undefined} />
                            <AvatarFallback>
                              {getInitials(member.name, member.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {member.name || "Unknown"}
                            </span>
                            {member.userId === currentUserId && (
                              <span className="text-xs text-muted-foreground">You</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {member.email}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getRoleIcon(member.role)}
                          <span className="capitalize">{member.role}</span>
                        </div>
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          {canModifyMember(member) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Change Role</DropdownMenuLabel>
                                <DropdownMenuItem
                                  onClick={() => handleUpdateRole(member.id, "member")}
                                  disabled={member.role === "member"}
                                >
                                  <User className="mr-2 h-4 w-4" />
                                  Member
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleUpdateRole(member.id, "admin")}
                                  disabled={member.role === "admin"}
                                >
                                  <Shield className="mr-2 h-4 w-4" />
                                  Admin
                                </DropdownMenuItem>
                                {currentUserRole === "owner" && (
                                  <DropdownMenuItem
                                    onClick={() => handleUpdateRole(member.id, "owner")}
                                    disabled={member.role === "owner"}
                                  >
                                    <Crown className="mr-2 h-4 w-4" />
                                    Owner
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setMemberToRemove(member)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  Remove Member
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {canManage && (
        <TabsContent value="invitations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Invitations</CardTitle>
              <CardDescription>
                {invitations.length} pending invitation
                {invitations.length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading invitations...
                </div>
              ) : invitations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No pending invitations
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Invited By</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((invitation) => (
                      <TableRow key={invitation.id}>
                        <TableCell className="font-medium">
                          {invitation.email}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getRoleIcon(invitation.role)}
                            <span className="capitalize">{invitation.role}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {invitation.inviterName || "Unknown"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {invitation.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(invitation.expiresAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInvitationToCancel(invitation)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      )}

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.name || memberToRemove?.email} from
              the organization? They will lose access to all organization resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Removing..." : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Invitation Confirmation Dialog */}
      <AlertDialog
        open={!!invitationToCancel}
        onOpenChange={(open) => !open && setInvitationToCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the invitation to {invitationToCancel?.email}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelInvitation}>
              {canceling ? "Cancelling..." : "Cancel Invitation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  )
}
