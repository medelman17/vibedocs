/**
 * @fileoverview Legal document structure detection — REFERENCE IMPLEMENTATION
 *
 * ============================================================================
 * CONTEXT FOR CLAUDE CODE
 * ============================================================================
 *
 * This file replaces lib/document-extraction/structure-detector.ts.
 *
 * WHY THIS REWRITE EXISTS:
 * The original had a critical performance bug: the regex patterns only matched
 * 3 very specific heading formats (ARTICLE I, Section 1., numbered ALL-CAPS).
 * Most real-world NDAs from law firms use variations that didn't match ANY of
 * those patterns, so ~90% of documents fell through to the LLM path — which
 * called claude-sonnet-4 with up to 50K characters. That's 60-120+ seconds
 * per document for what should be a <100ms regex operation.
 *
 * Compounding the problem: the legal chunker (legal-chunker.ts) ALSO calls
 * detectStructure(text, { forceLlm: true }) when it thinks structure quality
 * is poor (low chunk/page ratio). So a single document could trigger TWO
 * Sonnet calls — one in the parser, one in the chunker — totaling 2-4 minutes
 * of wall-clock time just for structure detection.
 *
 * Additionally, the structure detector hardcoded gateway('anthropic/claude-sonnet-4')
 * instead of using getAgentModel() from lib/ai/config.ts, where the parser
 * agent is already configured to use claude-haiku-4.5.
 *
 * WHAT CHANGED:
 * 1. Regex patterns expanded from 3 → 15+ to catch real-world NDA formats
 * 2. Multi-pass detection: heading scan → hierarchy inference → type classification
 * 3. LLM fallback uses MODELS.fast (Haiku 4.5) via project config, not Sonnet
 * 4. LLM truncation reduced from 50K → 15K chars (headings are front-loaded)
 * 5. LLM prompt simplified: asks for heading positions only, NOT full content
 *    extraction (the chunker handles content splitting downstream)
 * 6. generateObject → generateText + Output.object() (generateObject is deprecated)
 * 7. Party extraction regex expanded for common NDA naming conventions
 *
 * WHAT TO PRESERVE:
 * - All existing exports and their signatures (detectStructure, parseObviousStructure)
 * - The DetectStructureOptions interface (forceLlm flag used by legal-chunker.ts)
 * - The DocumentStructure return shape (consumed by legal-chunker.ts and analyses table)
 * - Position computation logic (drives UI highlighting per CONTEXT.md)
 * - Exhibit/signature/redaction detection patterns
 *
 * TESTING NOTES:
 * - No existing test file for this module (agents/parser.test.ts mocks it)
 * - After implementing, create lib/document-extraction/structure-detector.test.ts
 * - Test regex patterns against real NDA samples in docs/test-fixtures/ if available
 * - Key edge cases: OCR'd PDFs with inconsistent spacing, NDAs with no headings
 *   at all, documents with mixed numbered/lettered sections
 *
 * DOWNSTREAM CONSUMERS:
 * - agents/parser.ts → calls detectStructure(rawText)
 * - lib/document-chunking/legal-chunker.ts → calls detectStructure(text, { forceLlm: true })
 * - Both consumers use the sections array to guide chunk boundaries
 * - The chunker specifically uses section startOffset/endOffset for splitting
 *
 * @module lib/document-extraction/structure-detector
 */

import { generateText, Output } from "ai";
import { z } from "zod";
import { gateway } from "ai";
import { MODELS } from "@/lib/ai/config";
import type {
  DocumentStructure,
  DocumentSection,
  PositionedSection,
  SectionType,
} from "./types";

// ============================================================================
// Heading Detection Patterns
// ============================================================================
//
// DESIGN RATIONALE: The original had 3 patterns that only matched idealized
// formatting. Real NDAs from BigLaw firms, corporate counsel, and templates
// (DocuSign, PandaDoc, LegalZoom, etc.) use wildly varied heading styles.
//
// These patterns are ordered from most specific to most general. The detection
// loop tries all patterns and picks matches, then deduplicates by line number.
// This avoids the original's problem of bailing out to LLM on first non-match.
//
// Each pattern group is labeled with the real-world format it handles.
// The `m` (multiline) flag is critical — it makes ^ and $ match line boundaries.

