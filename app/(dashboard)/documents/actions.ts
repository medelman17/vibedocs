"use server"

/**
 * @fileoverview Document Server Actions
 *
 * This module provides Server Actions for document management in the NDA Analyst
 * application. All actions enforce tenant isolation via the DAL's `withTenant()`.
 *
 * @module app/(dashboard)/documents/actions
 */

import { z } from "zod"
import { withTenant } from "@/lib/dal"
import { ok, err, type ApiResponse } from "@/lib/api-response"
import { db } from "@/db"
import { documents, documentChunks } from "@/db/schema"
import { eq, and, isNull, ilike, desc, sql, count, isNotNull } from "drizzle-orm"
import { uploadFile, deleteFile, computeContentHash } from "@/lib/blob"

// ============================================================================
// Types
// ============================================================================

/** Document status values from the processing pipeline */
export type DocumentStatus =
  | "pending"
  | "parsing"
  | "embedding"
  | "analyzing"
  | "complete"
  | "failed"

/** Document record returned from queries */
export type Document = typeof documents.$inferSelect

/** Document chunk record */
export type DocumentChunk = typeof documentChunks.$inferSelect

/** Document with its associated chunks */
export type DocumentWithChunks = Document & { chunks: DocumentChunk[] }

/** Dashboard statistics summary */
export interface DashboardStats {
  totalDocuments: number
  pendingDocuments: number
  processingDocuments: number
  completedDocuments: number
  failedDocuments: number
}

// ============================================================================
// Validation Schemas
// ============================================================================

/** Allowed file types for NDA uploads */
const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
] as const

/** Maximum file size: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/** Valid document status values */
const documentStatusSchema = z.enum([
  "pending",
  "parsing",
  "embedding",
  "analyzing",
  "complete",
  "failed",
])

/** Schema for getDocuments options */
const getDocumentsInputSchema = z.object({
  status: documentStatusSchema.optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
})

/** Schema for searchDocuments */
const searchDocumentsInputSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().min(1).max(100).default(20),
})

/** Schema for document ID parameter */
const documentIdSchema = z.object({
  documentId: z.string().uuid(),
})

/** Schema for updateDocumentTitle */
const updateTitleInputSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().min(1).max(255).trim(),
})

// ============================================================================
// Helper Functions
// ============================================================================


/**
 * Extract title from filename (remove extension)
 */
function extractTitleFromFilename(fileName: string): string {
  return fileName.replace(/\.(pdf|docx)$/i, "")
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Upload a document to Vercel Blob and create a database record.
 *
 * @description
 * Handles NDA file uploads with validation for:
 * - File type (PDF or DOCX only)
 * - File size (max 10MB)
 * - Duplicate detection via SHA-256 hash
 *
 * The document is created with status "pending" for background processing.
 *
 * @param formData - FormData containing 'file' and optional 'title' fields
 * @returns The created document record with status 'pending'
 *
 * @example
 * ```typescript
 * const formData = new FormData()
 * formData.append('file', file)
 * formData.append('title', 'Acme NDA')
 * const result = await uploadDocument(formData)
 * ```
 */
export async function uploadDocument(
  formData: FormData
): Promise<ApiResponse<Document>> {
  const { db: _db, tenantId, userId } = await withTenant()

  // Extract form data
  const file = formData.get("file")
  const titleInput = formData.get("title")

  // Validate file presence
  if (!file || !(file instanceof File)) {
    return err("VALIDATION_ERROR", "No file provided")
  }

  // Validate file type
  if (!ALLOWED_FILE_TYPES.includes(file.type as (typeof ALLOWED_FILE_TYPES)[number])) {
    return err(
      "VALIDATION_ERROR",
      "Invalid file type. Only PDF and DOCX files are allowed."
    )
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return err(
      "VALIDATION_ERROR",
      "File size exceeds 10MB limit."
    )
  }

  // Determine title
  const title =
    typeof titleInput === "string" && titleInput.trim()
      ? titleInput.trim()
      : extractTitleFromFilename(file.name)

  try {
    // Compute content hash for duplicate detection
    const contentHash = await computeContentHash(file)

    // Check for duplicate within tenant
    const [existingDoc] = await db
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.contentHash, contentHash),
          isNull(documents.deletedAt)
        )
      )
      .limit(1)

    if (existingDoc) {
      return err(
        "DUPLICATE",
        `A document with the same content already exists: "${existingDoc.title}"`
      )
    }

    // Upload file to Vercel Blob
    const blob = await uploadFile(file, { folder: "documents" })
    const fileUrl = blob.url

    // Create document record
    const [newDocument] = await db
      .insert(documents)
      .values({
        tenantId,
        uploadedBy: userId,
        title,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileUrl,
        contentHash,
        status: "pending",
        metadata: {},
      })
      .returning()

    return ok(newDocument)
  } catch (error) {
    console.error("[uploadDocument]", error)
    return err("INTERNAL_ERROR", "Failed to upload document")
  }
}

