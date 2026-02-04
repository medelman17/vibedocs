# Phase 3: Document Extraction - Research

**Researched:** 2026-02-04
**Domain:** PDF/DOCX text extraction, document structure detection, Word Add-in integration
**Confidence:** HIGH

## Summary

This phase implements raw text extraction from PDF and DOCX documents with structure preservation, supporting the analysis pipeline. The existing codebase already has foundational extraction code in `lib/document-processing.ts` using pdf-parse v2.4.5 and mammoth v1.11.0, plus a parser agent that consumes this extraction.

The primary work involves:
1. Enhancing extraction with validation, error handling, and quality detection
2. Adding LLM-powered structure detection for ambiguous documents
3. Implementing Office.js document extraction for Word Add-in
4. Tracking character positions for downstream UI highlighting

**Primary recommendation:** Extend existing `extractText()` with validation layer and quality metrics; add new `extractStructure()` function using LLM for legal document parsing; leverage Office.js paragraph API for Word Add-in structured input.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pdf-parse | 2.4.5 | PDF text extraction | Already installed; TypeScript native; handles encrypted PDF detection |
| mammoth | 1.11.0 | DOCX text extraction | Already installed; clean API; preserves paragraph structure |
| gpt-tokenizer | 3.4.0 | Token counting | Already installed; used for chunking budget |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/office-js | 1.0.569 | Word Add-in types | Already in devDependencies; required for Office.js TypeScript |
| crypto (Node built-in) | - | Content hashing | SHA-256 for deduplication (already used in Word Add-in route) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pdf-parse | unpdf | Modern API but pdf-parse already integrated and working |
| mammoth raw text | mammoth HTML | HTML preserves more structure but adds parsing complexity |
| Custom structure detection | LLM-based parsing | Custom regex is brittle for legal docs; LLM handles variation |

**Installation:**
No new packages required. All dependencies already in package.json.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── document-processing.ts     # Existing - extend with validation
├── document-extraction/       # NEW - extraction-specific modules
│   ├── pdf-extractor.ts       # PDF-specific logic, error handling
│   ├── docx-extractor.ts      # DOCX-specific logic, track changes
│   ├── structure-detector.ts  # LLM-based structure detection
│   ├── validators.ts          # Quality validation, language detection
│   └── types.ts               # Extraction types and interfaces
└── word-addin/
    └── document-reader.ts     # Office.js extraction wrapper
```

### Pattern 1: Layered Extraction with Validation

**What:** Separate raw extraction from validation and structure detection
**When to use:** All document extraction flows
**Example:**
```typescript
// Source: Project CONTEXT.md decisions + Context7 pdf-parse docs
interface ExtractionResult {
  text: string
  structure: DocumentStructure
  quality: QualityMetrics
  positions: PositionMap
  metadata: DocumentMetadata
}

interface QualityMetrics {
  charCount: number
  wordCount: number
  pageCount: number
  confidence: number  // 0-1, based on text density
  warnings: ExtractionWarning[]
  requiresOcr: boolean
}

async function extractDocument(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  // 1. Raw extraction
  const raw = await extractRawText(buffer, mimeType)

  // 2. Quality validation
  const quality = validateExtraction(raw, buffer.length)

  // 3. Check for OCR need
  if (quality.requiresOcr) {
    throw new OcrRequiredError('Document requires OCR processing')
  }

  // 4. Structure detection (LLM-assisted if ambiguous)
  const structure = await detectStructure(raw.text)

  // 5. Position mapping
  const positions = computePositions(raw.text, structure)

  return { text: raw.text, structure, quality, positions, metadata: raw.metadata }
}
```

### Pattern 2: pdf-parse Error Handling

**What:** Proper exception handling for pdf-parse v2.x
**When to use:** All PDF extraction
**Example:**
```typescript
// Source: Context7 /mehmet-kozan/pdf-parse documentation
import { PDFParse, PasswordException, InvalidPDFException } from 'pdf-parse'

async function extractPdfText(buffer: Buffer): Promise<RawExtractionResult> {
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    return {
      text: result.text,
      pageCount: result.numpages,
      metadata: {
        title: result.info?.Title,
        author: result.info?.Author,
        creationDate: result.info?.CreationDate,
      }
    }
  } catch (error) {
    if (error instanceof PasswordException) {
      throw new EncryptedDocumentError(
        'Document is password-protected. Please upload an unprotected version.'
      )
    }
    if (error instanceof InvalidPDFException) {
      throw new CorruptDocumentError(
        'Could not process this file. Try re-uploading or use a different format.'
      )
    }
    throw error
  } finally {
    await parser.destroy()  // Critical: free memory
  }
}
```

### Pattern 3: mammoth DOCX Extraction with Messages

**What:** Extract raw text while capturing warnings
**When to use:** All DOCX extraction
**Example:**
```typescript
// Source: Context7 /mwilliamson/mammoth.js documentation
import mammoth from 'mammoth'

