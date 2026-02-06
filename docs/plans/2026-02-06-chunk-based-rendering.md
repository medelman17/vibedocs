# Chunk-Based Document Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace heuristic text splitting with database-driven chunk boundaries, leveraging the structural data (`chunkType`, `sectionPath`, positions) already stored in `documentChunks`.

**Architecture:** Fetch lightweight chunk metadata alongside existing rendering data, translate chunk positions through the offset map (same mechanism used for clauses), and create segments at chunk boundaries. Each segment inherits the chunk's `sectionPath.length` for indentation and `chunkType` for visual differentiation. Falls back to heuristic splitting when chunks are unavailable (progressive reveal, old analyses).

**Tech Stack:** Drizzle ORM queries, Next.js server actions, TypeScript, @tanstack/react-virtual

---

## Context

### Current flow (heuristic)

```
rawText + sections → convertToMarkdown() → markdown + offsetMap
markdown → splitIntoParagraphs() → DocumentSegment[]     ← REPLACE THIS
clauses + offsetMap + segments → mapClausePositions() → ClauseOverlay[]
```

`splitIntoParagraphs` uses regex heuristics (empty lines, short-line detection, page markers). It has no knowledge of the document's semantic structure.

### Target flow (chunk-driven)

```
rawText + sections → convertToMarkdown() → markdown + offsetMap
markdown + chunks + offsetMap → splitByChunks() → DocumentSegment[]  ← NEW
clauses + offsetMap + segments → mapClausePositions() → ClauseOverlay[]
```

Chunks already have perfect semantic boundaries (the chunker used sections to split). Each chunk carries `sectionPath` (hierarchy) and `chunkType` (definition/clause/sub-clause/recital/boilerplate/etc.).

### Key constraint: coordinate systems

- **Original text** — chunk positions, clause positions, section offsets
- **Markdown text** — after `convertToMarkdown` inserts `# ` prefixes at section starts
- The `offsetMap` translates original → markdown via binary search
- Chunks starting at a section boundary need the heading prefix INCLUDED in their segment. This requires using the shift from BEFORE the heading insertion (strict `<` comparison instead of `<=`).

### Overlap handling

Chunks may overlap (context preservation). For rendering, we use each chunk's `startPosition` as the segment boundary, so each character appears exactly once:
- Segment i: `[chunk[i].startPosition, chunk[i+1].startPosition)` in original text
- Last segment: `[lastChunk.startPosition, endOfText)`

---

## Task 1: Create chunk query DAL

**Files:**
- Create: `db/queries/chunks.ts`

**Step 1: Write the query function**

```typescript
import { db } from "../client"
import { documentChunks } from "../schema"
import { eq, and, asc, isNotNull } from "drizzle-orm"

export interface ChunkForRendering {
  chunkIndex: number
  chunkType: string | null
  sectionPath: string[] | null
  startPosition: number
  endPosition: number
}

/**
 * Fetch lightweight chunk metadata for document rendering.
 * Returns chunks ordered by document position. Only includes chunks
 * with valid positions (filters nulls). Omits content and embeddings.
 */
export async function getChunksForRendering(
  analysisId: string,
  tenantId: string
): Promise<ChunkForRendering[]> {
  const rows = await db
    .select({
      chunkIndex: documentChunks.chunkIndex,
      chunkType: documentChunks.chunkType,
      sectionPath: documentChunks.sectionPath,
      startPosition: documentChunks.startPosition,
      endPosition: documentChunks.endPosition,
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.analysisId, analysisId),
        eq(documentChunks.tenantId, tenantId),
        isNotNull(documentChunks.startPosition),
        isNotNull(documentChunks.endPosition)
      )
    )
    .orderBy(asc(documentChunks.chunkIndex))

  return rows.map((r) => ({
    chunkIndex: r.chunkIndex,
    chunkType: r.chunkType,
    sectionPath: r.sectionPath,
    startPosition: r.startPosition!,
    endPosition: r.endPosition!,
  }))
}
```

**Step 2: Commit**

```
feat: add chunk query DAL for document rendering
```

---

## Task 2: Extend rendering types

**Files:**
- Modify: `lib/document-rendering/types.ts`

**Step 1: Add optional chunk fields to `DocumentSegment`**

```typescript
export interface DocumentSegment {
  text: string
  startOffset: number
  endOffset: number
  index: number
  /** Section depth from chunk sectionPath (1 = top-level). Undefined for heuristic segments. */
  sectionLevel?: number
  /** Chunk type discriminator. Undefined for heuristic segments. */
  chunkType?: string
}
```

**Step 2: Add `ChunkForRendering` re-export and extend `DocumentRenderingData`**

