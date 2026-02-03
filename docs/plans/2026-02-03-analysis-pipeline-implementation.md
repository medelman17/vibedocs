# Analysis Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the four-agent NDA analysis pipeline with web upload and Word Add-in support.

**Architecture:** Parser → Classifier → Risk Scorer → Gap Analyst, orchestrated via Inngest with position tracking for Word Add-in content controls.

**Tech Stack:** AI SDK 6 + Vercel AI Gateway, Inngest durable functions, pdf-parse/mammoth for extraction, Voyage AI embeddings.

**Depends On:** Agent Foundation (`2026-02-03-agent-foundation-design.md`) - already implemented.

---

## Task 1: Document Processing Library

**Files:**
- Create: `lib/document-processing.ts`
- Create: `lib/document-processing.test.ts`

### Step 1: Write failing test for text extraction

```typescript
// lib/document-processing.test.ts
import { describe, it, expect, vi } from 'vitest'
import { extractText, chunkDocument, type DocumentChunk } from './document-processing'

describe('extractText', () => {
  it('extracts text from PDF buffer', async () => {
    const pdfBuffer = createSamplePdfBuffer()
    const result = await extractText(pdfBuffer, 'application/pdf')

    expect(result.text).toContain('CONFIDENTIALITY AGREEMENT')
    expect(result.pageCount).toBeGreaterThan(0)
  })

  it('extracts text from DOCX buffer', async () => {
    const docxBuffer = createSampleDocxBuffer()
    const result = await extractText(docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    expect(result.text).toContain('Agreement')
  })

  it('passes through plain text', async () => {
    const textBuffer = Buffer.from('This is plain text content')
    const result = await extractText(textBuffer, 'text/plain')

    expect(result.text).toBe('This is plain text content')
    expect(result.pageCount).toBe(1)
  })
})
```

### Step 2: Run test to verify it fails

Run: `pnpm test lib/document-processing.test.ts -- --run`
Expected: FAIL with "Cannot find module './document-processing'"

### Step 3: Write minimal implementation for text extraction

```typescript
// lib/document-processing.ts
import pdf from 'pdf-parse'
import mammoth from 'mammoth'

export interface ExtractionResult {
  text: string
  pageCount: number
}

export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  switch (mimeType) {
    case 'application/pdf': {
      const data = await pdf(buffer)
      return { text: data.text, pageCount: data.numpages }
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      const result = await mammoth.extractRawText({ buffer })
      return { text: result.value, pageCount: 1 }
    }
    case 'text/plain':
    default:
      return { text: buffer.toString('utf-8'), pageCount: 1 }
  }
}
```

### Step 4: Run test to verify extraction passes

Run: `pnpm test lib/document-processing.test.ts -- --run -t "extractText"`
Expected: PASS

### Step 5: Write failing test for chunking with positions

```typescript
// Add to lib/document-processing.test.ts
describe('chunkDocument', () => {
  it('chunks document with section detection', () => {
    const text = `
ARTICLE I - DEFINITIONS
1.1 "Confidential Information" means any information disclosed.

ARTICLE II - OBLIGATIONS
2.1 The Receiving Party shall hold in confidence.
2.2 The Receiving Party shall not disclose.
`
    const chunks = chunkDocument(text, { maxTokens: 200 })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].sectionPath).toContain('ARTICLE I')
    expect(chunks[0].startPosition).toBe(1) // After leading newline
    expect(chunks[0].endPosition).toBeGreaterThan(chunks[0].startPosition)
  })

  it('preserves position information for Word Add-in', () => {
    const text = 'First clause. Second clause. Third clause.'
    const chunks = chunkDocument(text, { maxTokens: 50 })

    // Positions should be continuous and non-overlapping
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startPosition).toBeGreaterThanOrEqual(chunks[i - 1].endPosition)
    }

    // Positions should map back to original text
    chunks.forEach(chunk => {
      expect(text.slice(chunk.startPosition, chunk.endPosition)).toBe(chunk.content)
    })
  })
})
```

### Step 6: Run test to verify it fails

Run: `pnpm test lib/document-processing.test.ts -- --run -t "chunkDocument"`
Expected: FAIL with "chunkDocument is not a function"

### Step 7: Implement chunking with position tracking

```typescript
// Add to lib/document-processing.ts
import { encode } from 'gpt-tokenizer'

export interface DocumentChunk {
  id: string
  index: number
  content: string
  sectionPath: string[]
  tokenCount: number
  startPosition: number
  endPosition: number
}

interface ChunkOptions {
  maxTokens?: number
  overlap?: number
}

const SECTION_PATTERNS = [
  /^(ARTICLE\s+[IVX\d]+)/im,
  /^(Section\s+\d+(?:\.\d+)?)/im,
  /^(\d+\.\s+)/m,
]

export function chunkDocument(
  text: string,
  options: ChunkOptions = {}
): DocumentChunk[] {
  const { maxTokens = 500, overlap = 50 } = options
  const chunks: DocumentChunk[] = []
  let currentSection: string[] = []
  let position = 0

  // Split into paragraphs while tracking positions
  const paragraphs = splitWithPositions(text)
  let currentChunk = ''
  let chunkStart = 0
  let chunkIndex = 0

  for (const { text: para, start, end } of paragraphs) {
    // Check for section headers
    for (const pattern of SECTION_PATTERNS) {
      const match = para.match(pattern)
      if (match) {
        currentSection = [match[1].trim()]
        break
      }
    }

    const potentialChunk = currentChunk + (currentChunk ? '\n' : '') + para
    const tokens = encode(potentialChunk).length

    if (tokens > maxTokens && currentChunk) {
      // Save current chunk
      chunks.push({
        id: `chunk-${chunkIndex}`,
        index: chunkIndex,
        content: currentChunk.trim(),
        sectionPath: [...currentSection],
        tokenCount: encode(currentChunk).length,
        startPosition: chunkStart,
        endPosition: chunkStart + currentChunk.length,
      })
      chunkIndex++

      // Start new chunk with overlap
      const overlapText = getOverlapText(currentChunk, overlap)
      currentChunk = overlapText + para
      chunkStart = start - overlapText.length
    } else {
      if (!currentChunk) chunkStart = start
      currentChunk = potentialChunk
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      id: `chunk-${chunkIndex}`,
      index: chunkIndex,
      content: currentChunk.trim(),
      sectionPath: [...currentSection],
      tokenCount: encode(currentChunk).length,
      startPosition: chunkStart,
      endPosition: chunkStart + currentChunk.length,
    })
  }

  return chunks
}

function splitWithPositions(text: string): Array<{ text: string; start: number; end: number }> {
  const result: Array<{ text: string; start: number; end: number }> = []
  const paragraphs = text.split(/\n\n+/)
  let position = 0

  for (const para of paragraphs) {
    const start = text.indexOf(para, position)
    const end = start + para.length
    if (para.trim()) {
      result.push({ text: para, start, end })
    }
    position = end
  }

  return result
}

function getOverlapText(text: string, overlapTokens: number): string {
  const words = text.split(/\s+/)
  const overlapWords: string[] = []
  let tokens = 0

  for (let i = words.length - 1; i >= 0 && tokens < overlapTokens; i--) {
    overlapWords.unshift(words[i])
    tokens = encode(overlapWords.join(' ')).length
  }

  return overlapWords.join(' ') + ' '
}
```

