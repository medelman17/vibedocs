// src/db/_columns.ts
import { timestamp, uuid } from "drizzle-orm/pg-core"

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}

export const tenantId = {
  tenantId: uuid("tenant_id").notNull(),
}

export const primaryId = {
  id: uuid("id").primaryKey().defaultRandom(),
}
