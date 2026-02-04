/**
 * @fileoverview Conversation and message schema for chat history persistence.
 *
 * This module defines the schema for storing chat conversations and their messages
 * in the VibeDocs application. Conversations represent chat sessions where users
 * interact with the AI assistant, upload documents, and receive analysis.
 *
 * ## Architecture Overview
 *
 * The conversation model follows these patterns:
 * 1. **Conversation**: Top-level container for a chat session
 * 2. **Messages**: Individual user/assistant messages within a conversation
 * 3. **Artifact References**: Messages can reference documents/analyses via metadata
 * 4. **File Attachments**: User messages can include file uploads
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
  jsonb,
  index,
  timestamp,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId, softDelete } from "../_columns"
import { users } from "./auth"
import { documents } from "./documents"

/**
 * Conversations table storing chat session metadata.
 *
 * Each conversation represents a chat session where a user interacts with the
 * AI assistant. Conversations can be associated with specific documents being
 * analyzed or can be general inquiries.
 *
 * @description Stores chat conversation sessions with metadata and optional document context.
 *
 * ## Fields
 *
 * | Field | Type | Description |
 * |-------|------|-------------|
 * | `id` | UUID | Primary key (auto-generated) |
 * | `tenantId` | UUID | Organization ID for RLS enforcement |
 * | `userId` | UUID | User who created this conversation |
 * | `title` | text | Display title (auto-generated from first message or user-provided) |
 * | `contextDocumentId` | UUID | Optional reference to primary document being discussed |
 * | `metadata` | JSONB | Extensible metadata (tags, context, etc.) |
 * | `lastMessageAt` | timestamp | Timestamp of most recent message (for sorting) |
 * | `createdAt` | timestamp | Record creation time |
 * | `updatedAt` | timestamp | Last modification time |
 * | `deletedAt` | timestamp | Soft deletion timestamp (null if active) |
 *
 * ## Indexes
 *
 * - `idx_conversations_tenant_user`: Composite index on (tenantId, userId, lastMessageAt) for user's conversation list
 * - `idx_conversations_document`: Index for finding conversations related to a document
 */
export const conversations = pgTable(
  "conversations",
  {
    ...primaryId,
    ...tenantId,

    /**
     * User who created this conversation.
     */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Display title for the conversation.
     * Auto-generated from first message or user-provided.
     */
    title: text("title").notNull(),

    /**
     * Optional reference to a document being discussed in this conversation.
     * Useful for showing document-specific chat history.
     */
    contextDocumentId: uuid("context_document_id").references(
      () => documents.id,
      { onDelete: "set null" }
    ),

    /**
     * Extensible metadata field.
     * Can include: tags, favorite status, custom notes, etc.
     */
    metadata: jsonb("metadata").default({}),

    /**
     * Timestamp of the most recent message in this conversation.
     * Used for sorting conversations by recency.
     */
    lastMessageAt: timestamp("last_message_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    /**
     * Composite index for efficient user conversation listing.
     * Optimizes "get all conversations for user X ordered by last message".
     */
    index("idx_conversations_tenant_user").on(
      table.tenantId,
      table.userId,
      table.lastMessageAt
    ),

    /**
     * Index for finding conversations related to a specific document.
     */
    index("idx_conversations_document").on(table.contextDocumentId),
  ]
)

/**
 * Messages table storing individual chat messages within conversations.
 *
 * Each message represents a single turn in the conversation, from either the
 * user or the assistant. Messages can include text content, file attachments,
 * and references to artifacts (documents, analyses).
 *
 * @description Stores individual messages within chat conversations.
 *
 * ## Fields
 *
 * | Field | Type | Description |
 * |-------|------|-------------|
 * | `id` | UUID | Primary key (auto-generated) |
 * | `tenantId` | UUID | Organization ID for RLS enforcement |
 * | `conversationId` | UUID | Reference to parent conversation (cascading delete) |
 * | `role` | text | Message sender: 'user' or 'assistant' |
 * | `content` | text | The text content of the message |
 * | `files` | JSONB | Array of file attachments (url, filename, mediaType) |
 * | `metadata` | JSONB | Message metadata (artifact references, streaming state, etc.) |
 * | `createdAt` | timestamp | Message creation time |
 * | `updatedAt` | timestamp | Last modification time |
 *
 * ## Message Roles
 *
 * - `'user'` - Message from the user
 * - `'assistant'` - Message from the AI assistant
 *
 * ## File Attachments Format
 *
 * The `files` field stores an array of file objects:
 * ```json
 * [
 *   {
 *     "url": "https://blob.vercel-storage.com/...",
 *     "filename": "document.pdf",
 *     "mediaType": "application/pdf"
 *   }
 * ]
 * ```
 *
 * ## Metadata Format
 *
 * The `metadata` field can include:
 * ```json
 * {
 *   "artifactReferences": [
 *     { "type": "document", "id": "uuid", "title": "NDA Analysis" },
 *     { "type": "analysis", "id": "uuid", "title": "Risk Assessment" }
 *   ],
 *   "streamingComplete": true,
 *   "errorMessage": "Processing failed"
 * }
 * ```
 *
 * ## Indexes
 *
 * - `idx_messages_conversation`: Composite index on (conversationId, createdAt) for ordered message retrieval
 * - `idx_messages_tenant`: Index for tenant-scoped queries
 */
export const messages = pgTable(
  "messages",
  {
    ...primaryId,
    ...tenantId,

    /**
     * Reference to the parent conversation.
     * Cascading delete ensures messages are removed when conversation is deleted.
     */
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),

    /**
     * Role of the message sender.
     * Either 'user' (human) or 'assistant' (AI).
     */
    role: text("role").notNull().$type<"user" | "assistant">(),

    /**
     * The text content of the message.
     */
    content: text("content").notNull(),

    /**
     * Array of file attachments associated with this message.
     * Typically user messages with uploaded documents.
     *
     * Format: [{ url: string, filename?: string, mediaType?: string }]
     */
    files: jsonb("files")
      .default([])
      .$type<Array<{ url: string; filename?: string; mediaType?: string }>>(),

    /**
     * Extensible metadata field.
     * Can include artifact references, streaming state, error messages, etc.
     *
     * Example:
     * {
     *   artifactReferences: [{ type: "analysis", id: "uuid", title: "..." }],
     *   streamingComplete: true
     * }
     */
    metadata: jsonb("metadata").default({}),

    ...timestamps,
  },
  (table) => [
    /**
     * Composite index for efficient ordered retrieval of conversation messages.
     * Optimizes "get all messages for conversation X in chronological order".
     */
    index("idx_messages_conversation").on(table.conversationId, table.createdAt),

    /**
     * Index for tenant-scoped message queries.
     */
    index("idx_messages_tenant").on(table.tenantId),
  ]
)
