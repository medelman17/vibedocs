# Sub-Plan 2B: Dataset Parsers

> **Status:** ✅ COMPLETE (audited 2026-02-04)
>
> All tasks implemented. See inngest/ and agents/ directories.

**Parent Plan:** `2026-02-01-inngest-bootstrap.md` (Plan 2: Bootstrap Pipeline)
**Dependencies:** None (can run parallel with 2A)

## Overview

Implement parsers for the four legal reference corpora that will populate the reference database:
- **CUAD** (Parquet) - 510 contracts, 13K+ annotated clauses, 41 categories
- **ContractNLI** (JSON) - 607 contracts, 17 hypothesis types, NLI labels
- **Bonterms** (Markdown) - Standard NDA templates
- **CommonAccord** (Markdown) - Open-source contract templates

All parsers output a unified `NormalizedRecord` interface that maps directly to the database schema.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    src/lib/datasets/                        │
├─────────────────────────────────────────────────────────────┤
│  types.ts          │ NormalizedRecord, source types         │
│  utils.ts          │ contentHash, sectionPath helpers       │
│  cuad-parser.ts    │ Parquet → NormalizedRecord             │
│  contractnli-parser.ts │ JSON → NormalizedRecord            │
│  template-parser.ts│ Markdown → NormalizedRecord            │
│  index.ts          │ Barrel export                          │
└─────────────────────────────────────────────────────────────┘
```

## Task 2B.1: Shared Types (`src/lib/datasets/types.ts`)

```typescript
/**
 * Dataset source identifiers - matches DB schema exactly
 */
export type DatasetSource = "cuad" | "contract_nli" | "bonterms" | "commonaccord"

/**
 * Granularity levels for embeddings - matches DB schema exactly
 */
export type EmbeddingGranularity = "document" | "section" | "clause" | "span" | "template"

/**
 * NLI labels from ContractNLI dataset
 */
export type NliLabel = "entailment" | "contradiction" | "not_mentioned"

/**
 * Unified output format from all parsers.
 * Maps directly to referenceDocuments + referenceEmbeddings tables.
 */
export interface NormalizedRecord {
  /** Dataset source identifier */
  source: DatasetSource

  /** Unique ID within the source dataset */
  sourceId: string

  /** Text content to be embedded */
  content: string

  /** Embedding granularity level */
  granularity: EmbeddingGranularity

  /** Hierarchical path within document (e.g., ["NDA", "Confidentiality", "Exceptions"]) */
  sectionPath: string[]

  /** CUAD category or template section type */
  category?: string

  /** ContractNLI hypothesis ID (1-17) */
  hypothesisId?: number

  /** ContractNLI NLI label */
  nliLabel?: NliLabel

  /** Arbitrary metadata from source */
  metadata: Record<string, unknown>

  /** SHA-256 hash of content for deduplication */
  contentHash: string
}

/**
 * CUAD's 41 legal clause categories
 */
export const CUAD_CATEGORIES = [
  "Document Name",
  "Parties",
  "Agreement Date",
  "Effective Date",
  "Expiration Date",
  "Renewal Term",
  "Notice Period To Terminate Renewal",
  "Governing Law",
  "Most Favored Nation",
  "Non-Compete",
  "Exclusivity",
  "No-Solicit Of Customers",
  "No-Solicit Of Employees",
  "Non-Disparagement",
  "Termination For Convenience",
  "Rofr/Rofo/Rofn",
  "Change Of Control",
  "Anti-Assignment",
  "Revenue/Profit Sharing",
  "Price Restrictions",
  "Minimum Commitment",
  "Volume Restriction",
  "Ip Ownership Assignment",
  "Joint Ip Ownership",
  "License Grant",
  "Non-Transferable License",
  "Affiliate License-Licensor",
  "Affiliate License-Licensee",
  "Unlimited/All-You-Can-Eat-License",
  "Irrevocable Or Perpetual License",
  "Source Code Escrow",
  "Post-Termination Services",
  "Audit Rights",
  "Uncapped Liability",
  "Cap On Liability",
  "Liquidated Damages",
  "Warranty Duration",
  "Insurance",
  "Covenant Not To Sue",
  "Third Party Beneficiary",
] as const