### Step 8: Run all document-processing tests

Run: `pnpm test lib/document-processing.test.ts -- --run`
Expected: PASS

### Step 9: Commit Task 1

```bash
git add lib/document-processing.ts lib/document-processing.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add document processing library with position tracking

- extractText: PDF (pdf-parse), DOCX (mammoth), plain text
- chunkDocument: Section detection, position preservation for Word Add-in
- Overlap support for context continuity across chunks

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Parser Agent

**Files:**
- Create: `agents/parser.ts`
- Create: `agents/parser.test.ts`

### Step 1: Write failing test for web source parsing

```typescript
// agents/parser.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runParserAgent, type ParserInput, type ParserOutput } from './parser'

// Mock document processing
vi.mock('@/lib/document-processing', () => ({
  extractText: vi.fn().mockResolvedValue({ text: 'Sample NDA text', pageCount: 1 }),
  chunkDocument: vi.fn().mockReturnValue([
    { id: 'chunk-0', index: 0, content: 'Sample NDA text', sectionPath: [], tokenCount: 10, startPosition: 0, endPosition: 15 }
  ]),
}))

// Mock embeddings
vi.mock('@/lib/embeddings', () => ({
  getVoyageAIClient: () => ({
    embedBatch: vi.fn().mockResolvedValue({
      embeddings: [[0.1, 0.2, 0.3]],
      usage: { totalTokens: 100 }
    })
  })
}))

// Mock blob fetch
vi.mock('@vercel/blob', () => ({
  get: vi.fn().mockResolvedValue({
    blob: () => Promise.resolve(new Blob(['mock content'])),
    contentType: 'application/pdf'
  })
}))

describe('Parser Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses web source by downloading from blob', async () => {
    const input: ParserInput = {
      documentId: 'doc-123',
      tenantId: 'tenant-456',
      source: 'web',
    }

    const result = await runParserAgent(input)

    expect(result.document.documentId).toBe('doc-123')
    expect(result.document.chunks.length).toBeGreaterThan(0)
    expect(result.document.chunks[0].embedding).toBeDefined()
  })
})
```

### Step 2: Run test to verify it fails

Run: `pnpm test agents/parser.test.ts -- --run`
Expected: FAIL with "Cannot find module './parser'"

### Step 3: Implement Parser Agent for web source

```typescript
// agents/parser.ts
import { get as getBlob } from '@vercel/blob'
import { extractText, chunkDocument, type DocumentChunk } from '@/lib/document-processing'
import { getVoyageAIClient } from '@/lib/embeddings'
import { db } from '@/db/client'
import { documents } from '@/db/schema/documents'
import { eq } from 'drizzle-orm'

export interface ParserInput {
  documentId: string
  tenantId: string
  source: 'web' | 'word-addin'
  content?: {
    rawText: string
    paragraphs: Array<{
      text: string
      style: string
      isHeading: boolean
    }>
  }
  metadata?: {
    title: string
    author?: string
  }
}

export interface ParserOutput {
  document: {
    documentId: string
    title: string
    rawText: string
    chunks: Array<DocumentChunk & { embedding: number[] }>
  }
  tokenUsage: {
    embeddingTokens: number
  }
}

export async function runParserAgent(input: ParserInput): Promise<ParserOutput> {
  const { documentId, tenantId, source, content, metadata } = input

  let rawText: string
  let title: string

  if (source === 'web') {
    // Fetch document from blob storage
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    })
    if (!doc?.blobUrl) throw new Error(`Document ${documentId} not found or has no blob URL`)

    const blob = await getBlob(doc.blobUrl)
    const buffer = Buffer.from(await blob.blob().then(b => b.arrayBuffer()))
    const extracted = await extractText(buffer, blob.contentType ?? 'application/pdf')

    rawText = extracted.text
    title = doc.title ?? 'Untitled'
  } else {
    // Word Add-in: use provided content
    if (!content) throw new Error('Word Add-in source requires content')
    rawText = content.rawText
    title = metadata?.title ?? 'Untitled'
  }

  // Chunk with section detection
  const baseChunks = chunkDocument(rawText, { maxTokens: 500, overlap: 50 })

  // Generate embeddings in batches
  const voyageClient = getVoyageAIClient()
  const texts = baseChunks.map(c => c.content)
  const { embeddings, usage } = await voyageClient.embedBatch(texts, 'document')

  // Combine chunks with embeddings
  const chunks = baseChunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
  }))

  return {
    document: {
      documentId,
      title,
      rawText,
      chunks,
    },
    tokenUsage: {
      embeddingTokens: usage.totalTokens,
    },
  }
}
```

### Step 4: Run test to verify web parsing passes

Run: `pnpm test agents/parser.test.ts -- --run -t "web source"`
Expected: PASS

### Step 5: Write failing test for Word Add-in source

```typescript
// Add to agents/parser.test.ts
it('parses word-addin source with structured paragraphs', async () => {
  const input: ParserInput = {
    documentId: 'doc-789',
    tenantId: 'tenant-456',
    source: 'word-addin',
    content: {
      rawText: 'ARTICLE I - DEFINITIONS\n1.1 Terms defined herein.',
      paragraphs: [
        { text: 'ARTICLE I - DEFINITIONS', style: 'Heading1', isHeading: true },
        { text: '1.1 Terms defined herein.', style: 'Normal', isHeading: false },
      ],
    },
    metadata: { title: 'Sample NDA' },
  }

  const result = await runParserAgent(input)

  expect(result.document.title).toBe('Sample NDA')
  expect(result.document.rawText).toContain('ARTICLE I')
  expect(result.document.chunks[0].sectionPath).toContain('ARTICLE I - DEFINITIONS')
})
```

### Step 6: Run test to verify Word Add-in section detection

Run: `pnpm test agents/parser.test.ts -- --run -t "word-addin"`
Expected: PASS (implementation already handles this via chunkDocument)

### Step 7: Write test for position preservation

```typescript
// Add to agents/parser.test.ts
it('preserves position information through parsing', async () => {
  const { chunkDocument } = await import('@/lib/document-processing')
  vi.mocked(chunkDocument).mockReturnValue([
    { id: 'chunk-0', index: 0, content: 'First clause', sectionPath: [], tokenCount: 5, startPosition: 0, endPosition: 12 },
    { id: 'chunk-1', index: 1, content: 'Second clause', sectionPath: [], tokenCount: 5, startPosition: 14, endPosition: 27 },
  ])

  const input: ParserInput = {
    documentId: 'doc-pos',
    tenantId: 'tenant-456',
    source: 'word-addin',
    content: { rawText: 'First clause. Second clause.', paragraphs: [] },
    metadata: { title: 'Test' },
  }

  const result = await runParserAgent(input)

  expect(result.document.chunks[0].startPosition).toBe(0)
  expect(result.document.chunks[0].endPosition).toBe(12)
  expect(result.document.chunks[1].startPosition).toBe(14)
})
```

### Step 8: Run all Parser tests

Run: `pnpm test agents/parser.test.ts -- --run`
Expected: PASS

### Step 9: Commit Task 2

```bash
git add agents/parser.ts agents/parser.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add Parser Agent with web and Word Add-in support

