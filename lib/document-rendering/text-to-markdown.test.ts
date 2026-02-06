/**
 * @fileoverview Tests for text-to-markdown conversion with offset tracking.
 *
 * Tests the convertToMarkdown function which inserts heading prefixes
 * based on DocumentStructure sections while tracking character offset
 * changes for accurate clause positioning.
 */

import { describe, it, expect } from "vitest"
import { convertToMarkdown, splitIntoParagraphs, splitByChunks } from "./text-to-markdown"
import type { PositionedSection } from "@/lib/document-extraction/types"
import type { OffsetMapping } from "./types"

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
    // At original position 0, markdown position is 0 + 2 (for "# " prefix) = 2
    expect(result.offsetMap[0]).toEqual({ original: 0, markdown: 2 })
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
    expect(result.markdown.startsWith("## Section One")).toBe(true)
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
    expect(result.markdown.startsWith("### Subsection")).toBe(true)
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
    expect(result.markdown.startsWith("#### Paragraph")).toBe(true)
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
    // First heading adds 2 chars ("# "), second heading adds 2 more ("# ")
    // At original pos 27, cumulative shift is 2+2=4, so markdown pos = 27+4 = 31
    const secondMapping = result.offsetMap.find((m) => m.original === 27)
    expect(secondMapping).toBeDefined()
    expect(secondMapping!.markdown).toBe(31) // 27 + 4 cumulative chars
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
    // At original pos 21, "# " (2 chars) inserted, so markdown pos = 21 + 2 = 23
    expect(result.offsetMap[0]).toEqual({ original: 21, markdown: 23 })
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
    // "First paragraph.\n\n" = 18 chars
    expect(result[1].startOffset).toBe(18)
    expect(result[1].index).toBe(1)

    expect(result[2].text).toBe("Third paragraph.")
    // "First paragraph.\n\nSecond paragraph.\n\n" = 18 + 19 = 37 chars
    expect(result[2].startOffset).toBe(37)
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
    expect(result[1].endOffset).toBe(20) // ends at position 20
  })
})

// ============================================================================
// splitByChunks
// ============================================================================

describe("splitByChunks", () => {
  it("creates segments at chunk boundaries", () => {
    const markdown =
      "# Intro\nParagraph one text here.\n## Terms\nPayment terms here."
    const chunks = [
      {
        chunkIndex: 0,
        chunkType: "clause",
        sectionPath: ["Intro"],
        startPosition: 0,
        endPosition: 26,
      },
      {
        chunkIndex: 1,
        chunkType: "clause",
        sectionPath: ["Intro", "Terms"],
        startPosition: 26,
        endPosition: 48,
      },
    ]
    const offsetMap: OffsetMapping[] = [
      { original: 0, markdown: 2 },
      { original: 26, markdown: 31 },
    ]

    const segments = splitByChunks(markdown, chunks, offsetMap)

    expect(segments).toHaveLength(2)
    expect(segments[0].text).toContain("Intro")
    expect(segments[0].sectionLevel).toBe(1)
    expect(segments[0].chunkType).toBe("clause")
    expect(segments[1].text).toContain("Terms")
    expect(segments[1].sectionLevel).toBe(2)
    expect(segments[1].chunkType).toBe("clause")
  })

  it("falls back to splitIntoParagraphs when no chunks provided", () => {
    const markdown = "Hello\n\nWorld"
    const segments = splitByChunks(markdown, [], [])

    expect(segments.length).toBeGreaterThanOrEqual(2)
    expect(segments[0].text).toBe("Hello")
    expect(segments[0].sectionLevel).toBeUndefined()
  })

  it("handles preamble text before first chunk", () => {
    const markdown = "Cover letter text.\nMain clause."
    const chunks = [
      {
        chunkIndex: 0,
        chunkType: "clause",
        sectionPath: ["Main"],
        startPosition: 19,
        endPosition: 31,
      },
    ]
    const segments = splitByChunks(markdown, chunks, [])

    expect(segments).toHaveLength(2)
    expect(segments[0].text).toContain("Cover letter")
    expect(segments[1].text).toContain("Main clause")
  })

  it("assigns sectionLevel from sectionPath depth", () => {
    const markdown = "Level one.\nLevel two.\nLevel three."
    const chunks = [
      {
        chunkIndex: 0,
        chunkType: "definition",
        sectionPath: ["Art 1"],
        startPosition: 0,
        endPosition: 11,
      },
      {
        chunkIndex: 1,
        chunkType: "sub-clause",
        sectionPath: ["Art 1", "Sec 1.1"],
        startPosition: 11,
        endPosition: 22,
      },
      {
        chunkIndex: 2,
        chunkType: "sub-clause",
        sectionPath: ["Art 1", "Sec 1.1", "(a)"],
        startPosition: 22,
        endPosition: 34,
      },
    ]
    const segments = splitByChunks(markdown, chunks, [])

    expect(segments[0].sectionLevel).toBe(1)
    expect(segments[1].sectionLevel).toBe(2)
    expect(segments[2].sectionLevel).toBe(3)
  })

  it("skips zero-length segments from overlapping chunks", () => {
    const markdown = "Text A.Text B."
    const chunks = [
      {
        chunkIndex: 0,
        chunkType: "clause",
        sectionPath: ["A"],
        startPosition: 0,
        endPosition: 10,
      },
      {
        chunkIndex: 1,
        chunkType: "clause",
        sectionPath: ["B"],
        startPosition: 7,
        endPosition: 14,
      },
    ]
    const segments = splitByChunks(markdown, chunks, [])

    expect(segments).toHaveLength(2)
    expect(segments[0].startOffset).toBe(0)
    expect(segments[1].startOffset).toBe(7)
  })

  it("returns empty array for empty markdown text", () => {
    const segments = splitByChunks("", [], [])
    expect(segments).toHaveLength(0)
  })

  it("handles chunks with null sectionPath", () => {
    const markdown = "Some text here."
    const chunks = [
      {
        chunkIndex: 0,
        chunkType: "clause",
        sectionPath: null,
        startPosition: 0,
        endPosition: 15,
      },
    ]
    const segments = splitByChunks(markdown, chunks, [])

    expect(segments).toHaveLength(1)
    expect(segments[0].sectionLevel).toBeUndefined()
  })

  it("handles chunks with null chunkType", () => {
    const markdown = "Some text here."
    const chunks = [
      {
        chunkIndex: 0,
        chunkType: null,
        sectionPath: ["Section"],
        startPosition: 0,
        endPosition: 15,
      },
    ]
    const segments = splitByChunks(markdown, chunks, [])

    expect(segments).toHaveLength(1)
    expect(segments[0].chunkType).toBeUndefined()
  })

  it("sorts chunks by startPosition regardless of input order", () => {
    const markdown = "First part.Second part."
    const chunks = [
      {
        chunkIndex: 1,
        chunkType: "clause",
        sectionPath: ["B"],
        startPosition: 11,
        endPosition: 23,
      },
      {
        chunkIndex: 0,
        chunkType: "clause",
        sectionPath: ["A"],
        startPosition: 0,
        endPosition: 11,
      },
    ]
    const segments = splitByChunks(markdown, chunks, [])

    expect(segments).toHaveLength(2)
    expect(segments[0].text).toBe("First part.")
    expect(segments[1].text).toBe("Second part.")
  })
})