async function extractDocxText(buffer: Buffer): Promise<RawExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer })

    // Check for warnings (embedded objects, images, etc.)
    const warnings = result.messages
      .filter(m => m.type === 'warning')
      .map(m => ({ type: 'docx_warning' as const, message: m.message }))

    return {
      text: result.value,
      pageCount: 1,  // DOCX doesn't have pages
      metadata: {},
      warnings,
    }
  } catch (error) {
    throw new CorruptDocumentError(
      'Could not process this Word document. Try re-uploading or use a different format.'
    )
  }
}
```

### Pattern 4: Office.js Document Extraction

**What:** Extract structured text from Word via Office.js
**When to use:** Word Add-in input
**Example:**
```typescript
// Source: Context7 /websites/learn_microsoft_en-us_office_dev_add-ins
interface WordParagraph {
  text: string
  style: string
  isHeading: boolean
  outlineLevel: number
}

async function extractFromWord(): Promise<{
  paragraphs: WordParagraph[]
  metadata: DocumentMetadata
}> {
  return Word.run(async (context) => {
    const body = context.document.body
    const paragraphs = body.paragraphs
    const properties = context.document.properties

    // Load text and structural information
    body.load('text')
    paragraphs.load('items')
    properties.load('title, author, creationDate')

    await context.sync()

    // Extract paragraph-level structure
    const structured: WordParagraph[] = []

    for (const para of paragraphs.items) {
      para.load('text, style, outlineLevel')
    }
    await context.sync()

    for (const para of paragraphs.items) {
      structured.push({
        text: para.text,
        style: para.style ?? 'Normal',
        isHeading: para.style?.startsWith('Heading') || para.outlineLevel > 0,
        outlineLevel: para.outlineLevel ?? 0,
      })
    }

    return {
      paragraphs: structured,
      metadata: {
        title: properties.title || 'Untitled',
        author: properties.author,
        creationDate: properties.creationDate,
      }
    }
  })
}
```

### Pattern 5: Position Tracking for UI Highlighting

**What:** Track character offsets for each section
**When to use:** All extraction to enable Phase 11 highlighting
**Example:**
```typescript
// Source: CONTEXT.md decisions - "Track start/end character positions"
interface PositionedSection {
  content: string
  startOffset: number
  endOffset: number
  sectionPath: string[]
}