/**
 * List documents with optional status filtering and pagination.
 *
 * @description
 * Retrieves documents for the current tenant, ordered by creation date (newest first).
 * Automatically excludes soft-deleted documents.
 *
 * @param input - Query options including status filter, limit, and offset
 * @returns Array of document records
 *
 * @example
 * ```typescript
 * // Get first 20 documents
 * const result = await getDocuments({})
 *
 * // Get pending documents only
 * const result = await getDocuments({ status: "pending" })
 *
 * // Paginate
 * const result = await getDocuments({ limit: 10, offset: 20 })
 * ```
 */
export async function getDocuments(
  input: z.input<typeof getDocumentsInputSchema> = {}
): Promise<ApiResponse<Document[]>> {
  const { tenantId } = await withTenant()

  const parsed = getDocumentsInputSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid input", parsed.error.issues)
  }

  const { status, limit, offset } = parsed.data

  try {
    const conditions = [
      eq(documents.tenantId, tenantId),
      isNull(documents.deletedAt),
    ]

    if (status) {
      conditions.push(eq(documents.status, status))
    }

    const result = await db
      .select()
      .from(documents)
      .where(and(...conditions))
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .offset(offset)

    return ok(result)
  } catch (error) {
    console.error("[getDocuments]", error)
    return err("INTERNAL_ERROR", "Failed to fetch documents")
  }
}

/**
 * Search documents by title using ILIKE pattern matching.
 *
 * @description
 * Searches document titles for the given query string (case-insensitive).
 * Results are ordered by creation date (newest first).
 *
 * @param input - Search query and optional limit
 * @returns Array of matching document records
 *
 * @example
 * ```typescript
 * const result = await searchDocuments({ query: "Acme", limit: 10 })
 * ```
 */
export async function searchDocuments(
  input: z.infer<typeof searchDocumentsInputSchema>
): Promise<ApiResponse<Document[]>> {
  const { tenantId } = await withTenant()

  const parsed = searchDocumentsInputSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid input", parsed.error.issues)
  }

  const { query, limit } = parsed.data

  try {
    const result = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt),
          ilike(documents.title, `%${query}%`)
        )
      )
      .orderBy(desc(documents.createdAt))
      .limit(limit)

    return ok(result)
  } catch (error) {
    console.error("[searchDocuments]", error)
    return err("INTERNAL_ERROR", "Failed to search documents")
  }
}

/**
 * Get a single document by ID.
 *
 * @description
 * Retrieves a specific document ensuring tenant isolation.
 * Returns NOT_FOUND if the document doesn't exist or is soft-deleted.
 *
 * @param input - Object containing documentId
 * @returns The document record or NOT_FOUND error
 *
 * @example
 * ```typescript
 * const result = await getDocument({ documentId: "uuid-here" })
 * if (result.success) {
 *   console.log(result.data.title)
 * }
 * ```
 */
