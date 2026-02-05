/**
 * @fileoverview Tests for text-to-markdown conversion with offset tracking.
 *
 * Tests the convertToMarkdown function which inserts heading prefixes
 * based on DocumentStructure sections while tracking character offset
 * changes for accurate clause positioning.
 */

import { describe, it, expect } from "vitest"
import { convertToMarkdown, splitIntoParagraphs } from "./text-to-markdown"
import type { PositionedSection } from "@/lib/document-extraction/types"

// ============================================================================
// convertToMarkdown
// ============================================================================

describe("convertToMarkdown", () => {
  it("returns empty markdown and empty offsetMap for empty text", () => {
    const result = convertToMarkdown("", [])
    expect(result.markdown).toBe("")
    expect(result.offsetMap).toEqual([])
  })

  it("returns identical text when there are no sections", () => {
    const text = "This is a simple document with no headings."
    const result = convertToMarkdown(text, [])
    expect(result.markdown).toBe(text)
    expect(result.offsetMap).toEqual([])
  })

  it("inserts # prefix for level 1 heading at position 0", () => {
    const text = "Introduction\n\nThis is the content."
    const sections: PositionedSection[] = [
      {
        title: "Introduction",
        level: 1,
        content: "Introduction",
        type: "heading",
        startOffset: 0,
        endOffset: 12,
        sectionPath: ["Introduction"],
      },
    ]

    const result = convertToMarkdown(text, sections)

    // "# " (2 chars) inserted before "Introduction"
    expect(result.markdown).toBe("# Introduction\n\nThis is the content.")
    expect(result.offsetMap.length).toBeGreaterThan(0)
    // The first mapping should show the shift at position 0
    expect(result.offsetMap[0]).toEqual({ original: 0, markdown: 0 })
  })

  it("inserts ## prefix for level 2 heading", () => {
    const text = "Section One\n\nContent here."
    const sections: PositionedSection[] = [
      {
        title: "Section One",
        level: 2,
        content: "Section One",
        type: "clause",
        startOffset: 0,
        endOffset: 11,
        sectionPath: ["Section One"],
      },
    ]

    const result = convertToMarkdown(text, sections)
    expect(result.markdown).toStartWith("## Section One")
  })

  it("inserts ### prefix for level 3 heading", () => {
    const text = "Subsection\n\nDetails."
    const sections: PositionedSection[] = [
      {
        title: "Subsection",
        level: 3,
        content: "Subsection",
        type: "clause",
        startOffset: 0,
        endOffset: 10,
        sectionPath: ["Subsection"],
      },
    ]

    const result = convertToMarkdown(text, sections)
    expect(result.markdown).toStartWith("### Subsection")
  })

  it("inserts #### prefix for level 4 heading", () => {
    const text = "Paragraph\n\nMore text."
    const sections: PositionedSection[] = [
      {
        title: "Paragraph",
        level: 4,
        content: "Paragraph",
        type: "clause",
        startOffset: 0,
        endOffset: 9,
        sectionPath: ["Paragraph"],
      },
    ]

    const result = convertToMarkdown(text, sections)
    expect(result.markdown).toStartWith("#### Paragraph")
  })

  it("handles multiple headings with cumulative offset tracking", () => {
    const text = "Article 1\n\nFirst content.\n\nArticle 2\n\nSecond content."
    const sections: PositionedSection[] = [
      {
        title: "Article 1",
        level: 1,
        content: "Article 1",
        type: "heading",
        startOffset: 0,
        endOffset: 9,
        sectionPath: ["Article 1"],
      },
      {
        title: "Article 2",
        level: 1,
        content: "Article 2",
        type: "heading",
        startOffset: 27,
        endOffset: 36,
        sectionPath: ["Article 2"],
      },
    ]

    const result = convertToMarkdown(text, sections)

    // Both headings get "# " prefix (2 chars each)
    expect(result.markdown).toContain("# Article 1")
    expect(result.markdown).toContain("# Article 2")

    // The second heading's offset map should show cumulative shift
    // First heading adds 2 chars, so second heading at original pos 27
    // appears at markdown pos 29 (27 + 2 from first heading)
    const secondMapping = result.offsetMap.find((m) => m.original === 27)
    expect(secondMapping).toBeDefined()
    expect(secondMapping!.markdown).toBe(29) // 27 + 2 chars from "# "
  })

  it("handles mixed heading levels with correct prefixes", () => {
    const text = "Main\n\nSub\n\nSubsub"
    const sections: PositionedSection[] = [
      {
        title: "Main",
        level: 1,
        content: "Main",
        type: "heading",
        startOffset: 0,
        endOffset: 4,
        sectionPath: ["Main"],
      },
      {
        title: "Sub",
        level: 2,
        content: "Sub",
        type: "clause",
        startOffset: 6,
        endOffset: 9,
        sectionPath: ["Main", "Sub"],
      },
      {
        title: "Subsub",
        level: 3,
        content: "Subsub",
        type: "clause",
        startOffset: 11,
        endOffset: 17,
        sectionPath: ["Main", "Sub", "Subsub"],
      },
    ]

    const result = convertToMarkdown(text, sections)

    expect(result.markdown).toContain("# Main")
    expect(result.markdown).toContain("## Sub")
    expect(result.markdown).toContain("### Subsub")
  })

  it("preserves all original text verbatim", () => {
    const text = "Article 1\n\nThis is important text with special chars: $100, 50%, & more."
    const sections: PositionedSection[] = [
      {
        title: "Article 1",
        level: 1,
        content: "Article 1",
        type: "heading",
        startOffset: 0,
        endOffset: 9,
        sectionPath: ["Article 1"],
      },
    ]

    const result = convertToMarkdown(text, sections)

    // After removing heading prefix, original text should be preserved
    const withoutPrefix = result.markdown.replace(/^# /, "")
    expect(withoutPrefix).toBe(text)
  })

  it("handles heading not at start of text", () => {
    const text = "Preamble text here.\n\nArticle 1\n\nContent."
    const sections: PositionedSection[] = [
      {
        title: "Article 1",
        level: 1,
        content: "Article 1",
        type: "heading",
        startOffset: 21,
        endOffset: 30,
        sectionPath: ["Article 1"],
      },
    ]

    const result = convertToMarkdown(text, sections)

    expect(result.markdown).toBe("Preamble text here.\n\n# Article 1\n\nContent.")
    expect(result.offsetMap.length).toBe(1)
    expect(result.offsetMap[0]).toEqual({ original: 21, markdown: 21 })
  })
})

// ============================================================================
// splitIntoParagraphs
// ============================================================================

describe("splitIntoParagraphs", () => {
  it("returns empty array for empty text", () => {
    const result = splitIntoParagraphs("")
    expect(result).toEqual([])
  })

  it("returns single segment for text without double newlines", () => {
    const text = "Single paragraph of text."
    const result = splitIntoParagraphs(text)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe(text)
    expect(result[0].startOffset).toBe(0)
    expect(result[0].endOffset).toBe(text.length)
    expect(result[0].index).toBe(0)
  })

  it("splits on double newlines and tracks offsets", () => {
    const text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
    const result = splitIntoParagraphs(text)

    expect(result).toHaveLength(3)

    expect(result[0].text).toBe("First paragraph.")
    expect(result[0].startOffset).toBe(0)
    expect(result[0].index).toBe(0)

    expect(result[1].text).toBe("Second paragraph.")
    expect(result[1].startOffset).toBe(18) // "First paragraph.\n\n" = 18 chars
    expect(result[1].index).toBe(1)

    expect(result[2].text).toBe("Third paragraph.")
    expect(result[2].startOffset).toBe(36) // 18 + "Second paragraph.\n\n" = 36
    expect(result[2].index).toBe(2)
  })

  it("handles markdown headings in paragraphs", () => {
    const text = "# Heading\n\nContent below heading."
    const result = splitIntoParagraphs(text)

    expect(result).toHaveLength(2)
    expect(result[0].text).toBe("# Heading")
    expect(result[1].text).toBe("Content below heading.")
  })

  it("handles multiple consecutive newlines", () => {
    const text = "First.\n\n\n\nSecond."
    const result = splitIntoParagraphs(text)

    expect(result).toHaveLength(2)
    expect(result[0].text).toBe("First.")
    expect(result[1].text).toBe("Second.")
  })

  it("correctly sets endOffset for each segment", () => {
    const text = "Para one.\n\nPara two."
    const result = splitIntoParagraphs(text)

    expect(result[0].endOffset).toBe(9) // "Para one." = 9 chars
    expect(result[1].endOffset).toBe(20) // ends at "Para two." = position 20
  })
})