- Web source: downloads from blob, extracts text via pdf-parse/mammoth
- Word Add-in source: uses provided rawText and paragraph structure
- Position tracking preserved for content control insertion
- Batch embedding generation via Voyage AI

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Classifier Agent

**Files:**
- Create: `agents/classifier.ts`
- Create: `agents/classifier.test.ts`

### Step 1: Write failing test for clause classification

```typescript
// agents/classifier.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runClassifierAgent, type ClassifierInput } from './classifier'
import { mockGenerateObject, mockVectorSearch } from './testing'
import { SAMPLE_GOVERNING_LAW_CLAUSE, SAMPLE_VECTOR_RESULTS } from './testing/fixtures'
import { BudgetTracker } from '@/lib/ai/budget'

vi.mock('ai', () => ({
  generateObject: mockGenerateObject({
    category: 'Governing Law',
    secondaryCategories: [],
    confidence: 0.95,
    reasoning: 'Explicit jurisdiction designation.',
  }, { inputTokens: 500, outputTokens: 100 }),
}))

vi.mock('./tools/vector-search', () => ({
  findSimilarClauses: mockVectorSearch(SAMPLE_VECTOR_RESULTS),
}))

describe('Classifier Agent', () => {
  let budgetTracker: BudgetTracker

  beforeEach(() => {
    vi.clearAllMocks()
    budgetTracker = new BudgetTracker()
  })

  it('classifies governing law clause correctly', async () => {
    const input: ClassifierInput = {
      parsedDocument: {
        documentId: 'doc-123',
        title: 'Test NDA',
        rawText: SAMPLE_GOVERNING_LAW_CLAUSE,
        chunks: [{
          id: 'chunk-0',
          index: 0,
          content: SAMPLE_GOVERNING_LAW_CLAUSE,
          sectionPath: ['ARTICLE V'],
          tokenCount: 50,
          startPosition: 0,
          endPosition: SAMPLE_GOVERNING_LAW_CLAUSE.length,
          embedding: [0.1, 0.2, 0.3],
        }],
      },
      budgetTracker,
    }

    const result = await runClassifierAgent(input)

    expect(result.clauses.length).toBe(1)
    expect(result.clauses[0].category).toBe('Governing Law')
    expect(result.clauses[0].confidence).toBeGreaterThan(0.9)
    expect(result.clauses[0].startPosition).toBe(0)
    expect(result.clauses[0].endPosition).toBe(SAMPLE_GOVERNING_LAW_CLAUSE.length)
  })
})
```

### Step 2: Run test to verify it fails

Run: `pnpm test agents/classifier.test.ts -- --run`
Expected: FAIL with "Cannot find module './classifier'"

### Step 3: Implement Classifier Agent

```typescript
// agents/classifier.ts
import { generateObject } from 'ai'
import { getAgentModel } from '@/lib/ai/config'
import { classificationSchema, type CuadCategory } from './types'
import { findSimilarClauses } from './tools/vector-search'
import { createClassifierPrompt, CLASSIFIER_SYSTEM_PROMPT } from './prompts'
import type { BudgetTracker } from '@/lib/ai/budget'
import type { DocumentChunk } from '@/lib/document-processing'

export interface ClassifierInput {
  parsedDocument: {
    documentId: string
    title: string
    rawText: string
    chunks: Array<DocumentChunk & { embedding: number[] }>
  }
  budgetTracker: BudgetTracker
}

export interface ClassifiedClause {
  chunkId: string
  clauseText: string
  category: CuadCategory
  secondaryCategories: CuadCategory[]
  confidence: number
  reasoning: string
  startPosition: number
  endPosition: number
}

export interface ClassifierOutput {
  clauses: ClassifiedClause[]
  tokenUsage: { inputTokens: number; outputTokens: number }
}

export async function runClassifierAgent(input: ClassifierInput): Promise<ClassifierOutput> {
  const { parsedDocument, budgetTracker } = input
  const clauses: ClassifiedClause[] = []
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (const chunk of parsedDocument.chunks) {
    // Fetch similar reference clauses
    const references = await findSimilarClauses(chunk.content, { limit: 3 })

    // Build prompt with references
    const prompt = createClassifierPrompt(chunk.content, references)

    // Generate classification
    const { object, usage } = await generateObject({
      model: getAgentModel('classifier'),
      system: CLASSIFIER_SYSTEM_PROMPT,
      prompt,
      schema: classificationSchema,
    })

    // Track token usage
    totalInputTokens += usage?.promptTokens ?? 0
    totalOutputTokens += usage?.completionTokens ?? 0

    // Skip low-confidence "Unknown" classifications
    if (object.category === 'Unknown' && object.confidence < 0.5) {
      continue
    }

    clauses.push({
      chunkId: chunk.id,
      clauseText: chunk.content,
      category: object.category,
      secondaryCategories: object.secondaryCategories,
      confidence: object.confidence,
      reasoning: object.reasoning,
      startPosition: chunk.startPosition,
      endPosition: chunk.endPosition,
    })
  }

  // Record budget
  budgetTracker.record('classifier', totalInputTokens, totalOutputTokens)

  return {
    clauses,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  }
}
```

### Step 4: Run test to verify classification passes

Run: `pnpm test agents/classifier.test.ts -- --run`
Expected: PASS

### Step 5: Write test for budget tracking

