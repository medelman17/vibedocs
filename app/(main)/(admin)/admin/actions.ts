"use server"

/**
 * @fileoverview Admin Document Management Server Actions
 *
 * This module provides Server Actions for administrative document management.
 * All actions enforce admin/owner role requirements via requireRole(["admin", "owner"]).
 *
 * Key differences from dashboard actions:
 * - Uses requireRole instead of withTenant (admin access)
 * - Admin sees ALL org documents (not filtered by uploadedBy)
 * - Supports hard delete with cascade cleanup (comparisons, blob, analyses)
 * - Includes bulk operations for batch management
 *
 * @module app/(admin)/admin/actions
 */

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/dal"
import { ok, err, wrapError, type ApiResponse } from "@/lib/api-response"
import { documents, analyses, comparisons } from "@/db/schema"
import { eq, and, isNull, ilike, desc, asc, or, count, gte } from "drizzle-orm"
import { deleteFile } from "@/lib/blob"
import { inngest } from "@/inngest"

// ============================================================================
// Types
// ============================================================================

export type Document = typeof documents.$inferSelect
export type Analysis = typeof analyses.$inferSelect

// ============================================================================
// Validation Schemas
// ============================================================================

const getDocumentsInputSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  search: z.string().optional(),
  status: z.string().optional(),
  fileType: z.string().optional(),
  dateRange: z.enum(["7d", "30d", "90d", "all"]).optional(),
  sortBy: z
    .enum(["title", "status", "fileType", "createdAt", "fileSize"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
})

const documentIdSchema = z.object({
  documentId: z.string().uuid(),
})

const updateTitleInputSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().min(1).max(255).trim(),
})

const bulkDeleteInputSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(100),
})

const analysisIdSchema = z.object({
  analysisId: z.string().uuid(),
})

// ============================================================================
// Actions
// ============================================================================

/**
 * Get paginated document listing with search, filter, and sort.
 *
 * Admin sees ALL org documents (not filtered by uploadedBy).
 *
 * @param input - Query options
 * @returns Paginated documents with total count
 */
export async function adminGetDocuments(
  input: z.infer<typeof getDocumentsInputSchema>
): Promise<ApiResponse<{ documents: Document[]; total: number }>> {
  try {
    const { db, tenantId } = await requireRole(["admin", "owner"])

    const parsed = getDocumentsInputSchema.safeParse(input)
    if (!parsed.success) {
      return err(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid input"
      )
    }

    const {
      page,
      pageSize,
      search,
      status,
      fileType,
      dateRange,
      sortBy,
      sortOrder,
    } = parsed.data

    const offset = (page - 1) * pageSize

    // Build conditions
    const conditions = [
      eq(documents.tenantId, tenantId),
      isNull(documents.deletedAt),
    ]

    if (search) {
      conditions.push(ilike(documents.title, `%${search}%`))
    }
    if (status) {
      conditions.push(eq(documents.status, status))
    }
    if (fileType) {
      conditions.push(eq(documents.fileType, fileType))
    }
    if (dateRange && dateRange !== "all") {
      const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90
      const threshold = new Date(Date.now() - days * 86400000)
      conditions.push(gte(documents.createdAt, threshold))
    }

    // Determine sort
    const sortColumn =
      sortBy === "title"
        ? documents.title
        : sortBy === "status"
          ? documents.status
          : sortBy === "fileType"
            ? documents.fileType
            : sortBy === "fileSize"
              ? documents.fileSize
              : documents.createdAt
    const orderFn = sortOrder === "asc" ? asc : desc

    // Parallel queries: data + count
    const [rows, [countResult]] = await Promise.all([
      db
        .select()
        .from(documents)
        .where(and(...conditions))
        .orderBy(orderFn(sortColumn))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: count() })
        .from(documents)
        .where(and(...conditions)),
    ])

    return ok({
      documents: rows,
      total: Number(countResult?.count ?? 0),
    })
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Get single document with associated analyses.
 *
 * @param input - Document ID
 * @returns Document with analyses array
 */