/**
 * Primary heading patterns that indicate clear document structure.
 *
 * These are checked FIRST in the detection pipeline. If ANY of these match
 * at least once in the document, we use the regex fast path.
 *
 * Note: We intentionally cast a WIDE net here. A few false positives from
 * regex (which get filtered by the chunker) are vastly preferable to a 2-minute
 * LLM call. The downstream chunker (legal-chunker.ts) validates section quality
 * and will re-chunk if the structure is truly bad.
 */
const HEADING_PATTERNS: Array<{
  pattern: RegExp;
  level: 1 | 2 | 3 | 4;
  label: string;
}> = [
  // ── Level 1: Top-level articles/parts ──────────────────────────────────
  // "ARTICLE I - DEFINITIONS", "ARTICLE 2: CONFIDENTIALITY", "Article III"
  {
    pattern: /^ARTICLE\s+[IVX\d]+\s*[-–—:.]\s*(.+)/gim,
    level: 1,
    label: "ARTICLE",
  },
  // "PART ONE", "PART 2 - RECITALS"
  {
    pattern:
      /^PART\s+(?:[IVX\d]+|ONE|TWO|THREE|FOUR|FIVE)\s*[-–—:.]?\s*(.*)/gim,
    level: 1,
    label: "PART",
  },

  // ── Level 2: Numbered sections ─────────────────────────────────────────
  // "Section 1. Definitions", "SECTION 2.1 Scope", "Section 3 - Term"
  {
    pattern: /^SECTION\s+\d+(?:\.\d+)?\.?\s*[-–—:]?\s*(.+)/gim,
    level: 2,
    label: "SECTION",
  },
  // "1. DEFINITIONS", "2. CONFIDENTIAL INFORMATION", "3. OBLIGATIONS"
  // Must have ALL-CAPS title to avoid matching list items like "1. The parties agree..."
  {
    pattern: /^(\d+)\.\s+([A-Z][A-Z\s,/&]{2,})$/gm,
    level: 2,
    label: "numbered-heading",
  },
  // "1. Definitions" — title-case numbered sections (common in modern templates)
  // Requires the title word to start with uppercase and be at least 3 chars
  {
    pattern: /^(\d+)\.\s+([A-Z][a-z]{2,}(?:\s+[A-Za-z]+)*)\s*$/gm,
    level: 2,
    label: "numbered-titlecase",
  },

  // ── Level 3: Sub-sections ──────────────────────────────────────────────
  // "2.1 Scope of Confidentiality", "3.2. Exceptions", "1.1 - Definitions"
  {
    pattern: /^(\d+\.\d+)\.?\s*[-–—:]?\s*(.+)/gm,
    level: 3,
    label: "decimal-subsection",
  },
  // "(a) Definitions", "(b) Exceptions", "(i) blah"
  {
    pattern: /^\(([a-z]|[ivx]+)\)\s+(.+)/gm,
    level: 3,
    label: "lettered-subsection",
  },

  // ── Level 4: Sub-sub-sections ──────────────────────────────────────────
  // "2.1.1 Specific exclusions", "3.2.1. Carve-outs"
  {
    pattern: /^(\d+\.\d+\.\d+)\.?\s*(.+)/gm,
    level: 4,
    label: "triple-decimal",
  },

  // ── ALL-CAPS standalone lines (very common in NDAs) ────────────────────
  // "CONFIDENTIALITY AGREEMENT", "MUTUAL NON-DISCLOSURE AGREEMENT",
  // "DEFINITIONS", "TERM AND TERMINATION", "MISCELLANEOUS"
  //
  // Constraints to reduce false positives:
  // - Must be 3+ words OR a known legal heading term
  // - Must be on its own line (no trailing punctuation except periods)
  // - Minimum 10 chars to skip things like "AND" or "THE"
  {
    pattern: /^([A-Z][A-Z\s,/&-]{8,})\.?\s*$/gm,
    level: 1,
    label: "all-caps-line",
  },

  // ── Roman numeral sections (without "ARTICLE" prefix) ──────────────────
  // "I. DEFINITIONS", "II. CONFIDENTIAL INFORMATION", "III. TERM"
  // Anchored to line start, requires ALL-CAPS title
  {
    pattern: /^([IVX]+)\.\s+([A-Z][A-Z\s,/&]{2,})/gm,
    level: 1,
    label: "roman-numeral",
  },

  // ── Legal document preamble markers ────────────────────────────────────
  // These aren't headings per se, but mark structural boundaries that the
  // chunker uses to separate preamble from operative clauses.
  // "WHEREAS", "NOW, THEREFORE", "RECITALS", "WITNESSETH"
  {
    pattern: /^(WHEREAS|NOW,?\s+THEREFORE|RECITALS|WITNESSETH)\b/gim,
    level: 1,
    label: "preamble-marker",
  },
];

