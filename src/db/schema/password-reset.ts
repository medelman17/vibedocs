// src/db/schema/password-reset.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { users } from "./auth"

/**
 * Password reset tokens for secure password recovery
 * Tokens expire after 1 hour and are single-use
 */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
