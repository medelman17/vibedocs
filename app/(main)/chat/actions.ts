"use server"

/**
 * @fileoverview Server actions for chat conversation and message persistence.
 *
 * This module provides CRUD operations for managing chat conversations and messages.
 * All operations are tenant-scoped and include proper authorization checks.
 *
 * @module app/(main)/chat/actions
 */

import { z } from "zod"
import { desc, eq, and, isNull, sql } from "drizzle-orm"
import { withTenant } from "@/lib/dal"
import { db } from "@/db"
import { conversations, messages } from "@/db/schema"
import { ok, wrapError, type ApiResponse } from "@/lib/api-response"
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "@/lib/errors"

/**
 * Schema for creating a new conversation.
 */
const createConversationSchema = z.object({
  title: z.string().min(1).max(200),
  documentId: z.string().uuid().optional(),
})

/**
 * Schema for updating conversation title.
 */
const updateConversationTitleSchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string().min(1).max(200),
})

/**
 * Schema for creating a new message.
 */
const createMessageSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  attachments: z
    .array(
      z.object({
        url: z.string().url(),
        filename: z.string().optional(),
        mediaType: z.string().optional(),
      })
    )
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Schema for conversation list query.
 */
const getConversationsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  documentId: z.string().uuid().optional(),
})

/**
 * Create a new conversation.
 *
 * @param data - Conversation creation data
 * @returns API response with created conversation
 *
 * @example
 * const result = await createConversation({
 *   title: "Analyze NDA",
 *   documentId: "some-doc-id",
 * })
 */
export async function createConversation(
  data: z.infer<typeof createConversationSchema>
): Promise<ApiResponse<{ id: string; title: string }>> {
  try {
    const parsed = createConversationSchema.safeParse(data)
    if (!parsed.success) {
      return wrapError(ValidationError.fromZodError(parsed.error))
    }

    const { db, tenantId, userId } = await withTenant()

    const [conversation] = await db
      .insert(conversations)
      .values({
        tenantId,
        userId,
        title: parsed.data.title,
        documentId: parsed.data.documentId,
      })
      .returning({ id: conversations.id, title: conversations.title })

    return ok(conversation)
  } catch (e) {
    return wrapError(e)
  }
}

/**
 * Get list of conversations for the current user.
 *
 * @param params - Query parameters (limit, offset, documentId)
 * @returns API response with conversations and message counts
 *
 * @example
 * const result = await getConversations({ limit: 20, offset: 0 })
 */
export async function getConversations(
  params?: z.infer<typeof getConversationsSchema>
): Promise<
  ApiResponse<
    Array<{
      id: string
      title: string
      createdAt: Date
      lastMessageAt: Date
      documentId: string | null
      messageCount: number
    }>
  >
