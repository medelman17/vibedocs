/**
 * @fileoverview Legal-aware document chunking engine — REFERENCE IMPLEMENTATION
 *
 * ============================================================================
 * CONTEXT FOR CLAUDE CODE
 * ============================================================================
 *
 * This file replaces lib/document-chunking/legal-chunker.ts.
 *
 * WHY THIS REWRITE EXISTS:
 * The chunker had a "CHK-03 LLM re-chunking" path (Step 4) that called
 * detectStructure(text, { forceLlm: true }) whenever chunk quality looked
 * poor. The trigger was chunkPageRatio < 2 (fewer than 2 chunks per estimated
 * page). Combined with the old structure-detector.ts that only had 3 regex
 * patterns, this meant:
 *
 *   1. structure-detector misses headings → regex returns few/no sections
 *   2. chunker produces few chunks from sparse structure
 *   3. chunkPageRatio < 2 triggers → chunker calls detectStructure(forceLlm)
 *   4. Second LLM call fires with Sonnet on 50K chars (60-120s)
 *
 * So a single document could trigger TWO LLM calls just for structure/chunking,
 * totaling 2-4 minutes of wall-clock time before any actual analysis begins.
 *
 * WHAT CHANGED:
 * 1. chunkLegalDocument() now accepts an optional `structureSource` parameter
 *    so the pipeline can tell the chunker whether regex or LLM was used,
 *    eliminating the fragile `inferStructureSource()` heuristic
 * 2. The LLM re-chunking trigger is now gated behind TWO conditions:
 *    - The initial structure came from REGEX (not already LLM-detected)
 *    - AND the ratio is genuinely bad (< 1.5 chunks/page, down from 2)
 *    This means: if the structure-detector already used the LLM path,
 *    we don't call it again. And with the expanded regex patterns in the
 *    new structure-detector.ts, the ratio threshold is rarely hit.
 * 3. Better logging with timing for the LLM re-chunking path
 * 4. The `inferStructureSource` heuristic is kept as a fallback only
 *    (for backward compat when structureSource isn't passed)
 *
 * WHAT DID NOT CHANGE:
 * - The chunking pipeline steps (validate → dispatch → merge → split → annotate → overlap → reindex)
 * - chunk-strategies.ts (definitions, clauses, recitals, boilerplate, exhibits, fallback)
 * - chunk-merger.ts (mergeShortChunks, splitOversizedChunks)
 * - cross-reference.ts (extractCrossReferences)
 * - token-counter.ts (initVoyageTokenizer, countVoyageTokensSync)
 * - The types (LegalChunk, LegalChunkOptions, ChunkType, etc.)
 * - The validation logic (bounds clamping, overlap detection, coverage check)
 * - The overlap application logic
 *
 * DOWNSTREAM CONSUMERS:
 * - inngest/functions/analyze-nda.ts → calls chunkLegalDocument(rawText, structure)
 *   ** UPDATE THIS CALL to pass structureSource when available **
 * - agents/parser.test.ts → mocks this module
 *
 * DEPENDENCY ON NEW structure-detector.ts:
 * This file imports detectStructure for the LLM re-chunking fallback.
 * The new structure-detector.ts uses Haiku (not Sonnet) and truncates to
 * 15K chars, so even when the fallback fires, it completes in 3-8 seconds.
 *
 * TESTING NOTES:
 * - Existing tests should pass since the exported function signature is
 *   backward-compatible (structureSource is optional)
 * - Key scenarios to test:
 *   a) Regex structure with good coverage → no LLM re-chunking
 *   b) Regex structure with poor coverage → LLM re-chunking fires
 *   c) LLM structure (forceLlm was used upstream) → NO re-chunking even if poor
 *   d) Empty structure → LLM re-chunking fires
 *   e) structureSource='llm' passed → no re-chunking regardless of quality
 *
 * @module lib/document-chunking/legal-chunker
 * @see {@link ./types} for LegalChunk, LegalChunkOptions types
 * @see {@link ./chunk-strategies} for strategy implementations
 */

import type {
  DocumentStructure,
  PositionedSection,
} from "@/lib/document-extraction/types";
import { detectStructure } from "@/lib/document-extraction/structure-detector";
import type { LegalChunk, LegalChunkOptions } from "./types";
import { initVoyageTokenizer, countVoyageTokensSync } from "./token-counter";
import {
  chunkDefinitions,
  chunkClause,
  chunkBoilerplate,
  chunkExhibit,
  chunkRecital,
  chunkFallback,
} from "./chunk-strategies";
import { mergeShortChunks, splitOversizedChunks } from "./chunk-merger";
import { extractCrossReferences } from "./cross-reference";

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<LegalChunkOptions> = {
  maxTokens: 512,
  targetTokens: 400,
  overlapTokens: 50,
  minChunkTokens: 50,
  skipBoilerplateEmbedding: true,
};

