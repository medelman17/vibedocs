"use server";

/**
 * @fileoverview User Profile Server Actions
 *
 * This module provides server actions for managing user profile settings,
 * password changes, and GDPR-related operations (data export and deletion).
 *
 * ## Actions
 *
 * - `updateProfile` - Update user profile information (name, image)
 * - `changePassword` - Change the user's password with verification
 * - `deleteAccount` - GDPR right to erasure (permanent account deletion)
 * - `exportUserData` - GDPR data portability (export all user data)
 *
 * @module app/(dashboard)/settings/profile/actions
 * @see {@link src/lib/dal.ts} for session verification
 * @see {@link src/lib/password.ts} for password utilities
 */

import { z } from "zod";
import { verifySession } from "@/lib/dal";
import { ok, err, type ApiResponse } from "@/lib/api-response";
import {
  hashPassword,
  verifyPassword,
  validatePassword,
} from "@/lib/password";
import { db } from "@/db/client";
import { users, organizations, organizationMembers } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";

// ============================================================================
// Types
// ============================================================================

/**
 * User profile data that can be updated.
 */
export type ProfileUpdate = {
  name?: string;
  image?: string;
};

/**
 * Exported user data structure for GDPR compliance.
 */
export type UserDataExport = {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    emailVerified: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  organizations: Array<{
    id: string;
    name: string;
    role: string;
    joinedAt: Date | null;
  }>;
  // Placeholder for full data export - in production, would include
  // documents, analyses, comparisons, generated NDAs, and audit logs
  exportedAt: Date;
  note: string;
};

// ============================================================================
// Validation Schemas
// ============================================================================

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(255).optional(),
  image: z.string().url("Image must be a valid URL").optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

const deleteAccountSchema = z.object({
  confirmation: z
    .string()
    .refine((val) => val === "DELETE", {
      message: 'You must type "DELETE" to confirm account deletion',
    }),
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Update user profile information.
 *
 * Updates the authenticated user's profile fields. Only provided
 * fields are updated; omitted fields remain unchanged.
 *
 * @param input - Object containing optional name and image fields
 * @returns The updated user data or an error
 *
 * @example
 * ```typescript
 * const result = await updateProfile({ name: "Jane Doe" });
 *
 * if (result.success) {
 *   console.log("Profile updated:", result.data.name);
 * }
 * ```
 */
export async function updateProfile(
  input: z.infer<typeof updateProfileSchema>
): Promise<ApiResponse<{ name: string | null; image: string | null }>> {
  const { userId } = await verifySession();

  // Validate input
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { name, image } = parsed.data;

  // Ensure at least one field is being updated
  if (name === undefined && image === undefined) {
    return err("VALIDATION_ERROR", "No fields to update");
  }

  try {
    // Build update object with only provided fields
    const updateData: Partial<{ name: string; image: string }> = {};
    if (name !== undefined) updateData.name = name;
    if (image !== undefined) updateData.image = image;

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({ name: users.name, image: users.image });

    return ok(updated);
  } catch (error) {
    console.error("Failed to update profile:", error);
    return err("INTERNAL_ERROR", "Failed to update profile");
  }
}

/**
 * Change the user's password.
 *
 * Verifies the current password before allowing the change.
 * The new password must meet strength requirements (minimum 8 characters,
 * uppercase, lowercase, number, and special character).
 *
 * Only works for users who have a password set (credentials auth).
 * OAuth-only users will receive an error.
 *
 * @param input - Object containing currentPassword and newPassword
 * @returns Success confirmation or an error
 *
 * @example
 * ```typescript
 * const result = await changePassword({
 *   currentPassword: "oldPass123!",
 *   newPassword: "newPass456@",
 * });
 *
 * if (result.success) {
 *   console.log("Password changed successfully");
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export async function changePassword(
  input: z.infer<typeof changePasswordSchema>
): Promise<ApiResponse<{ changed: true }>> {
  const { userId } = await verifySession();

  // Validate input
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { currentPassword, newPassword } = parsed.data;

  try {
    // Get current user's password hash
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { passwordHash: true },
    });

    if (!user) {
      return err("NOT_FOUND", "User not found");
    }

    // Check if user has a password (OAuth-only users don't)
    if (!user.passwordHash) {
      return err(
        "BAD_REQUEST",
        "Cannot change password for OAuth-only accounts. Please use your OAuth provider to manage authentication."
      );
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return err("UNAUTHORIZED", "Current password is incorrect");
    }

    // Validate new password strength
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      return err("VALIDATION_ERROR", validation.errors.join(". "));
    }

    // Ensure new password is different from current
    const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
    if (isSamePassword) {
      return err(
        "VALIDATION_ERROR",
        "New password must be different from current password"
      );
    }

    // Hash and update the password
    const newHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash: newHash })
      .where(eq(users.id, userId));

    return ok({ changed: true });
  } catch (error) {
    console.error("Failed to change password:", error);
    return err("INTERNAL_ERROR", "Failed to change password");
  }
}

/**
 * Delete the user's account (GDPR right to erasure).
 *
 * Permanently deletes the user account and removes them from all
 * organizations. Requires typing "DELETE" as confirmation.
 *
 * **Important constraints:**
 * - User cannot be the sole owner of any organization
 * - This action is irreversible
 *
 * @param input - Object containing confirmation string (must be "DELETE")
 * @returns Success confirmation or an error
 *
 * @example
 * ```typescript
 * const result = await deleteAccount({ confirmation: "DELETE" });
 *
 * if (result.success) {
 *   // Redirect to logged-out state
 *   signOut();
 * } else if (result.error.code === "FORBIDDEN") {
 *   console.error("Transfer ownership first:", result.error.message);
 * }
 * ```
 */
export async function deleteAccount(
  input: z.infer<typeof deleteAccountSchema>
): Promise<ApiResponse<{ deleted: true }>> {
  const { userId } = await verifySession();

  // Validate input
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  try {
    // Check if user is the sole owner of any organization
    // An organization needs at least one owner after user leaves
    const userOwnerships = await db
      .select({
        organizationId: organizationMembers.organizationId,
      })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.role, "owner")
        )
      );

    // For each org where user is owner, check if there are other owners
    for (const ownership of userOwnerships) {
      const [ownerCount] = await db
        .select({ count: count() })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, ownership.organizationId),
            eq(organizationMembers.role, "owner")
          )
        );

      if (ownerCount.count === 1) {
        // User is sole owner - get org name for error message
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, ownership.organizationId),
          columns: { name: true },
        });

        return err(
          "FORBIDDEN",
          `Cannot delete account: You are the sole owner of "${org?.name || "an organization"}". ` +
            "Please transfer ownership or delete the organization first."
        );
      }
    }

    // Remove user from all organizations (cascade will handle this, but explicit for clarity)
    await db
      .delete(organizationMembers)
      .where(eq(organizationMembers.userId, userId));

    // Delete the user (this will cascade to sessions, accounts via FK constraints)
    await db.delete(users).where(eq(users.id, userId));

    return ok({ deleted: true });
  } catch (error) {
    console.error("Failed to delete account:", error);
    return err("INTERNAL_ERROR", "Failed to delete account");
  }
}

