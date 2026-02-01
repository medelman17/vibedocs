// src/db/schema/analyses.ts
import {
  pgTable,
  text,
  uuid,
  integer,
  real,
  index,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId } from "../_columns"
import { documents, documentChunks } from "./documents"

export const analyses = pgTable(
  "analyses",
  {
    ...primaryId,
    ...tenantId,
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    overallRiskScore: real("overall_risk_score"),
    overallRiskLevel: text("overall_risk_level"),
    summary: text("summary"),
    gapAnalysis: jsonb("gap_analysis"),
    tokenUsage: jsonb("token_usage"),
    processingTimeMs: integer("processing_time_ms"),
    inngestRunId: text("inngest_run_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("idx_analyses_document").on(table.documentId),
    index("idx_analyses_tenant").on(table.tenantId, table.status),
  ]
)

export const clauseExtractions = pgTable(
  "clause_extractions",
  {
    ...primaryId,
    ...tenantId,
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id").references(() => documentChunks.id),
    category: text("category").notNull(),
    secondaryCategories: text("secondary_categories").array(),
    clauseText: text("clause_text").notNull(),
    startPosition: integer("start_position"),
    endPosition: integer("end_position"),
    confidence: real("confidence").notNull(),
    riskLevel: text("risk_level").notNull(),
    riskExplanation: text("risk_explanation"),
    evidence: jsonb("evidence"),
    metadata: jsonb("metadata").default({}),
    ...timestamps,
  },
  (table) => [
    index("idx_clauses_analysis").on(table.analysisId),
    index("idx_clauses_category").on(table.category),
    index("idx_clauses_tenant").on(table.tenantId),
  ]
)
