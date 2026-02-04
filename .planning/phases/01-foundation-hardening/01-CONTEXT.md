# Phase 1: Foundation Hardening - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate all agents to AI SDK 6 patterns and add validation gates that halt the pipeline on critical failures. Ensures idempotent database writes for safe retries. This is infrastructure work—no user-facing features, but validation failures become user-visible errors.

</domain>

<decisions>
## Implementation Decisions

### Validation Strictness
- **0 clauses = always halt** — If clause extraction returns zero results, pipeline stops. Never proceed with an empty result.
- **Fixed system-wide rules** — Validation gates are not configurable per-tenant. Same rules for everyone.
- **Low-confidence handling** — Claude's discretion on how to handle low-confidence classifications (flag but don't block is likely, but implementation decides).
- **Garbled text detection** — Claude's discretion on whether to add heuristics or let downstream stages fail naturally.

### Error Messaging
- **Plain language tone** — User-facing errors should be friendly and non-technical: "We couldn't find any clauses in this document"
- **Actionable guidance** — Error messages should suggest fixes when possible: "Try uploading a different file format" or "Check that the PDF isn't encrypted"
- **Stage visibility** — When pipeline halts, show which stage failed: "Analysis stopped at clause extraction"
- **Logging separation** — Full technical details in server logs, plain messages in UI

### Claude's Discretion
- AI SDK 6 migration approach (incremental vs all-at-once)
- Idempotency implementation patterns (upsert strategy)
- Specific validation thresholds for low-confidence scenarios
- Garbled text detection heuristics

</decisions>

<specifics>
## Specific Ideas

No specific references — open to standard approaches for AI SDK 6 migration and validation gates.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-hardening*
*Context gathered: 2026-02-04*