```typescript
// Re-export from query module for rendering consumers
export type { ChunkForRendering } from "@/db/queries/chunks"

export interface DocumentRenderingData {
  document: { rawText: string; title: string; metadata: Record<string, unknown> }
  structure: DocumentStructure
  clauses: ClauseForRendering[]
  /** Chunk metadata for chunk-based rendering. Empty during progressive reveal before chunking. */
  chunks: ChunkForRendering[]
  status: string
  tokenUsage: { total?: { input?: number; output?: number; estimatedCost?: number } } | null
}
```

**Step 3: Commit**

```
feat: extend DocumentSegment and DocumentRenderingData with chunk fields
```

---

## Task 3: Fetch chunks in `getDocumentForRendering`

**Files:**
- Modify: `app/(main)/(dashboard)/analyses/actions.ts`

**Step 1: Import and call the chunk query**

At top of file, add import:

```typescript
import { getChunksForRendering } from "@/db/queries/chunks"
```

In `getDocumentForRendering`, after fetching clauses (around line 1374), add:

```typescript
// Fetch chunk metadata for rendering (lightweight — no content/embeddings)
const chunks = await getChunksForRendering(analysisId, tenantId)
```

**Step 2: Add chunks to the return value**

```typescript
return ok({
  document: { rawText: document.rawText, title: document.title, metadata },
  structure,
  clauses,
  chunks,
  status: analysis.status,
  tokenUsage: tokenUsage ?? null,
})
```

**Step 3: Commit**

```
feat: include chunk metadata in document rendering data
```

---

## Task 4: Implement `splitByChunks`

**Files:**
- Modify: `lib/document-rendering/text-to-markdown.ts`
- Create: `lib/document-rendering/text-to-markdown.test.ts`

This is the core of the refactor.

**Step 1: Write the test**

```typescript
import { describe, it, expect } from "vitest"
import { splitByChunks, splitIntoParagraphs } from "./text-to-markdown"
import type { OffsetMapping } from "./types"

describe("splitByChunks", () => {
  it("creates segments at chunk boundaries", () => {
    // Raw text with two sections
    const markdown = "# Intro\nParagraph one text here.\n## Terms\nPayment terms here."
    // Chunks in original text coordinates (before heading insertion)
    const chunks = [
      { chunkIndex: 0, chunkType: "clause" as const, sectionPath: ["Intro"], startPosition: 0, endPosition: 26 },
      { chunkIndex: 1, chunkType: "clause" as const, sectionPath: ["Intro", "Terms"], startPosition: 26, endPosition: 48 },
    ]
    // "# " (2 chars) at original 0, "## " (3 chars) at original 26
    const offsetMap: OffsetMapping[] = [
      { original: 0, markdown: 2 },
      { original: 26, markdown: 31 },
    ]

    const segments = splitByChunks(markdown, chunks, offsetMap)

    expect(segments).toHaveLength(2)
    // First segment should include "# Intro" heading
    expect(segments[0].text).toContain("Intro")
    expect(segments[0].sectionLevel).toBe(1)
    expect(segments[0].chunkType).toBe("clause")
    // Second segment should include "## Terms" heading
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
      { chunkIndex: 0, chunkType: "clause" as const, sectionPath: ["Main"], startPosition: 19, endPosition: 31 },
    ]
    const segments = splitByChunks(markdown, chunks, [])

    expect(segments).toHaveLength(2)
    expect(segments[0].text).toContain("Cover letter")
    expect(segments[1].text).toContain("Main clause")
  })

  it("assigns sectionLevel from sectionPath depth", () => {
    const markdown = "Level one.\nLevel two.\nLevel three."
    const chunks = [
      { chunkIndex: 0, chunkType: "definition" as const, sectionPath: ["Art 1"], startPosition: 0, endPosition: 11 },
      { chunkIndex: 1, chunkType: "sub-clause" as const, sectionPath: ["Art 1", "Sec 1.1"], startPosition: 11, endPosition: 22 },
      { chunkIndex: 2, chunkType: "sub-clause" as const, sectionPath: ["Art 1", "Sec 1.1", "(a)"], startPosition: 22, endPosition: 34 },
    ]
    const segments = splitByChunks(markdown, chunks, [])

    expect(segments[0].sectionLevel).toBe(1)
    expect(segments[1].sectionLevel).toBe(2)
    expect(segments[2].sectionLevel).toBe(3)
  })

  it("skips zero-length segments from overlapping chunks", () => {
    const markdown = "Text A.Text B."
    const chunks = [
      { chunkIndex: 0, chunkType: "clause" as const, sectionPath: ["A"], startPosition: 0, endPosition: 10 },
      // Overlapping chunk — starts before previous ends
      { chunkIndex: 1, chunkType: "clause" as const, sectionPath: ["B"], startPosition: 7, endPosition: 14 },
    ]
    const segments = splitByChunks(markdown, chunks, [])

    // Segment 0: [0, 7), Segment 1: [7, end)
    expect(segments).toHaveLength(2)
    expect(segments[0].startOffset).toBe(0)
    expect(segments[1].startOffset).toBe(7)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test lib/document-rendering/text-to-markdown.test.ts
```