```typescript
// Add to agents/classifier.test.ts
it('records token usage in budget tracker', async () => {
  const input: ClassifierInput = {
    parsedDocument: {
      documentId: 'doc-123',
      title: 'Test',
      rawText: 'text',
      chunks: [{
        id: 'chunk-0', index: 0, content: 'text', sectionPath: [],
        tokenCount: 5, startPosition: 0, endPosition: 4, embedding: [],
      }],
    },
    budgetTracker,
  }

  await runClassifierAgent(input)

  const usage = budgetTracker.getUsage()
  expect(usage.byAgent['classifier']).toBeDefined()
  expect(usage.byAgent['classifier'].input).toBe(500)
  expect(usage.byAgent['classifier'].output).toBe(100)
})
```

### Step 6: Run budget tracking test

Run: `pnpm test agents/classifier.test.ts -- --run -t "budget"`
Expected: PASS

### Step 7: Commit Task 3

```bash
git add agents/classifier.ts agents/classifier.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add Classifier Agent with CUAD categorization

- Classifies chunks using CUAD 41-category taxonomy
- Fetches reference clauses for few-shot prompting
- Preserves position info for Word Add-in
- Budget tracking via shared BudgetTracker

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Risk Scorer Agent

**Files:**
- Create: `agents/risk-scorer.ts`
- Create: `agents/risk-scorer.test.ts`

### Step 1: Write failing test for risk assessment

```typescript
// agents/risk-scorer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRiskScorerAgent, type RiskScorerInput } from './risk-scorer'
import { mockGenerateObject, mockVectorSearch } from './testing'
import { SAMPLE_RISK_ASSESSMENT, SAMPLE_AGGRESSIVE_RISK } from './testing/fixtures'
import { BudgetTracker } from '@/lib/ai/budget'

vi.mock('ai', () => ({
  generateObject: mockGenerateObject(SAMPLE_RISK_ASSESSMENT, { inputTokens: 800, outputTokens: 200 }),
}))

vi.mock('./tools/vector-search', () => ({
  findSimilarClauses: mockVectorSearch([]),
}))

describe('Risk Scorer Agent', () => {
  let budgetTracker: BudgetTracker

  beforeEach(() => {
    vi.clearAllMocks()
    budgetTracker = new BudgetTracker()
  })

  it('scores governing law clause as standard risk', async () => {
    const input: RiskScorerInput = {
      clauses: [{
        chunkId: 'chunk-0',
        clauseText: 'Governed by Delaware law.',
        category: 'Governing Law',
        secondaryCategories: [],
        confidence: 0.95,
        reasoning: 'Jurisdiction clause',
        startPosition: 0,
        endPosition: 26,
      }],
      budgetTracker,
    }

    const result = await runRiskScorerAgent(input)

    expect(result.assessments.length).toBe(1)
    expect(result.assessments[0].riskLevel).toBe('standard')
    expect(result.assessments[0].evidence.citations.length).toBeGreaterThan(0)
    expect(result.assessments[0].startPosition).toBe(0)
  })
})
```

### Step 2: Run test to verify it fails

Run: `pnpm test agents/risk-scorer.test.ts -- --run`
Expected: FAIL with "Cannot find module './risk-scorer'"

### Step 3: Implement Risk Scorer Agent

```typescript
// agents/risk-scorer.ts
import { generateObject } from 'ai'
import { getAgentModel } from '@/lib/ai/config'
import { riskAssessmentSchema, type RiskLevel } from './types'
import { findSimilarClauses } from './tools/vector-search'
import { createRiskScorerPrompt, RISK_SCORER_SYSTEM_PROMPT } from './prompts'
import type { BudgetTracker } from '@/lib/ai/budget'
import type { ClassifiedClause } from './classifier'

export interface RiskScorerInput {
  clauses: ClassifiedClause[]
  budgetTracker: BudgetTracker
}

export interface RiskAssessmentResult {
  clauseId: string
  clause: ClassifiedClause
  riskLevel: RiskLevel
  confidence: number
  explanation: string
  evidence: {
    citations: string[]
    comparisons: string[]
    statistic?: string
  }
  startPosition: number
  endPosition: number
}

export interface RiskScorerOutput {
  assessments: RiskAssessmentResult[]
  overallRiskScore: number
  overallRiskLevel: RiskLevel
  tokenUsage: { inputTokens: number; outputTokens: number }
}

export async function runRiskScorerAgent(input: RiskScorerInput): Promise<RiskScorerOutput> {
  const { clauses, budgetTracker } = input
  const assessments: RiskAssessmentResult[] = []
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (const clause of clauses) {
    // Fetch reference clauses for comparison
    const references = await findSimilarClauses(clause.clauseText, {
      category: clause.category,
      limit: 5,
    })

    // Build prompt with clause and references
    const prompt = createRiskScorerPrompt(clause, references)

    // Generate risk assessment
    const { object, usage } = await generateObject({
      model: getAgentModel('riskScorer'),
      system: RISK_SCORER_SYSTEM_PROMPT,
      prompt,
      schema: riskAssessmentSchema,
    })

    totalInputTokens += usage?.promptTokens ?? 0
    totalOutputTokens += usage?.completionTokens ?? 0

    assessments.push({
      clauseId: clause.chunkId,
      clause,
      riskLevel: object.riskLevel,
      confidence: object.confidence,
      explanation: object.explanation,
      evidence: object.evidence,
      startPosition: clause.startPosition,
      endPosition: clause.endPosition,
    })
  }

  // Calculate overall risk
  const { score, level } = calculateOverallRisk(assessments)

  // Record budget
  budgetTracker.record('riskScorer', totalInputTokens, totalOutputTokens)

  return {
    assessments,
    overallRiskScore: score,
    overallRiskLevel: level,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  }
}

function calculateOverallRisk(assessments: RiskAssessmentResult[]): { score: number; level: RiskLevel } {
  if (assessments.length === 0) return { score: 0, level: 'unknown' }

  const weights: Record<RiskLevel, number> = {
    aggressive: 3,
    cautious: 1.5,
    standard: 0,
    unknown: 0.5,
  }

  const totalWeight = assessments.reduce((sum, a) => sum + weights[a.riskLevel], 0)
  const maxWeight = assessments.length * 3
  const score = Math.round((totalWeight / maxWeight) * 100)

  const level: RiskLevel =
    score >= 60 ? 'aggressive' :
    score >= 30 ? 'cautious' :
    'standard'

  return { score, level }
}
```

### Step 4: Run test to verify risk scoring passes

Run: `pnpm test agents/risk-scorer.test.ts -- --run`
Expected: PASS

### Step 5: Write test for overall risk calculation

```typescript
// Add to agents/risk-scorer.test.ts
it('calculates overall risk score correctly', async () => {
  // Mock to return aggressive risk
  vi.mocked(generateObject).mockResolvedValue({
    object: SAMPLE_AGGRESSIVE_RISK,
    usage: { promptTokens: 800, completionTokens: 200 },
  } as any)

  const input: RiskScorerInput = {
    clauses: [
      { chunkId: 'c1', clauseText: 'Non-compete worldwide', category: 'Non-Compete', secondaryCategories: [], confidence: 0.9, reasoning: '', startPosition: 0, endPosition: 20 },
      { chunkId: 'c2', clauseText: 'Non-solicit global', category: 'No-Solicit Of Employees', secondaryCategories: [], confidence: 0.9, reasoning: '', startPosition: 21, endPosition: 40 },
    ],
    budgetTracker,
  }

  const result = await runRiskScorerAgent(input)

  expect(result.overallRiskLevel).toBe('aggressive')
  expect(result.overallRiskScore).toBeGreaterThanOrEqual(60)
})
```

### Step 6: Run overall risk test

Run: `pnpm test agents/risk-scorer.test.ts -- --run -t "overall"`
Expected: PASS

### Step 7: Commit Task 4

```bash
git add agents/risk-scorer.ts agents/risk-scorer.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add Risk Scorer Agent with evidence-based assessments

