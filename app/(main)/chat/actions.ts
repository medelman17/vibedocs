"use server"

/**
 * @fileoverview Conversation and Message Server Actions
 *
 * This module provides Server Actions for chat conversation and message management
 * in the VibeDocs application. All actions enforce tenant isolation via the DAL's `withTenant()`.
 *
 * @module app/(main)/chat/actions
 */

import { z } from "zod"
import { withTenant, verifySession } from "@/lib/dal"
import { ok, err, type ApiResponse } from "@/lib/api-response"
import { conversations, messages } from "@/db/schema"
import { eq, and, isNull, desc, sql } from "drizzle-orm"

// ============================================================================
// Types
// ============================================================================

/** Conversation record returned from queries */
export type Conversation = typeof conversations.$inferSelect

/** Message record returned from queries */
export type Message = typeof messages.$inferSelect

/** Conversation with message count */
export interface ConversationWithCount extends Conversation {
  messageCount: number
}

/** File attachment structure for messages */
export interface FileAttachment {
  url: string
  filename?: string
  mediaType?: string
}

/** Artifact reference structure in message metadata */
export interface ArtifactReference {
  type: "document" | "analysis"
  id: string
  title: string
}

// ============================================================================
// Validation Schemas
// ============================================================================

/** Schema for creating a new conversation */
const createConversationInputSchema = z.object({
  title: z.string().min(1).max(255).trim(),
  contextDocumentId: z.string().uuid().optional(),
})

/** Schema for updating conversation title */
const updateConversationInputSchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string().min(1).max(255).trim(),
})

/** Schema for creating a new message */
const createMessageInputSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  files: z
    .array(
      z.object({
        url: z.string().url(),
        filename: z.string().optional(),
        mediaType: z.string().optional(),
      })
    )
    .default([]),
  metadata: z.record(z.unknown()).default({}),
})

/** Schema for getConversations */
const getConversationsInputSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
})

/** Schema for conversation ID parameter */
const conversationIdSchema = z.object({
  conversationId: z.string().uuid(),
})

// ============================================================================
// Conversation Actions
// ============================================================================

/**
 * Create a new conversation.
 *
 * @param input - Conversation creation data
 * @returns The created conversation
 *
 * @example
 * const result = await createConversation({
 *   title: "NDA Analysis Discussion",
 *   contextDocumentId: "doc-uuid"
 * })
 */
export async function createConversation(
  input: z.infer<typeof createConversationInputSchema>
): Promise<ApiResponse<Conversation>> {
  try {
    // Validate input
    const parsed = createConversationInputSchema.safeParse(input)
    if (!parsed.success) {
      return err({ code: "VALIDATION_ERROR", message: parsed.error.issues[0].message })
    }

    const { db, tenantId } = await withTenant()
    const { userId } = await verifySession()

    // Create conversation
    const [conversation] = await db
      .insert(conversations)
      .values({
        tenantId,
        userId,
        title: parsed.data.title,
        contextDocumentId: parsed.data.contextDocumentId,
        lastMessageAt: new Date(),
      })
      .returning()

    return ok(conversation)
  } catch (error) {
    console.error("Error creating conversation:", error)
    return err({
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Failed to create conversation",
    })
  }
}

/**
 * Get all conversations for the current user.
 *
 * @param options - Query options (limit, offset)
 * @returns List of conversations ordered by lastMessageAt
 *
 * @example
 * const result = await getConversations({ limit: 20, offset: 0 })
 */
export async function getConversations(
  options: z.infer<typeof getConversationsInputSchema> = {}
): Promise<ApiResponse<ConversationWithCount[]>> {
  try {
    // Validate input
    const parsed = getConversationsInputSchema.safeParse(options)
    if (!parsed.success) {
      return err({ code: "VALIDATION_ERROR", message: parsed.error.issues[0].message })
    }

    const { db, tenantId } = await withTenant()
    const { userId } = await verifySession()

    // Query conversations with message count
    const results = await db
      .select({
        id: conversations.id,
        tenantId: conversations.tenantId,
        userId: conversations.userId,
        title: conversations.title,
        contextDocumentId: conversations.contextDocumentId,
        metadata: conversations.metadata,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        deletedAt: conversations.deletedAt,
        messageCount: sql<number>`cast(count(${messages.id}) as integer)`,
      })
      .from(conversations)
      .leftJoin(messages, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.tenantId, tenantId),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt)
        )
      )
      .groupBy(conversations.id)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(parsed.data.limit)
      .offset(parsed.data.offset)

    return ok(results)
  } catch (error) {
    console.error("Error fetching conversations:", error)
    return err({
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Failed to fetch conversations",
    })
  }
}

/**
 * Get a single conversation by ID.
 *
 * @param conversationId - The conversation ID
 * @returns The conversation or null if not found
 *
 * @example
 * const result = await getConversation({ conversationId: "conv-uuid" })
 */
export async function getConversation(
  input: z.infer<typeof conversationIdSchema>
): Promise<ApiResponse<Conversation | null>> {
  try {
    // Validate input
    const parsed = conversationIdSchema.safeParse(input)
    if (!parsed.success) {
      return err({ code: "VALIDATION_ERROR", message: parsed.error.issues[0].message })
    }

    const { db, tenantId } = await withTenant()
    const { userId } = await verifySession()

    // Query conversation
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, parsed.data.conversationId),
          eq(conversations.tenantId, tenantId),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt)
        )
      )
      .limit(1)

    return ok(conversation || null)
  } catch (error) {
    console.error("Error fetching conversation:", error)
    return err({
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Failed to fetch conversation",
    })
  }
}

