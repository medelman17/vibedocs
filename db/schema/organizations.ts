/**
 * @fileoverview Multi-tenant organization schema for VibeDocs
 *
 * This module defines the core multi-tenancy structure for the application.
 * Organizations serve as the primary tenant boundary, with all tenant-scoped
 * data (documents, analyses, comparisons) linked via `tenant_id` foreign keys.
 *
 * ## Multi-Tenancy Architecture
 *
 * The application uses a single-database multi-tenant architecture with
 * logical separation enforced through Row Level Security (RLS):
 *
 * - **Organizations**: Top-level tenant containers (workspaces)
 * - **Organization Members**: Junction table linking users to organizations with roles
 * - **Tenant Tables**: All tenant-scoped tables include `tenant_id` referencing `organizations.id`
 *
 * ## User-Organization Relationship
 *
 * Users can belong to multiple organizations (many-to-many via `organization_members`).
 * The active organization context is stored in the session as `activeOrganizationId`
 * and used by the Data Access Layer (DAL) to scope all queries.
 *
 * ## Subscription Plans
 *
 * Organizations have a `plan` field that controls feature access:
 * - `free`: Basic features, limited analysis count
 * - `pro`: Full features, higher limits
 * - `enterprise`: Custom limits, SSO, audit logs
 *
 * @module db/schema/organizations
 * @see {@link file://../../../docs/PRD.md} - Full product requirements
 * @see {@link file://../../../docs/schema.md} - Database schema documentation
 * @see {@link file://../../lib/dal.ts} - Data Access Layer using these tables
 */

import {
  pgTable,
  text,
  uuid,
  unique,
  index,
  timestamp,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps, softDelete } from "../_columns"
import { users } from "./auth"

/**
 * Organizations table - primary tenant container for multi-tenancy
 *
 * Organizations are the top-level workspace containers in the application.
 * All tenant-scoped data (documents, analyses, comparisons, generated NDAs)
 * is linked to an organization via the `tenant_id` column pattern.
 *
 * ## Columns
 *
 * | Column      | Type      | Description                                      |
 * |-------------|-----------|--------------------------------------------------|
 * | id          | uuid      | Primary key (auto-generated UUIDv4)              |
 * | name        | text      | Display name (e.g., "Acme Corporation")          |
 * | slug        | text      | URL-safe identifier (unique, e.g., "acme-corp")  |
 * | plan        | text      | Subscription tier (default: "free")              |
 * | createdAt   | timestamp | Record creation timestamp (with timezone)        |
 * | updatedAt   | timestamp | Last modification timestamp (auto-updated)       |
 * | deletedAt   | timestamp | Soft delete timestamp (null if active)           |
 *
 * ## Plan Values
 *
 * - `"free"` - Free tier with basic features and limited analysis quota
 * - `"pro"` - Professional tier with full features and higher limits
 * - `"enterprise"` - Enterprise tier with custom limits, SSO, and audit logs
 *
 * ## Indexes
 *
 * - Primary key index on `id`
 * - Unique constraint on `slug` for URL routing
 *
 * ## Soft Delete
 *
 * Organizations use soft delete via `deletedAt`. When an organization is
 * "deleted", the timestamp is set but the record remains. Queries should
 * filter on `deletedAt IS NULL` for active organizations.
 *
 * @example
 * // Create a new organization
 * import { db } from "@/db"
 * import { organizations } from "@/db/schema"
 *
 * const [org] = await db.insert(organizations).values({
 *   name: "Acme Corporation",
 *   slug: "acme-corp",
 *   plan: "pro",
 * }).returning()
 *
 * @example
 * // Find organization by slug (for URL routing)
 * import { db } from "@/db"
 * import { organizations } from "@/db/schema"
 * import { eq, isNull, and } from "drizzle-orm"
 *
 * const org = await db.query.organizations.findFirst({
 *   where: and(
 *     eq(organizations.slug, "acme-corp"),
 *     isNull(organizations.deletedAt)
 *   ),
 * })
 *
 * @example
 * // Upgrade organization plan
 * import { db } from "@/db"
 * import { organizations } from "@/db/schema"
 * import { eq } from "drizzle-orm"
 *
 * await db.update(organizations)
 *   .set({ plan: "enterprise" })
 *   .where(eq(organizations.id, orgId))
 *
 * @example
 * // Soft delete an organization
 * import { db } from "@/db"
 * import { organizations } from "@/db/schema"
 * import { eq } from "drizzle-orm"
 *
 * await db.update(organizations)
 *   .set({ deletedAt: new Date() })
 *   .where(eq(organizations.id, orgId))
 */