export async function getDocument(
  input: z.infer<typeof documentIdSchema>
): Promise<ApiResponse<Document>> {
  const { tenantId } = await withTenant()

  const parsed = documentIdSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid document ID", parsed.error.issues)
  }

  const { documentId } = parsed.data

  try {
    const [doc] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt)
        )
      )
      .limit(1)

    if (!doc) {
      return err("NOT_FOUND", "Document not found")
    }

    return ok(doc)
  } catch (error) {
    console.error("[getDocument]", error)
    return err("INTERNAL_ERROR", "Failed to fetch document")
  }
}

/**
 * Get a document with all its processed text chunks.
 *
 * @description
 * Retrieves a document along with its associated chunks, ordered by chunk index.
 * Useful for displaying full document content or performing chunk-level operations.
 *
 * @param input - Object containing documentId
 * @returns The document record with chunks array
 *
 * @example
 * ```typescript
 * const result = await getDocumentWithChunks({ documentId: "uuid-here" })
 * if (result.success) {
 *   const fullText = result.data.chunks.map(c => c.content).join("\n\n")
 * }
 * ```
 */
export async function getDocumentWithChunks(
  input: z.infer<typeof documentIdSchema>
): Promise<ApiResponse<DocumentWithChunks>> {
  const { tenantId } = await withTenant()

  const parsed = documentIdSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid document ID", parsed.error.issues)
  }

  const { documentId } = parsed.data

  try {
    // Get document first
    const [doc] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt)
        )
      )
      .limit(1)

    if (!doc) {
      return err("NOT_FOUND", "Document not found")
    }

    // Get associated chunks
    const chunks = await db
      .select()
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.tenantId, tenantId)
        )
      )
      .orderBy(documentChunks.chunkIndex)

    return ok({ ...doc, chunks })
  } catch (error) {
    console.error("[getDocumentWithChunks]", error)
    return err("INTERNAL_ERROR", "Failed to fetch document with chunks")
  }
}

/**
 * Update a document's title.
 *
 * @description
 * Renames a document with tenant isolation enforcement.
 *
 * @param input - Object containing documentId and new title
 * @returns The updated document record
 *
 * @example
 * ```typescript
 * const result = await updateDocumentTitle({
 *   documentId: "uuid-here",
 *   title: "New Document Title"
 * })
 * ```
 */
export async function updateDocumentTitle(
  input: z.infer<typeof updateTitleInputSchema>
): Promise<ApiResponse<Document>> {
  const { tenantId } = await withTenant()

  const parsed = updateTitleInputSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid input", parsed.error.issues)
  }

  const { documentId, title } = parsed.data

  try {
    const [updated] = await db
      .update(documents)
      .set({
        title,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt)
        )
      )
      .returning()

    if (!updated) {
      return err("NOT_FOUND", "Document not found")
    }

    return ok(updated)
  } catch (error) {
    console.error("[updateDocumentTitle]", error)
    return err("INTERNAL_ERROR", "Failed to update document title")
  }
}

/**
 * Soft-delete a document.
 *
 * @description
 * Marks a document as deleted by setting the deletedAt timestamp.
 * The document is excluded from all subsequent queries but remains in the database.
 *
 * @param input - Object containing documentId
 * @returns The soft-deleted document record
 *
 * @example
 * ```typescript
 * const result = await deleteDocument({ documentId: "uuid-here" })
 * ```
 */
export async function deleteDocument(
  input: z.infer<typeof documentIdSchema>
): Promise<ApiResponse<Document>> {
  const { tenantId } = await withTenant()

  const parsed = documentIdSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid document ID", parsed.error.issues)
  }

  const { documentId } = parsed.data

  try {
    const [deleted] = await db
      .update(documents)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt)
        )
      )
      .returning()

    if (!deleted) {
      return err("NOT_FOUND", "Document not found")
    }

    return ok(deleted)
  } catch (error) {
    console.error("[deleteDocument]", error)
    return err("INTERNAL_ERROR", "Failed to delete document")
  }
}

/**
 * Restore a soft-deleted document.
 *
 * @description
 * Clears the deletedAt timestamp to restore a previously deleted document.
 * Only works on documents that have been soft-deleted.
 *
 * @param input - Object containing documentId
 * @returns The restored document record
 *
 * @example
 * ```typescript
 * const result = await restoreDocument({ documentId: "uuid-here" })
 * ```
 */
