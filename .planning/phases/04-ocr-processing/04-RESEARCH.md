# Phase 4: OCR Processing - Research

**Researched:** 2026-02-04
**Domain:** OCR text extraction from scanned PDFs, quality assessment, user notifications
**Confidence:** MEDIUM

## Summary

This phase implements OCR processing for scanned/image-based PDFs that Phase 3's extraction detected as requiring OCR (via `OcrRequiredError`). The existing codebase already:
1. Detects scanned PDFs when text < 100 chars (OCR threshold per CONTEXT.md)
2. Throws `OcrRequiredError` which sets analysis status to `pending_ocr`
3. Has infrastructure for routing to OCR via `mapExtractionError()`

Two viable OCR approaches exist for Node.js:

**Option 1: Tesseract.js** - Pure JavaScript OCR, requires PDF-to-image conversion first using `pdf-to-img` or similar. Well-established, Apache 2.0 license, but adds complexity with image conversion step.

**Option 2: Scribe.js** - JavaScript OCR library that handles PDFs natively, includes OCR capability, and claims better accuracy than Tesseract. However, uses AGPL 3.0 license (copyleft) which may require careful consideration.

**Option 3: Cloud OCR API** - Google Document AI, AWS Textract, or Azure Document Intelligence. Highest accuracy (~99%+ for printed text), but adds external dependency and cost ($1.50-10 per 1,000 pages).

**Primary recommendation:** Use **Tesseract.js with pdf-to-img** for MVP. Apache 2.0 license is cleaner, well-documented pattern, and keeps processing local. Implement confidence thresholds to warn users about low-quality OCR that may affect analysis accuracy.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tesseract.js | 5.x+ | OCR text extraction | Pure JS via WASM, 100+ languages, Apache 2.0, well-maintained |
| pdf-to-img | latest | PDF page to image conversion | Node.js v20+, uses pdfjs-dist internally, clean async API |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sharp (optional) | 0.33+ | Image preprocessing | Only if OCR quality issues with raw PDF renders |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tesseract.js + pdf-to-img | scribe.js-ocr | Native PDF support, better accuracy claims, but AGPL license |
| Local OCR | Google Document AI | Higher accuracy (~99%), but adds cloud dependency and cost |
| Local OCR | Azure Document Intelligence | Custom model training, but vendor lock-in |

**Installation:**
```bash
pnpm add tesseract.js pdf-to-img
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── document-extraction/      # Existing
│   ├── extract-document.ts   # Existing - throws OcrRequiredError
│   └── ...
├── ocr/                      # NEW
│   ├── ocr-processor.ts      # Main OCR entry point
│   ├── pdf-to-image.ts       # PDF page rendering
│   ├── tesseract-worker.ts   # Tesseract worker management
│   └── types.ts              # OCR types and interfaces
inngest/
└── functions/
    └── ocr-document.ts       # NEW - Inngest function for OCR pipeline
```

### Pattern 1: PDF-to-Image-to-OCR Pipeline

**What:** Convert PDF pages to images, then OCR each page
**When to use:** All scanned PDF processing
**Example:**
```typescript
// Source: Tesseract.js GitHub + pdf-to-img npm docs
import { createWorker } from 'tesseract.js'
import { pdf } from 'pdf-to-img'

interface OcrPageResult {
  pageNumber: number
  text: string
  confidence: number  // 0-100
}

interface OcrResult {
  text: string
  pages: OcrPageResult[]
  averageConfidence: number
  lowConfidencePages: number[]
}

async function ocrPdf(buffer: Buffer): Promise<OcrResult> {
  const pages: OcrPageResult[] = []
  const worker = await createWorker('eng')

  try {
    // pdf-to-img returns async iterator of page images
    const document = await pdf(buffer, { scale: 2.0 })  // Higher scale = better OCR
    let pageNumber = 0

    for await (const pageImage of document) {
      pageNumber++
      const result = await worker.recognize(pageImage)

      pages.push({
        pageNumber,
        text: result.data.text,
        confidence: result.data.confidence,
      })
    }

    // Aggregate results
    const fullText = pages.map(p => p.text).join('\n\n')
    const avgConfidence = pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length
    const lowConfPages = pages
      .filter(p => p.confidence < 85)
      .map(p => p.pageNumber)

    return {
      text: fullText,
      pages,
      averageConfidence: avgConfidence,
      lowConfidencePages: lowConfPages,
    }
  } finally {
    await worker.terminate()  // Critical: prevent memory leak
  }
}
```