export const organizations = pgTable("organizations", {
  /**
   * Primary key - auto-generated UUIDv4
   * Referenced by `organization_members.organization_id` and all tenant tables via `tenant_id`
   */
  ...primaryId,

  /**
   * Organization display name
   * Used in the UI header, settings, and member invitations
   * @example "Acme Corporation"
   * @example "Law Firm Partners LLP"
   */
  name: text("name").notNull(),

  /**
   * URL-safe unique identifier for routing
   * Must be lowercase alphanumeric with hyphens, used in URLs like `/org/acme-corp/dashboard`
   * @example "acme-corp"
   * @example "law-firm-partners"
   */
  slug: text("slug").unique().notNull(),

  /**
   * Subscription plan tier controlling feature access and quotas
   * @default "free"
   * @enum {"free" | "pro" | "enterprise"}
   * - "free" - Basic features, 10 analyses/month
   * - "pro" - Full features, 100 analyses/month
   * - "enterprise" - Unlimited analyses, SSO, audit logs
   */
  plan: text("plan").notNull().default("free"),

  /**
   * Audit timestamps (createdAt, updatedAt)
   * - createdAt: Set automatically on insert
   * - updatedAt: Updated automatically on every modification
   */
  ...timestamps,

  /**
   * Soft delete timestamp
   * - null: Organization is active
   * - Date: Organization has been soft-deleted at this time
   */
  ...softDelete,
})

/**
 * Organization members junction table - links users to organizations with roles
 *
 * This table implements the many-to-many relationship between users and
 * organizations, enabling users to belong to multiple organizations with
 * different roles in each. It also tracks invitation metadata for audit purposes.
 *
 * ## Columns
 *
 * | Column         | Type      | Description                                    |
 * |----------------|-----------|------------------------------------------------|
 * | id             | uuid      | Primary key (auto-generated UUIDv4)            |
 * | organizationId | uuid      | FK to organizations.id (cascade delete)        |
 * | userId         | uuid      | FK to users.id (cascade delete)                |
 * | role           | text      | Member's role in this organization             |
 * | invitedBy      | uuid      | FK to users.id who sent the invitation         |
 * | invitedAt      | timestamp | When the invitation was sent                   |
 * | acceptedAt     | timestamp | When the user accepted (null if pending)       |
 * | createdAt      | timestamp | Record creation timestamp                      |
 * | updatedAt      | timestamp | Last modification timestamp                    |
 *
 * ## Role Values
 *
 * - `"owner"` - Full administrative access, can delete organization, manage billing
 * - `"admin"` - Can manage members, settings, but cannot delete organization
 * - `"member"` - Standard access to documents and analyses (default)
 *
 * ## Indexes & Constraints
 *
 * - **Primary key**: `id`
 * - **Unique constraint** `org_member_unique`: (`organization_id`, `user_id`) -
 *   Prevents duplicate memberships
 * - **Index** `idx_org_members_user`: `user_id` - Fast lookup of user's organizations
 * - **Index** `idx_org_members_org`: `organization_id` - Fast lookup of organization members
 *
 * ## Cascade Delete Behavior
 *
 * - Deleting an organization cascades to delete all memberships
 * - Deleting a user cascades to delete all their memberships
 *
 * ## Invitation Flow
 *
 * 1. Admin creates membership with `invitedBy` and `invitedAt` set
 * 2. `acceptedAt` is null (pending invitation)
 * 3. User accepts invitation, `acceptedAt` is set
 * 4. Only accepted members (`acceptedAt IS NOT NULL`) can access organization data
 *
 * @example
 * // Add owner when creating organization
 * import { db } from "@/db"
 * import { organizationMembers } from "@/db/schema"
 *
 * await db.insert(organizationMembers).values({
 *   organizationId: org.id,
 *   userId: currentUser.id,
 *   role: "owner",
 *   acceptedAt: new Date(), // Immediately accepted (self-created)
 * })
 *
 * @example
 * // Invite a new member
 * import { db } from "@/db"
 * import { organizationMembers } from "@/db/schema"
 *
 * await db.insert(organizationMembers).values({
 *   organizationId: orgId,
 *   userId: invitedUserId,
 *   role: "member",
 *   invitedBy: currentUserId,
 *   invitedAt: new Date(),
 *   acceptedAt: null, // Pending acceptance
 * })
 *
 * @example
 * // Get all organizations for a user (with roles)
 * import { db } from "@/db"
 * import { organizations, organizationMembers } from "@/db/schema"
 * import { eq, isNotNull } from "drizzle-orm"
 *
 * const userOrgs = await db
 *   .select({
 *     organization: organizations,
 *     role: organizationMembers.role,
 *   })
 *   .from(organizationMembers)
 *   .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
 *   .where(
 *     and(
 *       eq(organizationMembers.userId, userId),
 *       isNotNull(organizationMembers.acceptedAt) // Only accepted memberships
 *     )
 *   )
 *
 * @example
 * // Check if user has admin access to organization
 * import { db } from "@/db"
 * import { organizationMembers } from "@/db/schema"
 * import { eq, and, inArray, isNotNull } from "drizzle-orm"
 *
 * const membership = await db.query.organizationMembers.findFirst({
 *   where: and(
 *     eq(organizationMembers.organizationId, orgId),
 *     eq(organizationMembers.userId, userId),
 *     inArray(organizationMembers.role, ["owner", "admin"]),
 *     isNotNull(organizationMembers.acceptedAt)
 *   ),
 * })
 * const hasAdminAccess = !!membership
 *
 * @example
 * // Get all members of an organization
 * import { db } from "@/db"
 * import { users, organizationMembers } from "@/db/schema"
 * import { eq } from "drizzle-orm"
 *
 * const members = await db
 *   .select({
 *     user: users,
 *     role: organizationMembers.role,
 *     acceptedAt: organizationMembers.acceptedAt,
 *   })
 *   .from(organizationMembers)
 *   .innerJoin(users, eq(users.id, organizationMembers.userId))
 *   .where(eq(organizationMembers.organizationId, orgId))
 *
 * @example
 * // Promote member to admin
 * import { db } from "@/db"
 * import { organizationMembers } from "@/db/schema"
 * import { eq, and } from "drizzle-orm"
 *
 * await db.update(organizationMembers)
 *   .set({ role: "admin" })
 *   .where(
 *     and(
 *       eq(organizationMembers.organizationId, orgId),
 *       eq(organizationMembers.userId, userId)
 *     )
 *   )
 */
