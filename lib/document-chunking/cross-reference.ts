/**
 * @fileoverview Cross-reference extraction from legal text.
 *
 * Extracts section, article, and clause references using regex patterns
 * common in legal documents (NDAs, contracts). Cross-references are
 * annotated in chunk metadata so downstream agents know about dependencies
 * between document sections.
 *
 * @module lib/document-chunking/cross-reference
 */

// ============================================================================
// Cross-Reference Patterns
// ============================================================================

/**
 * Patterns for extracting cross-references from legal text.
 *
 * Matches common legal reference formats:
 * - "Section 3.1", "Section 3.1(a)", "Sections 3.1 and 3.2"
 * - "Article I", "Article IV", "Article 5"
 * - "paragraph 2.3", "clause 4(b)"
 * - "as defined in Section 1", "pursuant to Section 7.4"
 * - "Exhibit A", "Schedule 1"
 */
const CROSS_REF_PATTERNS: RegExp[] = [
  // Section references with decimal notation: "Section 3.1", "Section 3.1.2"
  /Section\s+(\d+(?:\.\d+)*(?:\([a-z]\))?)/gi,
  // Article references: "Article I", "Article IV", "Article 5"
  /Article\s+([IVX\d]+)/gi,
  // Paragraph/clause references: "paragraph 2.3", "clause 4(b)"
  /(?:paragraph|clause)\s+(\d+(?:\.\d+)*(?:\([a-z]\))?)/gi,
  // Contextual references: "as defined in Section 1", "pursuant to Section 7.4"
  /(?:as defined in|pursuant to|in accordance with|subject to|under)\s+Section\s+(\d+(?:\.\d+)*)/gi,
  // Exhibit/Schedule references: "Exhibit A", "Schedule 1"
  /(?:Exhibit|Schedule|Attachment|Annex)\s+([A-Z\d]+)/gi,
]

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extracts cross-references from legal text.
 *
 * Searches for section, article, paragraph, clause, exhibit, and schedule
 * references using common legal patterns. Results are deduplicated and sorted.
 *
 * @param text - The legal text to search for cross-references
 * @returns Sorted, deduplicated array of reference identifiers
 *
 * @example
 * ```typescript
 * const refs = extractCrossReferences(
 *   "Subject to Section 3.1 and Article IV, as defined in Exhibit A."
 * )
 * // Returns: ["3.1", "A", "IV"]
 * ```
 */
export function extractCrossReferences(text: string): string[] {
  const refs = new Set<string>()

  for (const pattern of CROSS_REF_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0

    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        refs.add(match[1])
      }
    }
  }

  return Array.from(refs).sort()
}