export type CuadCategory = (typeof CUAD_CATEGORIES)[number]

/**
 * ContractNLI's 17 hypothesis definitions
 */
export const NLI_HYPOTHESES: Record<number, string> = {
  1: "All Confidential Information shall be expressly identified by the Disclosing Party.",
  2: "Confidential Information shall only include technical information.",
  3: "All Confidential Information shall be returned to the Disclosing Party upon termination of the Agreement.",
  4: "Confidential Information may be acquired independently.",
  5: "Confidential Information may be disclosed to employees.",
  6: "Confidential Information may be shared with third-parties with permission.",
  7: "Confidential Information may be disclosed pursuant to law.",
  8: "Receiving Party shall not disclose the fact that Agreement was agreed.",
  9: "Receiving Party shall not disclose the terms of Agreement.",
  10: "Receiving Party shall not solicit Disclosing Party's employees.",
  11: "Receiving Party shall not solicit Disclosing Party's customers.",
  12: "Receiving Party shall not use Confidential Information for competing business.",
  13: "Agreement shall be valid for some period after termination.",
  14: "Agreement shall not grant Receiving Party any right to Confidential Information.",
  15: "Receiving Party may create derivative works from Confidential Information.",
  16: "Receiving Party may retain some Confidential Information.",
  17: "Some obligations of Agreement may survive termination.",
}

/**
 * Raw CUAD record from Parquet file
 */
export interface CuadRawRecord {
  contract_name: string
  contract_text: string
  category: string
  clause_text: string
  start_ix: number
  end_ix: number
}

/**
 * Raw ContractNLI record from JSON file
 */
export interface ContractNliRawRecord {
  id: string
  text: string
  spans: Array<{
    start: number
    end: number
    text: string
  }>
  annotations: Record<
    string,
    {
      choice: "Entailment" | "Contradiction" | "NotMentioned"
      spans: number[]
    }
  >
}
```

## Task 2B.2: Utility Functions (`src/lib/datasets/utils.ts`)

```typescript
import { createHash } from "crypto"

/**
 * Generate SHA-256 content hash for deduplication
 */
export function generateContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

/**
 * Parse markdown heading to extract level and text
 */