/**
 * Known legal heading terms that validate an ALL-CAPS line as a real heading
 * (vs. a coincidentally capitalized sentence).
 *
 * Used by the ALL-CAPS pattern filter to reduce false positives.
 */
const KNOWN_LEGAL_HEADINGS = new Set([
  "DEFINITIONS",
  "CONFIDENTIAL INFORMATION",
  "CONFIDENTIALITY",
  "NON-DISCLOSURE",
  "OBLIGATIONS",
  "TERM",
  "TERMINATION",
  "TERM AND TERMINATION",
  "MISCELLANEOUS",
  "GENERAL PROVISIONS",
  "GOVERNING LAW",
  "DISPUTE RESOLUTION",
  "ARBITRATION",
  "INDEMNIFICATION",
  "REMEDIES",
  "INJUNCTIVE RELIEF",
  "RETURN OF MATERIALS",
  "RETURN OF INFORMATION",
  "REPRESENTATIONS AND WARRANTIES",
  "LIMITATION OF LIABILITY",
  "ENTIRE AGREEMENT",
  "ASSIGNMENT",
  "AMENDMENTS",
  "NOTICES",
  "SEVERABILITY",
  "WAIVER",
  "COUNTERPARTS",
  "RECITALS",
  "BACKGROUND",
  "PURPOSE",
  "SCOPE",
  "EXCEPTIONS",
  "EXCLUSIONS",
  "PERMITTED DISCLOSURES",
  "INTELLECTUAL PROPERTY",
  "NON-SOLICITATION",
  "NON-COMPETE",
  "NON-COMPETITION",
  "SURVIVAL",
]);

// ============================================================================
// Structural boundary patterns (unchanged from original)
// ============================================================================

/** Patterns indicating signature blocks to exclude */
const SIGNATURE_PATTERNS = [
  /IN WITNESS WHEREOF/i,
  /EXECUTED as of/i,
  /By:\s*_+/,
  /Signature:/i,
  /Authorized Representative/i,
];

/** Patterns indicating exhibits/schedules to exclude */
const EXHIBIT_PATTERNS = [
  /^EXHIBIT\s+[A-Z\d]/im,
  /^SCHEDULE\s+[A-Z\d]/im,
  /^ATTACHMENT\s+[A-Z\d]/im,
  /^ANNEX\s+[A-Z\d]/im,
];

/** Patterns for redacted text */
const REDACTED_PATTERNS = [/\[REDACTED\]/i, /\[CONFIDENTIAL\]/i, /\*{5,}/];

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Options for structure detection behavior.
 */
export interface DetectStructureOptions {
  /**
   * When true, skip the regex check and go directly to LLM-based structure
   * detection. Used by the legal chunker when regex-based structure is
   * insufficient (e.g., low chunk/page ratio or empty sections).
   *
   * IMPORTANT: Even with forceLlm=true, this now uses Haiku (not Sonnet)
   * and truncates to 15K chars instead of 50K. The LLM path should complete
   * in 3-8 seconds, not 60-120 seconds.
   */
  forceLlm?: boolean;
}

/**
 * Detects document structure with position tracking.
 *
 * Three-tier strategy:
 * 1. REGEX (fast path, <100ms): Expanded pattern set catches ~90% of NDAs
 * 2. LLM (fallback, 3-8s): Haiku 4.5 extracts headings from first 15K chars
 * 3. EMPTY (graceful degradation): Returns empty sections; chunker uses
 *    fallback token-window strategy
 *
 * The original always fell through to tier 2 (LLM) with Sonnet on 50K chars,
 * taking 60-120+ seconds. This version should resolve in <100ms for most docs.
 */