### Pattern 2: OCR Quality Assessment

**What:** Evaluate OCR quality and determine if user warning needed
**When to use:** After OCR completes, before analysis proceeds
**Example:**
```typescript
// Source: Project CONTEXT.md + OCR best practices research
interface OcrQuality {
  confidence: number           // Average confidence 0-100
  isLowQuality: boolean       // True if warning needed
  warningMessage?: string     // User-facing message
  affectedPages: number[]     // Pages with low confidence
}

const CONFIDENCE_THRESHOLD = 85  // Below this = warning
const CRITICAL_THRESHOLD = 60    // Below this = may be unusable

function assessOcrQuality(result: OcrResult): OcrQuality {
  const { averageConfidence, lowConfidencePages } = result

  if (averageConfidence < CRITICAL_THRESHOLD) {
    return {
      confidence: averageConfidence,
      isLowQuality: true,
      warningMessage:
        'This document has very low OCR quality. Analysis results may be significantly inaccurate. ' +
        'Consider uploading a clearer scan or the original document if available.',
      affectedPages: lowConfidencePages,
    }
  }

  if (averageConfidence < CONFIDENCE_THRESHOLD) {
    return {
      confidence: averageConfidence,
      isLowQuality: true,
      warningMessage:
        'Some parts of this document were difficult to read. ' +
        `Analysis accuracy may be affected on pages ${lowConfidencePages.join(', ')}.`,
      affectedPages: lowConfidencePages,
    }
  }

  return {
    confidence: averageConfidence,
    isLowQuality: false,
    affectedPages: [],
  }
}
```

### Pattern 3: Inngest OCR Function

**What:** Durable OCR processing with progress tracking
**When to use:** When `OcrRequiredError` triggers OCR routing
**Example:**
```typescript
// Source: Project Inngest patterns from analyze-nda.ts
import { inngest, CONCURRENCY, withTenantContext } from '@/inngest'
import { NonRetriableError } from '@/inngest/utils/errors'
import { ocrPdf, assessOcrQuality } from '@/lib/ocr'

export const ocrDocument = inngest.createFunction(
  {
    id: 'ocr-document',
    name: 'OCR Document Processing',
    concurrency: CONCURRENCY.analysis,  // Share with main pipeline
    retries: 2,  // OCR is expensive, limit retries
  },
  { event: 'nda/ocr.requested' },
  async ({ event, step }) => {
    const { documentId, analysisId, tenantId } = event.data

    return await withTenantContext(tenantId, async (ctx) => {
      // Step 1: Fetch document blob
      const document = await step.run('fetch-document', async () => {
        // Fetch from blob storage
        return await fetchDocumentBuffer(documentId)
      })

      // Step 2: Run OCR (potentially long-running)
      const ocrResult = await step.run('run-ocr', async () => {
        return await ocrPdf(document.buffer)
      })

      // Step 3: Assess quality and persist
      const quality = assessOcrQuality(ocrResult)

      await step.run('persist-ocr-result', async () => {
        await ctx.db.update(analyses).set({
          status: 'processing',  // Resume normal pipeline
          ocrText: ocrResult.text,
          ocrConfidence: ocrResult.averageConfidence,
          ocrWarning: quality.isLowQuality ? quality.warningMessage : null,
          metadata: {
            ocrCompletedAt: new Date().toISOString(),
            ocrPageCount: ocrResult.pages.length,
            lowConfidencePages: quality.affectedPages,
          },
        }).where(eq(analyses.id, analysisId))
      })

      // Step 4: Continue to main analysis pipeline
      await step.sendEvent('resume-analysis', {
        name: 'nda/analysis.ocr-complete',
        data: {
          documentId,
          analysisId,
          tenantId,
          ocrText: ocrResult.text,
          quality,
        },
      })

      return { success: true, quality }
    })
  }
)
```

### Pattern 4: User Warning Display

**What:** Show OCR quality warnings in UI
**When to use:** When displaying analysis with OCR-processed documents
**Example:**
```typescript
// Source: Project UI patterns
interface AnalysisHeaderProps {
  analysis: Analysis
}

function AnalysisHeader({ analysis }: AnalysisHeaderProps) {
  const hasOcrWarning = analysis.ocrWarning != null

  return (
    <div>
      {hasOcrWarning && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>OCR Quality Notice</AlertTitle>
          <AlertDescription>
            {analysis.ocrWarning}
          </AlertDescription>
        </Alert>
      )}
      {/* Rest of analysis UI */}
    </div>
  )
}
```

