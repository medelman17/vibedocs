"use server";

/**
 * @fileoverview Authentication and Session Server Actions
 *
 * This module provides server actions for session management, organization
 * switching, and invitation handling. These actions support the multi-org
 * user model where users can belong to multiple organizations.
 *
 * ## Actions
 *
 * - `switchOrganization` - Switch the active organization context
 * - `getUserOrganizations` - Get all organizations the user belongs to
 * - `acceptInvitation` - Accept a pending organization invitation
 * - `declineInvitation` - Decline a pending organization invitation
 *
 * @module app/(auth)/actions
 * @see {@link src/lib/dal.ts} for session verification
 * @see {@link src/db/schema/organizations.ts} for organization/member schema
 */

import { z } from "zod";
import { verifySession } from "@/lib/dal";
import { ok, err, type ApiResponse } from "@/lib/api-response";
import { db } from "@/db/client";
import { organizationMembers, organizations } from "@/db/schema";
import { eq, and, isNotNull, isNull } from "drizzle-orm";

// ============================================================================
// Types
// ============================================================================

/**
 * Organization with the user's role in that organization.
 */
export type UserOrganization = {
  organization: typeof organizations.$inferSelect;
  role: string;
};

/**
 * Result of accepting an invitation.
 */
export type AcceptInvitationResult = {
  organizationId: string;
  organizationName: string;
};

// ============================================================================
// Validation Schemas
// ============================================================================

const switchOrganizationSchema = z.object({
  orgId: z.string().uuid("Organization ID must be a valid UUID"),
});

const membershipIdSchema = z.object({
  membershipId: z.string().uuid("Membership ID must be a valid UUID"),
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Switch the active organization for the current user's session.
 *
 * Validates that the user is an accepted member of the target organization
 * before allowing the switch. The actual session update must happen client-side
 * as server actions cannot directly modify the session cookie.
 *
 * @param input - Object containing the target organization ID
 * @returns Success if user is a member, or an error
 *
 * @example
 * ```typescript
 * const result = await switchOrganization({ orgId: "org-uuid" });
 *
 * if (result.success) {
 *   // Session update happens client-side via signIn()
 *   router.refresh();
 * }
 * ```
 */
export async function switchOrganization(
  input: z.infer<typeof switchOrganizationSchema>
): Promise<ApiResponse<{ organizationId: string }>> {
  const { userId } = await verifySession();

  // Validate input
  const parsed = switchOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { orgId } = parsed.data;

  try {
    // Verify user is an accepted member of this organization
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, orgId),
        isNotNull(organizationMembers.acceptedAt)
      ),
    });

    if (!membership) {
      return err("FORBIDDEN", "Not a member of this organization");
    }

    // Verify the organization exists and is not deleted
    const org = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.id, orgId),
        isNull(organizations.deletedAt)
      ),
    });

    if (!org) {
      return err("NOT_FOUND", "Organization not found or has been deleted");
    }

    // Return success - client handles session update
    return ok({ organizationId: orgId });
  } catch (error) {
    console.error("Failed to switch organization:", error);
    return err("INTERNAL_ERROR", "Failed to switch organization");
  }
}

/**
 * Get all organizations the current user belongs to.
 *
 * Returns organizations where the user has an accepted membership,
 * along with their role in each organization. Excludes soft-deleted
 * organizations.
 *
 * @returns Array of organizations with user's role in each
 *
 * @example
 * ```typescript
 * const result = await getUserOrganizations();
 *
 * if (result.success) {
 *   for (const { organization, role } of result.data) {
 *     console.log(`${organization.name}: ${role}`);
 *   }
 * }
 * ```
 */
export async function getUserOrganizations(): Promise<
  ApiResponse<UserOrganization[]>
> {
  const { userId } = await verifySession();

  try {
    // Query all accepted memberships with organization data
    const memberships = await db
      .select({
        organization: organizations,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMembers.organizationId)
      )
      .where(
        and(
          eq(organizationMembers.userId, userId),
          isNotNull(organizationMembers.acceptedAt),
          isNull(organizations.deletedAt)
        )
      );

    return ok(memberships);
  } catch (error) {
    console.error("Failed to get user organizations:", error);
    return err("INTERNAL_ERROR", "Failed to retrieve organizations");
  }
}

/**
 * Accept a pending organization invitation.
 *
 * Updates the membership record to set the acceptedAt timestamp,
 * making the user an active member of the organization.
 *
 * @param input - Object containing the membership ID
 * @returns The organization ID and name, or an error
 *
 * @example
 * ```typescript
 * const result = await acceptInvitation({ membershipId: "membership-uuid" });
 *
 * if (result.success) {
 *   console.log(`Joined: ${result.data.organizationName}`);
 *   // Optionally switch to the new organization
 *   await switchOrganization({ orgId: result.data.organizationId });
 * }
 * ```
 */
export async function acceptInvitation(
  input: z.infer<typeof membershipIdSchema>
): Promise<ApiResponse<AcceptInvitationResult>> {
  const { userId } = await verifySession();

  // Validate input
  const parsed = membershipIdSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { membershipId } = parsed.data;

  try {
    // Find the pending invitation for this user
    const invitation = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.id, membershipId),
        eq(organizationMembers.userId, userId),
        isNull(organizationMembers.acceptedAt)
      ),
      with: {
        organization: true,
      },
    });

    if (!invitation) {
      return err(
        "NOT_FOUND",
        "Invitation not found, already accepted, or does not belong to you"
      );
    }

    // Check if organization is still active
    if (invitation.organization.deletedAt) {
      return err("NOT_FOUND", "The organization has been deleted");
    }

    // Accept the invitation by setting acceptedAt
    await db
      .update(organizationMembers)
      .set({ acceptedAt: new Date() })
      .where(eq(organizationMembers.id, membershipId));

    return ok({
      organizationId: invitation.organizationId,
      organizationName: invitation.organization.name,
    });
  } catch (error) {
    console.error("Failed to accept invitation:", error);
    return err("INTERNAL_ERROR", "Failed to accept invitation");
  }
}

/**
 * Decline a pending organization invitation.
 *
 * Removes the membership record entirely, preventing the user
 * from joining the organization without a new invitation.
 *
 * @param input - Object containing the membership ID
 * @returns Success confirmation or an error
 *
 * @example
 * ```typescript
 * const result = await declineInvitation({ membershipId: "membership-uuid" });
 *
 * if (result.success) {
 *   console.log("Invitation declined");
 * }
 * ```
 */
export async function declineInvitation(
  input: z.infer<typeof membershipIdSchema>
): Promise<ApiResponse<{ declined: true }>> {
  const { userId } = await verifySession();

  // Validate input
  const parsed = membershipIdSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { membershipId } = parsed.data;

  try {
    // Find the pending invitation for this user
    const invitation = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.id, membershipId),
        eq(organizationMembers.userId, userId),
        isNull(organizationMembers.acceptedAt)
      ),
    });

    if (!invitation) {
      return err(
        "NOT_FOUND",
        "Invitation not found, already accepted, or does not belong to you"
      );
    }

    // Delete the membership record
    await db
      .delete(organizationMembers)
      .where(eq(organizationMembers.id, membershipId));

    return ok({ declined: true });
  } catch (error) {
    console.error("Failed to decline invitation:", error);
    return err("INTERNAL_ERROR", "Failed to decline invitation");
  }
}
