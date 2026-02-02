"use server"

import { z } from "zod"
import { withTenant, requireRole } from "@/lib/dal"
import { ok, err, type ApiResponse } from "@/lib/api-response"
import { organizationMembers, users, organizations } from "@/db/schema"
import { sendInvitationEmail } from "@/lib/email"
import { eq, and, sql } from "drizzle-orm"
import { db } from "@/db"

// ============================================================================
// Types
// ============================================================================

export type OrganizationMember = {
  id: string
  user: {
    id: string
    name: string | null
    email: string
    image: string | null
  }
  role: string
  acceptedAt: Date | null
  invitedAt: Date | null
}

// ============================================================================
// Schemas
// ============================================================================

const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member"], {
    message: "Role must be admin or member",
  }),
})

const updateMemberRoleSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  role: z.enum(["admin", "member"], {
    message: "Role must be admin or member",
  }),
})

// ============================================================================
// 1. getOrganizationMembers - List all members
// ============================================================================

export async function getOrganizationMembers(): Promise<
  ApiResponse<OrganizationMember[]>
> {
  const { tenantId } = await withTenant()

  const members = await db
    .select({
      id: organizationMembers.id,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      acceptedAt: organizationMembers.acceptedAt,
      invitedAt: organizationMembers.invitedAt,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, tenantId))

  const result: OrganizationMember[] = members.map((m) => ({
    id: m.id,
    user: {
      id: m.userId,
      name: m.userName,
      email: m.userEmail,
      image: m.userImage,
    },
    role: m.role,
    acceptedAt: m.acceptedAt,
    invitedAt: m.invitedAt,
  }))

  return ok(result)
}

// ============================================================================
// 2. inviteMember - Invite user to organization
// ============================================================================

export async function inviteMember(
  input: z.infer<typeof inviteMemberSchema>
): Promise<ApiResponse<{ membershipId: string }>> {
  const { tenantId, userId: currentUserId } = await requireRole([
    "admin",
    "owner",
  ])

  const parsed = inviteMemberSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message)
  }

  const { email, role } = parsed.data

  // Find or create user
  let targetUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  if (!targetUser) {
    // Create a placeholder user for the invitation
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        name: null,
      })
      .returning()
    targetUser = newUser
  }

  // Check if user is already a member
  const existingMembership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, tenantId),
      eq(organizationMembers.userId, targetUser.id)
    ),
  })

  if (existingMembership) {
    if (existingMembership.acceptedAt) {
      return err("CONFLICT", "User is already a member of this organization")
    }
    return err("CONFLICT", "User has already been invited to this organization")
  }

  // Create pending membership
  const [membership] = await db
    .insert(organizationMembers)
    .values({
      organizationId: tenantId,
      userId: targetUser.id,
      role,
      invitedBy: currentUserId,
      invitedAt: new Date(),
      acceptedAt: null,
    })
    .returning()

  // Send invitation email
  // Get inviter name and organization name for the email
  const [inviter, organization] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, currentUserId) }),
    db.query.organizations.findFirst({ where: eq(organizations.id, tenantId) }),
  ])

  const inviterName = inviter?.name || inviter?.email || "A team member"
  const organizationName = organization?.name || "your organization"
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invitations/${membership.id}`

  // Send email (don't block on failure)
  sendInvitationEmail({
    to: email,
    inviterName,
    organizationName,
    inviteUrl,
  }).catch((error) => {
    console.error("[inviteMember] Failed to send invitation email:", error)
  })

  return ok({ membershipId: membership.id })
}

// ============================================================================
// 3. resendInvitation - Resend invitation email
// ============================================================================

export async function resendInvitation(
  membershipId: string
): Promise<ApiResponse<void>> {
  const { tenantId, userId: currentUserId } = await requireRole(["admin", "owner"])

  // Validate membership ID
  const uuidSchema = z.string().uuid()
  const parsed = uuidSchema.safeParse(membershipId)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid membership ID")
  }

  // Find the membership
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.id, membershipId),
      eq(organizationMembers.organizationId, tenantId)
    ),
  })

  if (!membership) {
    return err("NOT_FOUND", "Membership not found")
  }

  // Check if invitation is pending
  if (membership.acceptedAt) {
    return err("BAD_REQUEST", "Cannot resend invitation - member has already accepted")
  }

  // Update invitedAt timestamp
  await db
    .update(organizationMembers)
    .set({ invitedAt: new Date() })
    .where(eq(organizationMembers.id, membershipId))

  // Send invitation email
  // Get invited user, inviter name, and organization name for the email
  const [invitedUser, inviter, organization] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, membership.userId) }),
    db.query.users.findFirst({ where: eq(users.id, currentUserId) }),
    db.query.organizations.findFirst({ where: eq(organizations.id, tenantId) }),
  ])

  if (invitedUser?.email) {
    const inviterName = inviter?.name || inviter?.email || "A team member"
    const organizationName = organization?.name || "your organization"
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invitations/${membershipId}`

    // Send email (don't block on failure)
    sendInvitationEmail({
      to: invitedUser.email,
      inviterName,
      organizationName,
      inviteUrl,
    }).catch((error) => {
      console.error("[resendInvitation] Failed to send invitation email:", error)
    })
  }

  return ok(undefined)
}