/**
 * Update conversation title.
 *
 * @param input - Conversation ID and new title
 * @returns The updated conversation
 *
 * @example
 * const result = await updateConversationTitle({
 *   conversationId: "conv-uuid",
 *   title: "Updated Title"
 * })
 */
export async function updateConversationTitle(
  input: z.infer<typeof updateConversationInputSchema>
): Promise<ApiResponse<Conversation>> {
  try {
    // Validate input
    const parsed = updateConversationInputSchema.safeParse(input)
    if (!parsed.success) {
      return err({ code: "VALIDATION_ERROR", message: parsed.error.issues[0].message })
    }

    const { db, tenantId } = await withTenant()
    const { userId } = await verifySession()

    // Update conversation
    const [conversation] = await db
      .update(conversations)
      .set({ title: parsed.data.title })
      .where(
        and(
          eq(conversations.id, parsed.data.conversationId),
          eq(conversations.tenantId, tenantId),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt)
        )
      )
      .returning()

    if (!conversation) {
      return err({ code: "NOT_FOUND", message: "Conversation not found" })
    }

    return ok(conversation)
  } catch (error) {
    console.error("Error updating conversation:", error)
    return err({
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Failed to update conversation",
    })
  }
}

/**
 * Soft delete a conversation.
 *
 * @param input - Conversation ID
 * @returns Success response
 *
 * @example
 * const result = await deleteConversation({ conversationId: "conv-uuid" })
 */
export async function deleteConversation(
  input: z.infer<typeof conversationIdSchema>
): Promise<ApiResponse<void>> {
  try {
    // Validate input
    const parsed = conversationIdSchema.safeParse(input)
    if (!parsed.success) {
      return err({ code: "VALIDATION_ERROR", message: parsed.error.issues[0].message })
    }

    const { db, tenantId } = await withTenant()
    const { userId } = await verifySession()

    // Soft delete conversation
    const [conversation] = await db
      .update(conversations)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(conversations.id, parsed.data.conversationId),
          eq(conversations.tenantId, tenantId),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt)
        )
      )
      .returning({ id: conversations.id })

    if (!conversation) {
      return err({ code: "NOT_FOUND", message: "Conversation not found" })
    }

    return ok(undefined)
  } catch (error) {
    console.error("Error deleting conversation:", error)
    return err({
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Failed to delete conversation",
    })
  }
}

// ============================================================================
// Message Actions
// ============================================================================

/**
 * Create a new message in a conversation.
 *
 * Automatically updates the conversation's lastMessageAt timestamp.
 *
 * @param input - Message creation data
 * @returns The created message
 *
 * @example
 * const result = await createMessage({
 *   conversationId: "conv-uuid",
 *   role: "user",
 *   content: "Analyze this NDA",
 *   files: [{ url: "blob://...", filename: "nda.pdf" }]
 * })
 */
export async function createMessage(
  input: z.infer<typeof createMessageInputSchema>
): Promise<ApiResponse<Message>> {
  try {
    // Validate input
    const parsed = createMessageInputSchema.safeParse(input)
    if (!parsed.success) {
      return err({ code: "VALIDATION_ERROR", message: parsed.error.issues[0].message })
    }

    const { db, tenantId } = await withTenant()
    const { userId } = await verifySession()

    // Verify conversation exists and belongs to user
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, parsed.data.conversationId),
          eq(conversations.tenantId, tenantId),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt)
        )
      )
      .limit(1)

    if (!conversation) {
      return err({ code: "NOT_FOUND", message: "Conversation not found" })
    }

    // Create message and update conversation lastMessageAt in a transaction
    const [message] = await db.transaction(async (tx) => {
      // Insert message
      const [newMessage] = await tx
        .insert(messages)
        .values({
          tenantId,
          conversationId: parsed.data.conversationId,
          role: parsed.data.role,
          content: parsed.data.content,
          files: parsed.data.files,
          metadata: parsed.data.metadata,
        })
        .returning()

      // Update conversation lastMessageAt
      await tx
        .update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversations.id, parsed.data.conversationId))

      return [newMessage]
    })

    return ok(message)
  } catch (error) {
    console.error("Error creating message:", error)
    return err({
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Failed to create message",
    })
  }
}

/**
 * Get all messages for a conversation.
 *
 * @param input - Conversation ID
 * @returns List of messages ordered chronologically
 *
 * @example
 * const result = await getMessages({ conversationId: "conv-uuid" })
 */
export async function getMessages(
  input: z.infer<typeof conversationIdSchema>
): Promise<ApiResponse<Message[]>> {
  try {
    // Validate input
    const parsed = conversationIdSchema.safeParse(input)
    if (!parsed.success) {
      return err({ code: "VALIDATION_ERROR", message: parsed.error.issues[0].message })
    }

    const { db, tenantId } = await withTenant()
    const { userId } = await verifySession()

    // Verify conversation exists and belongs to user
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, parsed.data.conversationId),
          eq(conversations.tenantId, tenantId),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt)
        )
      )
      .limit(1)

    if (!conversation) {
      return err({ code: "NOT_FOUND", message: "Conversation not found" })
    }

    // Query messages
    const messageList = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, parsed.data.conversationId),
          eq(messages.tenantId, tenantId)
        )
      )
      .orderBy(messages.createdAt)

    return ok(messageList)
  } catch (error) {
    console.error("Error fetching messages:", error)
    return err({
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Failed to fetch messages",
    })
  }
}