/**
 * Minimum chunk-to-page ratio before LLM re-chunking is considered.
 *
 * Lowered from 2.0 → 1.5 because:
 * - The expanded regex patterns in structure-detector.ts catch more headings,
 *   producing better initial structure
 * - Short NDAs (2-4 pages) legitimately have 1-2 chunks/page for sections
 *   like "Miscellaneous" or "Governing Law" that are just a paragraph
 * - The old threshold of 2.0 was too aggressive and triggered LLM calls
 *   on well-structured documents with naturally short sections
 */
const MIN_CHUNK_PAGE_RATIO = 1.5;

/**
 * Minimum estimated page count before the chunk/page ratio check applies.
 *
 * Single-page documents shouldn't trigger re-chunking even with 1 chunk —
 * there's nothing more to find.
 */
const MIN_PAGES_FOR_RATIO_CHECK = 2;

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Chunks a legal document into semantically meaningful, right-sized chunks.
 *
 * Consumes `DocumentStructure` from structure detection and produces
 * `LegalChunk[]` with position tracking, section paths, and metadata.
 *
 * @param text - The full extracted document text
 * @param structure - Document structure from detectStructure()
 * @param options - Optional chunking configuration overrides
 * @param structureSource - How the structure was detected: 'regex' or 'llm'.
 *   When provided, the chunker uses this directly instead of inferring it.
 *   **When structureSource='llm', the LLM re-chunking fallback is SKIPPED**
 *   because the structure was already LLM-detected — calling it again won't
 *   produce better results.
 *   If not provided, falls back to the `inferStructureSource()` heuristic
 *   for backward compatibility.
 * @returns Array of legal chunks ready for embedding and storage
 *
 * @example
 * ```typescript
 * // Pipeline knows the structure came from regex (fast path)
 * const structure = await detectStructure(text)
 * const chunks = await chunkLegalDocument(text, structure, {}, 'regex')
 *
 * // Pipeline knows LLM was used (skip re-chunking)
 * const structure = await detectStructure(text, { forceLlm: true })
 * const chunks = await chunkLegalDocument(text, structure, {}, 'llm')
 * ```
 */
export async function chunkLegalDocument(
  text: string,
  structure: DocumentStructure,
  options?: Partial<LegalChunkOptions>,
  structureSource?: "regex" | "llm",
): Promise<LegalChunk[]> {
  const opts: Required<LegalChunkOptions> = { ...DEFAULT_OPTIONS, ...options };

  // Step 1: Initialize tokenizer for accurate token counting
  // NOTE: This is idempotent — safe to call multiple times. The tokenizer
  // initialization loads the Voyage AI tokenizer WASM module. It's cached
  // after first load, so subsequent calls are essentially free.
  await initVoyageTokenizer();

  // Step 2: Validate and sanitize structure
  const validatedStructure = validateStructure(text, structure);

  // Step 3: Determine structure source
  // Prefer the caller-provided value; fall back to heuristic inference.
  // The heuristic is kept for backward compatibility with callers that
  // don't pass structureSource yet (e.g., tests, older pipeline code).
  let source: "regex" | "llm" =
    structureSource ?? inferStructureSource(validatedStructure);

  // Step 4: Initial chunking from structure
  let chunks: LegalChunk[];

  if (validatedStructure.sections.length === 0) {
    // No structure at all — use fallback on entire text
    chunks = chunkFallback(text, 0, opts);
  } else {
    // Dispatch sections to appropriate strategies
    chunks = chunkSections(text, validatedStructure.sections, opts);
  }

  // Step 5: LLM re-chunking when structure is insufficient
  //
  // CRITICAL CHANGE: This path is now gated behind TWO conditions:
  //
  // Condition A: The initial structure came from REGEX.
  //   If the structure was already LLM-detected (either because the
  //   structure-detector fell back to LLM, or because the chunker was
  //   called with forceLlm from a retry), calling LLM again won't help.
  //   The same model with the same text will return the same headings.
  //
  // Condition B: The chunk quality is genuinely bad.
  //   Either zero sections were found, or the chunk/page ratio is below
  //   the threshold AND the document is long enough to warrant the check.
  //
  // With the expanded regex patterns in the new structure-detector.ts,
  // this path should fire on <10% of documents (was ~90% before).
  // When it does fire, it now uses Haiku (3-8s) instead of Sonnet (60-120s).
  const shouldAttemptLlmRechunk =
    source === "regex" &&
    shouldTriggerRechunk(
      validatedStructure.sections.length,
      chunks.length,
      text.length,
    );

  if (shouldAttemptLlmRechunk) {
    const rechunkResult = await attemptLlmRechunk(text, chunks, opts);
    if (rechunkResult) {
      chunks = rechunkResult.chunks;
      source = "llm";
    }
  }

  // Step 6: Post-process — merge short chunks, split oversized chunks
  chunks = mergeShortChunks(chunks, opts.minChunkTokens);
  chunks = splitOversizedChunks(chunks, opts.maxTokens);

  // Step 7: Annotate cross-references on all chunks
  for (const chunk of chunks) {
    chunk.metadata.references = extractCrossReferences(chunk.content);
    chunk.metadata.structureSource = source;
  }

  // Step 8: Add overlap between consecutive chunks
  chunks = addOverlap(chunks, opts.overlapTokens);

  // Step 9: Re-index all chunks sequentially
  for (let i = 0; i < chunks.length; i++) {
    chunks[i].index = i;
    chunks[i].id = `chunk-${i}`;
  }

  return chunks;
}