Expected: FAIL — `splitByChunks` is not exported.

**Step 3: Implement `splitByChunks`**

Add to `lib/document-rendering/text-to-markdown.ts`:

```typescript
import type { ChunkForRendering } from "@/db/queries/chunks"

// ============================================================================
// originalToMarkdownInclusive
// ============================================================================

/**
 * Translate an original-text position to markdown coordinates,
 * using the shift from BEFORE any heading inserted at this exact position.
 * This ensures headings are included in the segment they introduce.
 */
function originalToMarkdownInclusive(
  pos: number,
  offsetMap: OffsetMapping[]
): number {
  let shift = 0
  for (const m of offsetMap) {
    if (m.original < pos) {
      shift = m.markdown - m.original
    } else {
      break
    }
  }
  return pos + shift
}

// ============================================================================
// splitByChunks
// ============================================================================

/**
 * Split markdown text into segments using database chunk boundaries.
 *
 * Each chunk from the analysis pipeline defines a semantic text unit
 * (definition, clause, sub-clause, recital, boilerplate, etc.) with
 * exact character positions. This function translates those positions
 * to markdown coordinates and creates segments at chunk boundaries.
 *
 * Falls back to heuristic `splitIntoParagraphs` when no chunks are
 * available (progressive reveal before chunking, old analyses).
 *
 * @param markdownText - The markdown text (from convertToMarkdown)
 * @param chunks - Chunk metadata from the database
 * @param offsetMap - Offset map from convertToMarkdown
 * @returns Array of segments with chunk metadata attached
 */
export function splitByChunks(
  markdownText: string,
  chunks: ChunkForRendering[],
  offsetMap: OffsetMapping[]
): DocumentSegment[] {
  if (markdownText.length === 0) return []
  if (chunks.length === 0) return splitIntoParagraphs(markdownText)

  const sorted = [...chunks].sort((a, b) => a.startPosition - b.startPosition)
  const segments: DocumentSegment[] = []

  // Handle preamble text before the first chunk
  const firstMdStart = originalToMarkdownInclusive(sorted[0].startPosition, offsetMap)
  if (firstMdStart > 0) {
    const preamble = markdownText.slice(0, firstMdStart).trim()
    if (preamble.length > 0) {
      segments.push({
        text: preamble,
        startOffset: 0,
        endOffset: firstMdStart,
        index: 0,
      })
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const chunk = sorted[i]

    const mdStart = originalToMarkdownInclusive(chunk.startPosition, offsetMap)
    const mdEnd =
      i < sorted.length - 1
        ? originalToMarkdownInclusive(sorted[i + 1].startPosition, offsetMap)
        : markdownText.length

    if (mdEnd <= mdStart) continue

    const text = markdownText.slice(mdStart, mdEnd).trim()
    if (text.length === 0) continue

    segments.push({
      text,
      startOffset: mdStart,
      endOffset: mdEnd,
      index: segments.length,
      sectionLevel: chunk.sectionPath?.length ?? undefined,
      chunkType: chunk.chunkType ?? undefined,
    })
  }

  return segments
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test lib/document-rendering/text-to-markdown.test.ts
```

Expected: PASS

**Step 5: Commit**

```
feat: add splitByChunks for chunk-driven document segmentation
```

---

## Task 5: Wire chunks through the page component

**Files:**
- Modify: `app/(main)/analysis/[analysisId]/page.tsx`

**Step 1: Import `ChunkForRendering`**

```typescript
import type { ChunkForRendering } from "@/db/queries/chunks"
```

**Step 2: Extract chunks from data and pass to DocumentRenderer**

After line 162 (`const clausesForRenderer = ...`), add:

```typescript
// Progressive reveal: only pass chunks when chunking is complete
const chunkingDone = stageIndex(stage) > stageIndex("chunking")
const chunksForRenderer = chunkingDone ? (data?.chunks ?? []) : []
```

Update the `<DocumentRenderer>` call to include chunks:

```typescript
<DocumentRenderer
  rawText={data.document.rawText}
  sections={sections}
  clauses={clausesForRenderer}
  chunks={chunksForRenderer}
  isLoading={false}
  title={data.document.title}
  metadata={data.document.metadata}
  status={data.status}
  tokenUsage={tokenUsage}
/>
```

**Step 3: Commit**