- PRD-aligned risk levels: standard, cautious, aggressive, unknown
- Evidence with citations, comparisons, statistics
- Overall risk score calculation (0-100)
- Position preservation for Word Add-in

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Gap Analyst Agent

**Files:**
- Create: `agents/gap-analyst.ts`
- Create: `agents/gap-analyst.test.ts`

### Step 1: Write failing test for gap analysis

```typescript
// agents/gap-analyst.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runGapAnalystAgent, type GapAnalystInput } from './gap-analyst'
import { mockGenerateObject } from './testing'
import { BudgetTracker } from '@/lib/ai/budget'

const mockGapAnalysis = {
  presentCategories: ['Governing Law', 'Parties'],
  missingCategories: [
    { category: 'Insurance', importance: 'critical', explanation: 'No insurance requirements specified.' },
  ],
  weakClauses: [],
}

const mockHypothesis = {
  hypothesisId: 'nli-7',
  category: 'Public Information Exception',
  status: 'not_mentioned',
  explanation: 'No public information exception found.',
}

vi.mock('ai', () => ({
  generateObject: vi.fn()
    .mockResolvedValueOnce({ object: mockGapAnalysis, usage: { promptTokens: 1000, completionTokens: 300 } })
    .mockResolvedValueOnce({ object: mockHypothesis, usage: { promptTokens: 500, completionTokens: 100 } }),
}))

describe('Gap Analyst Agent', () => {
  let budgetTracker: BudgetTracker

  beforeEach(() => {
    vi.clearAllMocks()
    budgetTracker = new BudgetTracker()
  })

  it('identifies missing critical categories', async () => {
    const input: GapAnalystInput = {
      clauses: [
        { chunkId: 'c1', clauseText: 'Governing law clause', category: 'Governing Law', secondaryCategories: [], confidence: 0.9, reasoning: '', startPosition: 0, endPosition: 20 },
      ],
      assessments: [],
      documentSummary: 'A basic NDA between two parties.',
      budgetTracker,
    }

    const result = await runGapAnalystAgent(input)

    expect(result.gapAnalysis.missingCategories.length).toBeGreaterThan(0)
    expect(result.gapAnalysis.missingCategories[0].importance).toBe('critical')
  })
})
```

### Step 2: Run test to verify it fails

Run: `pnpm test agents/gap-analyst.test.ts -- --run`
Expected: FAIL with "Cannot find module './gap-analyst'"

### Step 3: Implement Gap Analyst Agent

```typescript
// agents/gap-analyst.ts
import { generateObject } from 'ai'
import { z } from 'zod'
import { getAgentModel } from '@/lib/ai/config'
import { cuadCategorySchema, type CuadCategory, CONTRACT_NLI_CATEGORIES, type ContractNLICategory } from './types'
import { createGapAnalystPrompt, GAP_ANALYST_SYSTEM_PROMPT, CONTRACT_NLI_HYPOTHESES } from './prompts'
import type { BudgetTracker } from '@/lib/ai/budget'
import type { ClassifiedClause } from './classifier'
import type { RiskAssessmentResult } from './risk-scorer'

export interface GapAnalystInput {
  clauses: ClassifiedClause[]
  assessments: RiskAssessmentResult[]
  documentSummary: string
  budgetTracker: BudgetTracker
}

export interface GapAnalystOutput {
  gapAnalysis: {
    presentCategories: CuadCategory[]
    missingCategories: Array<{
      category: CuadCategory
      importance: 'critical' | 'important' | 'optional'
      explanation: string
      suggestedLanguage?: string
    }>
    weakClauses: Array<{
      clauseId: string
      category: CuadCategory
      issue: string
      recommendation: string
    }>
    gapScore: number
  }
  hypothesisCoverage: Array<{
    hypothesisId: string
    category: ContractNLICategory
    status: 'entailment' | 'contradiction' | 'not_mentioned'
    supportingClauseId?: string
    explanation: string
  }>
  tokenUsage: { inputTokens: number; outputTokens: number }
}

const gapAnalysisSchema = z.object({
  presentCategories: z.array(cuadCategorySchema),
  missingCategories: z.array(z.object({
    category: cuadCategorySchema,
    importance: z.enum(['critical', 'important', 'optional']),
    explanation: z.string(),
    suggestedLanguage: z.string().optional(),
  })),
  weakClauses: z.array(z.object({
    clauseId: z.string(),
    category: cuadCategorySchema,
    issue: z.string(),
    recommendation: z.string(),
  })),
})

const hypothesisSchema = z.object({
  hypothesisId: z.string(),
  category: z.enum(CONTRACT_NLI_CATEGORIES),
  status: z.enum(['entailment', 'contradiction', 'not_mentioned']),
  supportingClauseId: z.string().optional(),
  explanation: z.string(),
})

export async function runGapAnalystAgent(input: GapAnalystInput): Promise<GapAnalystOutput> {
  const { clauses, assessments, documentSummary, budgetTracker } = input
  let totalInputTokens = 0
  let totalOutputTokens = 0

  // Analyze gaps in CUAD coverage
  const gapPrompt = createGapAnalystPrompt(clauses, assessments, documentSummary)
  const { object: gapResult, usage: gapUsage } = await generateObject({
    model: getAgentModel('gapAnalyst'),
    system: GAP_ANALYST_SYSTEM_PROMPT,
    prompt: gapPrompt,
    schema: gapAnalysisSchema,
  })

  totalInputTokens += gapUsage?.promptTokens ?? 0
  totalOutputTokens += gapUsage?.completionTokens ?? 0

  // Test ContractNLI hypotheses
  const hypothesisCoverage = []
  for (const hypothesis of CONTRACT_NLI_HYPOTHESES.slice(0, 5)) { // Limit for budget
    const { object, usage } = await generateObject({
      model: getAgentModel('gapAnalyst'),
      system: GAP_ANALYST_SYSTEM_PROMPT,
      prompt: `Test this hypothesis against the document:\n\nHypothesis: ${hypothesis.text}\nCategory: ${hypothesis.category}\n\nDocument clauses:\n${clauses.map(c => `- ${c.clauseText.slice(0, 200)}`).join('\n')}`,
      schema: hypothesisSchema,
    })

    totalInputTokens += usage?.promptTokens ?? 0
    totalOutputTokens += usage?.completionTokens ?? 0

    hypothesisCoverage.push({
      ...object,
      hypothesisId: hypothesis.id,
      category: hypothesis.category as ContractNLICategory,
    })
  }

  // Calculate gap score
  const gapScore = calculateGapScore(gapResult, hypothesisCoverage)

  // Record budget
  budgetTracker.record('gapAnalyst', totalInputTokens, totalOutputTokens)

  return {
    gapAnalysis: {
      ...gapResult,
      gapScore,
    },
    hypothesisCoverage,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  }
}

function calculateGapScore(
  gapResult: z.infer<typeof gapAnalysisSchema>,
  hypotheses: Array<{ status: string }>
): number {
  let score = 0

  for (const missing of gapResult.missingCategories) {
    if (missing.importance === 'critical') score += 15
    else if (missing.importance === 'important') score += 8
  }

  for (const weak of gapResult.weakClauses) {
    score += 5
  }

  for (const h of hypotheses) {
    if (h.status === 'not_mentioned') score += 10
    if (h.status === 'contradiction') score += 15
  }

  return Math.min(100, score)
}
```

