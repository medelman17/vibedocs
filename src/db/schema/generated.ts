// src/db/schema/generated.ts
import { pgTable, text, uuid, jsonb, index } from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId } from "../_columns"
import { users } from "./auth"

export const generatedNdas = pgTable(
  "generated_ndas",
  {
    ...primaryId,
    ...tenantId,
    createdBy: uuid("created_by").references(() => users.id),
    title: text("title").notNull(),
    templateSource: text("template_source").notNull(),
    parameters: jsonb("parameters").notNull(),
    content: text("content").notNull(),
    contentHtml: text("content_html"),
    status: text("status").notNull().default("draft"),
    ...timestamps,
  },
  (table) => [
    index("idx_generated_tenant").on(table.tenantId),
    index("idx_generated_status").on(table.tenantId, table.status),
  ]
)
