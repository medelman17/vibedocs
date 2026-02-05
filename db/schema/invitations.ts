/**
 * @fileoverview Organization invitation schema for VibeDocs
 *
 * This module defines the invitation flow for adding new members to organizations.
 * Invitations are sent via email with single-use tokens that expire after a configured duration.
 *
 * @module db/schema/invitations
 */

import {
  pgTable,
  text,
  uuid,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps } from "../_columns"
import { users } from "./auth"
import { organizations } from "./organizations"

/**
 * Organization invitations table - manages pending invitations to join organizations
 *
 * This table stores invitations sent to users (via email) to join an organization.
 * Invitations include a single-use token, expiration date, and track acceptance status.
 *
 * ## Columns
 *
 * | Column         | Type      | Description                                    |
 * |----------------|-----------|------------------------------------------------|
 * | id             | uuid      | Primary key (auto-generated UUIDv4)            |
 * | organizationId | uuid      | FK to organizations.id (cascade delete)        |
 * | email          | text      | Email address of invitee                       |
 * | role           | text      | Intended role for the invitee                  |
 * | token          | text      | Unique single-use invitation token             |
 * | invitedBy      | uuid      | FK to users.id who sent the invitation         |
 * | status         | text      | Invitation status (pending/accepted/declined)  |
 * | expiresAt      | timestamp | Token expiration timestamp                     |
 * | createdAt      | timestamp | Record creation timestamp                      |
 * | updatedAt      | timestamp | Last modification timestamp                    |
 *
 * ## Status Values
 *
 * - `"pending"` - Invitation sent, awaiting user action
 * - `"accepted"` - User accepted and joined organization
 * - `"declined"` - User explicitly declined invitation
 * - `"expired"` - Invitation passed expiration date without action
 *
 * ## Token Security
 *
 * - Tokens are cryptographically random (e.g., using `crypto.randomBytes()`)
 * - Single-use: marked as accepted/declined after use
 * - Time-limited: expire after 7 days (configurable)
 * - Unique constraint prevents token collisions
 *
 * ## Indexes
 *
 * - **Index** `idx_invitations_org`: `organization_id` - Fast lookup of org invitations
 * - **Index** `idx_invitations_email`: `email` - Fast lookup of pending invites for user
 * - **Index** `idx_invitations_token`: `token` - Fast token verification
 *
 * ## Cascade Delete Behavior
 *
 * - Deleting an organization cascades to delete all pending invitations
 * - Deleting the inviter user does NOT cascade (preserves audit trail)
 *
 * @example
 * // Create a new invitation
 * import { db } from "@/db"
 * import { organizationInvitations } from "@/db/schema"
 * import crypto from "crypto"
 *
 * const token = crypto.randomBytes(32).toString("hex")
 * const [invitation] = await db.insert(organizationInvitations).values({
 *   organizationId: orgId,
 *   email: "user@example.com",
 *   role: "member",
 *   token,
 *   invitedBy: currentUserId,
 *   status: "pending",
 *   expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
 * }).returning()
 *
 * @example
 * // Find pending invitations for an email
 * import { db } from "@/db"
 * import { organizationInvitations } from "@/db/schema"
 * import { eq, and, gt } from "drizzle-orm"
 *
 * const pending = await db.query.organizationInvitations.findMany({
 *   where: and(
 *     eq(organizationInvitations.email, "user@example.com"),
 *     eq(organizationInvitations.status, "pending"),
 *     gt(organizationInvitations.expiresAt, new Date())
 *   ),
 *   with: { organization: true }
 * })
 *
 * @example
 * // Accept an invitation
 * import { db } from "@/db"
 * import { organizationInvitations, organizationMembers } from "@/db/schema"
 * import { eq } from "drizzle-orm"
 *
 * await db.transaction(async (tx) => {
 *   // Mark invitation as accepted
 *   await tx.update(organizationInvitations)
 *     .set({ status: "accepted" })
 *     .where(eq(organizationInvitations.token, token))
 *
 *   // Create membership
 *   await tx.insert(organizationMembers).values({
 *     organizationId: invitation.organizationId,
 *     userId: userId,
 *     role: invitation.role,
 *     invitedBy: invitation.invitedBy,
 *     invitedAt: invitation.createdAt,
 *     acceptedAt: new Date(),
 *   })
 * })
 */
export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    /**
     * Primary key - auto-generated UUIDv4
     */
    ...primaryId,

    /**
     * Foreign key to the organization
     * Cascade delete ensures invitations are removed when organization is deleted
     */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /**
     * Email address of the person being invited
     * May or may not be an existing user in the system
     */
    email: text("email").notNull(),

    /**
     * Intended role for the invitee when they accept
     * @default "member"
     * @enum {"owner" | "admin" | "member"}
     */
    role: text("role").notNull().default("member"),

    /**
     * Unique single-use token for invitation acceptance
     * Included in the invitation email link
     * Should be cryptographically random (e.g., 32 bytes hex-encoded)
     */
    token: text("token").notNull().unique(),

    /**
     * User who sent the invitation
     * Does NOT cascade on delete to preserve audit trail
     */
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),

    /**
     * Current invitation status
     * @default "pending"
     * @enum {"pending" | "accepted" | "declined" | "expired"}
     */
    status: text("status").notNull().default("pending"),

    /**
     * Token expiration timestamp
     * After this time, the invitation cannot be accepted
     * Typically set to 7 days from creation
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    /**
     * Audit timestamps (createdAt, updatedAt)
     */
    ...timestamps,
  },
  (table) => [
    /**
     * Index for fast lookup of all invitations for an organization
     * Used by: organization settings, member management UI
     */
    index("idx_invitations_org").on(table.organizationId),

    /**
     * Index for fast lookup of pending invitations by email
     * Used by: user dashboard showing pending invites
     */
    index("idx_invitations_email").on(table.email),

    /**
     * Index for fast token verification during acceptance flow
     * Used by: invitation acceptance endpoint
     */
    index("idx_invitations_token").on(table.token),
  ]
)
