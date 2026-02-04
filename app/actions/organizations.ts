"use server"

/**
 * @fileoverview Server actions for organization management
 *
 * This module provides server actions for organization CRUD operations,
 * member management, and organization switching.
 *
 * @module app/actions/organizations
 */

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { db } from "@/db"
import {
  organizations,
  organizationMembers,
  organizationInvitations,
  sessions,
  users,
} from "@/db/schema"
import { eq, and, isNull, isNotNull, inArray, gt } from "drizzle-orm"
import {
  verifySession,
  requireRole,
  type TenantId,
  type UserId,
} from "@/lib/dal"
import { auth } from "@/lib/auth"
import {
  actionSuccess,
  actionError,
  withActionErrorHandling,
  type ActionResult,
} from "@/lib/api-utils"
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from "@/lib/errors"
import crypto from "crypto"

// ============================================================================
// Validation Schemas
// ============================================================================

const createOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
})

const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
})

const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["member", "admin", "owner"]).default("member"),
})

const updateMemberRoleSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(["member", "admin", "owner"]),
})

// ============================================================================
// Organization CRUD
// ============================================================================

/**
 * Create a new organization
 */
export async function createOrganization(
  input: z.infer<typeof createOrganizationSchema>
): Promise<ActionResult<{ id: string }>> {
  return withActionErrorHandling(async () => {
    const session = await verifySession()
    const parsed = createOrganizationSchema.safeParse(input)

    if (!parsed.success) {
      throw ValidationError.fromZodError(parsed.error)
    }

    const { name, slug } = parsed.data

    // Check if slug already exists
    const existing = await db.query.organizations.findFirst({
      where: and(eq(organizations.slug, slug), isNull(organizations.deletedAt)),
    })

    if (existing) {
      throw new ConflictError("Organization slug already exists")
    }

    // Create organization and add user as owner
    const [org] = await db
      .insert(organizations)
      .values({ name, slug })
      .returning()

    await db.insert(organizationMembers).values({
      organizationId: org.id,
      userId: session.userId as string,
      role: "owner",
      acceptedAt: new Date(),
    })

    revalidatePath("/settings/organizations")
    return actionSuccess({ id: org.id })
  })()
}

/**
 * Update organization details
 */
export async function updateOrganization(
  input: z.infer<typeof updateOrganizationSchema>
): Promise<ActionResult<{ id: string }>> {
  return withActionErrorHandling(async () => {
    const ctx = await requireRole(["owner", "admin"])
    const parsed = updateOrganizationSchema.safeParse(input)

    if (!parsed.success) {
      throw ValidationError.fromZodError(parsed.error)
    }

    const updates = parsed.data
    if (Object.keys(updates).length === 0) {
      throw new ValidationError("No updates provided")
    }

    // If updating slug, check for conflicts
    if (updates.slug) {
      const existing = await db.query.organizations.findFirst({
        where: and(
          eq(organizations.slug, updates.slug),
          isNull(organizations.deletedAt)
        ),
      })

      if (existing && existing.id !== ctx.tenantId) {
        throw new ConflictError("Organization slug already exists")
      }
    }

    await ctx.db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, ctx.tenantId as string))

    revalidatePath("/settings/organization")
    return actionSuccess({ id: ctx.tenantId as string })
  })()
}

/**
 * Delete (soft delete) an organization
 */
export async function deleteOrganization(): Promise<ActionResult<void>> {
  return withActionErrorHandling(async () => {
    const ctx = await requireRole(["owner"])

    await ctx.db
      .update(organizations)
      .set({ deletedAt: new Date() })
      .where(eq(organizations.id, ctx.tenantId as string))

    revalidatePath("/settings/organizations")
    redirect("/onboarding")
  })()
}

// ============================================================================
// Organization Switching
// ============================================================================

/**
 * Get all organizations the current user belongs to
 */
export async function getUserOrganizations(): Promise<
  ActionResult<
    Array<{
      id: string
      name: string
      slug: string
      role: string
      memberCount: number
    }>
  >