export async function adminGetDocumentDetail(
  input: z.infer<typeof documentIdSchema>
): Promise<
  ApiResponse<{ document: Document; analyses: Analysis[] }>
> {
  try {
    const { db, tenantId } = await requireRole(["admin", "owner"])

    const parsed = documentIdSchema.safeParse(input)
    if (!parsed.success) {
      return err(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid document ID"
      )
    }

    const { documentId } = parsed.data

    // Fetch document
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

    // Fetch associated analyses
    const analysesResult = await db.query.analyses.findMany({
      where: and(
        eq(analyses.documentId, documentId),
        eq(analyses.tenantId, tenantId)
      ),
      orderBy: [desc(analyses.version)],
    })

    return ok({
      document: doc,
      analyses: analysesResult,
    })
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Update document title.
 *
 * @param input - Document ID and new title
 * @returns Updated document
 */
export async function adminUpdateDocumentTitle(
  input: z.infer<typeof updateTitleInputSchema>
): Promise<ApiResponse<Document>> {
  try {
    const { db, tenantId } = await requireRole(["admin", "owner"])

    const parsed = updateTitleInputSchema.safeParse(input)
    if (!parsed.success) {
      return err(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid input"
      )
    }

    const { documentId, title } = parsed.data

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

    revalidatePath("/admin")
    return ok(updated)
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Hard delete single document with cascade cleanup.
 *
 * Steps:
 * 1. Verify document exists
 * 2. Delete comparisons referencing this document
 * 3. Delete blob file
 * 4. Hard delete document (cascades to chunks, analyses, classifications)
 *
 * @param input - Document ID
 * @returns Success message
 */
export async function adminDeleteDocument(
  input: z.infer<typeof documentIdSchema>
): Promise<ApiResponse<{ message: string }>> {
  try {
    const { db, tenantId } = await requireRole(["admin", "owner"])

    const parsed = documentIdSchema.safeParse(input)
    if (!parsed.success) {
      return err(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid document ID"
      )
    }

    const { documentId } = parsed.data

    // Get document
    const [doc] = await db
      .select({
        id: documents.id,
        fileUrl: documents.fileUrl,
        title: documents.title,
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

    // Delete comparisons referencing this document
    await db.delete(comparisons).where(
      and(
        eq(comparisons.tenantId, tenantId),
        or(
          eq(comparisons.documentAId, documentId),
          eq(comparisons.documentBId, documentId)
        )
      )
    )

    // Delete blob file
    if (doc.fileUrl) {
      try {
        await deleteFile(doc.fileUrl)
      } catch (blobError) {
        // File may not exist - log but continue
        console.warn("[adminDeleteDocument] Failed to delete blob:", blobError)
      }
    }

    // Hard delete document (cascades to chunks, analyses, classifications)
    await db.delete(documents).where(eq(documents.id, documentId))

    revalidatePath("/admin")
    return ok({ message: `Document "${doc.title}" permanently deleted` })
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Bulk delete multiple documents.
 *
 * Continues on failure, collecting errors per document.
 *
 * @param input - Array of document IDs
 * @returns Count of deleted documents and errors
 */
export async function adminBulkDeleteDocuments(
  input: z.infer<typeof bulkDeleteInputSchema>
): Promise<ApiResponse<{ deleted: number; errors: string[] }>> {
  try {
    const { db, tenantId } = await requireRole(["admin", "owner"])

    const parsed = bulkDeleteInputSchema.safeParse(input)
    if (!parsed.success) {
      return err(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid input"
      )
    }

    const { documentIds } = parsed.data

    const errors: string[] = []
    let deleted = 0

    for (const docId of documentIds) {
      try {
        // Get document
        const [doc] = await db
          .select({
            id: documents.id,
            fileUrl: documents.fileUrl,
            title: documents.title,
          })
          .from(documents)
          .where(
            and(
              eq(documents.id, docId),
              eq(documents.tenantId, tenantId),
              isNull(documents.deletedAt)
            )
          )
          .limit(1)

        if (!doc) {
          errors.push(`Document ${docId}: not found`)
          continue
        }

        // Delete comparisons
        await db.delete(comparisons).where(
          and(
            eq(comparisons.tenantId, tenantId),
            or(
              eq(comparisons.documentAId, docId),
              eq(comparisons.documentBId, docId)
            )
          )
        )

        // Delete blob file
        if (doc.fileUrl) {
          try {
            await deleteFile(doc.fileUrl)
          } catch {
            // File may not exist
          }
        }

        // Hard delete
        await db.delete(documents).where(eq(documents.id, docId))
        deleted++
      } catch (error) {
        errors.push(
          `Document ${docId}: ${error instanceof Error ? error.message : "unknown error"}`
        )
      }
    }

    revalidatePath("/admin")
    return ok({ deleted, errors })
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Delete individual analysis from a document.
 *
 * Unlike dashboard version, admin can delete the last analysis.
 *
 * @param input - Analysis ID
 * @returns Success
 */
export async function adminDeleteAnalysis(
  input: z.infer<typeof analysisIdSchema>
): Promise<ApiResponse<void>> {
  try {
    const { db, tenantId } = await requireRole(["admin", "owner"])

    const parsed = analysisIdSchema.safeParse(input)
    if (!parsed.success) {
      return err(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid analysis ID"
      )
    }

    const { analysisId } = parsed.data

    // Verify analysis exists and belongs to tenant
    const [existing] = await db
      .select({ id: analyses.id })
      .from(analyses)
      .where(and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId)))
      .limit(1)

    if (!existing) {
      return err("NOT_FOUND", "Analysis not found")
    }

    // Hard delete (admin can delete last analysis)
    await db.delete(analyses).where(eq(analyses.id, analysisId))

    revalidatePath("/admin")
    return ok(undefined)
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Re-trigger analysis on existing document.
 *
 * Creates new analysis record and sends inngest event.
 *
 * @param input - Document ID
 * @returns Newly created analysis
 */
export async function adminTriggerAnalysis(
  input: z.infer<typeof documentIdSchema>
): Promise<ApiResponse<Analysis>> {
  try {
    const { db, tenantId } = await requireRole(["admin", "owner"])

    const parsed = documentIdSchema.safeParse(input)
    if (!parsed.success) {
      return err(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid document ID"
      )
    }

    const { documentId } = parsed.data

    // Verify document exists and has status "ready" (or "complete")
    const [doc] = await db
      .select({ id: documents.id, status: documents.status })
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

    if (doc.status !== "ready" && doc.status !== "complete") {
      return err(
        "BAD_REQUEST",
        `Cannot re-trigger analysis on document with status "${doc.status}"`
      )
    }

    // Get next version number
    const existingAnalyses = await db
      .select({ version: analyses.version })
      .from(analyses)
      .where(
        and(eq(analyses.documentId, documentId), eq(analyses.tenantId, tenantId))
      )
      .orderBy(desc(analyses.version))
      .limit(1)

    const nextVersion = (existingAnalyses[0]?.version ?? 0) + 1

    // Create new analysis record
    const [newAnalysis] = await db
      .insert(analyses)
      .values({
        tenantId,
        documentId,
        status: "pending",
        version: nextVersion,
        progressPercent: 0,
        metadata: {},
      })
      .returning()

    // Send inngest event
    await inngest.send({
      name: "nda/analysis.requested",
      data: {
        tenantId,
        documentId,
        analysisId: newAnalysis.id,
        source: "web",
      },
    })

    revalidatePath("/admin")
    return ok(newAnalysis)
  } catch (error) {
    return wrapError(error)
  }
}
