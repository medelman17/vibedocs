# Phase 6: CUAD Classification - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Classify document chunks against the CUAD 41-category taxonomy with confidence scores. Each chunk gets category labels, and a document-level clause list aggregates all classifications. Coverage summary and gap identification are Phase 8 (Gap Analysis).

</domain>

<decisions>
## Implementation Decisions

### Multi-label handling
- Claude's discretion on primary/secondary vs flat list approach
- Claude's discretion on max categories per chunk
- Document-level aggregation: list all instances of each category (every chunk that matches, not just highest confidence)
- Chunks matching no category above threshold are labeled "Uncategorized" (explicitly visible, not hidden)

### Confidence thresholds
- Claude's discretion on the exact threshold for flagging low-confidence classifications (roadmap suggests 0.7, researcher should validate)
- Claude's discretion on flagging UI pattern (inline badge, separate section, or both)
- Claude's discretion on whether users can override classifications (view-only is acceptable for this phase)
- Claude's discretion on minimum confidence floor below which classifications are dropped

### Classification output
- Claude's discretion on whether to include a brief rationale per classification or just label + confidence
- Document-level clause list supports both views: grouped by CUAD category AND document order, with toggle
- Classification results stored in a **separate table** (not on chunk records) — supports multi-label cleanly
- No coverage summary in this phase — per-chunk results only (gap analysis handles coverage in Phase 8)

### RAG retrieval strategy
- Claude's discretion on two-stage (embed → narrow → classify) vs full taxonomy approach
- Use **both CUAD and ContractNLI** reference examples for classification context
- Claude's discretion on number of retrieved examples per chunk
- Claude's discretion on caching/deduplication of classification results
- Claude's discretion on individual vs batch classification calls
- Include 1-2 surrounding chunks as context window when classifying (not isolated)
- Claude's discretion on whether section path (headings) are included in classification prompt

</decisions>

<specifics>
## Specific Ideas

- User wants both "grouped by category" and "document order" views for the clause list, with a toggle to switch
- Surrounding chunk context (1-2 neighbors) should be available to help with boundary-spanning clauses
- ContractNLI examples complement CUAD for richer classification context
- Uncategorized chunks should be explicitly visible — don't hide anything from the user

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-cuad-classification*
*Context gathered: 2026-02-05*
