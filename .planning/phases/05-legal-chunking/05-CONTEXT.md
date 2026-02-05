# Phase 5: Legal Chunking - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Split extracted text into legal-aware chunks with Voyage AI embeddings stored in tenant database. Chunks serve as the retrieval unit for downstream classification (Phase 6), risk scoring (Phase 7), gap analysis (Phase 8), and RAG chat. Document rendering (Phase 11) uses chunk positions for highlighting. This phase does NOT include classification, scoring, or UI display of chunks.

</domain>

<decisions>
## Implementation Decisions

### Chunk Boundaries
- Definitions sections: each definition becomes its own standalone chunk (retrievable independently when clauses reference the term)
- Cross-references: annotate in metadata (e.g., `references: ["3.1", "7.4"]`) so downstream agents know about dependencies
- Reuse Phase 3 structure detection first; fall back to LLM analysis only when structure is insufficient
- Lettered sub-clauses (a), (b), (c): each lettered item becomes its own chunk for granular obligation analysis
- Chunks maintain sequential ordering (sequence number) so the original document can be reconstructed
- Store character-level positions (start/end offsets) into the original extracted text for Phase 11 highlighting
- Persist a "chunk map" summary per document showing all chunks and their section paths (for debugging and admin view)

### Chunk Sizing
- Target token limit: Claude's discretion based on Voyage AI voyage-law-2 research (roadmap suggests 512)
- Tokenizer: match Voyage AI's tokenizer for accurate size measurement (not gpt-tokenizer)
- Overlap strategy: Claude's discretion based on embedding quality research
- Oversized clause handling: Claude's discretion
- Short chunk merging: Claude's discretion
- Persist chunk statistics per document (total chunks, avg size, size distribution) for monitoring

### Embedding Strategy
- Metadata prefix for embeddings: Claude's discretion based on Voyage AI research
- Embedding generation: batch after all chunks are created (Voyage AI batch of 128)
- Storage: tenant database with RLS enforcement (consistent with existing architecture)
- Re-analysis: Claude's discretion on replace vs version (follow existing analysis patterns)

### Quality & Edge Cases
- Low chunk count threshold: if chunks/page ratio too low, trigger LLM-based re-chunking
- Non-standard formats: Claude's discretion on cost vs quality balance
- User-facing: show chunk/clause count during analysis progress
- Complete failure: Claude's discretion (follow existing validation gate patterns from Phase 1)

### Claude's Discretion
- Optimal chunk token size (research Voyage AI voyage-law-2 recommendations)
- Whether to prepend parent clause intro text to child chunks (embedding quality tradeoff)
- Multi-party NDA party-specific sub-clause handling
- Signature blocks, boilerplate, and exhibits treatment
- Overlap between chunks
- Handling run-on clauses (multi-obligation paragraphs)
- Exception list chunking strategy (keep together vs split)
- OCR text chunking adjustments (looser boundaries or same treatment)
- Recital/whereas clause treatment
- Unstructured document fallback strategy (LLM, sentence-based, or paragraph-based)
- Chunk versioning on re-analysis

</decisions>

<specifics>
## Specific Ideas

- User wants definitions as standalone retrievable chunks for cross-referencing
- Each lettered sub-clause (a), (b), (c) should be its own chunk for granular analysis
- Cross-references annotated in metadata, not resolved inline
- Character positions stored for document viewer highlighting (Phase 11)
- Chunk map + statistics persisted for debugging and admin observability
- Clause count shown to user during analysis progress for transparency
- Batch embedding after chunking complete (not streaming)
- Research additional tricky bits in legal chunking space beyond what was discussed

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-legal-chunking*
*Context gathered: 2026-02-04*