/**
 * Export all user data (GDPR data portability).
 *
 * Collects all data associated with the user for GDPR Article 20
 * compliance (right to data portability). In a production system,
 * this would generate a downloadable file (JSON or similar) and
 * upload it to blob storage.
 *
 * **Note:** This is a placeholder implementation. In production:
 * - Would compile all user data across all tables
 * - Would upload to Vercel Blob or similar storage
 * - Would return a download URL with expiration
 *
 * @returns User data export structure or an error
 *
 * @example
 * ```typescript
 * const result = await exportUserData();
 *
 * if (result.success) {
 *   // In production: result.data would include a downloadUrl
 *   console.log("Data exported at:", result.data.exportedAt);
 * }
 * ```
 */
export async function exportUserData(): Promise<ApiResponse<UserDataExport>> {
  const { userId } = await verifySession();

  try {
    // Get user profile data
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        email: true,
        name: true,
        image: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        // Explicitly exclude sensitive fields
        // passwordHash: false (not selected)
      },
    });

    if (!user) {
      return err("NOT_FOUND", "User not found");
    }

    // Get all organization memberships
    const memberships = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        role: organizationMembers.role,
        joinedAt: organizationMembers.acceptedAt,
      })
      .from(organizationMembers)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMembers.organizationId)
      )
      .where(eq(organizationMembers.userId, userId));

    // In a full implementation, we would also export:
    // - Documents uploaded by user
    // - Analyses created by user
    // - Comparisons involving user's documents
    // - Generated NDAs created by user
    // - Audit logs related to user
    //
    // This would then be serialized and uploaded to Vercel Blob
    // with a signed download URL returned to the user.

    const exportData: UserDataExport = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      organizations: memberships,
      exportedAt: new Date(),
      note:
        "This is a placeholder export. In production, a complete data export " +
        "including documents, analyses, and activity history would be generated " +
        "and made available for download.",
    };

    return ok(exportData);
  } catch (error) {
    console.error("Failed to export user data:", error);
    return err("INTERNAL_ERROR", "Failed to export user data");
  }
}