### Step 4: Run test to verify gap analysis passes

Run: `pnpm test agents/gap-analyst.test.ts -- --run`
Expected: PASS

### Step 5: Write test for hypothesis coverage

```typescript
// Add to agents/gap-analyst.test.ts
it('tests ContractNLI hypotheses', async () => {
  const input: GapAnalystInput = {
    clauses: [{ chunkId: 'c1', clauseText: 'Confidential info defined.', category: 'Parties', secondaryCategories: [], confidence: 0.9, reasoning: '', startPosition: 0, endPosition: 26 }],
    assessments: [],
    documentSummary: 'Basic NDA',
    budgetTracker,
  }

  const result = await runGapAnalystAgent(input)

  expect(result.hypothesisCoverage.length).toBeGreaterThan(0)
  expect(result.hypothesisCoverage[0].status).toBeDefined()
})
```

### Step 6: Run hypothesis test

Run: `pnpm test agents/gap-analyst.test.ts -- --run -t "hypotheses"`
Expected: PASS

### Step 7: Commit Task 5

```bash
git add agents/gap-analyst.ts agents/gap-analyst.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add Gap Analyst Agent with ContractNLI support

- Identifies missing CUAD categories with importance levels
- Detects weak clauses needing improvement
- Tests ContractNLI hypotheses for coverage
- Gap score calculation (0-100, lower is better)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Inngest Events and Types

**Files:**
- Create: `inngest/events/analysis.ts`
- Modify: `inngest/events/index.ts` (add export)

### Step 1: Create analysis event types

```typescript
// inngest/events/analysis.ts
import type { RiskLevel } from '@/agents/types'

/** Web upload analysis event */
export interface WebAnalysisEvent {
  name: 'nda/analysis.requested'
  data: {
    documentId: string
    tenantId: string
    source: 'web'
  }
}

/** Word Add-in analysis event */
export interface WordAddinAnalysisEvent {
  name: 'nda/analysis.requested'
  data: {
    documentId: string
    tenantId: string
    source: 'word-addin'
    content: {
      rawText: string
      paragraphs: Array<{
        text: string
        style: string
        isHeading: boolean
      }>
    }
    metadata: {
      title: string
      author?: string
    }
  }
}

export type AnalysisRequestedEvent = WebAnalysisEvent | WordAddinAnalysisEvent

/** Progress event for SSE updates */
export interface AnalysisProgressEvent {
  name: 'nda/analysis.progress'
  data: {
    documentId: string
    analysisId: string
    tenantId: string
    stage: 'parsing' | 'classifying' | 'scoring' | 'analyzing_gaps' | 'complete' | 'failed'
    progress: number
    message: string
    metadata?: {
      chunksProcessed?: number
      totalChunks?: number
      clausesClassified?: number
    }
  }
}

/** Analysis completed event */
export interface AnalysisCompletedEvent {
  name: 'nda/analysis.completed'
  data: {
    documentId: string
    analysisId: string
    tenantId: string
    overallRiskScore: number
    overallRiskLevel: RiskLevel
  }
}
```

### Step 2: Export from barrel

```typescript
// Add to inngest/events/index.ts
export * from './analysis'
```

### Step 3: Commit Task 6

```bash
git add inngest/events/analysis.ts inngest/events/index.ts
git commit -m "$(cat <<'EOF'
feat(inngest): add analysis pipeline event types

- WebAnalysisEvent and WordAddinAnalysisEvent for entry points
- AnalysisProgressEvent for SSE streaming
- AnalysisCompletedEvent for completion notification

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Analysis Pipeline Function

**Files:**
- Create: `inngest/functions/analyze-nda.ts`
- Create: `inngest/functions/analyze-nda.test.ts`

### Step 1: Write failing test for pipeline orchestration

```typescript
// inngest/functions/analyze-nda.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeNda } from './analyze-nda'
import { createMockEvent, createMockStep } from '@/inngest/utils/test-helpers'

vi.mock('@/agents/parser', () => ({
  runParserAgent: vi.fn().mockResolvedValue({
    document: { documentId: 'doc-1', title: 'Test', rawText: 'text', chunks: [] },
    tokenUsage: { embeddingTokens: 100 },
  }),
}))

vi.mock('@/agents/classifier', () => ({
  runClassifierAgent: vi.fn().mockResolvedValue({
    clauses: [],
    tokenUsage: { inputTokens: 500, outputTokens: 100 },
  }),
}))

vi.mock('@/agents/risk-scorer', () => ({
  runRiskScorerAgent: vi.fn().mockResolvedValue({
    assessments: [],
    overallRiskScore: 25,
    overallRiskLevel: 'standard',
    tokenUsage: { inputTokens: 800, outputTokens: 200 },
  }),
}))

vi.mock('@/agents/gap-analyst', () => ({
  runGapAnalystAgent: vi.fn().mockResolvedValue({
    gapAnalysis: { presentCategories: [], missingCategories: [], weakClauses: [], gapScore: 10 },
    hypothesisCoverage: [],
    tokenUsage: { inputTokens: 1000, outputTokens: 300 },
  }),
}))

describe('analyzeNda Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs all agents in sequence', async () => {
    const event = createMockEvent('nda/analysis.requested', {
      documentId: 'doc-123',
      tenantId: 'tenant-456',
      source: 'web',
    })
    const step = createMockStep()

    // Simulate function execution
    const handler = analyzeNda.fn
    const result = await handler({ event, step } as any)

    expect(step.run).toHaveBeenCalledWith('parser-agent', expect.any(Function))
    expect(step.run).toHaveBeenCalledWith('classifier-agent', expect.any(Function))
    expect(step.run).toHaveBeenCalledWith('risk-scorer-agent', expect.any(Function))
    expect(step.run).toHaveBeenCalledWith('gap-analyst-agent', expect.any(Function))
    expect(result.success).toBe(true)
  })
})
```

