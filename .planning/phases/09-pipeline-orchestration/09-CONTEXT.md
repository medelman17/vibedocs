# Phase 9: Pipeline Orchestration - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Wrap all analysis agents (parser, classifier, risk scorer, gap analyst) into a single durable Inngest pipeline with progress events, rate limiting, cancellation support, and developer testing tools. Individual agents already exist from phases 1-8 — this phase weaves them into a resilient end-to-end flow with observability.

</domain>

<decisions>
## Implementation Decisions

### Pipeline Resumability
- Keep all prior step results on failure — earlier steps' data stays in DB
- Pipeline resumes from the failed step, not from scratch
- Cancelled analyses preserve partial results with clear "partial" indication
- User can choose to resume a cancelled/failed analysis OR start fresh (both options available)
- New analysis from scratch creates a fresh record; resume reuses existing

### Claude's Discretion: Retry & Timeout Strategy
- Auto-retry vs manual re-trigger per error type (retriable vs permanent)
- Retry analysis record handling (reuse existing vs new record)
- Per-step and pipeline-level timeout values
- Retry backoff curves and attempt limits

### Progress Granularity
- Stage-level AND chunk-level progress: "Scoring clause 7 of 15..."
- Dual delivery: Inngest events for real-time + DB status column as source of truth
- DB status supports page reload/reconnection (shows last known progress state)
- Queue position visible to users when rate limits cause delays

### Claude's Discretion: Progress Details
- Whether to show estimated time remaining (based on feasibility of reliable estimates)
- Exact progress persistence format in DB (stage + sub-step granularity)
- Progress display on page reload (granular vs generic "in progress")

### Cancellation Behavior
- Partial results shown after cancellation (whatever completed is displayed)
- After cancellation, user can resume from where it stopped OR start fresh analysis
- Cancellation responsiveness and UX pattern (confirmation dialog, etc.) — Claude's discretion

### Rate Limit Strategy
- 429 responses handled with automatic exponential backoff retry (transparent to user)
- Queue position shown to users when waiting for rate limit capacity
- Sequential vs parallel batching within rate limits — Claude's discretion based on headroom
- Tenant concurrency limits — Claude's discretion for reasonable defaults

### Claude's Discretion: Rate Limit Details
- Throughput vs conservative buffer (staying below API limits)
- Concurrent analysis handling (FIFO queue vs round-robin)
- Pre-flight estimation of API call count and slow-document warnings
- Batch parallelism strategy for chunked operations

### Ad Hoc Testing & Debug
- Full pipeline trigger from UI (upload doc, run pipeline, see results)
- Dev/debug panel showing step timings, status, AND raw AI input/output
- Built-in sample NDAs (2-3: short, medium, complex) for one-click testing
- Manual individual step execution for debugging (run just parser, just classifier, etc.)
- Availability (dev-only vs admin-in-prod) — Claude's discretion per capability

</decisions>

<specifics>
## Specific Ideas

- Debug panel should feel like "Inngest dashboard embedded in the app" — step status, timings, raw AI responses
- Sample NDAs should cover the range: short simple NDA, medium standard NDA, complex multi-party NDA
- Queue position display: "Your analysis is queued (position 3)" when waiting

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-pipeline-orchestration*
*Context gathered: 2026-02-05*