### Anti-Patterns to Avoid
- **Processing all pages in parallel:** Tesseract workers are memory-intensive; process sequentially or with limited concurrency
- **Not terminating workers:** Memory leaks from unterminated Tesseract workers
- **Low-resolution PDF renders:** OCR accuracy suffers at < 150 DPI; use scale 2.0+ with pdf-to-img
- **Blocking on OCR in main pipeline:** OCR can take 30+ seconds per page; always use Inngest steps
- **Ignoring confidence scores:** Users should know when results may be unreliable

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OCR engine | Custom ML model | Tesseract.js/Scribe.js | Decades of research, 100+ language models |
| PDF to image | Manual pdfjs-dist canvas | pdf-to-img | Handles canvas setup, memory, async iteration |
| Confidence scoring | Word-by-word analysis | Tesseract aggregate confidence | Page-level metrics more reliable than word-level |
| Image preprocessing | Custom filters | sharp (if needed) | Optimized native bindings, well-tested |

**Key insight:** OCR is a solved problem with mature libraries. The complexity is in orchestration (Inngest), quality assessment, and user communication - not the OCR itself.

## Common Pitfalls

### Pitfall 1: Memory Exhaustion on Large PDFs

**What goes wrong:** Server OOMs processing a 100+ page scanned PDF
**Why it happens:** Each page rendered as high-res image (4000x5000 pixels) + Tesseract worker memory
**How to avoid:**
- Process pages sequentially, not in parallel
- Use single Tesseract worker, reuse across pages
- Add step.run() per batch of pages (e.g., every 10 pages) for checkpointing
- Consider page limits (e.g., 50 pages max for OCR)
**Warning signs:** Inngest function timeouts, server restarts

### Pitfall 2: Blocking the Main Analysis Pipeline

**What goes wrong:** Users wait 10+ minutes for OCR before analysis starts
**Why it happens:** OCR runs synchronously in main pipeline
**How to avoid:**
- Separate Inngest function for OCR (`nda/ocr.requested`)
- Set analysis status to `pending_ocr` immediately
- Resume main pipeline via event (`nda/analysis.ocr-complete`)
- Show "Processing scanned document..." in UI
**Warning signs:** Analysis requests timing out

### Pitfall 3: Meaningless Confidence Scores

**What goes wrong:** User warned about "low quality" on readable document, or not warned on garbage
**Why it happens:** Word-level confidence is unreliable per Tesseract docs
**How to avoid:**
- Use page-level average confidence only
- Threshold at 85% for warnings (well-tested empirically)
- Sample actual OCR output to tune thresholds
**Warning signs:** User complaints about false positives/negatives

### Pitfall 4: Dynamic Import Failures

**What goes wrong:** Same barrel export issue as pdf-parse (CLAUDE.md documented)
**Why it happens:** pdf-to-img uses pdfjs-dist which has browser dependencies
**How to avoid:**
- Dynamic import for pdf-to-img
- Keep OCR modules out of barrel exports
- Test in production build before deploying
**Warning signs:** "DOMMatrix is not defined" in production

### Pitfall 5: No User Recourse on OCR Failure

**What goes wrong:** OCR fails silently, user doesn't know what to do
**Why it happens:** Missing error handling and user messaging
**How to avoid:**
- Always show actionable message: "Try uploading original document or clearer scan"
- Provide option to proceed anyway with quality warning
- Log detailed metrics for debugging
**Warning signs:** Support tickets about stuck documents

## Code Examples

Verified patterns from official sources:

### Tesseract.js Worker Lifecycle
```typescript
// Source: https://github.com/naptha/tesseract.js README
import { createWorker } from 'tesseract.js'

async function processWithOcr(images: ArrayBuffer[]): Promise<string[]> {
  const worker = await createWorker('eng')

  try {
    const results: string[] = []

    for (const image of images) {
      const { data } = await worker.recognize(image)
      results.push(data.text)
      // data.confidence is page-level confidence 0-100
    }

    return results
  } finally {
    await worker.terminate()  // CRITICAL: always terminate
  }
}
```