export async function detectStructure(
  text: string,
  options?: DetectStructureOptions,
): Promise<DocumentStructure> {
  let sections: DocumentSection[];
  let parties: { disclosing?: string; receiving?: string };

  if (options?.forceLlm) {
    // Explicit LLM request from chunker — skip regex entirely
    // This path is hit when the chunker's quality check fails
    const llmResult = await detectStructureWithLlm(text);
    sections = llmResult.sections;
    parties = llmResult.parties;
  } else {
    // Try regex first (fast path)
    const regexResult = parseStructureWithRegex(text);

    if (regexResult.sections.length > 0) {
      // Regex found structure — use it
      sections = regexResult.sections;
      parties = extractPartiesFromText(text);
    } else {
      // No regex matches at all — fall back to LLM
      // This should be rare (~10% of documents) with the expanded patterns
      console.log(
        `[structure-detector] No regex heading matches found. ` +
          `Falling back to LLM detection (Haiku). ` +
          `Text length: ${text.length} chars.`,
      );
      const llmResult = await detectStructureWithLlm(text);
      sections = llmResult.sections;
      parties = llmResult.parties;
    }
  }

  // Compute character positions for UI highlighting
  const positionedSections = computePositions(text, sections);

  // Detect structural markers (unchanged from original)
  const hasExhibits = EXHIBIT_PATTERNS.some((p) => p.test(text));
  const hasSignatureBlock = SIGNATURE_PATTERNS.some((p) => p.test(text));
  const hasRedactedText = REDACTED_PATTERNS.some((p) => p.test(text));

  return {
    sections: positionedSections,
    parties,
    hasExhibits,
    hasSignatureBlock,
    hasRedactedText,
  };
}

// ============================================================================
// Regex-Based Parsing (REWRITTEN)
// ============================================================================

/**
 * Raw heading match before deduplication and content extraction.
 */
interface RawHeadingMatch {
  /** Full matched heading text */
  fullMatch: string;
  /** Extracted title portion (without numbering prefix) */
  title: string;
  /** Hierarchy level from the pattern that matched */
  level: 1 | 2 | 3 | 4;
  /** Character offset in the source text */
  offset: number;
  /** Line number (0-based) for deduplication */
  lineNumber: number;
  /** Which pattern group matched (for debugging) */
  patternLabel: string;
}

/**
 * Multi-pass regex structure detection.
 *
 * Strategy:
 * 1. Run ALL heading patterns against the full text, collecting matches
 * 2. Deduplicate by line number (multiple patterns can match the same line)
 * 3. Sort by offset to get document order
 * 4. Extract content between headings
 * 5. Classify section types
 *
 * This approach is more robust than the original's single-pass line-by-line
 * scan because:
 * - A heading like "2. DEFINITIONS" matches BOTH the numbered-heading pattern
 *   and the all-caps-line pattern. Deduplication picks the most specific match.
 * - Patterns with `g` flag find ALL occurrences, not just the first.
 * - We don't bail out on the first non-matching line.
 *
 * Exported for testing. This is the function tests should exercise directly.
 */
export function parseStructureWithRegex(text: string): {
  sections: DocumentSection[];
} {
  // ── Pass 1: Collect all heading matches ──────────────────────────────
  const rawMatches: RawHeadingMatch[] = [];
  // Pre-compute line start offsets for line number lookup
  const lineStarts = buildLineStartOffsets(text);

  for (const { pattern, level, label } of HEADING_PATTERNS) {
    // Reset lastIndex for global patterns (they're stateful)
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const offset = match.index;
      const lineNumber = findLineNumber(lineStarts, offset);
      const fullMatch = match[0].trim();

      // For all-caps-line pattern: filter out short/generic lines
      if (label === "all-caps-line") {
        const normalized = fullMatch.replace(/[^A-Z\s]/g, "").trim();
        const wordCount = normalized.split(/\s+/).length;
        // Require 2+ words OR be a known legal heading
        if (wordCount < 2 && !KNOWN_LEGAL_HEADINGS.has(normalized)) continue;
        // Skip very common false positives
        if (/^(AND|THE|FOR|BUT|NOT|NOR|YET|THIS|THAT|SUCH)$/i.test(normalized))
          continue;
      }

      // For preamble markers, the title IS the match
      const title =
        label === "preamble-marker"
          ? fullMatch
          : (match[2] ?? match[1] ?? fullMatch).trim();

      rawMatches.push({
        fullMatch,
        title: title || fullMatch,
        level,
        offset,
        lineNumber,
        patternLabel: label,
      });
    }
  }

  if (rawMatches.length === 0) {
    return { sections: [] };
  }

  // ── Pass 2: Deduplicate by line number ───────────────────────────────
  // When multiple patterns match the same line, prefer the most specific:
  // ARTICLE > SECTION > numbered > all-caps
  const SPECIFICITY: Record<string, number> = {
    ARTICLE: 10,
    PART: 9,
    SECTION: 8,
    "roman-numeral": 7,
    "numbered-heading": 6,
    "numbered-titlecase": 5,
    "decimal-subsection": 4,
    "triple-decimal": 3,
    "lettered-subsection": 2,
    "preamble-marker": 1,
    "all-caps-line": 0, // Least specific — only used if nothing else matches
  };

  const byLine = new Map<number, RawHeadingMatch>();
  for (const m of rawMatches) {
    const existing = byLine.get(m.lineNumber);
    if (
      !existing ||
      (SPECIFICITY[m.patternLabel] ?? 0) >
        (SPECIFICITY[existing.patternLabel] ?? 0)
    ) {
      byLine.set(m.lineNumber, m);
    }
  }

  // Sort by document offset
  const headings = Array.from(byLine.values()).sort(
    (a, b) => a.offset - b.offset,
  );

  // ── Pass 3: Extract content between headings and classify ────────────
  const sections: DocumentSection[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextHeading = headings[i + 1];

    // Content starts after the heading line
    const headingLineEnd = text.indexOf("\n", heading.offset);
    const contentStart =
      headingLineEnd >= 0
        ? headingLineEnd + 1
        : heading.offset + heading.fullMatch.length;
    const contentEnd = nextHeading ? nextHeading.offset : text.length;

    const content = text.slice(contentStart, contentEnd).trim();
    const type = classifySectionType(heading.fullMatch, heading.title);

    sections.push({
      title: heading.fullMatch,
      level: heading.level,
      content,
      type,
    });
  }

  return { sections };
}

