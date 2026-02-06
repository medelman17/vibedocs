import { db } from "../client"
import { documentChunks } from "../schema"
import { eq, and, asc, isNotNull } from "drizzle-orm"

export interface ChunkForRendering {
  chunkIndex: number
  chunkType: string | null
  sectionPath: string[] | null
  startPosition: number
  endPosition: number
}

/**
 * Fetch lightweight chunk metadata for document rendering.
 * Returns chunks ordered by document position. Only includes chunks
 * with valid positions (filters nulls). Omits content and embeddings.
 */
export async function getChunksForRendering(
  analysisId: string,
  tenantId: string
): Promise<ChunkForRendering[]> {
  const rows = await db
    .select({
      chunkIndex: documentChunks.chunkIndex,
      chunkType: documentChunks.chunkType,
      sectionPath: documentChunks.sectionPath,
      startPosition: documentChunks.startPosition,
      endPosition: documentChunks.endPosition,
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.analysisId, analysisId),
        eq(documentChunks.tenantId, tenantId),
        isNotNull(documentChunks.startPosition),
        isNotNull(documentChunks.endPosition)
      )
    )
    .orderBy(asc(documentChunks.chunkIndex))

  return rows.map((r) => ({
    chunkIndex: r.chunkIndex,
    chunkType: r.chunkType,
    sectionPath: r.sectionPath,
    startPosition: r.startPosition!,
    endPosition: r.endPosition!,
  }))
}