export function parseHeading(line: string): { level: number; text: string } | null {
  const match = line.match(/^(#{1,6})\s+(.+)$/)
  if (!match) return null
  return {
    level: match[1].length,
    text: match[2].trim(),
  }
}

/**
 * Build section path from heading hierarchy
 */
export function buildSectionPath(
  headings: Array<{ level: number; text: string }>,
  currentLevel: number,
  currentText: string
): string[] {
  const path: string[] = []

  // Find ancestors at each level above current
  for (let level = 1; level < currentLevel; level++) {
    const ancestor = [...headings].reverse().find((h) => h.level === level)
    if (ancestor) {
      path.push(ancestor.text)
    }
  }

  path.push(currentText)
  return path
}

/**
 * Normalize NLI choice to lowercase label
 */
export function normalizeNliLabel(
  choice: "Entailment" | "Contradiction" | "NotMentioned"
): "entailment" | "contradiction" | "not_mentioned" {
  const map = {
    Entailment: "entailment",
    Contradiction: "contradiction",
    NotMentioned: "not_mentioned",
  } as const
  return map[choice]
}

/**
 * Clean and normalize text content
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\t/g, "  ") // Tabs to spaces
    .trim()
}
```

## Task 2B.3: CUAD Parser (`src/lib/datasets/cuad-parser.ts`)

```typescript
import { readFile } from "fs/promises"
import type { NormalizedRecord, CuadRawRecord, CuadCategory } from "./types"
import { generateContentHash, normalizeText } from "./utils"

// parquet-wasm is ESM-only, use dynamic import
let parquetModule: typeof import("parquet-wasm") | null = null

async function getParquetModule() {
  if (!parquetModule) {
    parquetModule = await import("parquet-wasm")
  }
  return parquetModule
}

/**
 * Parse CUAD Parquet dataset and yield normalized records.
 *
 * Outputs at TWO granularities:
 * - "document": Full contract text (deduplicated by contract_name)
 * - "clause": Individual annotated clauses with CUAD category
 */
export async function* parseCuadDataset(
  parquetPath: string
): AsyncGenerator<NormalizedRecord> {
  const parquet = await getParquetModule()

  // Read Parquet file
  const buffer = await readFile(parquetPath)
  const table = parquet.readParquet(new Uint8Array(buffer))

  // Track seen contracts for document-level deduplication
  const seenContracts = new Set<string>()

  // Convert Arrow table to records
  const numRows = table.numRows
  for (let i = 0; i < numRows; i++) {
    const row = table.get(i) as CuadRawRecord

    const contractName = row.contract_name
    const contractText = normalizeText(row.contract_text)
    const clauseText = normalizeText(row.clause_text)
    const category = row.category as CuadCategory

    // Yield document-level record (once per contract)
    if (!seenContracts.has(contractName)) {
      seenContracts.add(contractName)

      yield {
        source: "cuad",
        sourceId: `cuad:doc:${contractName}`,
        content: contractText,
        granularity: "document",
        sectionPath: [],
        metadata: {
          contractName,
          totalClauses: 0, // Will be updated in post-processing
        },
        contentHash: generateContentHash(contractText),
      }
    }

    // Yield clause-level record
    if (clauseText) {
      yield {
        source: "cuad",
        sourceId: `cuad:clause:${contractName}:${row.start_ix}-${row.end_ix}`,
        content: clauseText,
        granularity: "clause",
        sectionPath: [category],
        category,
        metadata: {
          contractName,
          startIndex: row.start_ix,
          endIndex: row.end_ix,
        },
        contentHash: generateContentHash(clauseText),
      }
    }
  }
}

/**
 * Get CUAD dataset statistics
 */
export async function getCuadStats(parquetPath: string): Promise<{
  totalContracts: number
  totalClauses: number
  categoryCounts: Record<string, number>
}> {
  const contracts = new Set<string>()
  const categoryCounts: Record<string, number> = {}
  let totalClauses = 0

  for await (const record of parseCuadDataset(parquetPath)) {
    if (record.granularity === "document") {
      contracts.add(record.sourceId)
    } else if (record.granularity === "clause") {
      totalClauses++
      const cat = record.category || "unknown"
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    }
  }

  return {
    totalContracts: contracts.size,
    totalClauses,
    categoryCounts,
  }
}
```

## Task 2B.4: ContractNLI Parser (`src/lib/datasets/contractnli-parser.ts`)

```typescript
import { readFile } from "fs/promises"
import type { NormalizedRecord, ContractNliRawRecord, NliLabel } from "./types"
import { NLI_HYPOTHESES } from "./types"
import { generateContentHash, normalizeText, normalizeNliLabel } from "./utils"

/**
 * Parse ContractNLI JSON dataset and yield normalized records.
 *
 * Outputs at TWO granularities:
 * - "document": Full contract text
 * - "span": Evidence spans with hypothesis ID and NLI label
 */
export async function* parseContractNliDataset(
  jsonPath: string
): AsyncGenerator<NormalizedRecord> {
  const raw = await readFile(jsonPath, "utf-8")
  const data = JSON.parse(raw) as ContractNliRawRecord[]

  for (const record of data) {
    const contractText = normalizeText(record.text)
    const contractId = record.id

    // Yield document-level record
    yield {
      source: "contract_nli",
      sourceId: `cnli:doc:${contractId}`,
      content: contractText,
      granularity: "document",
      sectionPath: [],
      metadata: {
        originalId: contractId,
        spanCount: record.spans.length,
        annotationCount: Object.keys(record.annotations).length,
      },
      contentHash: generateContentHash(contractText),
    }

    // Yield span-level records for each annotation
    for (const [hypothesisIdStr, annotation] of Object.entries(record.annotations)) {
      const hypothesisId = parseInt(hypothesisIdStr, 10)
      const nliLabel = normalizeNliLabel(annotation.choice)
      const hypothesisText = NLI_HYPOTHESES[hypothesisId] || `Hypothesis ${hypothesisId}`

      // Get evidence spans for this annotation
      for (const spanIndex of annotation.spans) {
        const span = record.spans[spanIndex]
        if (!span) continue

        const spanText = normalizeText(span.text)

        yield {
          source: "contract_nli",
          sourceId: `cnli:span:${contractId}:h${hypothesisId}:${spanIndex}`,
          content: spanText,
          granularity: "span",
          sectionPath: [hypothesisText],
          hypothesisId,
          nliLabel,
          metadata: {
            contractId,
            spanIndex,
            startOffset: span.start,
            endOffset: span.end,
            hypothesisText,
          },
          contentHash: generateContentHash(spanText),
        }
      }
    }
  }
}

/**
 * Get ContractNLI dataset statistics
 */
export async function getContractNliStats(jsonPath: string): Promise<{
  totalContracts: number
  totalSpans: number
  labelCounts: Record<NliLabel, number>
  hypothesisCounts: Record<number, number>
}> {
  const contracts = new Set<string>()
  const labelCounts: Record<NliLabel, number> = {
    entailment: 0,
    contradiction: 0,
    not_mentioned: 0,
  }
  const hypothesisCounts: Record<number, number> = {}
  let totalSpans = 0

  for await (const record of parseContractNliDataset(jsonPath)) {
    if (record.granularity === "document") {
      contracts.add(record.sourceId)
    } else if (record.granularity === "span") {
      totalSpans++
      if (record.nliLabel) {
        labelCounts[record.nliLabel]++
      }
      if (record.hypothesisId) {
        hypothesisCounts[record.hypothesisId] =
          (hypothesisCounts[record.hypothesisId] || 0) + 1
      }
    }
  }

  return {
    totalContracts: contracts.size,
    totalSpans,
    labelCounts,
    hypothesisCounts,
  }
}
```

## Task 2B.5: Template Parser (`src/lib/datasets/template-parser.ts`)

```typescript
import { readFile, readdir } from "fs/promises"
import { join, basename } from "path"
import type { NormalizedRecord, DatasetSource } from "./types"
import { generateContentHash, normalizeText, parseHeading, buildSectionPath } from "./utils"

interface TemplateSection {
  heading: string
  level: number
  content: string
  path: string[]
}

/**
 * Parse a markdown template into sections
 */
export function parseMarkdownTemplate(markdown: string): TemplateSection[] {
  const lines = markdown.split("\n")
  const sections: TemplateSection[] = []
  const headingHistory: Array<{ level: number; text: string }> = []

  let currentSection: TemplateSection | null = null
  let contentLines: string[] = []

  for (const line of lines) {
    const heading = parseHeading(line)

    if (heading) {
      // Save previous section
      if (currentSection) {
        currentSection.content = normalizeText(contentLines.join("\n"))
        if (currentSection.content) {
          sections.push(currentSection)
        }
      }

      // Update heading history (remove deeper levels)
      while (
        headingHistory.length > 0 &&
        headingHistory[headingHistory.length - 1].level >= heading.level
      ) {
        headingHistory.pop()
      }
      headingHistory.push(heading)

      // Start new section
      currentSection = {
        heading: heading.text,
        level: heading.level,
        content: "",
        path: buildSectionPath(headingHistory, heading.level, heading.text),
      }
      contentLines = []
    } else if (currentSection) {
      contentLines.push(line)
    }
  }

  // Don't forget last section
  if (currentSection) {
    currentSection.content = normalizeText(contentLines.join("\n"))
    if (currentSection.content) {
      sections.push(currentSection)
    }
  }

  return sections
}

/**
 * Parse a directory of markdown templates
 */
async function* parseTemplateDirectory(
  dirPath: string,
  source: DatasetSource
): AsyncGenerator<NormalizedRecord> {
  const entries = await readdir(dirPath, { withFileTypes: true, recursive: true })

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue

    const filePath = join(entry.parentPath || dirPath, entry.name)
    const relativePath = filePath.replace(dirPath, "").replace(/^\//, "")
    const templateName = basename(entry.name, ".md")

    const content = await readFile(filePath, "utf-8")
    const normalizedContent = normalizeText(content)

    // Yield template-level record (full document)
    yield {
      source,
      sourceId: `${source}:template:${relativePath}`,
      content: normalizedContent,
      granularity: "template",
      sectionPath: [templateName],
      metadata: {
        fileName: entry.name,
        relativePath,
      },
      contentHash: generateContentHash(normalizedContent),
    }

    // Yield section-level records
    const sections = parseMarkdownTemplate(content)
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]

      yield {
        source,
        sourceId: `${source}:section:${relativePath}:${i}`,
        content: section.content,
        granularity: "section",
        sectionPath: [templateName, ...section.path],
        category: section.heading,
        metadata: {
          fileName: entry.name,
          relativePath,
          headingLevel: section.level,
          sectionIndex: i,
        },
        contentHash: generateContentHash(section.content),
      }
    }
  }
}