> {
  return withActionErrorHandling(async () => {
    const session = await verifySession()

    const memberships = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMembers.organizationId)
      )
      .where(
        and(
          eq(organizationMembers.userId, session.userId as string),
          isNotNull(organizationMembers.acceptedAt),
          isNull(organizations.deletedAt)
        )
      )

    // Get member counts for each org
    const orgsWithCounts = await Promise.all(
      memberships.map(async (org) => {
        const [result] = await db
          .select({ count: db.$count(organizationMembers.id) })
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, org.id),
              isNotNull(organizationMembers.acceptedAt)
            )
          )

        return {
          ...org,
          memberCount: result?.count ?? 0,
        }
      })
    )

    return actionSuccess(orgsWithCounts)
  })()
}

/**
 * Switch the active organization in the session
 */
export async function switchOrganization(
  organizationId: string
): Promise<ActionResult<void>> {
  return withActionErrorHandling(async () => {
    const session = await verifySession()

    // Verify user is a member of this organization
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, session.userId as string),
        isNotNull(organizationMembers.acceptedAt)
      ),
    })

    if (!membership) {
      throw new ForbiddenError(
        "You are not a member of this organization"
      )
    }

    // Update session
    const authSession = await auth()
    if (!authSession?.user?.id) {
      throw new Error("No active session")
    }

    await db
      .update(sessions)
      .set({ activeOrganizationId: organizationId })
      .where(eq(sessions.userId, authSession.user.id))

    revalidatePath("/", "layout")
    return actionSuccess(undefined)
  })()
}

// ============================================================================
// Member Management
// ============================================================================

/**
 * Get all members of the current organization
 */
export async function getOrganizationMembers(): Promise<
  ActionResult<
    Array<{
      id: string
      userId: string
      name: string | null
      email: string
      image: string | null
      role: string
      acceptedAt: Date | null
      invitedBy: string | null
    }>
  >
> {
  return withActionErrorHandling(async () => {
    const ctx = await requireRole(["owner", "admin", "member"])

    const members = await ctx.db
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        name: users.name,
        email: users.email,
        image: users.image,
        role: organizationMembers.role,
        acceptedAt: organizationMembers.acceptedAt,
        invitedBy: organizationMembers.invitedBy,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, ctx.tenantId as string))
      .orderBy(organizationMembers.createdAt)

    return actionSuccess(members)
  })()
}

/**
 * Update a member's role
 */
export async function updateMemberRole(
  input: z.infer<typeof updateMemberRoleSchema>
): Promise<ActionResult<void>> {
  return withActionErrorHandling(async () => {
    const ctx = await requireRole(["owner", "admin"])
    const parsed = updateMemberRoleSchema.safeParse(input)

    if (!parsed.success) {
      throw ValidationError.fromZodError(parsed.error)
    }

    const { memberId, role } = parsed.data

    // Only owners can assign owner role
    if (role === "owner" && ctx.role !== "owner") {
      throw new ForbiddenError("Only owners can assign owner role")
    }

    // Admins cannot modify owners
    if (ctx.role === "admin") {
      const targetMember = await ctx.db.query.organizationMembers.findFirst({
        where: eq(organizationMembers.id, memberId),
      })

      if (targetMember?.role === "owner") {
        throw new ForbiddenError("Admins cannot modify owners")
      }
    }

    await ctx.db
      .update(organizationMembers)
      .set({ role })
      .where(
        and(
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.organizationId, ctx.tenantId as string)
        )
      )

    revalidatePath("/settings/organization/members")
    return actionSuccess(undefined)
  })()
}

/**
 * Remove a member from the organization
 */
