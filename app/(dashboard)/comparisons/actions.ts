"use server";

/**
 * @fileoverview Comparisons Server Actions
 *
 * This module provides server actions for managing NDA document comparisons.
 * Comparisons enable side-by-side analysis of two documents, highlighting
 * clause-level differences, gap analysis, and risk implications.
 *
 * ## Actions
 *
 * - `createComparison` - Compare two uploaded documents
 * - `compareWithTemplate` - Compare document against reference template
 * - `getComparison` - Get full comparison results
 * - `getComparisonStatus` - Lightweight status check
 * - `getDocumentComparisons` - Get all comparisons involving a document
 * - `retryComparison` - Retry failed comparison
 * - `deleteComparison` - Remove a comparison
 *
 * All actions are tenant-scoped via `withTenant()` from the DAL.
 *
 * @module app/(dashboard)/comparisons/actions
 * @see {@link src/db/schema/comparisons.ts} for schema definition
 */

import { z } from "zod";
import { withTenant } from "@/lib/dal";
import { ok, err, type ApiResponse } from "@/lib/api-response";
import { comparisons, documents, referenceDocuments } from "@/db/schema";
import { eq, and, or, desc } from "drizzle-orm";

// ============================================================================
// Types
// ============================================================================

/**
 * Comparison record returned from database queries.
 */
export type Comparison = typeof comparisons.$inferSelect;

/**
 * Comparison with related document data.
 */
export type ComparisonWithDocuments = Comparison & {
  documentA: typeof documents.$inferSelect;
  documentB: typeof documents.$inferSelect;
};

/**
 * Lightweight comparison status response.
 */
export type ComparisonStatus = Pick<
  Comparison,
  "id" | "status" | "createdAt" | "updatedAt"
>;

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for creating a comparison between two uploaded documents.
 * Includes refinement to ensure documents are different.
 */
const createComparisonSchema = z
  .object({
    documentAId: z.string().uuid("Document A ID must be a valid UUID"),
    documentBId: z.string().uuid("Document B ID must be a valid UUID"),
  })
  .refine((data) => data.documentAId !== data.documentBId, {
    message: "Cannot compare a document with itself",
    path: ["documentBId"],
  });

/**
 * Schema for comparing a document against a reference template.
 */
const compareWithTemplateSchema = z.object({
  documentId: z.string().uuid("Document ID must be a valid UUID"),
  templateId: z.string().uuid("Template ID must be a valid UUID"),
});

/**
 * Schema for single comparison ID operations.
 */
const comparisonIdSchema = z.object({
  comparisonId: z.string().uuid("Comparison ID must be a valid UUID"),
});

/**
 * Schema for single document ID operations.
 */
