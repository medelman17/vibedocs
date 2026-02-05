/**
 * @fileoverview Tests for offset mapping utilities.
 *
 * Tests translateOffset (binary search through offset map) and
 * mapClausePositions (bulk clause position translation).
 */

import { describe, it, expect } from "vitest"
import { translateOffset, mapClausePositions } from "./offset-mapper"
import type { OffsetMapping, DocumentSegment } from "./types"

// ============================================================================
// translateOffset
// ============================================================================

describe("translateOffset", () => {
  it("returns same position with empty offsetMap", () => {
    const result = translateOffset(42, [])
    expect(result).toBe(42)
  })

  it("returns shifted position with single mapping before the offset", () => {
    // The offsetMap records cumulative shifts at each heading insertion.
    // { original: 0, markdown: 2 } means at original position 0,
    // 2 chars were inserted (e.g., "# "), so markdown position is 2.
    // translateOffset(X, map) returns X + (markdown - original) for
    // the nearest mapping at or before X.
    const map: OffsetMapping[] = [{ original: 0, markdown: 2 }]
    // Position 10 in original -> should be at 10 + (2-0) = 12 in markdown
    expect(translateOffset(10, map)).toBe(12)
  })

  it("returns unshifted position when offset is before first mapping", () => {
    // If first mapping is at original:10, positions before 10 are unshifted
    const map: OffsetMapping[] = [{ original: 10, markdown: 12 }]
    expect(translateOffset(5, map)).toBe(5)
  })

  it("handles multiple mappings with cumulative shifts", () => {
    // First heading at pos 0 adds "# " (2 chars)
    // Second heading at pos 20 adds "## " (3 chars) -> cumulative = 5
    const map: OffsetMapping[] = [
      { original: 0, markdown: 2 },   // 2 chars inserted so far
      { original: 20, markdown: 25 },  // 5 chars inserted total (2 + 3)
    ]

    // Before first insertion
    // (nothing before pos 0, but let's not test that)

    // Between first and second insertion: original 10 -> 10 + (2-0) = 12
    expect(translateOffset(10, map)).toBe(12)

    // After second insertion: original 30 -> 30 + (25-20) = 35
    expect(translateOffset(30, map)).toBe(35)

    // Exactly at second insertion point: original 20 -> 25
    expect(translateOffset(20, map)).toBe(25)
  })

  it("handles offset exactly at a mapping point", () => {
    const map: OffsetMapping[] = [{ original: 5, markdown: 7 }]
    expect(translateOffset(5, map)).toBe(7)
  })

  it("handles zero offset with mapping at zero", () => {
    const map: OffsetMapping[] = [{ original: 0, markdown: 2 }]
    expect(translateOffset(0, map)).toBe(2)
  })
})

// ============================================================================
// mapClausePositions
// ============================================================================

describe("mapClausePositions", () => {
  const paragraphs: DocumentSegment[] = [
    { text: "# Heading", startOffset: 0, endOffset: 9, index: 0 },
    { text: "Content here.", startOffset: 11, endOffset: 24, index: 1 },
    { text: "More content.", startOffset: 26, endOffset: 39, index: 2 },
  ]

  it("maps a single clause through the offset map", () => {
    const clauses = [
      {
        id: "clause-1",
        category: "Non-Compete",
        riskLevel: "cautious",
        startPosition: 10,
        endPosition: 20,
        confidence: 0.9,
        clauseText: "some text",
        riskExplanation: "explanation",
      },
    ]

    const map: OffsetMapping[] = [{ original: 0, markdown: 2 }]

    const result = mapClausePositions(clauses, map, paragraphs)

    expect(result).toHaveLength(1)
    expect(result[0].clauseId).toBe("clause-1")
    expect(result[0].category).toBe("Non-Compete")
    expect(result[0].riskLevel).toBe("cautious")
    expect(result[0].confidence).toBe(0.9)
    expect(result[0].originalStart).toBe(10)
    expect(result[0].originalEnd).toBe(20)
    expect(result[0].markdownStart).toBe(12) // 10 + 2
    expect(result[0].markdownEnd).toBe(22)   // 20 + 2
  })

  it("maps multiple clauses", () => {
    const clauses = [
      {
        id: "c1",
        category: "Parties",
        riskLevel: "standard",
        startPosition: 5,
        endPosition: 15,
        confidence: 0.95,
        clauseText: "text",
        riskExplanation: null,
      },
      {
        id: "c2",
        category: "Governing Law",
        riskLevel: "aggressive",
        startPosition: 25,
        endPosition: 35,
        confidence: 0.8,
        clauseText: "text",
        riskExplanation: null,
      },
    ]

    const map: OffsetMapping[] = [
      { original: 0, markdown: 2 },
      { original: 20, markdown: 25 },
    ]

    const result = mapClausePositions(clauses, map, paragraphs)

    expect(result).toHaveLength(2)
    expect(result[0].markdownStart).toBe(7)  // 5 + 2
    expect(result[1].markdownStart).toBe(30) // 25 + 5
  })

  it("handles zero-length clause (start === end)", () => {
    const clauses = [
      {
        id: "c0",
        category: "Parties",
        riskLevel: "standard",
        startPosition: 10,
        endPosition: 10,
        confidence: 0.7,
        clauseText: "",
        riskExplanation: null,
      },
    ]

    const result = mapClausePositions(clauses, [], paragraphs)

    expect(result).toHaveLength(1)
    expect(result[0].markdownStart).toBe(10)
    expect(result[0].markdownEnd).toBe(10)
  })

  it("skips clauses with null positions", () => {
    const clauses = [
      {
        id: "c-null",
        category: "Parties",
        riskLevel: "standard",
        startPosition: null,
        endPosition: null,
        confidence: 0.7,
        clauseText: "text",
        riskExplanation: null,
      },
    ]

    const result = mapClausePositions(clauses, [], paragraphs)

    expect(result).toHaveLength(0)
  })

  it("clamps negative start positions to 0", () => {
    const clauses = [
      {
        id: "c-neg",
        category: "Parties",
        riskLevel: "standard",
        startPosition: -5,
        endPosition: 10,
        confidence: 0.7,
        clauseText: "text",
        riskExplanation: null,
      },
    ]

    const result = mapClausePositions(clauses, [], paragraphs)

    expect(result).toHaveLength(1)
    expect(result[0].originalStart).toBe(0)
  })

  it("assigns correct paragraphIndex based on markdown position", () => {
    const clauses = [
      {
        id: "c-para",
        category: "Parties",
        riskLevel: "standard",
        startPosition: 12,
        endPosition: 20,
        confidence: 0.9,
        clauseText: "text",
        riskExplanation: null,
      },
    ]

    // With no offset changes, markdown position = original position
    // Position 12 falls in paragraph index 1 (startOffset: 11, endOffset: 24)
    const result = mapClausePositions(clauses, [], paragraphs)

    expect(result).toHaveLength(1)
    expect(result[0].paragraphIndex).toBe(1)
  })

  it("returns empty array for empty clauses input", () => {
    const result = mapClausePositions([], [], paragraphs)
    expect(result).toEqual([])
  })
})