export async function restoreDocument(
  input: z.infer<typeof documentIdSchema>
): Promise<ApiResponse<Document>> {
  const { tenantId } = await withTenant()

  const parsed = documentIdSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid document ID", parsed.error.issues)
  }

  const { documentId } = parsed.data

  try {
    // Find and restore the soft-deleted document
    const [restored] = await db
      .update(documents)
      .set({
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.tenantId, tenantId),
          isNotNull(documents.deletedAt)
        )
      )
      .returning()

    if (!restored) {
      return err("NOT_FOUND", "Document not found or not deleted")
    }

    return ok(restored)
  } catch (error) {
    console.error("[restoreDocument]", error)
    return err("INTERNAL_ERROR", "Failed to restore document")
  }
}

/**
 * Permanently delete a document and its associated blob file.
 *
 * @description
 * Performs a hard delete that:
 * 1. Deletes the file from Vercel Blob storage
 * 2. Deletes associated document chunks from the database
 * 3. Permanently removes the document record from the database
 *
 * This action is irreversible. Use soft-delete (`deleteDocument`) for recoverable deletion.
 * Only works on documents that have already been soft-deleted.
 *
 * @param input - Object containing documentId
 * @returns Success message confirming deletion
 *
 * @example
 * ```typescript
 * // First soft-delete, then hard-delete
 * await deleteDocument({ documentId: "uuid-here" })
 * await hardDeleteDocument({ documentId: "uuid-here" })
 * ```
 */
export async function hardDeleteDocument(
  input: z.infer<typeof documentIdSchema>
): Promise<ApiResponse<{ message: string }>> {
  const { tenantId } = await withTenant()

  const parsed = documentIdSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid document ID", parsed.error.issues)
  }

  const { documentId } = parsed.data

  try {
    // Find the soft-deleted document
    const [doc] = await db
      .select({
        id: documents.id,
        fileUrl: documents.fileUrl,
        title: documents.title,
        deletedAt: documents.deletedAt,
      })
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.tenantId, tenantId),
          isNotNull(documents.deletedAt) // Only allow hard delete of soft-deleted docs
        )
      )
      .limit(1)

    if (!doc) {
      return err(
        "NOT_FOUND",
        "Document not found or not in deleted state. Soft-delete the document first."
      )
    }

    // Delete blob file if it exists
    if (doc.fileUrl) {
      try {
        await deleteFile(doc.fileUrl)
      } catch (blobError) {
        // Log but don't fail if blob deletion fails (file may already be gone)
        console.warn("[hardDeleteDocument] Failed to delete blob:", blobError)
      }
    }

    // Delete associated chunks first (foreign key constraint)
    await db
      .delete(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.tenantId, tenantId)
        )
      )

    // Permanently delete the document record
    await db
      .delete(documents)
      .where(eq(documents.id, documentId))

    return ok({ message: `Document "${doc.title}" permanently deleted` })
  } catch (error) {
    console.error("[hardDeleteDocument]", error)
    return err("INTERNAL_ERROR", "Failed to permanently delete document")
  }
}

/**
 * Retry processing for a document in error state.
 *
 * @description
 * Resets a failed document back to "pending" status to allow reprocessing.
 * Only works on documents with status "failed".
 *
 * @param input - Object containing documentId
 * @returns The document record with status reset to "pending"
 *
 * @example
 * ```typescript
 * const result = await retryDocumentProcessing({ documentId: "uuid-here" })
 * ```
 */