const documentIdSchema = z.object({
  documentId: z.string().uuid("Document ID must be a valid UUID"),
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Create a comparison between two uploaded documents.
 *
 * Validates that both documents exist and belong to the current tenant,
 * and that they are different documents. Creates a comparison record
 * with status `pending` for async processing.
 *
 * @param input - Object containing documentAId and documentBId
 * @returns The created comparison record or an error
 *
 * @example
 * ```typescript
 * const result = await createComparison({
 *   documentAId: "uuid-1",
 *   documentBId: "uuid-2",
 * });
 *
 * if (result.success) {
 *   console.log("Comparison created:", result.data.id);
 * }
 * ```
 */
export async function createComparison(
  input: z.infer<typeof createComparisonSchema>
): Promise<ApiResponse<Comparison>> {
  const { db, tenantId } = await withTenant();

  // Validate input
  const parsed = createComparisonSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { documentAId, documentBId } = parsed.data;

  try {
    // Verify both documents exist and belong to tenant
    const [docA, docB] = await Promise.all([
      db.query.documents.findFirst({
        where: and(
          eq(documents.id, documentAId),
          eq(documents.tenantId, tenantId)
        ),
      }),
      db.query.documents.findFirst({
        where: and(
          eq(documents.id, documentBId),
          eq(documents.tenantId, tenantId)
        ),
      }),
    ]);

    if (!docA) {
      return err("NOT_FOUND", "Document A not found or does not belong to this organization");
    }

    if (!docB) {
      return err("NOT_FOUND", "Document B not found or does not belong to this organization");
    }

    // Create the comparison record
    const [comparison] = await db
      .insert(comparisons)
      .values({
        tenantId,
        documentAId,
        documentBId,
        status: "pending",
      })
      .returning();

    return ok(comparison);
  } catch (error) {
    console.error("Failed to create comparison:", error);
    return err("INTERNAL_ERROR", "Failed to create comparison");
  }
}

/**
 * Compare a tenant document against a shared reference template.
 *
 * The documentId references a document in the tenant's documents table,
 * while templateId references a document in the shared reference_documents table.
 * This allows users to compare their NDAs against standardized templates.
 *
 * Note: Since reference templates are in a shared table, we need to store
 * the template data differently. This action creates a special comparison
 * where documentBId is null and the template reference is stored in metadata.
 *
 * @param input - Object containing documentId and templateId
 * @returns The created comparison record or an error
 *
 * @example
 * ```typescript
 * const result = await compareWithTemplate({
 *   documentId: "user-doc-uuid",
 *   templateId: "bonterms-nda-uuid",
 * });
 * ```
 */
export async function compareWithTemplate(
  input: z.infer<typeof compareWithTemplateSchema>
): Promise<ApiResponse<Comparison>> {
  const { db, tenantId } = await withTenant();

  // Validate input
  const parsed = compareWithTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { documentId, templateId } = parsed.data;

  try {
    // Verify the document exists and belongs to tenant
    const document = await db.query.documents.findFirst({
      where: and(
        eq(documents.id, documentId),
        eq(documents.tenantId, tenantId)
      ),
    });

    if (!document) {
      return err("NOT_FOUND", "Document not found or does not belong to this organization");
    }

    // Verify the template exists in reference documents (shared table)
    const template = await db.query.referenceDocuments.findFirst({
      where: eq(referenceDocuments.id, templateId),
    });

    if (!template) {
      return err("NOT_FOUND", "Reference template not found");
    }

    // For template comparisons, we need to create a copy of the template
    // in the tenant's documents table to maintain the foreign key relationship.
    // Alternatively, we could create a special document record that references
    // the template. For now, we'll create a placeholder document.
    const [templateDoc] = await db
      .insert(documents)
      .values({
        tenantId,
        title: `[Template] ${template.title}`,
        fileName: `template-${template.id}.md`,
        fileType: "text/markdown",
        rawText: template.rawText,
        status: "ready",
        metadata: {
          isTemplateReference: true,
          referenceDocumentId: template.id,
          source: template.source,
        },
      })
      .returning();

    // Create the comparison record
    const [comparison] = await db
      .insert(comparisons)
      .values({
        tenantId,
        documentAId: documentId,
        documentBId: templateDoc.id,
        status: "pending",
      })
      .returning();

    return ok(comparison);
  } catch (error) {
    console.error("Failed to create template comparison:", error);
    return err("INTERNAL_ERROR", "Failed to create comparison with template");
  }
}

/**
 * Get full comparison results including both document data.
 *
 * Returns the complete comparison record with all analysis results
 * (clauseAlignments, keyDifferences, summary) along with the
 * related document records.
 *
 * @param input - Object containing comparisonId
 * @returns The comparison with document data or an error
 *
 * @example
 * ```typescript
 * const result = await getComparison({ comparisonId: "comparison-uuid" });
 *
 * if (result.success) {
 *   console.log("Status:", result.data.status);
 *   console.log("Document A:", result.data.documentA.title);
 *   console.log("Key differences:", result.data.keyDifferences);
 * }
 * ```
 */
export async function getComparison(
  input: z.infer<typeof comparisonIdSchema>
): Promise<ApiResponse<ComparisonWithDocuments>> {
  const { db, tenantId } = await withTenant();

  // Validate input
  const parsed = comparisonIdSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { comparisonId } = parsed.data;

  try {
    // Query comparison with related documents
    const comparison = await db.query.comparisons.findFirst({
      where: and(
        eq(comparisons.id, comparisonId),
        eq(comparisons.tenantId, tenantId)
      ),
      with: {
        documentA: true,
        documentB: true,
      },
    });

    if (!comparison) {
      return err("NOT_FOUND", "Comparison not found or does not belong to this organization");
    }

    return ok(comparison);
  } catch (error) {
    console.error("Failed to get comparison:", error);
    return err("INTERNAL_ERROR", "Failed to retrieve comparison");
  }
}

/**
 * Lightweight status check for a comparison.
 *
 * Returns only the essential status fields without the full
 * analysis results or document data. Useful for polling
 * comparison status during async processing.
 *
 * @param input - Object containing comparisonId
 * @returns The comparison status or an error
 *
 * @example
 * ```typescript
 * // Poll for completion
 * const result = await getComparisonStatus({ comparisonId: "comparison-uuid" });
 *
 * if (result.success && result.data.status === "completed") {
 *   // Fetch full results
 *   const fullResult = await getComparison({ comparisonId: "comparison-uuid" });
 * }
 * ```
 */
export async function getComparisonStatus(
  input: z.infer<typeof comparisonIdSchema>
): Promise<ApiResponse<ComparisonStatus>> {
  const { db, tenantId } = await withTenant();

  // Validate input
  const parsed = comparisonIdSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { comparisonId } = parsed.data;

  try {
    const comparison = await db
      .select({
        id: comparisons.id,
        status: comparisons.status,
        createdAt: comparisons.createdAt,
        updatedAt: comparisons.updatedAt,
      })
      .from(comparisons)
      .where(
        and(
          eq(comparisons.id, comparisonId),
          eq(comparisons.tenantId, tenantId)
        )
      )
      .limit(1);

    if (comparison.length === 0) {
      return err("NOT_FOUND", "Comparison not found or does not belong to this organization");
    }

    return ok(comparison[0]);
  } catch (error) {
    console.error("Failed to get comparison status:", error);
    return err("INTERNAL_ERROR", "Failed to retrieve comparison status");
  }
}

/**
 * Get all comparisons involving a specific document.
 *
 * Returns comparisons where the document is either Document A
 * (baseline) or Document B (comparison target), ordered by
 * creation date descending.
 *
 * @param input - Object containing documentId
 * @returns Array of comparisons involving the document or an error
 *
 * @example
 * ```typescript
 * const result = await getDocumentComparisons({ documentId: "doc-uuid" });
 *
 * if (result.success) {
 *   console.log(`Found ${result.data.length} comparisons`);
 * }
 * ```
 */
export async function getDocumentComparisons(
  input: z.infer<typeof documentIdSchema>
): Promise<ApiResponse<ComparisonWithDocuments[]>> {
  const { db, tenantId } = await withTenant();

  // Validate input
  const parsed = documentIdSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { documentId } = parsed.data;

  try {
    // First verify the document exists and belongs to tenant
    const document = await db.query.documents.findFirst({
      where: and(
        eq(documents.id, documentId),
        eq(documents.tenantId, tenantId)
      ),
    });

    if (!document) {
      return err("NOT_FOUND", "Document not found or does not belong to this organization");
    }

    // Query all comparisons involving this document
    const results = await db.query.comparisons.findMany({
      where: and(
        eq(comparisons.tenantId, tenantId),
        or(
          eq(comparisons.documentAId, documentId),
          eq(comparisons.documentBId, documentId)
        )
      ),
      with: {
        documentA: true,
        documentB: true,
      },
      orderBy: [desc(comparisons.createdAt)],
    });

    return ok(results);
  } catch (error) {
    console.error("Failed to get document comparisons:", error);
    return err("INTERNAL_ERROR", "Failed to retrieve document comparisons");
  }
}

/**
 * Retry a failed comparison.
 *
 * Only comparisons with status `error` can be retried. This resets
 * the status to `pending` and clears any error state, allowing
 * the comparison pipeline to re-process.
 *
 * @param input - Object containing comparisonId
 * @returns The updated comparison record or an error
 *
 * @example
 * ```typescript
 * const result = await retryComparison({ comparisonId: "failed-comparison-uuid" });
 *
 * if (result.success) {
 *   console.log("Retry initiated, new status:", result.data.status);
 * } else if (result.error.code === "BAD_REQUEST") {
 *   console.log("Cannot retry:", result.error.message);
 * }
 * ```
 */
export async function retryComparison(
  input: z.infer<typeof comparisonIdSchema>
): Promise<ApiResponse<Comparison>> {
  const { db, tenantId } = await withTenant();

  // Validate input
  const parsed = comparisonIdSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { comparisonId } = parsed.data;

  try {
    // Find the comparison
    const existing = await db.query.comparisons.findFirst({
      where: and(
        eq(comparisons.id, comparisonId),
        eq(comparisons.tenantId, tenantId)
      ),
    });

    if (!existing) {
      return err("NOT_FOUND", "Comparison not found or does not belong to this organization");
    }

    // Only allow retry for error status
    if (existing.status !== "error") {
      return err(
        "BAD_REQUEST",
        `Cannot retry comparison with status '${existing.status}'. Only comparisons with 'error' status can be retried.`
      );
    }

    // Reset to pending status
    const [updated] = await db
      .update(comparisons)
      .set({
        status: "pending",
        summary: null,
        clauseAlignments: null,
        keyDifferences: null,
      })
      .where(eq(comparisons.id, comparisonId))
      .returning();

    return ok(updated);
  } catch (error) {
    console.error("Failed to retry comparison:", error);
    return err("INTERNAL_ERROR", "Failed to retry comparison");
  }
}

/**
 * Delete a comparison.
 *
 * Permanently removes the comparison record. Note that this does
 * not delete the associated documents - only the comparison itself.
 *
 * @param input - Object containing comparisonId
 * @returns Success confirmation or an error
 *
 * @example
 * ```typescript
 * const result = await deleteComparison({ comparisonId: "comparison-uuid" });
 *
 * if (result.success) {
 *   console.log("Comparison deleted successfully");
 * }
 * ```
 */
export async function deleteComparison(
  input: z.infer<typeof comparisonIdSchema>
): Promise<ApiResponse<{ deleted: true }>> {
  const { db, tenantId } = await withTenant();

  // Validate input
  const parsed = comparisonIdSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const { comparisonId } = parsed.data;

  try {
    // Verify the comparison exists and belongs to tenant
    const existing = await db.query.comparisons.findFirst({
      where: and(
        eq(comparisons.id, comparisonId),
        eq(comparisons.tenantId, tenantId)
      ),
    });

    if (!existing) {
      return err("NOT_FOUND", "Comparison not found or does not belong to this organization");
    }

    // Delete the comparison
    await db.delete(comparisons).where(eq(comparisons.id, comparisonId));

    return ok({ deleted: true });
  } catch (error) {
    console.error("Failed to delete comparison:", error);
    return err("INTERNAL_ERROR", "Failed to delete comparison");
  }
}
