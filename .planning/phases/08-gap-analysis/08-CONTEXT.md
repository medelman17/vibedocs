# Phase 8: Gap Analysis - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Identify missing CUAD categories from an NDA, explain their importance, and suggest recommended language. Uses existing classification results (Phase 6) and Bonterms/CommonAccord templates. Does not add new classification capabilities or modify the analysis pipeline orchestration (Phase 9).

</domain>

<decisions>
## Implementation Decisions

### Gap detection logic
- Claude's Discretion: Detection method (binary presence vs. confidence threshold) — pick what works best with existing classifier output
- Two-tier gap status: "Missing" (category completely absent) vs. "Incomplete" (present but weak/partial coverage)
- Claude's Discretion: Whether to check all 41 CUAD categories or filter to NDA-relevant subset — pick what reduces noise while maintaining coverage
- Classification results only — no additional LLM verification pass to confirm gaps. Trust the classifier output.

### Severity & prioritization
- Both Bonterms baseline comparison AND LLM-assessed importance combined: Bonterms presence sets the severity tier, LLM provides the explanation for why it matters
- Claude's Discretion: Number of severity tiers (2 or 3) — determine based on what works best with Bonterms data
- Claude's Discretion: Gap ordering (by severity vs. by category type) — determine the most useful presentation
- Claude's Discretion: Whether perspective toggle (disclosing/receiving party from Phase 7) affects gap severity — determine based on implementation complexity

### Recommended language
- Template with LLM adaptation: Start from Bonterms/CommonAccord template text, then LLM adapts to fit the NDA's style and context
- Always cite source template (e.g., "Based on Bonterms NDA §X.Y" or "Adapted from CommonAccord")
- Full clause draft per gap — complete, insertable clause text (1-3 paragraphs), not just bullet points
- Match NDA style: LLM reads existing clauses and adapts suggested language to match formality level, defined terms, and structure

### Report presentation
- Gaps tab in existing analysis view (alongside classification and risk tabs)
- Claude's Discretion: Individual gap display format (expandable cards vs. full detail list) — follow existing UI patterns
- Coverage summary at top: overall coverage percentage and gap breakdown (e.g., "Coverage: 28/41 categories, 3 critical gaps")
- Both copy-to-clipboard per gap AND full export option for all gaps as document

### Claude's Discretion
- Gap detection threshold method
- CUAD category filtering (all 41 vs. NDA-relevant subset)
- Severity tier count and ordering
- Perspective-aware gap severity
- Individual gap card UI pattern

</decisions>

<specifics>
## Specific Ideas

- Coverage score at top gives quick at-a-glance assessment before drilling into individual gaps
- Recommended language should feel like it belongs in the NDA — not boilerplate that looks pasted in
- Source attribution builds trust: user can verify suggestions against Bonterms/CommonAccord originals
- Two-tier gap status (Missing vs. Incomplete) gives more nuance than binary present/absent

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-gap-analysis*
*Context gathered: 2026-02-05*
