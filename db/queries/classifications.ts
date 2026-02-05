/**
 * @fileoverview Classification Data Access Layer for Multi-Label CUAD Results
 *
 * This module provides query functions for retrieving chunk classification results
 * from the enhanced CUAD classifier. It supports two primary views:
 *
 * 1. **Category view**: Classifications grouped by CUAD category, showing all
 *    matching chunks per category. Useful for reviewing all instances of a
 *    particular clause type across the document.
 *
 * 2. **Document order view**: Classifications sorted by chunk position in the
 *    original document. Shows how classifications flow through the document,
 *    with primary labels first within each chunk.
 *
 * Both views include all classifications (primary + secondary) and explicitly
 * show "Uncategorized" chunks that matched no CUAD category.
 *
 * @module db/queries/classifications
 * @see {@link ../schema/analyses.ts} for chunkClassifications table definition
 */

import { eq, and, desc, asc } from "drizzle-orm"
import { db } from "../client"
import { chunkClassifications } from "../schema/analyses"

/** Classification row type inferred from schema */
export type ChunkClassificationRow = typeof chunkClassifications.$inferSelect

/** Classifications grouped by CUAD category */
export interface ClassificationsByCategory {
  category: string
  classifications: ChunkClassificationRow[]
}

/**
 * Get classifications grouped by CUAD category for an analysis.
 *
 * Each category lists all matching chunks (primary and secondary labels).
 * Categories are ordered alphabetically, with classifications within each
 * category ordered by confidence descending.
 *
 * "Uncategorized" entries will appear as their own group, making chunks
 * that matched no CUAD category explicitly visible.
 *
 * @param analysisId - UUID of the analysis
 * @param tenantId - UUID of the tenant for isolation
 * @returns Array of category groups, each containing matching classifications
 */
export async function getClassificationsByCategory(
  analysisId: string,
  tenantId: string
): Promise<ClassificationsByCategory[]> {
  const rows = await db
    .select()
    .from(chunkClassifications)
    .where(
      and(
        eq(chunkClassifications.analysisId, analysisId),
        eq(chunkClassifications.tenantId, tenantId)
      )
    )
    .orderBy(
      asc(chunkClassifications.category),
      desc(chunkClassifications.confidence)
    )

  // Group by category
  const grouped = new Map<string, ChunkClassificationRow[]>()
  for (const row of rows) {
    const existing = grouped.get(row.category) ?? []
    existing.push(row)
    grouped.set(row.category, existing)
  }

  return Array.from(grouped.entries()).map(([category, classifications]) => ({
    category,
    classifications,
  }))
}

/**
 * Get classifications in document order for an analysis.
 *
 * Sorted by chunk index (document position), then primary label first
 * within each chunk. This view shows how classifications flow through
 * the document sequentially.
 *
 * @param analysisId - UUID of the analysis
 * @param tenantId - UUID of the tenant for isolation
 * @returns Array of classification rows in document order
 */
export async function getClassificationsByPosition(
  analysisId: string,
  tenantId: string
): Promise<ChunkClassificationRow[]> {
  return db
    .select()
    .from(chunkClassifications)
    .where(
      and(
        eq(chunkClassifications.analysisId, analysisId),
        eq(chunkClassifications.tenantId, tenantId)
      )
    )
    .orderBy(
      asc(chunkClassifications.chunkIndex),
      desc(chunkClassifications.isPrimary)
    )
}
