/**
 * @fileoverview Type definitions for legal-aware document chunking.
 *
 * This module defines the core types used by the legal chunking pipeline,
 * which transforms extracted document text into semantically meaningful
 * chunks for Voyage AI embedding and downstream analysis.
 *
 * The chunking pipeline consumes `DocumentStructure` from Phase 3's
 * structure detection and produces `LegalChunk[]` with position tracking,
 * section paths, and metadata for each chunk.
 *
 * @module lib/document-chunking/types
 * @see {@link ../document-extraction/types} for upstream structure types
 */

import type {
  PositionedSection,
  DocumentStructure,
} from "@/lib/document-extraction/types"

// Re-export upstream types used by chunking consumers
export type { PositionedSection, DocumentStructure }

// ============================================================================
// Chunk Type Discriminators
// ============================================================================

/**
 * Discriminator for the type/origin of a chunk.
 *
 * - `definition` - Individual definition entry (e.g., "Confidential Information" means...)
 * - `clause` - Standard clause or section
 * - `sub-clause` - Lettered items like (a), (b), (c) within a clause
 * - `recital` - Whereas/recital clauses (preamble)
 * - `boilerplate` - Signature blocks, notices, governing law, etc.
 * - `exhibit` - Exhibit or schedule content
 * - `merged` - Result of merging short adjacent chunks below minChunkTokens
 * - `split` - Result of splitting an oversized clause exceeding maxTokens
 * - `fallback` - Produced by paragraph/sentence fallback when structure is unavailable
 */
export type ChunkType =
  | "definition"
  | "clause"
  | "sub-clause"
  | "recital"
  | "boilerplate"
  | "exhibit"
  | "merged"
  | "split"
  | "fallback"

// ============================================================================
// Chunk Metadata
// ============================================================================

/**
 * Additional metadata attached to each chunk for downstream processing.
 */
export interface ChunkMetadata {
  /**
   * First ~100 tokens of the parent clause text.
   * Prepended to sub-chunks to provide context for embedding quality.
   * Only present on sub-clause and split chunks.
   */
  parentClauseIntro?: string

  /**
   * Cross-references found in this chunk's text.
   * Section numbers referenced by this chunk, e.g., `["3.1", "7.4"]`.
   * Annotated in metadata so downstream agents know about dependencies.
   */
  references: string[]

  /**
   * Whether this chunk has overlap text prepended from the previous chunk.
   * When true, the first `overlapTokens` tokens duplicate the end of
   * the previous chunk for context continuity.
   */
  isOverlap: boolean

  /**
   * Number of tokens that are overlap from the previous chunk.
   * Zero when `isOverlap` is false.
   */
  overlapTokens: number

  /**
   * How the document structure was detected.
   * - `regex` - Structure found via regex pattern matching (Phase 3)
   * - `llm` - Structure determined by LLM fallback analysis
   */
  structureSource: "regex" | "llm"

  /**
   * True if the text came from OCR processing (Phase 4).
   * OCR text may have lower quality and different chunking heuristics.
   */
  isOcr?: boolean
}

// ============================================================================
// Core Chunk Types
// ============================================================================

/**
 * A single legal-aware chunk of document text.
 *
 * Each chunk represents a semantically meaningful unit of the document
 * (a definition, clause, sub-clause, etc.) with position tracking for
 * document viewer highlighting and section paths for context reconstruction.
 *
 * Chunks maintain sequential ordering so the original document can be
 * reconstructed by concatenating chunks in index order (minus overlaps).
 */
export interface LegalChunk {
  /** Chunk identifier in format `chunk-{index}` */
  id: string

  /** Sequential ordering (0-based) for document reconstruction */
  index: number

  /** The chunk text content */
  content: string

  /**
   * Hierarchical path in the document structure.
   * @example ["Article 5", "Section 5.2", "(a)"]
   */
  sectionPath: string[]

  /** Voyage AI token count (Llama 2 tokenizer) */
  tokenCount: number

  /** Character offset where chunk starts in original extracted text */
  startPosition: number

  /** Character offset where chunk ends in original extracted text (exclusive) */
  endPosition: number

  /** Type discriminator for this chunk */
  chunkType: ChunkType

  /** Additional metadata for downstream processing */
  metadata: ChunkMetadata
}

// ============================================================================
// Chunk Statistics & Mapping
// ============================================================================

/**
 * Aggregate statistics about all chunks produced for a document.
 * Stored on the analysis record for monitoring and debugging.
 */
export interface ChunkStats {
  /** Total number of chunks produced */
  totalChunks: number

  /** Average token count across all chunks */
  avgTokens: number

  /** Minimum token count (smallest chunk) */
  minTokens: number

  /** Maximum token count (largest chunk) */
  maxTokens: number

  /** Count of chunks by type */
  distribution: Record<ChunkType, number>
}

/**
 * Summary entry for a single chunk in the chunk map.
 * Lightweight representation for debugging and admin views.
 */
export interface ChunkMapEntry {
  /** Sequential index of the chunk */
  index: number

  /** Section path in document hierarchy */
  sectionPath: string[]

  /** Chunk type discriminator */
  type: ChunkType

  /** Voyage AI token count */
  tokenCount: number

  /** First 100 characters of chunk content (preview) */
  preview: string
}

/**
 * Complete chunk map for a document, summarizing all chunks.
 * Stored as JSONB on the analysis record for debugging and admin observability.
 */
export interface ChunkMap {
  /** ID of the source document */
  documentId: string

  /** Total number of chunks */
  totalChunks: number

  /** Average token count */
  avgTokens: number

  /** Minimum token count */
  minTokens: number

  /** Maximum token count */
  maxTokens: number

  /** Count by chunk type */
  distribution: Record<string, number>

  /** Individual chunk summaries */
  entries: ChunkMapEntry[]
}

// ============================================================================
// Chunking Options
// ============================================================================

/**
 * Configuration options for the legal chunking pipeline.
 *
 * Defaults are tuned for Voyage AI voyage-law-2 (16K context, 1024 dims):
 * - Target 400 tokens for optimal embedding quality
 * - Hard max 512 tokens per Voyage AI recommendations
 * - 50 token overlap for context continuity at chunk boundaries
 * - Merge chunks below 50 tokens to avoid degenerate embeddings
 */
export interface LegalChunkOptions {
  /**
   * Hard maximum tokens per chunk.
   * Chunks exceeding this will be split.
   * @default 512
   */
  maxTokens?: number

  /**
   * Soft target tokens per chunk.
   * The chunker aims for this size but respects semantic boundaries.
   * @default 400
   */
  targetTokens?: number

  /**
   * Overlap tokens between consecutive chunks.
   * Provides context continuity at chunk boundaries.
   * @default 50
   */
  overlapTokens?: number

  /**
   * Minimum chunk size in tokens.
   * Chunks below this threshold are merged with adjacent chunks.
   * @default 50
   */
  minChunkTokens?: number

  /**
   * Whether to skip embedding generation for boilerplate chunks.
   * Boilerplate (signature blocks, notices) rarely adds retrieval value.
   * @default true
   */
  skipBoilerplateEmbedding?: boolean
}

// ============================================================================
// Embedded Chunk
// ============================================================================

/**
 * A legal chunk with its Voyage AI embedding vector.
 * The embedding is null when the chunk was skipped (e.g., boilerplate
 * chunks when `skipBoilerplateEmbedding` is true).
 */
export type EmbeddedChunk = LegalChunk & {
  /** Voyage AI voyage-law-2 embedding (1024 dims), or null if skipped */
  embedding: number[] | null
}
