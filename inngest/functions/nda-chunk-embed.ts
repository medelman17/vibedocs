/**
 * @fileoverview NDA Chunk + Embed Sub-Function
 *
 * Reads rawText from documents table and structure from analyses.metadata,
 * chunks the document, embeds non-boilerplate chunks via Voyage AI,
 * and persists everything to documentChunks.
 *
 * Invoked by the orchestrator via step.invoke().
 *
 * @module inngest/functions/nda-chunk-embed
 */

import { inngest, RETRY_CONFIG, withTenantContext, RATE_LIMITS } from '@/inngest'
import { NonRetriableError } from '@/inngest/utils/errors'
import { analyses } from '@/db/schema/analyses'
import { documents } from '@/db/schema/documents'
import { documentChunks } from '@/db/schema/documents'
import { chunkLegalDocument } from '@/lib/document-chunking/legal-chunker'
import { generateChunkMap, computeChunkStats } from '@/lib/document-chunking/chunk-map'
import { getVoyageAIClient, VOYAGE_CONFIG } from '@/lib/embeddings'
import type { LegalChunk, EmbeddedChunk } from '@/lib/document-chunking/types'
import { eq, and } from 'drizzle-orm'

const DB_INSERT_BATCH_SIZE = 100

export const ndaChunkEmbed = inngest.createFunction(
  {
    id: 'nda-chunk-embed',
    name: 'NDA Chunk + Embed',
    concurrency: { limit: 3, key: 'event.data.tenantId' },
    retries: RETRY_CONFIG.default.retries,
    cancelOn: [{
      event: 'nda/analysis.cancelled',
      if: 'async.data.analysisId == event.data.analysisId',
    }],
  },
  { event: 'nda/chunk-embed.requested' },
  async ({ event, step }) => {
    const { documentId, tenantId, analysisId, isOcr } = event.data

    return await withTenantContext(tenantId, async (ctx) => {
      // Read rawText and structure from DB
      const docData = await step.run('read-source-data', async () => {
        const [doc] = await ctx.db
          .select({ rawText: documents.rawText })
          .from(documents)
          .where(eq(documents.id, documentId))
          .limit(1)

        const [analysis] = await ctx.db
          .select({ metadata: analyses.metadata })
          .from(analyses)
          .where(eq(analyses.id, analysisId))
          .limit(1)

        if (!doc?.rawText) {
          throw new NonRetriableError('Document rawText not found - parse step may have failed')
        }

        return {
          rawText: doc.rawText,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          structure: (analysis?.metadata as any)?.structure ?? { sections: [], headings: [] },
        }
      })

      // Initialize tokenizer
      await step.run('init-tokenizer', async () => {
        const { initVoyageTokenizer } = await import('@/lib/document-chunking/token-counter')
        await initVoyageTokenizer()
      })

      // Chunk document
      const chunks = await step.run('chunk-document', async () => {
        return await chunkLegalDocument(
          docData.rawText,
          docData.structure,
          { maxTokens: 512, targetTokens: 400, overlapTokens: 50, minChunkTokens: 50 }
        )
      }) as LegalChunk[]

      // Persist chunk map + stats + progress
      await step.run('persist-chunk-metadata', async () => {
        const chunkMap = generateChunkMap(chunks, documentId)
        const chunkStats = computeChunkStats(chunks)

        await ctx.db
          .update(analyses)
          .set({
            chunkMap,
            chunkStats,
            progressStage: 'chunking',
            progressPercent: 25,
            progressMessage: `Chunked into ${chunks.length} legal segments`,
          })
          .where(eq(analyses.id, analysisId))
      })

      // Embed non-boilerplate chunks in batches
      const embeddableChunks = chunks.filter(c => c.chunkType !== 'boilerplate')
      const boilerplateChunks = chunks.filter(c => c.chunkType === 'boilerplate')
      const totalBatches = Math.ceil(embeddableChunks.length / VOYAGE_CONFIG.batchLimit)
      const allEmbeddings: (number[] | null)[] = new Array(chunks.length).fill(null)

      for (let batch = 0; batch < totalBatches; batch++) {
        const batchStart = batch * VOYAGE_CONFIG.batchLimit
        const batchEnd = Math.min(batchStart + VOYAGE_CONFIG.batchLimit, embeddableChunks.length)
        const batchChunks = embeddableChunks.slice(batchStart, batchEnd)

        const batchEmbeddings = await step.run(`embed-batch-${batch}`, async () => {
          if (batch > 0) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.voyageAi.delayMs))
          }
          const voyageClient = getVoyageAIClient()
          const texts = batchChunks.map(c => c.content)
          const result = await voyageClient.embedBatch(texts, 'document')
          return result.embeddings
        }) as number[][]

        for (let i = 0; i < batchChunks.length; i++) {
          allEmbeddings[batchChunks[i].index] = batchEmbeddings[i]
        }
      }

      const embeddedChunks: EmbeddedChunk[] = chunks.map(chunk => ({
        ...chunk,
        embedding: allEmbeddings[chunk.index],
      }))

      // Persist chunks to database
      await step.run('persist-chunks', async () => {
        // Delete old chunks for this document+analysis
        await ctx.db
          .delete(documentChunks)
          .where(
            and(
              eq(documentChunks.documentId, documentId),
              eq(documentChunks.analysisId, analysisId)
            )
          )

        // Bulk insert in batches
        for (let i = 0; i < embeddedChunks.length; i += DB_INSERT_BATCH_SIZE) {
          const batch = embeddedChunks.slice(i, i + DB_INSERT_BATCH_SIZE)
          await ctx.db.insert(documentChunks).values(
            batch.map(chunk => ({
              tenantId,
              documentId,
              analysisId,
              chunkIndex: chunk.index,
              content: chunk.content,
              sectionPath: chunk.sectionPath,
              embedding: chunk.embedding,
              tokenCount: chunk.tokenCount,
              startPosition: chunk.startPosition,
              endPosition: chunk.endPosition,
              chunkType: chunk.chunkType,
              overlapTokens: chunk.metadata.overlapTokens,
              metadata: {
                references: chunk.metadata.references,
                structureSource: chunk.metadata.structureSource,
                isOcr: isOcr ?? chunk.metadata.isOcr,
                parentClauseIntro: chunk.metadata.parentClauseIntro,
              },
            }))
          )
        }

        // Update progress
        await ctx.db
          .update(analyses)
          .set({
            progressStage: 'chunking',
            progressPercent: 35,
            progressMessage: `Embedded ${embeddableChunks.length} chunks (${boilerplateChunks.length} boilerplate skipped)`,
          })
          .where(eq(analyses.id, analysisId))
      })

      return {
        chunkCount: chunks.length,
        embeddableCount: embeddableChunks.length,
        boilerplateCount: boilerplateChunks.length,
      }
    })
  }
)
