// src/db/schema/organizations.ts
import { pgTable, text, uuid, unique, index, timestamp } from "drizzle-orm/pg-core"
import { primaryId, timestamps, softDelete } from "../_columns"
import { users } from "./auth"

export const organizations = pgTable("organizations", {
  ...primaryId,
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  plan: text("plan").notNull().default("free"),
  ...timestamps,
  ...softDelete,
})

export const organizationMembers = pgTable(
  "organization_members",
  {
    ...primaryId,
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    invitedBy: uuid("invited_by").references(() => users.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("org_member_unique").on(table.organizationId, table.userId),
    index("idx_org_members_user").on(table.userId),
    index("idx_org_members_org").on(table.organizationId),
  ]
)