// ============================================================================
// 4. cancelInvitation - Cancel pending invitation
// ============================================================================

export async function cancelInvitation(
  membershipId: string
): Promise<ApiResponse<void>> {
  const { tenantId } = await requireRole(["admin", "owner"])

  // Validate membership ID
  const uuidSchema = z.string().uuid()
  const parsed = uuidSchema.safeParse(membershipId)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid membership ID")
  }

  // Find the membership
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.id, membershipId),
      eq(organizationMembers.organizationId, tenantId)
    ),
  })

  if (!membership) {
    return err("NOT_FOUND", "Membership not found")
  }

  // Check if invitation is pending
  if (membership.acceptedAt) {
    return err(
      "BAD_REQUEST",
      "Cannot cancel invitation - member has already accepted"
    )
  }

  // Delete the membership record
  await db
    .delete(organizationMembers)
    .where(eq(organizationMembers.id, membershipId))

  return ok(undefined)
}

// ============================================================================
// 5. updateMemberRole - Change member's role
// ============================================================================

export async function updateMemberRole(
  input: z.infer<typeof updateMemberRoleSchema>
): Promise<ApiResponse<void>> {
  const { tenantId } = await requireRole(["owner"])

  const parsed = updateMemberRoleSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message)
  }

  const { userId: targetUserId, role } = parsed.data

  // Find the membership
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, tenantId),
      eq(organizationMembers.userId, targetUserId)
    ),
  })

  if (!membership) {
    return err("NOT_FOUND", "Member not found in this organization")
  }

  // Cannot change owner's role
  if (membership.role === "owner") {
    return err("FORBIDDEN", "Cannot change the role of an owner")
  }

  // Update the role
  await db
    .update(organizationMembers)
    .set({ role })
    .where(
      and(
        eq(organizationMembers.organizationId, tenantId),
        eq(organizationMembers.userId, targetUserId)
      )
    )

  return ok(undefined)
}

// ============================================================================
// 6. removeMember - Remove member (admin action)
// ============================================================================

export async function removeMember(userId: string): Promise<ApiResponse<void>> {
  const { tenantId, userId: currentUserId } = await requireRole([
    "admin",
    "owner",
  ])

  // Validate user ID
  const uuidSchema = z.string().uuid()
  const parsed = uuidSchema.safeParse(userId)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid user ID")
  }

  // Cannot remove yourself using this action
  if (userId === currentUserId) {
    return err("BAD_REQUEST", "Use leaveOrganization to remove yourself")
  }

  // Find the membership
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, tenantId),
      eq(organizationMembers.userId, userId)
    ),
  })

  if (!membership) {
    return err("NOT_FOUND", "Member not found in this organization")
  }

  // Check if removing an owner
  if (membership.role === "owner") {
    // Count owners to ensure not removing last owner
    const ownerCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, tenantId),
          eq(organizationMembers.role, "owner")
        )
      )

    const ownerCount = ownerCountResult[0]?.count ?? 0

    if (ownerCount <= 1) {
      return err(
        "BAD_REQUEST",
        "Cannot remove the last owner of the organization"
      )
    }
  }

  // Delete the membership
  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, tenantId),
        eq(organizationMembers.userId, userId)
      )
    )

  return ok(undefined)
}

// ============================================================================
// 7. leaveOrganization - Self-initiated leave
// ============================================================================

export async function leaveOrganization(): Promise<ApiResponse<void>> {
  const { tenantId, userId } = await withTenant()

  // Find the membership
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, tenantId),
      eq(organizationMembers.userId, userId)
    ),
  })

  if (!membership) {
    return err("NOT_FOUND", "You are not a member of this organization")
  }

  // If user is an owner, check if they are the last owner
  if (membership.role === "owner") {
    const ownerCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, tenantId),
          eq(organizationMembers.role, "owner")
        )
      )

    const ownerCount = ownerCountResult[0]?.count ?? 0

    if (ownerCount <= 1) {
      return err(
        "BAD_REQUEST",
        "Cannot leave - you are the last owner. Transfer ownership first or delete the organization."
      )
    }
  }

  // Delete own membership
  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, tenantId),
        eq(organizationMembers.userId, userId)
      )
    )

  return ok(undefined)
}
