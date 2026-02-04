/**
 * @fileoverview Chat conversation and message persistence schema.
 *
 * This module defines tables for storing chat conversations and their messages.
 * It supports multi-tenant isolation, soft deletes, and automatic timestamp management.
 *
 * ## Architecture Overview
 *
 * The chat persistence follows these patterns:
 * 1. **Conversations**: Container for messages, tracks title and last activity
 * 2. **Messages**: Individual user/assistant messages with attachments and metadata
 * 3. **Auto-updates**: `lastMessageAt` on conversations is automatically updated
 *
 * ## Multi-Tenancy
 *
 * Both tables include `tenantId` for Row-Level Security (RLS) enforcement.
 * All queries should be scoped to the active tenant via the DAL's `withTenant()`.
 *
 * @module db/schema/conversations
 */

import {
  pgTable,
  text,
  uuid,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId, softDelete } from "../_columns"
import { users } from "./auth"
import { documents } from "./documents"

/**
 * Conversations table storing chat sessions.
 *
 * Each conversation represents a chat session between the user and the AI assistant.
 * Conversations can optionally be associated with a document for context.
 *
 * @remarks
 * - `title` can be auto-generated from the first message or set by user
 * - `documentId` is optional - links conversation to a specific document context
 * - `lastMessageAt` is updated automatically when messages are added
 * - Soft deleted conversations cascade-delete their messages
 *
 * @example
 * // Create a new conversation
 * const [conversation] = await db
 *   .insert(conversations)
 *   .values({
 *     tenantId,
 *     userId,
 *     title: "Analyze NDA",
 *     documentId: "some-doc-id", // optional
 *   })
 *   .returning()
 *
 * @see {@link messages} for associated messages table
 */
export const conversations = pgTable(
  "conversations",
  {
    ...primaryId,
    ...timestamps,
    ...tenantId,
    ...softDelete,

    /**
     * User who owns this conversation.
     * Required - every conversation belongs to a user.
     */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Optional document context for this conversation.
     * When set, the conversation is focused on analyzing/discussing this document.
     */
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),

    /**
     * Conversation title/summary.
     * Can be user-provided or auto-generated from first message.
     */
    title: text("title").notNull(),

    /**
     * Timestamp of most recent message.
     * Used for sorting conversations by recency.
     * Updated automatically when messages are added.
     */
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Index for efficient "recent conversations" queries
    tenantUserLastMessageIdx: index("idx_conversations_tenant_user_last_message").on(
      table.tenantId,
      table.userId,
      table.lastMessageAt
    ),
    // Index for document-specific conversations
    tenantDocumentIdx: index("idx_conversations_tenant_document").on(
      table.tenantId,
      table.documentId
    ),
  })
)

/**
 * Messages table storing individual chat messages.
 *
 * Each message belongs to a conversation and can be from either the user or assistant.
 * Messages support file attachments and arbitrary metadata (e.g., artifact references).
 *
 * @remarks
 * - `role` is either "user" or "assistant"
 * - `attachments` stores file URLs and metadata as JSONB
 * - `metadata` can store artifact references, tool calls, etc.
 * - Messages are cascade-deleted when parent conversation is deleted
 *
 * @example
 * // Create a user message
 * await db.insert(messages).values({
 *   conversationId,
 *   role: "user",
 *   content: "Analyze this NDA",
 *   attachments: [{ url: "blob://...", filename: "nda.pdf", mediaType: "application/pdf" }],
 * })
 *
 * @example
 * // Create an assistant message with artifact reference
 * await db.insert(messages).values({
 *   conversationId,
 *   role: "assistant",
 *   content: "I'm analyzing your NDA...",
 *   metadata: { artifactId: "analysis-123", artifactType: "analysis" },
 * })
 *
 * @see {@link conversations} for parent conversation table
 */
export const messages = pgTable(
  "messages",
  {
    ...primaryId,
    ...timestamps,

    /**
     * Parent conversation ID.
     * Messages are cascade-deleted when conversation is removed.
     */
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),

    /**
     * Message sender: "user" or "assistant".
     */
    role: text("role", { enum: ["user", "assistant"] }).notNull(),

    /**
     * Message text content.
     */
    content: text("content").notNull(),

    /**
     * File attachments for this message.
     * Stored as JSONB array of { url, filename?, mediaType? }
     *
     * @example
     * [
     *   {
     *     "url": "blob://xyz",
     *     "filename": "nda.pdf",
     *     "mediaType": "application/pdf"
     *   }
     * ]
     */
    attachments: jsonb("attachments").$type<
      Array<{
        url: string
        filename?: string
        mediaType?: string
      }>
    >(),

    /**
     * Additional message metadata.
     * Can store artifact references, tool calls, error details, etc.
     *
     * @example
     * {
     *   "artifactId": "analysis-123",
     *   "artifactType": "analysis",
     *   "toolCalls": [...]
     * }
     */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    // Index for efficient message list queries
    conversationCreatedIdx: index("idx_messages_conversation_created").on(
      table.conversationId,
      table.createdAt
    ),
  })
)

/**
 * Type definitions for insert operations.
 */
export type NewConversation = typeof conversations.$inferInsert
export type NewMessage = typeof messages.$inferInsert

/**
 * Type definitions for select operations.
 */
export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
