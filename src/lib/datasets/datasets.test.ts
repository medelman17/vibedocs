import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { writeFile, mkdir, rm } from "fs/promises"
import { join } from "path"
import {
  generateContentHash,
  normalizeText,
  parseHeading,
  buildSectionPath,
  normalizeNliLabel,
  parseMarkdownTemplate,
  parseBontermsDataset,
  parseContractNliDataset,
  type NormalizedRecord,
} from "./index"

describe("utils", () => {
  describe("generateContentHash", () => {
    it("generates consistent SHA-256 hash", () => {
      const hash1 = generateContentHash("test content")
      const hash2 = generateContentHash("test content")
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA-256 hex
    })

    it("generates different hashes for different content", () => {
      const hash1 = generateContentHash("content A")
      const hash2 = generateContentHash("content B")
      expect(hash1).not.toBe(hash2)
    })
  })

  describe("normalizeText", () => {
    it("normalizes line endings", () => {
      expect(normalizeText("a\r\nb")).toBe("a\nb")
    })

    it("converts tabs to spaces", () => {
      expect(normalizeText("a\tb")).toBe("a  b")
    })

    it("trims whitespace", () => {
      expect(normalizeText("  content  ")).toBe("content")
    })
  })

  describe("parseHeading", () => {
    it("parses h1 heading", () => {
      expect(parseHeading("# Title")).toEqual({ level: 1, text: "Title" })
    })

    it("parses h3 heading", () => {
      expect(parseHeading("### Section")).toEqual({ level: 3, text: "Section" })
    })

    it("returns null for non-heading", () => {
      expect(parseHeading("Regular text")).toBeNull()
    })

    it("handles heading with extra spaces", () => {
      expect(parseHeading("##   Spaced Title  ")).toEqual({ level: 2, text: "Spaced Title" })
    })
  })

  describe("buildSectionPath", () => {
    it("builds path from heading history", () => {
      const history = [
        { level: 1, text: "Doc" },
        { level: 2, text: "Chapter" },
      ]
      const path = buildSectionPath(history, 3, "Section")
      expect(path).toEqual(["Doc", "Chapter", "Section"])
    })

    it("handles top-level heading", () => {
      const history: Array<{ level: number; text: string }> = []
      const path = buildSectionPath(history, 1, "Title")
      expect(path).toEqual(["Title"])
    })
  })

  describe("normalizeNliLabel", () => {
    it("converts Entailment to entailment", () => {
      expect(normalizeNliLabel("Entailment")).toBe("entailment")
    })

    it("converts Contradiction to contradiction", () => {
      expect(normalizeNliLabel("Contradiction")).toBe("contradiction")
    })

    it("converts NotMentioned to not_mentioned", () => {
      expect(normalizeNliLabel("NotMentioned")).toBe("not_mentioned")
    })
  })
})

describe("parseMarkdownTemplate", () => {
  it("parses sections from markdown", () => {
    const markdown = `# Title
Intro content

## Section A
Section A content

### Subsection
Subsection content

## Section B
Section B content`

    const sections = parseMarkdownTemplate(markdown)

    expect(sections).toHaveLength(4)
    expect(sections[0]).toMatchObject({
      heading: "Title",
      level: 1,
      path: ["Title"],
    })
    expect(sections[2]).toMatchObject({
      heading: "Subsection",
      level: 3,
      path: ["Title", "Section A", "Subsection"],
    })
  })

  it("handles empty sections", () => {
    const markdown = `# Title

## Empty Section

## Section With Content
Some content here`

    const sections = parseMarkdownTemplate(markdown)
    // Title and Empty Section have no content, only Section With Content remains
    expect(sections).toHaveLength(1)
    expect(sections[0].heading).toBe("Section With Content")
  })
})

describe("template parsers", () => {
  const testDir = join(process.cwd(), ".cache/test-templates")

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true })
    await writeFile(
      join(testDir, "nda.md"),
      `# NDA Template

## Confidentiality
The Receiving Party shall maintain confidentiality.

## Term
This agreement shall remain in effect for 2 years.`
    )
  })

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("parses Bonterms directory", async () => {
    const records: NormalizedRecord[] = []
    for await (const record of parseBontermsDataset(testDir)) {
      records.push(record)
    }

    expect(records.length).toBeGreaterThan(0)

    const templateRecord = records.find((r) => r.granularity === "template")
    expect(templateRecord).toBeDefined()
    expect(templateRecord?.source).toBe("bonterms")

    const sectionRecords = records.filter((r) => r.granularity === "section")
    // Title section has no content (just blank line), so only Confidentiality and Term
    expect(sectionRecords.length).toBe(2)
  })

  it("generates unique content hashes", async () => {
    const records: NormalizedRecord[] = []
    for await (const record of parseBontermsDataset(testDir)) {
      records.push(record)
    }

    const hashes = records.map((r) => r.contentHash)
    const uniqueHashes = new Set(hashes)
    expect(uniqueHashes.size).toBe(hashes.length)
  })
})

describe("ContractNLI parser", () => {
  const testFile = join(process.cwd(), ".cache/test-cnli.json")

  beforeAll(async () => {
    await mkdir(join(process.cwd(), ".cache"), { recursive: true })
    const testData = [
      {
        id: "test-001",
        text: "This is a confidentiality agreement between parties.",
        spans: [
          { start: 0, end: 10, text: "This is a" },
          { start: 11, end: 25, text: "confidentiality" },
        ],
        annotations: {
          "1": { choice: "Entailment", spans: [0] },
          "5": { choice: "NotMentioned", spans: [] },
        },
      },
    ]
    await writeFile(testFile, JSON.stringify(testData))
  })

  afterAll(async () => {
    await rm(testFile, { force: true })
  })

  it("parses ContractNLI JSON", async () => {
    const records: NormalizedRecord[] = []
    for await (const record of parseContractNliDataset(testFile)) {
      records.push(record)
    }

    // 1 document + 1 span (hypothesis 1 has 1 span, hypothesis 5 has 0)
    expect(records).toHaveLength(2)

    const docRecord = records.find((r) => r.granularity === "document")
    expect(docRecord?.source).toBe("contract_nli")

    const spanRecord = records.find((r) => r.granularity === "span")
    expect(spanRecord?.hypothesisId).toBe(1)
    expect(spanRecord?.nliLabel).toBe("entailment")
  })

  it("preserves hypothesis text in sectionPath", async () => {
    const records: NormalizedRecord[] = []
    for await (const record of parseContractNliDataset(testFile)) {
      records.push(record)
    }

    const spanRecord = records.find((r) => r.granularity === "span")
    expect(spanRecord?.sectionPath[0]).toContain("Confidential Information")
  })
})