function computePositions(
  fullText: string,
  structure: DocumentStructure
): PositionedSection[] {
  const sections: PositionedSection[] = []
  let currentOffset = 0

  for (const section of structure.sections) {
    // Find exact position in full text (handle whitespace normalization)
    const normalizedSection = section.content.trim()
    const searchStart = currentOffset
    const foundAt = fullText.indexOf(normalizedSection, searchStart)

    if (foundAt >= 0) {
      sections.push({
        content: section.content,
        startOffset: foundAt,
        endOffset: foundAt + normalizedSection.length,
        sectionPath: section.path,
      })
      currentOffset = foundAt + normalizedSection.length
    }
  }

  return sections
}
```

### Anti-Patterns to Avoid
- **Proceeding with empty/garbage text:** Always validate extraction quality before downstream processing
- **Ignoring parser warnings:** mammoth messages indicate lost content (images, embedded objects)
- **Not calling parser.destroy():** pdf-parse leaks memory without explicit cleanup
- **Regex-only structure detection:** Legal documents have too much variation; use LLM fallback
- **Assuming page count from DOCX:** Word documents don't have intrinsic pages

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF text extraction | Custom PDF parser | pdf-parse | Binary format complexity, font handling, layout detection |
| DOCX extraction | XML parsing | mammoth | OpenXML complexity, style resolution, track changes |
| Encrypted PDF detection | Binary inspection | pdf-parse PasswordException | Library handles all encryption variants |
| Unicode normalization | Manual string ops | Node.js String.prototype.normalize('NFC') | Built-in, handles edge cases |
| Token counting | Word splitting | gpt-tokenizer encode() | Already used, matches Claude tokenization (~10-15%) |
| Content hashing | Custom hash | crypto.createHash('sha256') | Standard, already used in Word Add-in route |

**Key insight:** Document formats are deceptively complex. PDF has fonts, encodings, rotated text, forms. DOCX has styles, revisions, embedded objects. Let battle-tested libraries handle the complexity.

## Common Pitfalls

### Pitfall 1: Silent Extraction Failures

**What goes wrong:** Scanned PDFs or image-only documents extract empty text. Pipeline proceeds with unusable content.
**Why it happens:** pdf-parse returns empty string for image-only PDFs rather than throwing error.
**How to avoid:**
- Validate text length vs file size ratio
- Require minimum 100 characters (per CONTEXT.md decision)
- Auto-route to OCR when text < 100 chars
**Warning signs:**
- File > 100KB but extracted text < 100 chars
- Very high non-ASCII character ratio
- No sentence boundaries detected

### Pitfall 2: Memory Leaks from pdf-parse

**What goes wrong:** Server memory grows over time, eventually OOMs.
**Why it happens:** pdf-parse creates internal pdfjs instances that must be explicitly destroyed.
**How to avoid:**
```typescript
const parser = new PDFParse({ data: buffer })
try {
  const result = await parser.getText()
  return result
} finally {
  await parser.destroy()  // Always destroy
}
```
**Warning signs:** Gradually increasing memory usage in production logs.

### Pitfall 3: Track Changes in DOCX

**What goes wrong:** Extracted text includes deleted text from track changes, corrupting analysis.
**Why it happens:** mammoth.extractRawText() extracts all text including deletions by default.
**How to avoid:** Per CONTEXT.md decision, "Accept all track changes when extracting DOCX." Use mammoth options or post-process. mammoth by default extracts final text (accepted changes).
**Warning signs:** Extracted text contains duplicate/conflicting clauses.

### Pitfall 4: Unicode Inconsistency

**What goes wrong:** Same text appears different due to composed vs decomposed characters.
**Why it happens:** Different sources use different Unicode forms (e.g., 'é' vs 'e' + combining accent).
**How to avoid:** Per CONTEXT.md: "UTF-8 encoding with NFC unicode normalization"
```typescript
const normalizedText = rawText.normalize('NFC')
```
**Warning signs:** Content hash differs for visually identical documents.

### Pitfall 5: Dynamic Import for pdf-parse

**What goes wrong:** Production crashes with "DOMMatrix is not defined" or barrel export issues.
**Why it happens:** pdfjs-dist (pdf-parse dependency) has browser-only code paths.
**How to avoid:** Per CLAUDE.md [02-01] decision: "Dynamic import for pdf-parse to avoid barrel export issues"
```typescript
// Use dynamic import
const pdfParse = await import('pdf-parse')
```
**Warning signs:** Works in dev, crashes in production.

### Pitfall 6: Mismatched Position Offsets

**What goes wrong:** UI highlights wrong text because positions don't match after normalization.
**Why it happens:** Whitespace normalization, Unicode normalization, or structure detection changes text.
**How to avoid:**
- Compute positions on final normalized text
- Store both original and normalized offsets if needed
- Test with real documents that have unusual formatting
**Warning signs:** Click-to-highlight lands on wrong clause.

## Code Examples

Verified patterns from official sources:

### PDF Extraction with Validation
```typescript
// Source: Context7 pdf-parse + project conventions
import type { LoadParameters, TextResult } from 'pdf-parse'
import { PDFParse, PasswordException, InvalidPDFException } from 'pdf-parse'
import { ValidationError } from '@/lib/errors'

const MIN_TEXT_LENGTH = 100  // Per CONTEXT.md
const TEXT_TO_SIZE_RATIO_THRESHOLD = 0.001  // Very low = likely scanned

export async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    const text = result.text.normalize('NFC')  // Per CONTEXT.md

    // Quality validation
    const charCount = text.length
    const ratio = charCount / buffer.length
    const requiresOcr = charCount < MIN_TEXT_LENGTH

    if (requiresOcr) {
      return {
        text: '',
        quality: {
          charCount,
          requiresOcr: true,
          confidence: 0,
          warnings: [{ type: 'ocr_required', message: 'Document requires OCR processing (may take longer)' }]
        },
        pageCount: result.numpages,
        metadata: parseMetadata(result),
      }
    }

    return {
      text,
      quality: {
        charCount,
        requiresOcr: false,
        confidence: Math.min(1, ratio * 100),  // Higher ratio = more confident
        warnings: [],
      },
      pageCount: result.numpages,
      metadata: parseMetadata(result),
    }
  } catch (error) {
    if (error instanceof PasswordException) {
      throw new ValidationError('Please upload an unprotected version of this document.')
    }
    if (error instanceof InvalidPDFException) {
      throw new ValidationError('Could not process this file. Try re-uploading or use a different format.')
    }
    throw error
  } finally {
    await parser.destroy()
  }
}
```

### DOCX Extraction
```typescript
// Source: Context7 mammoth.js + project conventions
import mammoth from 'mammoth'
import { ValidationError } from '@/lib/errors'

