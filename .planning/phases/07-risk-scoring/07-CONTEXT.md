# Phase 7: Risk Scoring - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Assign risk levels to classified clauses with evidence-grounded explanations and verified citations. Each clause gets a risk assessment (standard/cautious/aggressive/unknown), a plain-language explanation, and references from the reference corpus. Document-level risk score aggregates clause-level results. Re-scoring with different perspectives is supported.

</domain>

<decisions>
## Implementation Decisions

### Risk Level Criteria
- Comparative approach: compare clause text against Bonterms/standard NDA baselines — deviation from market standard determines risk level
- Perspective is configurable: user can toggle between receiving party, disclosing party, and balanced/neutral
- Default perspective: balanced/neutral
- Re-score on toggle: switching perspective triggers re-scoring of all clauses (not pre-computed)
- Confidence score (0.0-1.0) accompanies each risk level — low confidence flagged for review
- Flag "atypical language" even when substance is standard — secondary indicator for unusual wording that may introduce ambiguity

### Explanation Style
- Tone: professional accessible — a VP of Sales could understand without a law degree
- Structure: risk-first — lead with the risk implication, then explain why
- Include brief negotiation suggestion for non-standard clauses: "Consider negotiating a 2-year cap on non-compete period"
- 2-3 sentences per clause explanation

### Citation & Evidence
- Expandable detail UI: clean explanation with "See evidence" toggle that reveals reference clauses
- Evidence shows: summary first, with option to expand to full reference clause text
- Each reference labeled with source (CUAD, ContractNLI, Bonterms)
- LLM outputs structured references (source ID + section) alongside explanation — enables verification pipeline
- When no reference match exists: still score with caveat ("No reference corpus match — assessment based on legal analysis only")
- Verification strictness: Claude's discretion

### Document-Level Score
- Numeric score (0-100) that maps to a label (standard/cautious/aggressive) — granular + intuitive
- Visual risk distribution: color-coded breakdown showing count per risk level (e.g., "12 standard, 5 cautious, 2 aggressive")
- Executive summary: top 3-5 riskiest clauses highlighted as key findings with brief explanations

### Claude's Discretion
- "Unknown" risk level threshold and criteria
- Whether to differentiate mutual vs unilateral NDA baselines
- When explicit vs implicit baseline comparison adds clarity in explanations
- Citation count per assessment (quality over quantity)
- Citation verification strictness (exact match vs semantic match)
- Category weighting strategy for document-level score (equal vs importance-weighted)

</decisions>

<specifics>
## Specific Ideas

- Risk-first explanation pattern: "This clause exposes you to unlimited liability..." then explain why
- Negotiation suggestions should be concrete and actionable, not generic
- Evidence detail pattern: summary → expand → full reference text (progressive disclosure)
- Source labeling on references adds credibility: users can see "Bonterms Standard NDA" vs "CUAD Example"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-risk-scoring*
*Context gathered: 2026-02-05*