> {
  try {
    const parsed = getConversationsSchema.safeParse(params || {})
    if (!parsed.success) {
      return wrapError(ValidationError.fromZodError(parsed.error))
    }

    const { db, tenantId, userId } = await withTenant()

    // Build where conditions
    const conditions = [
      eq(conversations.tenantId, tenantId),
      eq(conversations.userId, userId),
      isNull(conversations.deletedAt),
    ]

    if (parsed.data.documentId) {
      conditions.push(eq(conversations.documentId, parsed.data.documentId))
    }

    // Query conversations with message counts
    const result = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        createdAt: conversations.createdAt,
        lastMessageAt: conversations.lastMessageAt,
        documentId: conversations.documentId,
        messageCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${messages}
          WHERE ${messages.conversationId} = ${conversations.id}
        )`,
      })
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(parsed.data.limit)
      .offset(parsed.data.offset)

    return ok(result)
  } catch (e) {
    return wrapError(e)
  }
}

/**
 * Get a single conversation by ID.
 *
 * @param conversationId - Conversation UUID
 * @returns API response with conversation data
 *
 * @example
 * const result = await getConversation("conversation-uuid")
 */
export async function getConversation(
  conversationId: string
): Promise<
  ApiResponse<{
    id: string
    title: string
    createdAt: Date
    lastMessageAt: Date
    documentId: string | null
  }>
> {
  try {
    const { db, tenantId, userId } = await withTenant()

    const [conversation] = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        createdAt: conversations.createdAt,
        lastMessageAt: conversations.lastMessageAt,
        documentId: conversations.documentId,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.tenantId, tenantId),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt)
        )
      )

    if (!conversation) {
      return wrapError(new NotFoundError("Conversation not found"))
    }

    return ok(conversation)
  } catch (e) {
    return wrapError(e)
  }
}

/**
 * Update conversation title.
 *
 * @param data - Update data with conversationId and new title
 * @returns API response with updated conversation
 *
 * @example
 * const result = await updateConversationTitle({
 *   conversationId: "uuid",
 *   title: "New Title",
 * })
 */
export async function updateConversationTitle(
  data: z.infer<typeof updateConversationTitleSchema>
): Promise<ApiResponse<{ id: string; title: string }>> {
  try {
    const parsed = updateConversationTitleSchema.safeParse(data)
    if (!parsed.success) {
      return wrapError(ValidationError.fromZodError(parsed.error))
    }

    const { db, tenantId, userId } = await withTenant()

    // Verify ownership
    const [existing] = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, parsed.data.conversationId),
          eq(conversations.tenantId, tenantId),
          isNull(conversations.deletedAt)
        )
      )

    if (!existing) {
      return wrapError(new NotFoundError("Conversation not found"))
    }

    if (existing.userId !== userId) {
      return wrapError(new ForbiddenError("Not authorized to update this conversation"))
    }

    // Update title
    const [updated] = await db
      .update(conversations)
      .set({ title: parsed.data.title })
      .where(eq(conversations.id, parsed.data.conversationId))
      .returning({ id: conversations.id, title: conversations.title })

    return ok(updated)
  } catch (e) {
    return wrapError(e)
  }
}

/**
 * Soft delete a conversation.
 *
 * @param conversationId - Conversation UUID
 * @returns API response with success status
 *
 * @example
 * const result = await deleteConversation("conversation-uuid")
 */
export async function deleteConversation(
  conversationId: string
): Promise<ApiResponse<{ deleted: boolean }>> {
  try {
    const { db, tenantId, userId } = await withTenant()

    // Verify ownership
    const [existing] = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.tenantId, tenantId),
          isNull(conversations.deletedAt)
        )
      )

    if (!existing) {
      return wrapError(new NotFoundError("Conversation not found"))
    }

    if (existing.userId !== userId) {
      return wrapError(new ForbiddenError("Not authorized to delete this conversation"))
    }

    // Soft delete
    await db
      .update(conversations)
      .set({ deletedAt: new Date() })
      .where(eq(conversations.id, conversationId))

    return ok({ deleted: true })
  } catch (e) {
    return wrapError(e)
  }
}

/**
 * Create a new message in a conversation.
 * Automatically updates the parent conversation's lastMessageAt timestamp.
 *
 * @param data - Message creation data
 * @returns API response with created message
 *
 * @example
 * const result = await createMessage({
 *   conversationId: "uuid",
 *   role: "user",
 *   content: "Hello",
 *   attachments: [{ url: "blob://...", filename: "file.pdf" }],
 * })
 */
export async function createMessage(
  data: z.infer<typeof createMessageSchema>
): Promise<ApiResponse<{ id: string; createdAt: Date }>> {
  try {
    const parsed = createMessageSchema.safeParse(data)
    if (!parsed.success) {
      return wrapError(ValidationError.fromZodError(parsed.error))
    }

    const { db, tenantId, userId } = await withTenant()

    // Verify conversation exists and user owns it
    const [conversation] = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, parsed.data.conversationId),
          eq(conversations.tenantId, tenantId),
          isNull(conversations.deletedAt)
        )
      )

    if (!conversation) {
      return wrapError(new NotFoundError("Conversation not found"))
    }

    if (conversation.userId !== userId) {
      return wrapError(new ForbiddenError("Not authorized to add messages to this conversation"))
    }

    // Insert message
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: parsed.data.conversationId,
        role: parsed.data.role,
        content: parsed.data.content,
        attachments: parsed.data.attachments,
        metadata: parsed.data.metadata,
      })
      .returning({ id: messages.id, createdAt: messages.createdAt })

    // Update conversation's lastMessageAt
    await db
      .update(conversations)
      .set({ lastMessageAt: message.createdAt })
      .where(eq(conversations.id, parsed.data.conversationId))

    return ok(message)
  } catch (e) {
    return wrapError(e)
  }
}

/**
 * Get all messages for a conversation.
 *
 * @param conversationId - Conversation UUID
 * @returns API response with messages ordered by creation time
 *
 * @example
 * const result = await getMessages("conversation-uuid")
 */
export async function getMessages(
  conversationId: string
): Promise<
  ApiResponse<
    Array<{
      id: string
      role: "user" | "assistant"
      content: string
      createdAt: Date
      attachments: Array<{ url: string; filename?: string; mediaType?: string }> | null
      metadata: Record<string, unknown> | null
    }>
  >
> {
  try {
    const { db, tenantId, userId } = await withTenant()

    // Verify conversation exists and user owns it
    const [conversation] = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.tenantId, tenantId),
          isNull(conversations.deletedAt)
        )
      )

    if (!conversation) {
      return wrapError(new NotFoundError("Conversation not found"))
    }

    if (conversation.userId !== userId) {
      return wrapError(new ForbiddenError("Not authorized to view messages in this conversation"))
    }

    // Fetch messages
    const result = await db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
        attachments: messages.attachments,
        metadata: messages.metadata,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)

    return ok(result)
  } catch (e) {
    return wrapError(e)
  }
}

// ============================================================================
// Internal Functions (bypass withTenant for use in streaming callbacks)
// ============================================================================
// These functions accept pre-captured tenant context directly, avoiding the
// request-context dependency that causes issues in onFinish callbacks.
// IMPORTANT: Only use from API routes that have already verified auth.

/**
 * Schema for internal conversation creation (includes tenant context).
 */
const createConversationInternalSchema = z.object({
  title: z.string().min(1).max(200),
  documentId: z.string().uuid().optional(),
  tenantId: z.string(),
  userId: z.string(),
})

/**
 * Internal: Create conversation with pre-captured context.
 * Use this from streaming callbacks where request context is unavailable.
 */
export async function createConversationInternal(
  data: z.infer<typeof createConversationInternalSchema>
): Promise<ApiResponse<{ id: string; title: string }>> {
  try {
    const parsed = createConversationInternalSchema.safeParse(data)
    if (!parsed.success) {
      return wrapError(ValidationError.fromZodError(parsed.error))
    }

    const { tenantId, userId, title, documentId } = parsed.data

    const [conversation] = await db
      .insert(conversations)
      .values({
        tenantId,
        userId,
        title,
        documentId,
      })
      .returning({ id: conversations.id, title: conversations.title })

    return ok(conversation)
  } catch (e) {
    return wrapError(e)
  }
}

/**
 * Schema for internal message creation (includes tenant context).
 */
const createMessageInternalSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  attachments: z
    .array(
      z.object({
        url: z.string().url(),
        filename: z.string().optional(),
        mediaType: z.string().optional(),
      })
    )
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tenantId: z.string(),
  userId: z.string(),
})

/**
 * Internal: Create message with pre-captured context.
 * Use this from streaming callbacks where request context is unavailable.
 */
export async function createMessageInternal(
  data: z.infer<typeof createMessageInternalSchema>
): Promise<ApiResponse<{ id: string; createdAt: Date }>> {
  try {
    const parsed = createMessageInternalSchema.safeParse(data)
    if (!parsed.success) {
      return wrapError(ValidationError.fromZodError(parsed.error))
    }

    const { tenantId, userId, conversationId, role, content, attachments, metadata } = parsed.data

    // Verify conversation exists and user owns it
    const [conversation] = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.tenantId, tenantId),
          isNull(conversations.deletedAt)
        )
      )

    if (!conversation) {
      return wrapError(new NotFoundError("Conversation not found"))
    }

    if (conversation.userId !== userId) {
      return wrapError(new ForbiddenError("Not authorized to add messages to this conversation"))
    }

    // Insert message
    const [message] = await db
      .insert(messages)
      .values({
        conversationId,
        role,
        content,
        attachments,
        metadata,
      })
      .returning({ id: messages.id, createdAt: messages.createdAt })

    // Update conversation's lastMessageAt
    await db
      .update(conversations)
      .set({ lastMessageAt: message.createdAt })
      .where(eq(conversations.id, conversationId))

    return ok(message)
  } catch (e) {
    return wrapError(e)
  }
}

/**
 * Schema for internal title update (includes tenant context).
 */
const updateConversationTitleInternalSchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string().min(1).max(200),
  tenantId: z.string(),
  userId: z.string(),
})

/**
 * Internal: Update conversation title with pre-captured context.
 * Use this from streaming callbacks where request context is unavailable.
 */
export async function updateConversationTitleInternal(
  data: z.infer<typeof updateConversationTitleInternalSchema>
): Promise<ApiResponse<{ id: string; title: string }>> {
  try {
    const parsed = updateConversationTitleInternalSchema.safeParse(data)
    if (!parsed.success) {
      return wrapError(ValidationError.fromZodError(parsed.error))
    }

    const { tenantId, userId, conversationId, title } = parsed.data

    // Verify ownership
    const [existing] = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.tenantId, tenantId),
          isNull(conversations.deletedAt)
        )
      )

    if (!existing) {
      return wrapError(new NotFoundError("Conversation not found"))
    }

    if (existing.userId !== userId) {
      return wrapError(new ForbiddenError("Not authorized to update this conversation"))
    }

    // Update title
    const [updated] = await db
      .update(conversations)
      .set({ title })
      .where(eq(conversations.id, conversationId))
      .returning({ id: conversations.id, title: conversations.title })

    return ok(updated)
  } catch (e) {
    return wrapError(e)
  }
}
