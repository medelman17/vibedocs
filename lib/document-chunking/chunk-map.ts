/**
 * @fileoverview Chunk map and statistics generator.
 *
 * Produces summary information about all chunks generated for a document.
 * The chunk map includes lightweight entries for each chunk (preview, type,
 * token count) plus aggregate statistics. This data is stored as JSONB on
 * the analysis record for debugging, admin observability, and monitoring.
 *
 * @module lib/document-chunking/chunk-map
 * @see {@link ./types} for ChunkMap, ChunkStats, ChunkMapEntry types
 */

import type { LegalChunk, ChunkMap, ChunkStats, ChunkType } from "./types"

// ============================================================================
// Chunk Map Generation
// ============================================================================

/**
 * Generates a complete chunk map summary for a document.
 *
 * The chunk map includes:
 * - Overall statistics (total, avg, min, max tokens)
 * - Distribution by chunk type
 * - Individual entries with preview text
 *
 * Stored as JSONB on the analysis record for debugging and admin views.
 *
 * @param chunks - Array of legal chunks to summarize
 * @param documentId - ID of the source document
 * @returns Complete chunk map ready for JSONB storage
 *
 * @example
 * ```typescript
 * const chunks = await chunkLegalDocument(text, structure)
 * const chunkMap = generateChunkMap(chunks, documentId)
 * await db.update(analyses).set({ chunkMap }).where(eq(analyses.id, analysisId))
 * ```
 */
export function generateChunkMap(
  chunks: LegalChunk[],
  documentId: string
): ChunkMap {
  const stats = computeChunkStats(chunks)

  return {
    documentId,
    totalChunks: stats.totalChunks,
    avgTokens: stats.avgTokens,
    minTokens: stats.minTokens,
    maxTokens: stats.maxTokens,
    distribution: stats.distribution,
    entries: chunks.map((chunk) => ({
      index: chunk.index,
      sectionPath: chunk.sectionPath,
      type: chunk.chunkType,
      tokenCount: chunk.tokenCount,
      preview: chunk.content.slice(0, 100),
    })),
  }
}

// ============================================================================
// Chunk Statistics
// ============================================================================

/**
 * Computes lightweight aggregate statistics for a set of chunks.
 *
 * Suitable for storing on the analysis record for monitoring dashboards
 * without the full chunk map entries.
 *
 * @param chunks - Array of legal chunks to compute stats for
 * @returns Aggregate statistics including distribution by type
 *
 * @example
 * ```typescript
 * const stats = computeChunkStats(chunks)
 * // stats.totalChunks: 42
 * // stats.avgTokens: 320
 * // stats.distribution: { clause: 25, definition: 10, ... }
 * ```
 */
export function computeChunkStats(chunks: LegalChunk[]): ChunkStats {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      avgTokens: 0,
      minTokens: 0,
      maxTokens: 0,
      distribution: {} as Record<ChunkType, number>,
    }
  }

  const tokenCounts = chunks.map((c) => c.tokenCount)
  const totalTokens = tokenCounts.reduce((sum, t) => sum + t, 0)

  // Compute distribution by chunk type
  const distribution: Record<string, number> = {}
  for (const chunk of chunks) {
    distribution[chunk.chunkType] = (distribution[chunk.chunkType] || 0) + 1
  }

  return {
    totalChunks: chunks.length,
    avgTokens: Math.round(totalTokens / chunks.length),
    minTokens: Math.min(...tokenCounts),
    maxTokens: Math.max(...tokenCounts),
    distribution: distribution as Record<ChunkType, number>,
  }
}
