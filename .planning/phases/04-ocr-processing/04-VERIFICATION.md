---
phase: 04-ocr-processing
verified: 2026-02-05T06:30:00Z
status: gaps_found
score: 3/4 must-haves verified
gaps:
  - truth: "Scanned PDFs detected automatically (not processed as empty documents)"
    status: verified
    reason: "OcrRequiredError thrown and caught, status set to pending_ocr"
  - truth: "OCR extracts readable text from scanned documents"
    status: verified
    reason: "ocrPdf function fully implemented with Tesseract.js"
  - truth: "Low-confidence OCR shows warning to user about potential accuracy impact"
    status: verified
    reason: "OcrWarning component implemented with confidence thresholds"
  - truth: "User can proceed with analysis despite OCR quality warnings"
    status: failed
    reason: "OCR pipeline never triggered - missing event emission"
    artifacts:
      - path: "inngest/functions/analyze-nda.ts"
        issue: "Sets status to pending_ocr but does not send nda/ocr.requested event"
    missing:
      - "Add step.sendEvent('trigger-ocr', { name: 'nda/ocr.requested', ... }) after setting pending_ocr status"
      - "Send event BEFORE throwing NonRetriableError so OCR function gets triggered"
---

# Phase 4: OCR Processing Verification Report

**Phase Goal:** Scanned/image-based PDFs are detected and processed with user awareness of quality limitations  
**Verified:** 2026-02-05T06:30:00Z  
**Status:** gaps_found  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Scanned PDFs detected automatically (not processed as empty documents) | ✓ VERIFIED | OcrRequiredError thrown by extraction, caught by analyze-nda.ts, status set to pending_ocr |
| 2 | OCR extracts readable text from scanned documents | ✓ VERIFIED | ocrPdf() in lib/ocr/ocr-processor.ts coordinates PDF-to-image + Tesseract, returns OcrResult with text |
| 3 | Low-confidence OCR shows warning to user about potential accuracy impact | ✓ VERIFIED | OcrWarning component in components/analysis/ocr-warning.tsx renders warnings based on confidence thresholds |
| 4 | User can proceed with analysis despite OCR quality warnings | ✗ FAILED | OCR pipeline never gets triggered - no event sent to start OCR processing |

