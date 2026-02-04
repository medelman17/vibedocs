# Phase 3: Document Extraction - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract raw text from PDF and DOCX documents with structure preserved. Support Word Add-in raw text input. Handle extraction failures with clear error messages. Exhibits, schedules, and signature blocks are excluded from extraction scope.

</domain>

<decisions>
## Implementation Decisions

### Structure Preservation
- Claude decides structure element detail (headings, tables, lists) based on legal document practicality
- Claude decides section hierarchy representation (markdown vs path labels)
- Use LLM to detect legal structure when formatting cues are ambiguous
- Claude decides definitions section handling (key-value vs prose)
- Claude decides page number/header/footer handling
- Strip signature blocks and execution pages entirely
- Exclude exhibits and schedules from extraction scope (main agreement body only)
- Claude decides amendment handling based on document structure
- Track start/end character positions for each section (enables UI highlighting in Phase 11)
- Linearize PDF layout completely (single-column, discard visual layout)
- UTF-8 encoding with NFC unicode normalization
- Detect and flag redacted text (black bars, [REDACTED] markers)
- Claude decides embedded image detection in DOCX
- Accept all track changes when extracting DOCX (final text only)
- Claude decides cross-reference handling
- Claude decides footnote handling

### Failure Handling
- Password-protected/encrypted PDFs: Clear error, no retry ("Please upload an unprotected version")
- Very little text extracted (<100 chars): Auto-route to OCR (Phase 4)
- Corrupted files: Generic error ("Could not process. Try re-uploading or different format")
- Partial extraction failure: Claude decides all-or-nothing vs extract available

### Word Add-in Input
- Research Office.js capabilities for OOXML/HTML markup or pre-structured JSON (researcher task)
- Pass full context: filename, document properties (title, author, dates), selection info, Word version
- Claude decides selection support (full doc only vs partial)
- Run structure detection on Add-in text (same processing as file uploads for consistency)
- Support read-only and protected view documents
- Claude decides unsaved changes warning
- Claude decides desktop + Online support based on Office.js capabilities
- Claude decides error handling approach (in-pane vs web link)
- Claude decides storage path (Blob vs direct DB)
- Claude decides size limits based on platform constraints
- Compute content hash for deduplication (check for existing analysis)
- Show summary results inline in Add-in sidebar, detailed view opens web

### Extraction Quality
- Claude decides confidence scoring approach
- Claude decides minimum quality thresholds
- Claude decides garbled text handling
- Log detailed quality metrics for every extraction (page count, section count, confidence, warnings)
- Claude decides manual edit/preview capability
- Claude decides legal formatting normalization
- Scanned documents: Notify "Document requires OCR processing (may take longer)" then proceed automatically
- Block non-English documents with clear message (analysis optimized for English)
- Accept any legal document type (no NDA-specific detection) — CUAD taxonomy handles various contracts
- Claude decides multi-agreement document handling
- Claude decides legal citation preservation
- Use LLM to intelligently separate NDA content from cover letters/mixed content
- Extract party names (disclosing/receiving) from document for metadata
- No effective date extraction (leave to downstream)

### Claude's Discretion
- Structure element detail level (headings only vs full structure with tables/lists)
- Section hierarchy format (markdown headings vs path labels)
- Definitions section format (key-value pairs vs prose)
- Page number/header/footer handling
- Amendment handling
- Embedded image detection in DOCX
- Footnote handling
- Cross-reference handling
- Partial extraction failure behavior
- Word Add-in: selection support, unsaved changes warning, platform support, error display, storage path, size limits
- Confidence scoring and quality thresholds
- Garbled text handling and fallback strategies
- Manual preview/edit capability
- Legal formatting normalization
- Multi-agreement document handling
- Legal citation preservation

</decisions>

<specifics>
## Specific Ideas

- "Route to OCR automatically" — seamless handling when text extraction fails
- "Track positions" — character offsets enable click-to-highlight in document viewer
- "Intelligent separation" — LLM identifies NDA portion in mixed-content documents
- "Inline sidebar results" — Word Add-in shows summary without leaving Word

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-document-extraction*
*Context gathered: 2026-02-04*