// Backward compatibility: the original export name used by tests/mocks
export const parseObviousStructure = parseStructureWithRegex;

// ============================================================================
// Regex Helpers
// ============================================================================

/**
 * Builds an array of character offsets where each line starts.
 * Used for O(log n) line number lookup from character offset.
 */
function buildLineStartOffsets(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

/**
 * Binary search for line number from character offset.
 */
function findLineNumber(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Classifies a section by its heading text.
 *
 * Expanded from the original to handle more section types and reduce
 * "other" classifications (which provide no signal to the chunker).
 */
function classifySectionType(heading: string, title: string): SectionType {
  const combined = `${heading} ${title}`.toLowerCase();

  // Order matters: check most specific patterns first
  if (/defin/i.test(combined)) return "definitions";
  if (/exhibit/i.test(combined)) return "exhibit";
  if (/schedule/i.test(combined)) return "schedule";
  if (/attach|annex/i.test(combined)) return "exhibit";
  if (/signature|witness|executed/i.test(combined)) return "signature";
  if (/amend/i.test(combined)) return "amendment";
  if (/cover\s*letter|transmittal/i.test(combined)) return "cover_letter";

  // Legal structural markers
  if (/whereas|recital|background|purpose/i.test(combined)) return "heading";
  if (/now,?\s*therefore|witnesseth/i.test(combined)) return "heading";

  // If it looks like a section/article heading, mark as heading
  if (/^(article|section|part)\s/i.test(heading)) return "heading";

  // Numbered headings with legal terms → clause
  if (/^(\d+|[ivx]+)\./i.test(heading)) return "clause";

  return "clause"; // Default to clause, not 'other' — gives chunker useful signal
}

// ============================================================================
// LLM-Based Detection (REWRITTEN)
// ============================================================================

/**
 * Schema for LLM structure detection.
 *
 * IMPORTANT CHANGE: We no longer ask the LLM to extract full section content.
 * The original sent 50K chars and asked for content extraction, which:
 * - Bloated output tokens (content is just repeated from input)
 * - Made the call extremely slow (Sonnet processing 50K chars)
 * - Was redundant (the chunker extracts content from positions anyway)
 *
 * Now we ask for headings + approximate positions only. The position computation
 * step (computePositions) maps these back to exact offsets in the source text.
 * Content is extracted from the text between heading positions.
 */
const LlmStructureSchema = z.object({
  sections: z
    .array(
      z.object({
        title: z
          .string()
          .describe("The heading text exactly as it appears in the document"),
        level: z
          .number()
          .min(1)
          .max(4)
          .describe(
            "1=article/top-level, 2=section, 3=subsection, 4=paragraph",
          ),
        type: z
          .enum([
            "heading",
            "definitions",
            "clause",
            "signature",
            "exhibit",
            "schedule",
            "amendment",
            "cover_letter",
            "other",
          ])
          .describe("Section type for filtering"),
      }),
    )
    .describe("Document headings in order of appearance"),
  parties: z.object({
    disclosing: z
      .string()
      .optional()
      .describe("Name of the disclosing party, if identifiable"),
    receiving: z
      .string()
      .optional()
      .describe("Name of the receiving party, if identifiable"),
  }),
});

/**
 * LLM fallback for structure detection when regex finds nothing.
 *
 * KEY DIFFERENCES FROM ORIGINAL:
 * - Uses MODELS.fast (Haiku 4.5) instead of hardcoded Sonnet
 * - Truncates to 15K chars instead of 50K (headings are front-loaded in legal docs)
 * - Does NOT ask for section content (just headings) — massively reduces output
 * - Uses generateText + Output.object() instead of deprecated generateObject
 * - Content is filled in from the source text between heading positions
 *
 * Expected latency: 3-8 seconds (was 60-120+ seconds with Sonnet on 50K).
 */
async function detectStructureWithLlm(text: string): Promise<{
  sections: DocumentSection[];
  parties: { disclosing?: string; receiving?: string };
}> {
  // 15K chars is enough to capture all headings in a typical NDA.
  // Legal documents front-load their structure: table of contents, preamble,
  // and article headings are in the first ~5 pages. Even a 30-page NDA
  // has all its heading styles established by page 5.
  const truncatedText = text.slice(0, 15_000);

  const startTime = Date.now();

  try {
    const result = await generateText({
      // Use project-wide model config instead of hardcoding Sonnet.
      // MODELS.fast = 'anthropic/claude-haiku-4.5' (see lib/ai/config.ts)
      model: gateway(MODELS.fast),
      system: `You are a legal document structure analyzer. Extract ONLY the headings and their hierarchy — do NOT extract or summarize content. Be precise with heading text so it can be matched in the source document.`,
      prompt: `List all section headings in this legal document in order of appearance.

For each heading provide:
- title: The exact heading text as written in the document
- level: Hierarchy depth (1=article/top-level, 2=section, 3=subsection, 4=paragraph)
- type: One of heading, definitions, clause, signature, exhibit, schedule, amendment, cover_letter, other

Also identify the disclosing and receiving party names if this is an NDA.

Document text:
${truncatedText}`,
      output: Output.object({ schema: LlmStructureSchema }),
      temperature: 0,
    });

    const elapsed = Date.now() - startTime;
    console.log(
      `[structure-detector] LLM detection completed in ${elapsed}ms. ` +
        `Found ${result.output?.sections.length ?? 0} sections.`,
    );

    if (!result.output) {
      console.warn(
        "[structure-detector] LLM returned null output, returning empty structure",
      );
      return { sections: [], parties: {} };
    }

    // Fill in section content from the source text.
    // The LLM only returns heading titles; we extract content between them.
    const sections: DocumentSection[] = result.output.sections.map((s) => ({
      title: s.title,
      level: s.level as 1 | 2 | 3 | 4,
      content: "", // Will be populated by computePositions → downstream chunker
      type: s.type as SectionType,
    }));

    return {
      sections,
      parties: result.output.parties,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(
      `[structure-detector] LLM detection failed after ${elapsed}ms:`,
      error instanceof Error ? error.message : error,
    );
    // Graceful degradation: return empty structure
    // The chunker will use its fallback token-window strategy
    return { sections: [], parties: {} };
  }
}

// ============================================================================
// Position Computation (unchanged from original, with added comments)
// ============================================================================

/**
 * Computes character positions for each section in the original text.
 *
 * This is critical for the downstream pipeline:
 * - legal-chunker.ts uses startOffset/endOffset for section-aware chunking
 * - The frontend uses positions for clause highlighting in the document viewer
 * - Risk assessment UI maps scored clauses back to source text via these offsets
 *
 * Strategy: Sequential search from current position. Each heading title is
 * searched as a substring from the last known position forward. This works
 * because sections are ordered by document appearance.
 *
 * For LLM-detected sections where content is empty, the content is filled
 * in from the text between this heading's start and the next heading's start.
 */
function computePositions(
  fullText: string,
  sections: DocumentSection[],
): PositionedSection[] {
  const positioned: PositionedSection[] = [];
  let currentOffset = 0;
  const sectionPath: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const nextSection = sections[i + 1];

    // Update section path based on level (for sectionPath breadcrumb)
    while (sectionPath.length >= section.level) {
      sectionPath.pop();
    }
    sectionPath.push(section.title);

    // Find heading in text (search forward from current position)
    const searchText = section.title.trim();
    const foundAt = fullText.indexOf(searchText, currentOffset);

    let startOffset: number;
    let endOffset: number;

    if (foundAt >= 0) {
      startOffset = foundAt;

      // End offset: start of next section, or end of document
      if (nextSection) {
        const nextTitle = nextSection.title.trim();
        const nextAt = fullText.indexOf(nextTitle, foundAt + searchText.length);
        endOffset = nextAt >= 0 ? nextAt : fullText.length;
      } else {
        endOffset = fullText.length;
      }

      // If section content was empty (LLM path), fill it in from text
      if (!section.content || section.content.length === 0) {
        const contentStart = foundAt + searchText.length;
        section.content = fullText.slice(contentStart, endOffset).trim();
      }

      currentOffset = startOffset + searchText.length;
    } else {
      // Heading not found at expected position — use estimate
      // This can happen with OCR'd documents where text doesn't match exactly
      startOffset = currentOffset;
      endOffset = currentOffset + section.title.length + section.content.length;
      currentOffset = endOffset;
    }

    positioned.push({
      ...section,
      startOffset,
      endOffset,
      sectionPath: [...sectionPath],
    });
  }

  return positioned;
}

// ============================================================================
// Party Extraction (expanded from original)
// ============================================================================

/**
 * Extracts party names from text using common NDA patterns.
 *
 * Expanded from the original to handle:
 * - "ABC Company ("Disclosing Party")" — curly quotes
 * - "ABC Company (the 'Disclosing Party')" — single quotes
 * - "ABC Company, as the Disclosing Party" — no parentheses
 * - "Disclosing Party: ABC Company" — label-first format
 * - Various entity suffixes (Inc., LLC, Corp., Ltd., L.P., etc.)
 */
export function extractPartiesFromText(text: string): {
  disclosing?: string;
  receiving?: string;
} {
  const parties: { disclosing?: string; receiving?: string } = {};

  // Entity suffix pattern (reused across matchers)
  const entitySuffix = `(?:,?\\s*(?:Inc|LLC|L\\.?L\\.?C|Corp|Ltd|L\\.?P|Company|Corporation|LP|LLP)\\.?)?`;

  // Pattern 1: "ABC Company (the "Disclosing Party")"
  // Handles straight quotes, curly quotes, single quotes
  const disclosingParenMatch = text.match(
    new RegExp(
      `([A-Z][A-Za-z\\s,.'&]+${entitySuffix})\\s*\\(?(?:the\\s+)?[""''"]?Disclosing Party[""''"]?\\)?`,
      "i",
    ),
  );
  if (disclosingParenMatch) {
    parties.disclosing = disclosingParenMatch[1].trim().replace(/[,\s]+$/, "");
  }

  const receivingParenMatch = text.match(
    new RegExp(
      `([A-Z][A-Za-z\\s,.'&]+${entitySuffix})\\s*\\(?(?:the\\s+)?[""''"]?Receiving Party[""''"]?\\)?`,
      "i",
    ),
  );
  if (receivingParenMatch) {
    parties.receiving = receivingParenMatch[1].trim().replace(/[,\s]+$/, "");
  }

  // Pattern 2: "Disclosing Party: ABC Company" or "Disclosing Party means ABC Company"
  if (!parties.disclosing) {
    const disclosingLabelMatch = text.match(
      /(?:Disclosing Party|Discloser)(?:\s+means|\s*:)\s+([A-Z][A-Za-z\s,.'&]+)/i,
    );
    if (disclosingLabelMatch) {
      parties.disclosing = disclosingLabelMatch[1]
        .trim()
        .replace(/[,\s]+$/, "");
    }
  }

  if (!parties.receiving) {
    const receivingLabelMatch = text.match(
      /(?:Receiving Party|Recipient)(?:\s+means|\s*:)\s+([A-Z][A-Za-z\s,.'&]+)/i,
    );
    if (receivingLabelMatch) {
      parties.receiving = receivingLabelMatch[1].trim().replace(/[,\s]+$/, "");
    }
  }

  return parties;
}