```
feat: pass chunk data to DocumentRenderer with progressive reveal
```

---

## Task 6: Update DocumentRenderer to use chunk-based splitting

**Files:**
- Modify: `components/document/document-renderer.tsx`

**Step 1: Add chunks prop and import `splitByChunks`**

```typescript
import { convertToMarkdown, splitIntoParagraphs, splitByChunks } from "@/lib/document-rendering/text-to-markdown"
import type { ChunkForRendering } from "@/db/queries/chunks"
```

Add to `DocumentRendererProps`:

```typescript
interface DocumentRendererProps {
  rawText: string
  sections: PositionedSection[]
  clauses: ClauseInput[]
  chunks?: ChunkForRendering[]
  isLoading: boolean
  title?: string
  metadata?: Record<string, unknown>
  status?: string
  tokenUsage?: TokenUsageData | null
}
```

Destructure in component: `{ rawText, sections, clauses, chunks, ... }`

**Step 2: Replace paragraph splitting logic**

Change step 2 from:

```typescript
const paragraphs = React.useMemo(
  () => splitIntoParagraphs(markdown),
  [markdown]
)
```

To:

```typescript
const paragraphs = React.useMemo(
  () =>
    chunks && chunks.length > 0
      ? splitByChunks(markdown, chunks, offsetMap)
      : splitIntoParagraphs(markdown),
  [markdown, chunks, offsetMap]
)
```

**Step 3: Simplify section level lookup**

Replace the `paragraphLevels` useMemo with inline segment access. In the virtualizer row rendering, change:

```typescript
const sectionLevel = paragraphLevels.get(virtualRow.index) ?? 0
```

To:

```typescript
const sectionLevel = segment.sectionLevel
  ?? findSectionForOffset(segment.startOffset, sections)?.level
  ?? 0
```

Remove the `paragraphLevels` useMemo (it's now redundant when chunks provide levels).

**Step 4: Add chunk type visual styling to virtualizer rows**

In the virtualizer row `<div>`, add a className for chunk-type styling:

```typescript
const isBoilerplate = segment.chunkType === "boilerplate"
const isDefinition = segment.chunkType === "definition"
const isRecital = segment.chunkType === "recital"

// In the JSX:
<div
  key={virtualRow.key}
  ref={virtualizer.measureElement}
  data-index={virtualRow.index}
  style={{
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    transform: `translateY(${virtualRow.start}px)`,
    paddingLeft: `${basePad + levelIndent}rem`,
    paddingRight: "2rem",
  }}
  className={cn(
    isBoilerplate && "text-muted-foreground/70 text-[0.85em]",
    isDefinition && "border-l-2 border-muted-foreground/20",
    isRecital && "italic text-muted-foreground"
  )}
>
```

**Step 5: Commit**

```
feat: use chunk-based splitting in DocumentRenderer with type styling
```

---

## Task 7: Verify end-to-end

**Step 1: Type check**

```bash
npx tsc --noEmit
```

**Step 2: Build**

```bash
pnpm build
```

**Step 3: Visual check**

Start the dev server and verify on an analyzed document:
- Paragraphs are properly split at semantic boundaries
- Subsections are indented
- Definitions have a left border
- Boilerplate text is de-emphasized
- Clause highlights still work correctly
- DocuSign envelope IDs are in a boilerplate chunk (muted style)

**Step 4: Commit (if any fixes needed)**

```
fix: adjustments from e2e verification
```

---

## Summary of files changed

| File | Action | Purpose |
|------|--------|---------|
| `db/queries/chunks.ts` | Create | Chunk query DAL |
| `lib/document-rendering/types.ts` | Modify | Add `sectionLevel`, `chunkType` to `DocumentSegment`; add `chunks` to `DocumentRenderingData` |
| `lib/document-rendering/text-to-markdown.ts` | Modify | Add `splitByChunks`, `originalToMarkdownInclusive` |
| `lib/document-rendering/text-to-markdown.test.ts` | Create | Tests for `splitByChunks` |
| `app/(main)/(dashboard)/analyses/actions.ts` | Modify | Fetch chunks in `getDocumentForRendering` |
| `app/(main)/analysis/[analysisId]/page.tsx` | Modify | Pass chunks to renderer with progressive reveal |
| `components/document/document-renderer.tsx` | Modify | Use chunk-based splitting, chunk-type styling |

## Fallback behavior

When `chunks` is empty (progressive reveal before chunking, old analyses without chunks):
- `splitByChunks` returns `splitIntoParagraphs(markdown)` — the heuristic approach
- `segment.sectionLevel` and `segment.chunkType` are undefined
- Indentation falls back to `findSectionForOffset` (section-based lookup)
- No chunk-type styling is applied