// ============================================================================
// LLM Re-Chunking (extracted from main function for clarity)
// ============================================================================

/**
 * Determines whether LLM re-chunking should be attempted.
 *
 * Returns true when:
 * - Zero sections were detected (structure completely failed), OR
 * - The chunk/page ratio is below the threshold AND the document has
 *   enough pages to make the ratio meaningful
 */
function shouldTriggerRechunk(
  sectionCount: number,
  chunkCount: number,
  textLength: number,
): boolean {
  // Always re-chunk if no structure at all
  if (sectionCount === 0) return true;

  // For short documents, don't bother
  const estimatedPages = Math.ceil(textLength / 3000);
  if (estimatedPages < MIN_PAGES_FOR_RATIO_CHECK) return false;

  // Check ratio
  const ratio = chunkCount / estimatedPages;
  if (ratio < MIN_CHUNK_PAGE_RATIO) {
    console.log(
      `[legal-chunker] Low chunk quality detected: ` +
        `${chunkCount} chunks / ${estimatedPages} est. pages = ${ratio.toFixed(1)} ratio ` +
        `(threshold: ${MIN_CHUNK_PAGE_RATIO}). Will attempt LLM re-chunking.`,
    );
    return true;
  }

  return false;
}

/**
 * Attempts LLM-based re-chunking and returns improved chunks if successful.
 *
 * This calls detectStructure({ forceLlm: true }) which now routes to Haiku 4.5
 * via the new structure-detector.ts. Expected latency: 3-8 seconds.
 *
 * Returns null if:
 * - The LLM call fails (graceful degradation)
 * - The LLM-based chunks aren't better than the initial regex-based chunks
 */
async function attemptLlmRechunk(
  text: string,
  initialChunks: LegalChunk[],
  opts: Required<LegalChunkOptions>,
): Promise<{ chunks: LegalChunk[] } | null> {
  const estimatedPages = Math.ceil(text.length / 3000);
  const startTime = Date.now();

  console.log(
    `[legal-chunker] Attempting LLM re-chunking. ` +
      `Initial: ${initialChunks.length} chunks, ` +
      `${estimatedPages} est. pages.`,
  );

  try {
    const llmStructure = await detectStructure(text, { forceLlm: true });
    const llmValidated = validateStructure(text, llmStructure);

    if (llmValidated.sections.length === 0) {
      const elapsed = Date.now() - startTime;
      console.log(
        `[legal-chunker] LLM re-chunking returned no sections (${elapsed}ms). ` +
          `Keeping initial chunks.`,
      );
      return null;
    }

    const llmChunks = chunkSections(text, llmValidated.sections, opts);
    const llmRatio =
      estimatedPages > 0 ? llmChunks.length / estimatedPages : llmChunks.length;
    const elapsed = Date.now() - startTime;

    // Only use LLM chunks if they're meaningfully better
    // "Better" = more chunks OR better ratio
    if (
      llmChunks.length > initialChunks.length ||
      llmRatio >= MIN_CHUNK_PAGE_RATIO
    ) {
      console.log(
        `[legal-chunker] LLM re-chunking improved results in ${elapsed}ms: ` +
          `${initialChunks.length} → ${llmChunks.length} chunks ` +
          `(ratio: ${llmRatio.toFixed(1)})`,
      );
      return { chunks: llmChunks };
    }

    console.log(
      `[legal-chunker] LLM re-chunking didn't improve results (${elapsed}ms): ` +
        `${llmChunks.length} chunks (ratio: ${llmRatio.toFixed(1)}). ` +
        `Keeping initial ${initialChunks.length} chunks.`,
    );
    return null;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.warn(
      `[legal-chunker] LLM re-chunking failed after ${elapsed}ms. ` +
        `Keeping initial chunks.`,
      error,
    );
    return null;
  }
}