**Score:** 3/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/ocr/types.ts` | OCR type definitions with confidence thresholds | ✓ VERIFIED | 61 lines, exports CONFIDENCE_THRESHOLD (85), CRITICAL_THRESHOLD (60), OcrResult, OcrQuality, etc. |
| `lib/ocr/pdf-to-image.ts` | PDF page to image conversion | ✓ VERIFIED | 56 lines, exports renderPdfPages() async generator with dynamic import |
| `lib/ocr/tesseract-worker.ts` | Tesseract worker lifecycle management | ✓ VERIFIED | 67 lines, exports createOcrWorker() and recognizePage() |
| `lib/ocr/ocr-processor.ts` | Main OCR entry point | ✓ VERIFIED | 103 lines, exports ocrPdf() with sequential processing, worker termination in finally |
| `lib/ocr/quality.ts` | OCR quality assessment | ✓ VERIFIED | 59 lines, exports assessOcrQuality() with threshold logic |
| `inngest/functions/ocr-document.ts` | Inngest OCR processing function | ✓ VERIFIED | 169 lines, listens for nda/ocr.requested, persists results, emits nda/analysis.ocr-complete |
| `inngest/functions/analyze-nda.ts` (analyzeNdaAfterOcr) | Post-OCR pipeline continuation | ✓ VERIFIED | 200+ lines, handles nda/analysis.ocr-complete event, uses OCR text via 'ocr' source type |
| `components/analysis/ocr-warning.tsx` | OCR quality warning UI component | ✓ VERIFIED | 97 lines, exports OcrWarning and hasOcrIssues, renders based on confidence |
| `db/schema/analyses.ts` | OCR fields on analyses table | ✓ VERIFIED | ocrText, ocrConfidence, ocrWarning, ocrCompletedAt columns added |

**All artifacts exist and are substantive.**

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `lib/ocr/ocr-processor.ts` | `lib/ocr/tesseract-worker.ts` | createOcrWorker, recognizePage | ✓ WIRED | Imports and calls both functions, worker terminated in finally |
| `lib/ocr/ocr-processor.ts` | `lib/ocr/pdf-to-image.ts` | renderPdfPages | ✓ WIRED | Imports and iterates via for-await loop |
| `inngest/functions/ocr-document.ts` | `lib/ocr/ocr-processor.ts` | ocrPdf | ✓ WIRED | Imported and called in download-and-ocr step |
| `inngest/functions/ocr-document.ts` | `lib/ocr/quality.ts` | assessOcrQuality | ✓ WIRED | Imported and called after OCR processing |
| `inngest/functions/ocr-document.ts` | `nda/analysis.ocr-complete` | step.sendEvent | ✓ WIRED | Event sent in resume-analysis step |
| `inngest/functions/analyze-nda.ts` | `nda/ocr.requested` | step.sendEvent | ✗ NOT_WIRED | **CRITICAL GAP**: Event never sent when OcrRequiredError caught |
| `inngest/functions/analyze-nda.ts` (analyzeNdaAfterOcr) | `nda/analysis.ocr-complete` | event listener | ✓ WIRED | Function registered with { event: 'nda/analysis.ocr-complete' } |

**Critical gap found:** The OCR pipeline is never triggered because `analyze-nda.ts` sets status to `pending_ocr` but does not send the `nda/ocr.requested` event.

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| OCR-01: Detect non-readable PDFs | ✓ SATISFIED | OcrRequiredError thrown by extraction validation |
| OCR-02: Apply OCR processing | ⚠️ ORPHANED | ocrPdf() implemented but never called (no trigger event) |
| OCR-03: Handle OCR quality issues | ✓ SATISFIED | assessOcrQuality() returns warnings for <85% confidence |
| OCR-04: Warn user when OCR quality is poor | ✓ SATISFIED | OcrWarning component renders based on ocrWarning field |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| inngest/functions/analyze-nda.ts | 144 | Status set to pending_ocr then throws error without triggering OCR | 🛑 Blocker | OCR pipeline never runs |
| inngest/functions/analyze-nda.ts | 160 | throw NonRetriableError after setting pending_ocr | 🛑 Blocker | Stops pipeline without continuation path |

### Human Verification Required

None - the gap is clearly identifiable via code inspection.

### Gaps Summary

**1 critical gap blocks goal achievement:**

The OCR infrastructure is fully implemented and wired internally, but the **entry point is disconnected**. When a scanned PDF is detected:

1. ✓ `OcrRequiredError` is thrown by extraction
2. ✓ Error is caught by `analyze-nda.ts` 
3. ✓ Status is set to `pending_ocr`
4. ✗ **No `nda/ocr.requested` event is sent**
5. ✗ `NonRetriableError` is thrown, stopping pipeline
6. ✗ OCR function never runs
7. ✗ Analysis never completes

**The fix:** In `inngest/functions/analyze-nda.ts`, after setting status to `pending_ocr`, send the OCR trigger event BEFORE throwing the error:

```typescript
// After persist-extraction-failure step
if (mapped.routeToOcr) {
  // Trigger OCR processing
  await step.sendEvent('trigger-ocr', {
    name: 'nda/ocr.requested',
    data: { documentId, analysisId, tenantId }
  })
}

// Then throw (OCR will pick up from pending_ocr status)
throw new NonRetriableError(mapped.userMessage)
```

This allows the OCR function to process the document asynchronously, then resume the analysis pipeline via the `nda/analysis.ocr-complete` event (which is already wired).

---

_Verified: 2026-02-05T06:30:00Z_  
_Verifier: Claude (gsd-verifier)_