### Step 2: Run test to verify it fails

Run: `pnpm test inngest/functions/analyze-nda.test.ts -- --run`
Expected: FAIL with "Cannot find module './analyze-nda'"

### Step 3: Implement analyze-nda pipeline

```typescript
// inngest/functions/analyze-nda.ts
import { inngest, CONCURRENCY, RETRY_CONFIG, withTenantContext } from '@/inngest'
import { runParserAgent } from '@/agents/parser'
import { runClassifierAgent } from '@/agents/classifier'
import { runRiskScorerAgent } from '@/agents/risk-scorer'
import { runGapAnalystAgent } from '@/agents/gap-analyst'
import { BudgetTracker } from '@/lib/ai/budget'
import { db } from '@/db/client'
import { analyses } from '@/db/schema/analyses'
import { eq } from 'drizzle-orm'
import type { AnalysisRequestedEvent, AnalysisProgressEvent } from '../events/analysis'

export const analyzeNda = inngest.createFunction(
  {
    id: 'analyze-nda',
    concurrency: CONCURRENCY.analysis,
    retries: RETRY_CONFIG.default.retries,
  },
  { event: 'nda/analysis.requested' },
  async ({ event, step }) => {
    const { documentId, tenantId, source } = event.data
    const content = 'content' in event.data ? event.data.content : undefined
    const metadata = 'metadata' in event.data ? event.data.metadata : undefined

    const budgetTracker = new BudgetTracker()
    const startTime = Date.now()

    // Create analysis record
    const analysisId = await step.run('create-analysis', async () => {
      const [analysis] = await db.insert(analyses).values({
        documentId,
        tenantId,
        status: 'processing',
      }).returning({ id: analyses.id })
      return analysis.id
    })

    // Emit progress helper
    const emitProgress = async (stage: AnalysisProgressEvent['data']['stage'], progress: number, message: string) => {
      await step.sendEvent('emit-progress', {
        name: 'nda/analysis.progress',
        data: { documentId, analysisId, tenantId, stage, progress, message },
      })
    }

    // Step 1: Parser
    const parserResult = await step.run('parser-agent', () =>
      runParserAgent({ documentId, tenantId, source, content, metadata })
    )
    await emitProgress('parsing', 20, `Parsed ${parserResult.document.chunks.length} chunks`)

    // Step 2: Classifier
    const classifierResult = await step.run('classifier-agent', () =>
      runClassifierAgent({ parsedDocument: parserResult.document, budgetTracker })
    )
    await step.run('persist-clauses', async () => {
      await db.update(analyses)
        .set({ clauses: classifierResult.clauses })
        .where(eq(analyses.id, analysisId))
    })
    await emitProgress('classifying', 45, `Classified ${classifierResult.clauses.length} clauses`)

    // Step 3: Risk Scorer
    const riskResult = await step.run('risk-scorer-agent', () =>
      runRiskScorerAgent({ clauses: classifierResult.clauses, budgetTracker })
    )
    await step.run('persist-assessments', async () => {
      await db.update(analyses)
        .set({ assessments: riskResult.assessments })
        .where(eq(analyses.id, analysisId))
    })
    await emitProgress('scoring', 70, `Scored ${riskResult.assessments.length} clauses`)

    // Step 4: Gap Analyst
    const documentSummary = `${parserResult.document.title}: ${classifierResult.clauses.length} clauses identified.`
    const gapResult = await step.run('gap-analyst-agent', () =>
      runGapAnalystAgent({
        clauses: classifierResult.clauses,
        assessments: riskResult.assessments,
        documentSummary,
        budgetTracker,
      })
    )
    await emitProgress('analyzing_gaps', 90, 'Gap analysis complete')

    // Step 5: Persist final results
    await step.run('persist-final', async () => {
      await db.update(analyses)
        .set({
          status: 'completed',
          overallRiskScore: riskResult.overallRiskScore,
          overallRiskLevel: riskResult.overallRiskLevel,
          gapAnalysis: gapResult.gapAnalysis,
          hypothesisCoverage: gapResult.hypothesisCoverage,
          tokenUsage: budgetTracker.getUsage(),
          processingTimeMs: Date.now() - startTime,
          completedAt: new Date(),
        })
        .where(eq(analyses.id, analysisId))
    })

    await emitProgress('complete', 100, 'Analysis complete')

    // Emit completion event
    await step.sendEvent('analysis-completed', {
      name: 'nda/analysis.completed',
      data: {
        documentId,
        analysisId,
        tenantId,
        overallRiskScore: riskResult.overallRiskScore,
        overallRiskLevel: riskResult.overallRiskLevel,
      },
    })

    return { analysisId, success: true }
  }
)
```

### Step 4: Run test to verify pipeline passes

Run: `pnpm test inngest/functions/analyze-nda.test.ts -- --run`
Expected: PASS

### Step 5: Write test for progress events

```typescript
// Add to inngest/functions/analyze-nda.test.ts
it('emits progress events at each stage', async () => {
  const event = createMockEvent('nda/analysis.requested', {
    documentId: 'doc-123',
    tenantId: 'tenant-456',
    source: 'web',
  })
  const step = createMockStep()

  await analyzeNda.fn({ event, step } as any)

  const sendEventCalls = step.sendEvent.mock.calls
  const progressEvents = sendEventCalls.filter(
    ([name]) => name === 'emit-progress'
  )

  expect(progressEvents.length).toBeGreaterThanOrEqual(4) // parsing, classifying, scoring, analyzing_gaps, complete
})
```

### Step 6: Run progress event test

Run: `pnpm test inngest/functions/analyze-nda.test.ts -- --run -t "progress"`
Expected: PASS

### Step 7: Commit Task 7