export async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    const text = result.value.normalize('NFC')

    const warnings = result.messages
      .filter(m => m.type === 'warning')
      .map(m => ({
        type: 'docx_warning' as const,
        message: m.message
      }))

    // Check for embedded images that may contain text
    const hasImages = warnings.some(w =>
      w.message.includes('image') || w.message.includes('picture')
    )

    return {
      text,
      quality: {
        charCount: text.length,
        requiresOcr: false,
        confidence: hasImages ? 0.8 : 1.0,
        warnings: hasImages
          ? [...warnings, { type: 'embedded_images', message: 'Document contains images that may have text' }]
          : warnings,
      },
      pageCount: 1,
      metadata: {},
    }
  } catch (error) {
    throw new ValidationError(
      'Could not process this Word document. Try re-uploading or use a different format.'
    )
  }
}
```

### LLM Structure Detection
```typescript
// Source: Project architecture patterns
import { generateObject } from 'ai'
import { z } from 'zod'
import { gateway } from '@/lib/ai-gateway'

const DocumentStructureSchema = z.object({
  sections: z.array(z.object({
    title: z.string(),
    level: z.number().min(1).max(4),
    content: z.string(),
    type: z.enum(['heading', 'definitions', 'clause', 'signature', 'exhibit', 'other']),
  })),
  parties: z.object({
    disclosing: z.string().optional(),
    receiving: z.string().optional(),
  }),
  hasExhibits: z.boolean(),
  hasSignatureBlock: z.boolean(),
})

export async function detectStructure(text: string): Promise<DocumentStructure> {
  // Check if structure is obvious from formatting
  const hasObviousHeadings = /^(ARTICLE|Section|§)\s+[IVX\d]+/m.test(text)

  if (hasObviousHeadings) {
    return parseObviousStructure(text)
  }

  // Use LLM for ambiguous cases
  const result = await generateObject({
    model: gateway('anthropic/claude-sonnet-4'),
    schema: DocumentStructureSchema,
    prompt: `Analyze this legal document and extract its structure.

Document:
${text.slice(0, 50000)}  // Limit to avoid token overflow

Identify:
1. Document sections with hierarchy levels (1=main, 2=subsection, etc.)
2. Party names (disclosing party, receiving party)
3. Whether it has exhibits/schedules (to exclude)
4. Whether it has signature blocks (to exclude)

Focus on the main agreement body. Mark exhibits, schedules, and signature sections but do not extract their content.`,
    temperature: 0,
  })

  return result.object
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pdf-parse legacy API | pdf-parse 2.x class API | 2024 | Must use `new PDFParse()` and call `destroy()` |
| mammoth.convertToHtml | mammoth.extractRawText | Preference | Raw text simpler for LLM processing |
| Regex structure detection | LLM-assisted detection | 2025 | Better handling of varied legal formats |
| Store positions relative to original | Store positions on normalized text | Current | Prevents offset drift |

**Deprecated/outdated:**
- Legacy pdf-parse default export: Now use named `PDFParse` class
- mammoth.convertToMarkdown: Deprecated per maintainer

## Open Questions

Things that couldn't be fully resolved:

1. **Office.js Track Changes API**
   - What we know: Word Add-in can read document via Office.js
   - What's unclear: Whether track changes are automatically accepted in Office.js text extraction or if explicit handling needed
   - Recommendation: Test with track-changes document; likely mammoth behavior applies (extracts accepted text)

2. **Multi-language Detection**
   - What we know: CONTEXT.md says "Block non-English documents with clear message"
   - What's unclear: Best library for language detection (franc? cld3?)
   - Recommendation: Use simple heuristic first (character script detection), add library if needed

3. **Scanned Document Heuristics**
   - What we know: Need to detect < 100 chars for OCR routing
   - What's unclear: Optimal threshold varies by document size
   - Recommendation: Use ratio (chars/filesize) in addition to absolute minimum

## Sources

### Primary (HIGH confidence)
- Context7 `/mehmet-kozan/pdf-parse` - getText API, exception handling, destroy pattern
- Context7 `/mwilliamson/mammoth.js` - extractRawText API, messages handling
- Context7 `/websites/learn_microsoft_en-us_office_dev_add-ins` - Word.js paragraph API
- `/Users/medelman/GitHub/medelman17/vibedocs/lib/document-processing.ts` - Existing extraction code

### Secondary (MEDIUM confidence)
- [UAX #15: Unicode Normalization](https://unicode.org/reports/tr15/) - NFC normalization specification
- [Strapi PDF Libraries](https://strapi.io/blog/7-best-javascript-pdf-parsing-libraries-nodejs-2025) - Library comparison
- [Nanonets Document Parsing](https://nanonets.com/blog/document-parsing/) - Structure detection patterns

### Tertiary (LOW confidence)
- [LlamaIndex PDF Parsing](https://www.llamaindex.ai/blog/beyond-ocr-how-llms-are-revolutionizing-pdf-parsing) - LLM-based parsing trends (no specific code patterns verified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries already installed and documented in CLAUDE.md
- Architecture: HIGH - Extends existing patterns, verified with Context7
- Pitfalls: HIGH - Documented in project PITFALLS.md and verified against docs

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable domain, libraries mature)
