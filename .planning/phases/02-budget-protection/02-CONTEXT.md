# Phase 2: Budget Protection - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Prevent runaway costs by enforcing limits BEFORE and DURING analysis. Document size caps at upload, token budget enforcement after parsing, and cost tracking for analytics. Users only see messaging when there's a problem — no proactive cost display.

</domain>

<decisions>
## Implementation Decisions

### Estimation Approach
- Users DO NOT see cost estimates proactively — internal enforcement only
- Estimate tokens AFTER parsing (accurate count, not heuristic)
- Track per-analysis: estimated tokens, actual tokens, and cost in analysis record
- Build aggregated dashboard in future phase (not now)

### Upload Limits
- Hard limits at upload: 50 pages / 10MB
- Cannot override — hard block in MVP
- Quick size check happens before storing document
- Global limits (same for all tenants)

### Token Budget
- Post-parse limit: ~200K tokens per analysis
- If document exceeds token budget after parsing: analyze partial, truncate at section boundaries
- No soft warnings — either it passes or it gets truncated

### Rejection Behavior
- Two-stage enforcement: quick size check at upload, token check after parsing
- Upload rejection: clear error message (Claude's discretion on tone)
- Token budget exceeded: proceed with partial analysis, truncate at legal section breaks
- Truncation warning in analysis results

### Cost Tracking
- Track tokens per-stage internally (Claude determines appropriate granularity)
- Usage hidden from regular users
- Admin-only API endpoint for usage queries
- API supports both per-analysis breakdown and aggregate by time range

### Claude's Discretion
- Error message tone for rejections
- Token tracking granularity (total vs per-stage breakdown)
- Tokenizer choice for estimation
- Whether to include Voyage AI costs in tracking

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Key principle: users should never be surprised by a failed analysis due to document size. Fail fast at upload when possible, gracefully truncate when not.

</specifics>

<deferred>
## Deferred Ideas

- Admin usage dashboard — future phase
- Per-organization custom limits — not planned
- User-visible cost estimates — intentionally excluded

</deferred>

---

*Phase: 02-budget-protection*
*Context gathered: 2026-02-04*