export const organizationMembers = pgTable(
  "organization_members",
  {
    /**
     * Primary key - auto-generated UUIDv4
     */
    ...primaryId,

    /**
     * Foreign key to the organization
     * Cascade delete ensures memberships are removed when organization is deleted
     */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /**
     * Foreign key to the user
     * Cascade delete ensures memberships are removed when user is deleted
     */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Member's role within this organization
     * @default "member"
     * @enum {"owner" | "admin" | "member"}
     * - "owner" - Full access including billing and organization deletion
     * - "admin" - Can manage members and settings
     * - "member" - Standard document and analysis access
     */
    role: text("role").notNull().default("member"),

    /**
     * User who sent the invitation (null if self-created or system-assigned)
     * Used for audit trail and invitation tracking
     */
    invitedBy: uuid("invited_by").references(() => users.id),

    /**
     * Timestamp when invitation was sent
     * Null for founding members or system-assigned memberships
     */
    invitedAt: timestamp("invited_at", { withTimezone: true }),

    /**
     * Timestamp when user accepted the invitation
     * - null: Invitation is pending (user cannot access organization)
     * - Date: User has accepted and can access organization resources
     */
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),

    /**
     * Audit timestamps (createdAt, updatedAt)
     */
    ...timestamps,
  },
  (table) => [
    /**
     * Unique constraint preventing duplicate memberships
     * A user can only have one membership record per organization
     */
    unique("org_member_unique").on(table.organizationId, table.userId),

    /**
     * Index for fast lookup of all organizations a user belongs to
     * Used by: getUserOrganizations(), session context switching
     */
    index("idx_org_members_user").on(table.userId),

    /**
     * Index for fast lookup of all members in an organization
     * Used by: getOrganizationMembers(), member management UI
     */
    index("idx_org_members_org").on(table.organizationId),
  ]
)