/**
 * Parse Bonterms template directory
 */
export async function* parseBontermsDataset(
  dirPath: string
): AsyncGenerator<NormalizedRecord> {
  yield* parseTemplateDirectory(dirPath, "bonterms")
}

/**
 * Parse CommonAccord template directory
 */
export async function* parseCommonAccordDataset(
  dirPath: string
): AsyncGenerator<NormalizedRecord> {
  yield* parseTemplateDirectory(dirPath, "commonaccord")
}

/**
 * Get template dataset statistics
 */
export async function getTemplateStats(
  dirPath: string,
  source: DatasetSource
): Promise<{
  totalTemplates: number
  totalSections: number
  avgSectionsPerTemplate: number
}> {
  let totalTemplates = 0
  let totalSections = 0

  const parser =
    source === "bonterms" ? parseBontermsDataset : parseCommonAccordDataset

  for await (const record of parser(dirPath)) {
    if (record.granularity === "template") {
      totalTemplates++
    } else if (record.granularity === "section") {
      totalSections++
    }
  }

  return {
    totalTemplates,
    totalSections,
    avgSectionsPerTemplate: totalTemplates > 0 ? totalSections / totalTemplates : 0,
  }
}
```

## Task 2B.6: Barrel Export (`src/lib/datasets/index.ts`)

```typescript
// Types
export type {
  DatasetSource,
  EmbeddingGranularity,
  NliLabel,
  NormalizedRecord,
  CuadRawRecord,
  ContractNliRawRecord,
  CuadCategory,
} from "./types"