// ============================================================================
// Section Dispatch
// ============================================================================

/**
 * Dispatches each section to the appropriate chunking strategy based on type.
 * Also handles gaps between sections (preamble, trailing text, inter-section gaps).
 */
function chunkSections(
  text: string,
  sections: PositionedSection[],
  opts: Required<LegalChunkOptions>,
): LegalChunk[] {
  const chunks: LegalChunk[] = [];

  // Sort sections by start offset to process in document order
  const sorted = [...sections].sort((a, b) => a.startOffset - b.startOffset);

  // Handle text before first section (preamble, title page, etc.)
  if (sorted.length > 0 && sorted[0].startOffset > 0) {
    const preambleText = text.slice(0, sorted[0].startOffset).trim();
    if (preambleText && countVoyageTokensSync(preambleText) >= 10) {
      chunks.push(...chunkFallback(preambleText, 0, opts, ["Preamble"]));
    }
  }

  // Process each section
  for (let i = 0; i < sorted.length; i++) {
    const section = sorted[i];
    const sectionChunks = dispatchSection(section, text, opts);
    chunks.push(...sectionChunks);

    // Handle gaps between sections
    if (i + 1 < sorted.length) {
      const gapStart = section.endOffset;
      const gapEnd = sorted[i + 1].startOffset;

      if (gapEnd > gapStart) {
        const gapText = text.slice(gapStart, gapEnd).trim();
        if (gapText && countVoyageTokensSync(gapText) >= 10) {
          chunks.push(
            ...chunkFallback(gapText, gapStart, opts, section.sectionPath),
          );
        }
      }
    }
  }

  // Handle text after last section (trailing content)
  if (sorted.length > 0) {
    const lastEnd = sorted[sorted.length - 1].endOffset;
    if (lastEnd < text.length) {
      const trailingText = text.slice(lastEnd).trim();
      if (trailingText && countVoyageTokensSync(trailingText) >= 10) {
        chunks.push(
          ...chunkFallback(trailingText, lastEnd, opts, ["Trailing"]),
        );
      }
    }
  }

  return chunks;
}

/**
 * Dispatches a single section to its type-specific chunking strategy.
 *
 * Recitals are detected by checking section content for WHEREAS patterns,
 * since SectionType doesn't include a dedicated recital type (they appear
 * as 'clause' or 'heading' from the structure detector).
 */
function dispatchSection(
  section: PositionedSection,
  text: string,
  opts: Required<LegalChunkOptions>,
): LegalChunk[] {
  // Check for recital content (WHEREAS patterns) regardless of section type
  const sectionContent = text.slice(
    Math.max(0, section.startOffset),
    Math.min(text.length, section.endOffset),
  );
  if (/WHEREAS/i.test(sectionContent) || /recital/i.test(section.title)) {
    return chunkRecital(section, text, opts);
  }

  switch (section.type) {
    case "definitions":
      return chunkDefinitions(section, text, opts);

    case "clause":
    case "heading":
    case "other":
    case "amendment":
      return chunkClause(section, text, opts);

    case "signature":
      return chunkBoilerplate(section, text, opts);

    case "exhibit":
    case "schedule":
      return chunkExhibit(section, text, opts);

    case "cover_letter":
      return chunkBoilerplate(section, text, opts);

    default:
      return chunkClause(section, text, opts);
  }
}

// ============================================================================
// Structure Validation
// ============================================================================

/**
 * Validates and sanitizes a DocumentStructure before chunking.
 *
 * Checks:
 * - Section positions are within text bounds (clamps if out of bounds)
 * - Sections don't overlap (logs warning if found)
 * - Coverage gaps are reasonable (logs warning if > 20% uncovered)
 */