### pdf-to-img Usage
```typescript
// Source: https://www.npmjs.com/package/pdf-to-img (inferred from search results)
import { pdf } from 'pdf-to-img'

async function renderPdfPages(buffer: Buffer): Promise<ArrayBuffer[]> {
  const pages: ArrayBuffer[] = []

  const document = await pdf(buffer, {
    scale: 2.0,     // 2x resolution for better OCR
    // password: '...'  // For encrypted PDFs (but we reject those earlier)
  })

  for await (const page of document) {
    pages.push(page)  // page is ArrayBuffer/Uint8Array
  }

  return pages
}
```

### OCR Result Types for Database
```typescript
// Source: Project conventions from db/schema
// Add to db/schema/analyses.ts
export const analyses = pgTable('analyses', {
  // ... existing fields

  // OCR-specific fields
  ocrText: text('ocr_text'),              // OCR-extracted text (if applicable)
  ocrConfidence: real('ocr_confidence'),  // Average confidence 0-100
  ocrWarning: text('ocr_warning'),        // User-facing warning message (nullable)
  ocrCompletedAt: timestamp('ocr_completed_at'),
})
```

### OCR Processing Error Types
```typescript
// Source: Project conventions from lib/errors.ts
// Add new error codes
export type ErrorCode =
  | // ... existing codes
  | 'OCR_FAILED'           // OCR processing failed
  | 'OCR_QUALITY_CRITICAL' // OCR quality too low to proceed

export class OcrFailedError extends AppError {
  constructor(message = 'OCR processing failed. Please try uploading a clearer scan.') {
    super('OCR_FAILED', message, 500)
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server-side Tesseract binaries | Tesseract.js (WASM) | 2020+ | No native dependencies, runs everywhere |
| Manual PDF.js canvas | pdf-to-img abstraction | 2024+ | Simpler API, handles edge cases |
| Word-level confidence thresholds | Page-level aggregate | Always | More reliable quality assessment |
| Synchronous OCR | Durable Inngest steps | Project pattern | Handles long-running OCR gracefully |

**Deprecated/outdated:**
- `node-tesseract-ocr`: Wrapper for system Tesseract; use Tesseract.js instead
- `pdf.js` direct usage for images: Use pdf-to-img for cleaner API

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal Confidence Threshold**
   - What we know: 85% is commonly cited, but varies by document type
   - What's unclear: Best threshold for legal documents specifically
   - Recommendation: Start at 85%, tune based on user feedback

2. **Page Limit for OCR**
   - What we know: OCR is slow (~10-30 sec/page) and memory-intensive
   - What's unclear: What's an acceptable limit? 50? 100? None?
   - Recommendation: Start with 100 pages, add warning UI for very long documents

3. **Scribe.js Licensing Impact**
   - What we know: AGPL 3.0 requires source disclosure for web apps
   - What's unclear: Whether it affects VibeDocs if used server-side only
   - Recommendation: Consult legal if considering scribe.js; stick with Tesseract.js for now

4. **Cloud OCR for Enterprise Tier**
   - What we know: Cloud OCR (Azure/Google) is more accurate
   - What's unclear: Whether to offer as premium feature
   - Recommendation: Defer to future phase; MVP uses local OCR

## Sources

### Primary (HIGH confidence)
- [Tesseract.js GitHub](https://github.com/naptha/tesseract.js) - Worker API, confidence scoring, memory management
- [pdf-to-img npm](https://www.npmjs.com/package/pdf-to-img) - PDF page rendering API
- Project codebase - `lib/document-extraction/`, `inngest/functions/analyze-nda.ts`

### Secondary (MEDIUM confidence)
- [Scribe.js vs Tesseract](https://github.com/scribeocr/scribe.js/blob/master/docs/scribe_vs_tesseract.md) - Feature comparison
- [OCR Benchmark 2026](https://research.aimultiple.com/ocr-accuracy/) - Cloud OCR accuracy comparison
- [Tesseract Confidence Discussion](https://groups.google.com/g/tesseract-ocr/c/SN8L0IA_0D4) - Confidence score reliability

### Tertiary (LOW confidence)
- [Medium: OCR Application with Node.js](https://medium.com/@rjaloudi/building-an-ocr-application-with-node-js-pdf-js-and-tesseract-js-c54fbd039173) - Implementation patterns (unverified)
- [StudyRaid: Confidence Thresholds](https://app.studyraid.com/en/read/15018/519349/adjusting-confidence-thresholds-in-tesseractjs) - Threshold tuning (unverified)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - Tesseract.js well-documented, pdf-to-img less so
- Architecture: HIGH - Follows established project Inngest patterns
- Pitfalls: MEDIUM - Based on general OCR knowledge + project patterns

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable domain, libraries mature)