export async function removeMember(memberId: string): Promise<ActionResult<void>> {
  return withActionErrorHandling(async () => {
    const ctx = await requireRole(["owner", "admin"])

    const member = await ctx.db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.id, memberId),
        eq(organizationMembers.organizationId, ctx.tenantId as string)
      ),
    })

    if (!member) {
      throw new NotFoundError("Member not found")
    }

    // Prevent removing yourself if you're the only owner
    if (member.userId === ctx.userId && member.role === "owner") {
      const ownerCount = await ctx.db
        .select({ count: db.$count(organizationMembers.id) })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, ctx.tenantId as string),
            eq(organizationMembers.role, "owner")
          )
        )

      if (ownerCount[0]?.count === 1) {
        throw new ForbiddenError(
          "Cannot remove the only owner. Transfer ownership first."
        )
      }
    }

    // Admins cannot remove owners
    if (ctx.role === "admin" && member.role === "owner") {
      throw new ForbiddenError("Admins cannot remove owners")
    }

    await ctx.db
      .delete(organizationMembers)
      .where(eq(organizationMembers.id, memberId))

    revalidatePath("/settings/organization/members")
    return actionSuccess(undefined)
  })()
}

// ============================================================================
// Invitations
// ============================================================================

/**
 * Get pending invitations for the current organization
 */
export async function getOrganizationInvitations(): Promise<
  ActionResult<
    Array<{
      id: string
      email: string
      role: string
      status: string
      expiresAt: Date
      inviterName: string | null
      createdAt: Date
    }>
  >
> {
  return withActionErrorHandling(async () => {
    const ctx = await requireRole(["owner", "admin"])

    const invitations = await ctx.db
      .select({
        id: organizationInvitations.id,
        email: organizationInvitations.email,
        role: organizationInvitations.role,
        status: organizationInvitations.status,
        expiresAt: organizationInvitations.expiresAt,
        inviterName: users.name,
        createdAt: organizationInvitations.createdAt,
      })
      .from(organizationInvitations)
      .innerJoin(users, eq(users.id, organizationInvitations.invitedBy))
      .where(
        eq(organizationInvitations.organizationId, ctx.tenantId as string)
      )
      .orderBy(organizationInvitations.createdAt)

    return actionSuccess(invitations)
  })()
}

/**
 * Get pending invitations for the current user
 */
export async function getUserInvitations(): Promise<
  ActionResult<
    Array<{
      id: string
      token: string
      organizationName: string
      organizationSlug: string
      role: string
      expiresAt: Date
      inviterName: string | null
    }>
  >
> {
  return withActionErrorHandling(async () => {
    const session = await verifySession()
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId as string),
    })

    if (!user) {
      throw new NotFoundError("User not found")
    }

    const invitations = await db
      .select({
        id: organizationInvitations.id,
        token: organizationInvitations.token,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        role: organizationInvitations.role,
        expiresAt: organizationInvitations.expiresAt,
        inviterName: users.name,
      })
      .from(organizationInvitations)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationInvitations.organizationId)
      )
      .innerJoin(users, eq(users.id, organizationInvitations.invitedBy))
      .where(
        and(
          eq(organizationInvitations.email, user.email),
          eq(organizationInvitations.status, "pending"),
          gt(organizationInvitations.expiresAt, new Date())
        )
      )

    return actionSuccess(invitations)
  })()
}

/**
 * Invite a new member to the organization
 */