function validateStructure(
  text: string,
  structure: DocumentStructure,
): DocumentStructure {
  const textLength = text.length;
  const sections: PositionedSection[] = [];

  for (const section of structure.sections) {
    // Clamp positions to valid range
    const startOffset = Math.max(0, section.startOffset);
    const endOffset = Math.min(textLength, section.endOffset);

    // Ensure end is after start
    if (endOffset <= startOffset) {
      console.warn(
        `[legal-chunker] Section "${section.title}" has invalid range ` +
          `[${section.startOffset}, ${section.endOffset}], skipping`,
      );
      continue;
    }

    // Log warning if positions were clamped
    if (
      startOffset !== section.startOffset ||
      endOffset !== section.endOffset
    ) {
      console.warn(
        `[legal-chunker] Section "${section.title}" positions clamped: ` +
          `[${section.startOffset}, ${section.endOffset}] -> [${startOffset}, ${endOffset}]`,
      );
    }

    sections.push({
      ...section,
      startOffset,
      endOffset,
    });
  }

  // Check for overlapping sections
  const sorted = [...sections].sort((a, b) => a.startOffset - b.startOffset);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endOffset > sorted[i + 1].startOffset) {
      console.warn(
        `[legal-chunker] Overlapping sections detected: "${sorted[i].title}" ` +
          `ends at ${sorted[i].endOffset} but "${sorted[i + 1].title}" starts at ${sorted[i + 1].startOffset}`,
      );
    }
  }

  // Check for large gaps (> 20% uncovered)
  if (sorted.length > 0 && textLength > 0) {
    let coveredChars = 0;
    for (const s of sorted) {
      coveredChars += s.endOffset - s.startOffset;
    }
    const coverageRatio = coveredChars / textLength;
    if (coverageRatio < 0.8) {
      console.warn(
        `[legal-chunker] Low structure coverage: ${(coverageRatio * 100).toFixed(1)}% ` +
          `of text covered by sections (${coveredChars}/${textLength} chars)`,
      );
    }
  }

  return {
    ...structure,
    sections,
  };
}

// ============================================================================
// Overlap Application
// ============================================================================

/**
 * Adds overlap tokens between consecutive chunks for context continuity.
 *
 * For each chunk after the first, prepends up to `overlapTokens` tokens
 * from the end of the previous chunk. The overlap text is prepended to
 * the chunk content, and metadata is updated accordingly.
 *
 * Note: startPosition/endPosition still reference the original text
 * positions (without overlap). The overlap is for embedding quality only.
 */
function addOverlap(chunks: LegalChunk[], overlapTokens: number): LegalChunk[] {
  if (overlapTokens <= 0 || chunks.length <= 1) return chunks;

  const result: LegalChunk[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1];
    const currentChunk = chunks[i];

    // Extract overlap text from end of previous chunk
    const overlapText = extractOverlapText(prevChunk.content, overlapTokens);

    if (overlapText) {
      const overlappedContent = overlapText + "\n\n" + currentChunk.content;
      result.push({
        ...currentChunk,
        content: overlappedContent,
        tokenCount: countVoyageTokensSync(overlappedContent),
        metadata: {
          ...currentChunk.metadata,
          isOverlap: true,
          overlapTokens: countVoyageTokensSync(overlapText),
        },
      });
    } else {
      result.push(currentChunk);
    }
  }

  return result;
}

/**
 * Extracts approximately N tokens from the end of text for overlap.
 * Uses word boundaries to avoid cutting mid-word.
 */
function extractOverlapText(text: string, targetTokens: number): string {
  const words = text.split(/\s+/);
  const overlapWords: string[] = [];

  for (let i = words.length - 1; i >= 0; i--) {
    overlapWords.unshift(words[i]);
    const candidateTokens = countVoyageTokensSync(overlapWords.join(" "));
    if (candidateTokens >= targetTokens) break;
  }

  const result = overlapWords.join(" ");

  // Don't return the entire previous chunk as overlap
  if (countVoyageTokensSync(result) > targetTokens * 1.5) {
    while (
      overlapWords.length > 1 &&
      countVoyageTokensSync(overlapWords.join(" ")) > targetTokens
    ) {
      overlapWords.shift();
    }
    return overlapWords.join(" ");
  }

  return result;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Infers whether the structure was detected via regex or LLM.
 *
 * DEPRECATION NOTE: This heuristic is kept for backward compatibility only.
 * Callers should pass `structureSource` directly to `chunkLegalDocument()`.
 * The new structure-detector.ts could easily tag the structure with its source,
 * making this heuristic unnecessary in the future.
 *
 * Heuristic: If >50% of section titles start with regex-typical prefixes
 * (ARTICLE, Section, numbered), it's regex-detected.
 */
function inferStructureSource(structure: DocumentStructure): "regex" | "llm" {
  if (structure.sections.length === 0) return "regex";

  const regexIndicators = /^(ARTICLE|Section|SECTION|\d+\.)/i;
  const regexCount = structure.sections.filter((s) =>
    regexIndicators.test(s.title),
  ).length;

  return regexCount > structure.sections.length / 2 ? "regex" : "llm";
}