```bash
git add inngest/functions/analyze-nda.ts inngest/functions/analyze-nda.test.ts
git commit -m "$(cat <<'EOF'
feat(inngest): add analyze-nda pipeline function

- Orchestrates Parser → Classifier → Risk Scorer → Gap Analyst
- Supports web and word-addin sources
- Emits progress events for SSE streaming
- Partial persistence for resume-on-failure
- Budget tracking across all agents

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Word Add-in API Routes

**Files:**
- Create: `app/api/word-addin/analyze/route.ts`
- Create: `app/api/word-addin/status/[id]/route.ts`
- Create: `app/api/word-addin/results/[id]/route.ts`

### Step 1: Create analyze endpoint

```typescript
// app/api/word-addin/analyze/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/lib/dal'
import { success, error, withErrorHandling } from '@/lib/api-utils'
import { ValidationError } from '@/lib/errors'
import { inngest } from '@/inngest'
import { db } from '@/db/client'
import { documents } from '@/db/schema/documents'
import { nanoid } from 'nanoid'

const analyzeRequestSchema = z.object({
  content: z.object({
    rawText: z.string().min(1),
    paragraphs: z.array(z.object({
      text: z.string(),
      style: z.string(),
      isHeading: z.boolean(),
    })),
  }),
  metadata: z.object({
    title: z.string(),
    author: z.string().optional(),
  }),
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const { db: tenantDb, tenantId } = await withTenant()

  const body = await req.json()
  const parsed = analyzeRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw ValidationError.fromZodError(parsed.error)
  }

  const { content, metadata } = parsed.data

  // Create document record (no blob for Word Add-in)
  const documentId = nanoid()
  await db.insert(documents).values({
    id: documentId,
    tenantId,
    title: metadata.title,
    source: 'word-addin',
    status: 'processing',
  })

  // Trigger analysis
  await inngest.send({
    name: 'nda/analysis.requested',
    data: {
      documentId,
      tenantId,
      source: 'word-addin',
      content,
      metadata,
    },
  })

  return success({ documentId, message: 'Analysis started' }, 202)
})
```

### Step 2: Create status SSE endpoint

```typescript
// app/api/word-addin/status/[id]/route.ts
import { NextRequest } from 'next/server'
import { withTenant } from '@/lib/dal'
import { NotFoundError } from '@/lib/errors'
import { db } from '@/db/client'
import { analyses } from '@/db/schema/analyses'
import { eq, and } from 'drizzle-orm'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params
  const { tenantId } = await withTenant()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // Poll for status updates (in production, use Redis pub/sub)
      let lastStatus = ''
      const interval = setInterval(async () => {
        const analysis = await db.query.analyses.findFirst({
          where: and(
            eq(analyses.documentId, documentId),
            eq(analyses.tenantId, tenantId)
          ),
        })

        if (!analysis) {
          sendEvent({ stage: 'failed', error: 'Analysis not found' })
          clearInterval(interval)
          controller.close()
          return
        }

        if (analysis.status !== lastStatus) {
          lastStatus = analysis.status
          sendEvent({
            stage: analysis.status,
            progress: analysis.status === 'completed' ? 100 : 50,
          })
        }

        if (analysis.status === 'completed' || analysis.status === 'failed') {
          clearInterval(interval)
          controller.close()
        }
      }, 1000)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

### Step 3: Create results endpoint

```typescript
// app/api/word-addin/results/[id]/route.ts
import { NextRequest } from 'next/server'
import { withTenant } from '@/lib/dal'
import { success, withErrorHandling } from '@/lib/api-utils'
import { NotFoundError } from '@/lib/errors'
import { db } from '@/db/client'
import { analyses } from '@/db/schema/analyses'
import { eq, and } from 'drizzle-orm'

export const GET = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: documentId } = await params
  const { tenantId } = await withTenant()

  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.documentId, documentId),
      eq(analyses.tenantId, tenantId)
    ),
  })

  if (!analysis) {
    throw new NotFoundError('Analysis', documentId)
  }

  // Format for Word Add-in consumption
  const result = {
    analysisId: analysis.id,
    overallRiskScore: analysis.overallRiskScore,
    overallRiskLevel: analysis.overallRiskLevel,
    clauses: (analysis.clauses as any[])?.map(c => ({
      id: c.chunkId,
      category: c.category,
      text: c.clauseText,
      textPreview: c.clauseText.slice(0, 100),
      startPosition: c.startPosition,
      endPosition: c.endPosition,
      riskLevel: (analysis.assessments as any[])?.find(a => a.clauseId === c.chunkId)?.riskLevel ?? 'unknown',
      riskExplanation: (analysis.assessments as any[])?.find(a => a.clauseId === c.chunkId)?.explanation ?? '',
    })) ?? [],
    gapAnalysis: analysis.gapAnalysis,
  }

  return success(result)
})
```

### Step 4: Commit Task 8

```bash
git add app/api/word-addin/analyze/route.ts app/api/word-addin/status/\[id\]/route.ts app/api/word-addin/results/\[id\]/route.ts
git commit -m "$(cat <<'EOF'
feat(api): add Word Add-in API routes

- POST /api/word-addin/analyze - Start analysis from task pane
- GET /api/word-addin/status/[id] - SSE progress stream
- GET /api/word-addin/results/[id] - Fetch results with positions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Register Functions and Install Dependencies

**Files:**
- Modify: `inngest/functions/index.ts` (add export)
- Run: `pnpm add pdf-parse mammoth gpt-tokenizer`
- Run: `pnpm add -D @types/pdf-parse`

### Step 1: Export analyze-nda function

```typescript
// Add to inngest/functions/index.ts
export { analyzeNda } from './analyze-nda'
```

### Step 2: Install dependencies

```bash
pnpm add pdf-parse mammoth gpt-tokenizer
pnpm add -D @types/pdf-parse
```

### Step 3: Run full test suite

Run: `pnpm test -- --run`
Expected: All tests pass

### Step 4: Commit Task 9

```bash
git add inngest/functions/index.ts package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore: register analyze-nda and add document processing deps

- Export analyzeNda from functions barrel
- Add pdf-parse, mammoth for document extraction
- Add gpt-tokenizer for chunk size estimation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Verification Checklist

After completing all tasks:

- [ ] `pnpm test -- --run` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` succeeds
- [ ] Manual test: Upload NDA via web → check Inngest dashboard
- [ ] Manual test: Word Add-in analyze endpoint returns 202
- [ ] Position info preserved through entire pipeline
- [ ] Progress events emitted at each stage
- [ ] Budget tracking totals < 212K tokens

---

## References

- Design: `docs/plans/2026-02-03-analysis-pipeline-design.md`
- Agent Foundation: `docs/plans/2026-02-03-agent-foundation-design.md`
- Word Add-in PRD: `docs/PRD-word-addin.md`
- CLAUDE.md (Inngest patterns, error handling, testing)
