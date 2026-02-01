// src/db/schema/audit.ts
import { pgTable, text, uuid, jsonb, timestamp, index } from "drizzle-orm/pg-core"
import { primaryId, tenantId } from "../_columns"

export const auditLogs = pgTable(
  "audit_logs",
  {
    ...primaryId,
    ...tenantId,
    tableName: text("table_name").notNull(),
    recordId: uuid("record_id").notNull(),
    action: text("action").notNull(),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    userId: uuid("user_id"),
    ipAddress: text("ip_address"),
    performedAt: timestamp("performed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_audit_tenant").on(table.tenantId, table.tableName, table.performedAt),
    index("idx_audit_record").on(table.tableName, table.recordId),
  ]
)