export async function inviteMember(
  input: z.infer<typeof inviteMemberSchema>
): Promise<ActionResult<{ id: string }>> {
  return withActionErrorHandling(async () => {
    const ctx = await requireRole(["owner", "admin"])
    const parsed = inviteMemberSchema.safeParse(input)

    if (!parsed.success) {
      throw ValidationError.fromZodError(parsed.error)
    }

    const { email, role } = parsed.data

    // Only owners can invite owners
    if (role === "owner" && ctx.role !== "owner") {
      throw new ForbiddenError("Only owners can invite owners")
    }

    // Check if user is already a member
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    })

    if (existingUser) {
      const existingMember = await ctx.db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, ctx.tenantId as string),
          eq(organizationMembers.userId, existingUser.id)
        ),
      })

      if (existingMember) {
        throw new ConflictError("User is already a member")
      }
    }

    // Check for pending invitation
    const pendingInvitation =
      await ctx.db.query.organizationInvitations.findFirst({
        where: and(
          eq(organizationInvitations.organizationId, ctx.tenantId as string),
          eq(organizationInvitations.email, email),
          eq(organizationInvitations.status, "pending"),
          gt(organizationInvitations.expiresAt, new Date())
        ),
      })

    if (pendingInvitation) {
      throw new ConflictError("Pending invitation already exists")
    }

    // Create invitation
    const token = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const [invitation] = await ctx.db
      .insert(organizationInvitations)
      .values({
        organizationId: ctx.tenantId as string,
        email,
        role,
        token,
        invitedBy: ctx.userId as string,
        status: "pending",
        expiresAt,
      })
      .returning()

    // TODO: Send invitation email via Resend
    // await sendInvitationEmail({ email, token, organizationName: org.name })

    revalidatePath("/settings/organization/members")
    return actionSuccess({ id: invitation.id })
  })()
}

/**
 * Accept an invitation
 */
export async function acceptInvitation(
  token: string
): Promise<ActionResult<{ organizationId: string }>> {
  return withActionErrorHandling(async () => {
    const session = await verifySession()
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId as string),
    })

    if (!user) {
      throw new NotFoundError("User not found")
    }

    const invitation = await db.query.organizationInvitations.findFirst({
      where: and(
        eq(organizationInvitations.token, token),
        eq(organizationInvitations.email, user.email),
        eq(organizationInvitations.status, "pending"),
        gt(organizationInvitations.expiresAt, new Date())
      ),
    })

    if (!invitation) {
      throw new NotFoundError("Invitation not found or expired")
    }

    // Accept invitation in a transaction
    await db.transaction(async (tx) => {
      // Mark invitation as accepted
      await tx
        .update(organizationInvitations)
        .set({ status: "accepted" })
        .where(eq(organizationInvitations.id, invitation.id))

      // Create membership
      await tx.insert(organizationMembers).values({
        organizationId: invitation.organizationId,
        userId: session.userId as string,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.createdAt,
        acceptedAt: new Date(),
      })
    })

    revalidatePath("/settings/organizations")
    return actionSuccess({ organizationId: invitation.organizationId })
  })()
}

/**
 * Decline an invitation
 */
export async function declineInvitation(
  token: string
): Promise<ActionResult<void>> {
  return withActionErrorHandling(async () => {
    const session = await verifySession()
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId as string),
    })

    if (!user) {
      throw new NotFoundError("User not found")
    }

    const invitation = await db.query.organizationInvitations.findFirst({
      where: and(
        eq(organizationInvitations.token, token),
        eq(organizationInvitations.email, user.email),
        eq(organizationInvitations.status, "pending")
      ),
    })

    if (!invitation) {
      throw new NotFoundError("Invitation not found")
    }

    await db
      .update(organizationInvitations)
      .set({ status: "declined" })
      .where(eq(organizationInvitations.id, invitation.id))

    revalidatePath("/settings/organizations")
    return actionSuccess(undefined)
  })()
}

/**
 * Cancel (revoke) an invitation
 */
export async function cancelInvitation(
  invitationId: string
): Promise<ActionResult<void>> {
  return withActionErrorHandling(async () => {
    const ctx = await requireRole(["owner", "admin"])

    const invitation = await ctx.db.query.organizationInvitations.findFirst({
      where: and(
        eq(organizationInvitations.id, invitationId),
        eq(organizationInvitations.organizationId, ctx.tenantId as string)
      ),
    })

    if (!invitation) {
      throw new NotFoundError("Invitation not found")
    }

    await ctx.db
      .delete(organizationInvitations)
      .where(eq(organizationInvitations.id, invitationId))

    revalidatePath("/settings/organization/members")
    return actionSuccess(undefined)
  })()
}