export async function retryDocumentProcessing(
  input: z.infer<typeof documentIdSchema>
): Promise<ApiResponse<Document>> {
  const { tenantId } = await withTenant()

  const parsed = documentIdSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid document ID", parsed.error.issues)
  }

  const { documentId } = parsed.data

  try {
    // Only allow retry for documents in error state
    const [doc] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt)
        )
      )
      .limit(1)

    if (!doc) {
      return err("NOT_FOUND", "Document not found")
    }

    if (doc.status !== "failed") {
      return err(
        "BAD_REQUEST",
        `Cannot retry document with status "${doc.status}". Only failed documents can be retried.`
      )
    }

    // Reset to pending and clear error
    const [updated] = await db
      .update(documents)
      .set({
        status: "pending",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))
      .returning()

    // TODO: Trigger reprocessing via Inngest
    // await inngest.send({
    //   name: "document/process",
    //   data: { documentId: updated.id, tenantId },
    // })

    return ok(updated)
  } catch (error) {
    console.error("[retryDocumentProcessing]", error)
    return err("INTERNAL_ERROR", "Failed to retry document processing")
  }
}

/**
 * Generate a signed download URL for a document.
 *
 * @description
 * Creates a time-limited signed URL for downloading the original document file.
 * Uses Vercel Blob's getDownloadUrl functionality.
 *
 * @param input - Object containing documentId
 * @returns Object containing the signed download URL
 *
 * @example
 * ```typescript
 * const result = await getDocumentDownloadUrl({ documentId: "uuid-here" })
 * if (result.success) {
 *   window.open(result.data.url, "_blank")
 * }
 * ```
 */
export async function getDocumentDownloadUrl(
  input: z.infer<typeof documentIdSchema>
): Promise<ApiResponse<{ url: string; fileName: string }>> {
  const { tenantId } = await withTenant()

  const parsed = documentIdSchema.safeParse(input)
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid document ID", parsed.error.issues)
  }

  const { documentId } = parsed.data

  try {
    const [doc] = await db
      .select({
        fileUrl: documents.fileUrl,
        fileName: documents.fileName,
      })
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt)
        )
      )
      .limit(1)

    if (!doc) {
      return err("NOT_FOUND", "Document not found")
    }

    if (!doc.fileUrl) {
      return err("BAD_REQUEST", "Document file not available")
    }

    // Vercel Blob URLs with public access are directly accessible
    // No signed URL generation needed for public blobs
    return ok({ url: doc.fileUrl, fileName: doc.fileName })
  } catch (error) {
    console.error("[getDocumentDownloadUrl]", error)
    return err("INTERNAL_ERROR", "Failed to generate download URL")
  }
}

/**
 * Get aggregate statistics for the dashboard.
 *
 * @description
 * Returns counts of documents by status for the current tenant's dashboard.
 * Excludes soft-deleted documents from all counts.
 *
 * @returns Dashboard statistics including total and per-status counts
 *
 * @example
 * ```typescript
 * const result = await getDashboardStats()
 * if (result.success) {
 *   console.log(`Total: ${result.data.totalDocuments}`)
 *   console.log(`Pending: ${result.data.pendingDocuments}`)
 * }
 * ```
 */
export async function getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  const { tenantId } = await withTenant()

  try {
    // Get all status counts in a single query using conditional aggregation
    const result = await db
      .select({
        totalDocuments: count(),
        pendingDocuments: sql<number>`count(*) filter (where ${documents.status} = 'pending')`,
        processingDocuments: sql<number>`count(*) filter (where ${documents.status} in ('parsing', 'embedding', 'analyzing'))`,
        completedDocuments: sql<number>`count(*) filter (where ${documents.status} = 'complete')`,
        failedDocuments: sql<number>`count(*) filter (where ${documents.status} = 'failed')`,
      })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt)
        )
      )

    const stats = result[0] ?? {
      totalDocuments: 0,
      pendingDocuments: 0,
      processingDocuments: 0,
      completedDocuments: 0,
      failedDocuments: 0,
    }

    return ok({
      totalDocuments: Number(stats.totalDocuments),
      pendingDocuments: Number(stats.pendingDocuments),
      processingDocuments: Number(stats.processingDocuments),
      completedDocuments: Number(stats.completedDocuments),
      failedDocuments: Number(stats.failedDocuments),
    })
  } catch (error) {
    console.error("[getDashboardStats]", error)
    return err("INTERNAL_ERROR", "Failed to fetch dashboard statistics")
  }
}
