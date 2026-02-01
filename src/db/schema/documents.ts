// src/db/schema/documents.ts
import {
  pgTable,
  text,
  uuid,
  integer,
  index,
  unique,
  vector,
  jsonb,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId } from "../_columns"
import { users } from "./auth"

export const documents = pgTable(
  "documents",
  {
    ...primaryId,
    ...tenantId,
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    fileSize: integer("file_size"),
    fileUrl: text("file_url"),
    contentHash: text("content_hash"),
    rawText: text("raw_text"),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").default({}),
    ...timestamps,
  },
  (table) => [
    index("idx_docs_tenant").on(table.tenantId, table.createdAt),
    index("idx_docs_status").on(table.tenantId, table.status),
  ]
)

export const documentChunks = pgTable(
  "document_chunks",
  {
    ...primaryId,
    ...tenantId,
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    sectionPath: text("section_path").array(),
    embedding: vector("embedding", { dimensions: 1024 }),
    tokenCount: integer("token_count"),
    metadata: jsonb("metadata").default({}),
    ...timestamps,
  },
  (table) => [
    unique("chunk_doc_index").on(table.documentId, table.chunkIndex),
    index("idx_chunks_document").on(table.documentId, table.chunkIndex),
    index("idx_chunks_tenant").on(table.tenantId),
  ]
)
