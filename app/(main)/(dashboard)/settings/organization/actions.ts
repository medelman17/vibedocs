"use server"

/**
 * @fileoverview Organization Server Actions
 *
 * This module provides Server Actions for managing organizations in the multi-tenant
 * application. Organizations serve as the primary tenant boundary, with all user
 * data (documents, analyses, comparisons) scoped to an organization.
 *
 * ## Available Actions
 *
 * - **createOrganization**: Create a new organization and add creator as owner
 * - **getOrganization**: Get the current organization details from session
 * - **updateOrganization**: Update organization name/slug (requires admin or owner)
 * - **deleteOrganization**: Soft-delete an organization (requires owner)
 *
 * ## Role Requirements
 *
 * | Action             | Required Role(s)    |
 * |--------------------|---------------------|
 * | createOrganization | Any authenticated   |
 * | getOrganization    | Any member          |
 * | updateOrganization | admin or owner      |
 * | deleteOrganization | owner only          |
 *
 * @module app/(dashboard)/settings/organization/actions
 */

import { z } from "zod"
import { verifySession, requireRole, withTenant } from "@/lib/dal"
import { ok, err, wrapError, type ApiResponse } from "@/lib/api-response"
// Note: sharedDb is ONLY for operations without tenant context (e.g., createOrganization)
// All tenant-scoped queries MUST use db from withTenant()/requireRole()
import { db as sharedDb } from "@/db"
import { organizations, organizationMembers } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"

// ============================================================================
// Types
// ============================================================================

/**
 * Organization record as returned from the database.
 */
export type Organization = typeof organizations.$inferSelect

/**
 * Organization with membership role information.
 */
export type OrganizationWithRole = Organization & {
  role: string
}

// ============================================================================
// Schemas
// ============================================================================

/**
 * Schema for creating a new organization.
 * - name: 1-100 characters, display name
 * - slug: 1-50 characters, lowercase alphanumeric with hyphens only
 */
const createOrgSchema = z.object({
  name: z
    .string()
    .min(1, "Organization name is required")
    .max(100, "Organization name must be 100 characters or less"),
  slug: z
    .string()
    .min(1, "Organization slug is required")
    .max(50, "Organization slug must be 50 characters or less")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must contain only lowercase letters, numbers, and hyphens"
    ),
})

/**
 * Schema for updating an organization.
 * Both fields are optional but at least one must be provided.
 */