export { CUAD_CATEGORIES, NLI_HYPOTHESES } from "./types"

// Utilities
export { generateContentHash, normalizeText, parseHeading, buildSectionPath } from "./utils"

// Parsers
export { parseCuadDataset, getCuadStats } from "./cuad-parser"
export { parseContractNliDataset, getContractNliStats } from "./contractnli-parser"
export {
  parseMarkdownTemplate,
  parseBontermsDataset,
  parseCommonAccordDataset,
  getTemplateStats,
} from "./template-parser"
```

## Task 2B.7: Tests (`src/lib/datasets/__tests__/parsers.test.ts`)

```typescript
import { describe, it, expect, beforeAll } from "vitest"
import { writeFile, mkdir, rm } from "fs/promises"
import { join } from "path"
import {
  generateContentHash,
  normalizeText,
  parseHeading,
  buildSectionPath,
  parseMarkdownTemplate,
  parseBontermsDataset,
  parseContractNliDataset,
  type NormalizedRecord,
} from "../index"

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
    expect(sectionRecords.length).toBe(2)
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
})
```

## Dependencies

```bash
pnpm add parquet-wasm
```

## Implementation Sequence

1. **2B.1** - Types (no dependencies)
2. **2B.2** - Utils (depends on 2B.1)
3. **2B.3-2B.5** - Parsers (can run in parallel, depend on 2B.1 + 2B.2)
4. **2B.6** - Barrel export (depends on all parsers)
5. **2B.7** - Tests (depends on all above)

## Success Criteria

- [ ] All parsers yield valid `NormalizedRecord` objects
- [ ] Content hashes are consistent and unique
- [ ] CUAD outputs both document and clause granularities
- [ ] ContractNLI preserves hypothesis IDs and NLI labels
- [ ] Template parsers build correct section paths
- [ ] All tests pass
- [ ] No TypeScript errors
