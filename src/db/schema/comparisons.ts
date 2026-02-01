// src/db/schema/comparisons.ts
import { pgTable, text, uuid, jsonb, index } from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId } from "../_columns"
import { documents } from "./documents"

export const comparisons = pgTable(
  "comparisons",
  {
    ...primaryId,
    ...tenantId,
    documentAId: uuid("document_a_id")
      .notNull()
      .references(() => documents.id),
    documentBId: uuid("document_b_id")
      .notNull()
      .references(() => documents.id),
    status: text("status").notNull().default("pending"),
    summary: text("summary"),
    clauseAlignments: jsonb("clause_alignments"),
    keyDifferences: jsonb("key_differences"),
    ...timestamps,
  },
  (table) => [
    index("idx_comparisons_tenant").on(table.tenantId),
    index("idx_comparisons_docs").on(table.documentAId, table.documentBId),
  ]
)