const updateOrgSchema = z
  .object({
    name: z
      .string()
      .min(1, "Organization name is required")
      .max(100, "Organization name must be 100 characters or less")
      .optional(),
    slug: z
      .string()
      .min(1, "Organization slug is required")
      .max(50, "Organization slug must be 50 characters or less")
      .regex(
        /^[a-z0-9-]+$/,
        "Slug must contain only lowercase letters, numbers, and hyphens"
      )
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.slug !== undefined, {
    message: "At least one field (name or slug) must be provided",
  })

// ============================================================================
// Actions
// ============================================================================

/**
 * Creates a new organization and adds the current user as owner.
 *
 * This action:
 * 1. Validates the input (name and slug)
 * 2. Checks that the slug is unique
 * 3. Creates the organization
 * 4. Adds the current user as an owner with immediate acceptance
 *
 * After creating an organization, the client should update the session
 * to set the new organization as active (via session update or redirect).
 *
 * @param input - Organization creation data
 * @param input.name - Display name for the organization
 * @param input.slug - URL-safe unique identifier
 *
 * @returns Success with the created organization, or error response
 *
 * @example
 * ```typescript
 * const result = await createOrganization({
 *   name: "Acme Corporation",
 *   slug: "acme-corp",
 * })
 *
 * if (result.success) {
 *   // Redirect to new org or update session
 *   router.push(`/org/${result.data.slug}/dashboard`)
 * } else {
 *   toast.error(result.error.message)
 * }
 * ```
 */
export async function createOrganization(
  input: z.infer<typeof createOrgSchema>
): Promise<ApiResponse<Organization>> {
  try {
    // Verify user is authenticated
    const { userId } = await verifySession()

    // Validate input
    const parsed = createOrgSchema.safeParse(input)
    if (!parsed.success) {
      return err("VALIDATION_ERROR", parsed.error.issues[0].message)
    }

    const { name, slug } = parsed.data

    // Check slug uniqueness (excluding soft-deleted orgs)
    // Note: Using sharedDb because user may not have a tenant context yet
    const existing = await sharedDb.query.organizations.findFirst({
      where: and(eq(organizations.slug, slug), isNull(organizations.deletedAt)),
    })

    if (existing) {
      return err("DUPLICATE", "An organization with this slug already exists")
    }

    // Create the organization
    const [org] = await sharedDb
      .insert(organizations)
      .values({
        name,
        slug,
        plan: "free",
      })
      .returning()

    if (!org) {
      return err("INTERNAL_ERROR", "Failed to create organization")
    }

    // Add current user as owner with immediate acceptance
    await sharedDb.insert(organizationMembers).values({
      organizationId: org.id,
      userId,
      role: "owner",
      acceptedAt: new Date(), // Immediately accepted since user created it
    })

    return ok(org)
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Retrieves the current organization based on the active session.
 *
 * Uses the `activeOrganizationId` from the session to fetch the full
 * organization record. Returns the organization along with the user's
 * role in that organization.
 *
 * @returns Success with organization and role, or error response
 *
 * @example
 * ```typescript
 * const result = await getOrganization()
 *
 * if (result.success) {
 *   const { name, slug, plan, role } = result.data
 *   // Display organization info
 * } else {
 *   // Handle error - likely redirect to onboarding
 * }
 * ```
 */
export async function getOrganization(): Promise<
  ApiResponse<OrganizationWithRole>
> {
  try {
    // withTenant verifies auth and org membership
    const { db, tenantId, role } = await withTenant()

    // Fetch the full organization record
    const org = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.id, tenantId),
        isNull(organizations.deletedAt)
      ),
    })

    if (!org) {
      return err("NOT_FOUND", "Organization not found")
    }

    return ok({ ...org, role })
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Updates organization settings.
 *
 * Requires `admin` or `owner` role. Validates slug uniqueness if the slug
 * is being changed.
 *
 * @param input - Fields to update (name and/or slug)
 * @param input.name - New display name (optional)
 * @param input.slug - New URL-safe identifier (optional)
 *
 * @returns Success with updated organization, or error response
 *
 * @example
 * ```typescript
 * // Update name only
 * const result = await updateOrganization({ name: "New Name" })
 *
 * // Update slug only
 * const result = await updateOrganization({ slug: "new-slug" })
 *
 * // Update both
 * const result = await updateOrganization({
 *   name: "New Name",
 *   slug: "new-slug",
 * })
 *
 * if (result.success) {
 *   toast.success("Organization updated")
 * }
 * ```
 */
export async function updateOrganization(input: {
  name?: string
  slug?: string
}): Promise<ApiResponse<Organization>> {
  try {
    // Requires admin or owner role
    const { db, tenantId } = await requireRole(["admin", "owner"])

    // Validate input
    const parsed = updateOrgSchema.safeParse(input)
    if (!parsed.success) {
      return err("VALIDATION_ERROR", parsed.error.issues[0].message)
    }

    const { name, slug } = parsed.data

    // If slug is being changed, check uniqueness
    if (slug) {
      const existing = await db.query.organizations.findFirst({
        where: and(
          eq(organizations.slug, slug),
          isNull(organizations.deletedAt)
        ),
      })

      // Check if another org has this slug (not the current one)
      if (existing && existing.id !== tenantId) {
        return err("DUPLICATE", "An organization with this slug already exists")
      }
    }

    // Build update object (only include provided fields)
    const updateData: Partial<{ name: string; slug: string; updatedAt: Date }> =
      {
        updatedAt: new Date(),
      }
    if (name !== undefined) updateData.name = name
    if (slug !== undefined) updateData.slug = slug

    // Update the organization
    const [updated] = await db
      .update(organizations)
      .set(updateData)
      .where(
        and(eq(organizations.id, tenantId), isNull(organizations.deletedAt))
      )
      .returning()

    if (!updated) {
      return err("NOT_FOUND", "Organization not found")
    }

    return ok(updated)
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Soft-deletes an organization by setting the deletedAt timestamp.
 *
 * Requires `owner` role. This action:
 * - Sets the `deletedAt` timestamp on the organization
 * - Does NOT delete associated data (documents, analyses, etc.)
 * - Organization can potentially be restored by admin if needed
 *
 * After deletion, users will be unable to access this organization and
 * should be redirected to select a different organization or create a new one.
 *
 * @returns Success with the deleted organization, or error response
 *
 * @example
 * ```typescript
 * const result = await deleteOrganization()
 *
 * if (result.success) {
 *   // Redirect user to org selection or onboarding
 *   router.push("/onboarding")
 * } else {
 *   toast.error(result.error.message)
 * }
 * ```
 */
export async function deleteOrganization(): Promise<ApiResponse<Organization>> {
  try {
    // Requires owner role
    const { db, tenantId } = await requireRole(["owner"])

    // Soft delete by setting deletedAt
    const [deleted] = await db
      .update(organizations)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(organizations.id, tenantId), isNull(organizations.deletedAt))
      )
      .returning()

    if (!deleted) {
      return err("NOT_FOUND", "Organization not found or already deleted")
    }

    return ok(deleted)
  } catch (error) {
    return wrapError(error)
  }
}
