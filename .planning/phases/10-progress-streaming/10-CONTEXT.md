# Phase 10: Progress Streaming - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace polling-based progress updates with real-time SSE streaming for analysis progress. Web UI and Word Add-in both consume the SSE endpoint. The pipeline already emits stage-level and chunk-level progress events (Phase 9) — this phase adds the transport layer to deliver them to clients in real-time.

</domain>

<decisions>
## Implementation Decisions

### Update frequency
- Throttle SSE events to max 1 per second on the server side
- Prevents UI thrashing during rapid chunk-level progress updates
- Current polling is 3s interval — SSE will be significantly more responsive even throttled

### Late join behavior
- On SSE connect, send a current-state snapshot first (stage, percent, message, queue position)
- Then stream subsequent events as they occur
- User sees where analysis is immediately, not a blank state until next event

### Word Add-in content placement
- Content controls (clause highlights) placed all at once after full analysis completes
- Do NOT progressively insert as stages finish — avoids partial state in document
- SSE still streams progress to the task pane for user awareness

### Word Add-in progress display
- Simple progress bar + stage label in the task pane sidebar
- Shows current stage name (Extracting... Classifying... Scoring...)
- Do NOT mirror the full debug panel step timeline — keep it minimal for the task pane context

### Claude's Discretion
- **SSE source**: Inngest Realtime vs custom Next.js SSE route handler (research both, pick best fit)
- **Reconnection strategy**: Resume from last event ID vs send state snapshot on reconnect
- **Auth mechanism**: Session-based vs signed URL token (must work for both web and Word Add-in)
- **Connection lifecycle**: Close on completion vs keep alive with timeout
- **Polling fate**: Remove entirely vs keep as fallback (evaluate SSE reliability on Vercel)
- **Hook strategy**: Refactor useAnalysisProgress in-place vs create new useAnalysisStream
- **Event detail level**: Stage-only vs stage + chunk-level (evaluate current event frequency)
- **Event payload**: Progress metadata only vs include lightweight result summaries
- **Error streaming**: Errors via SSE vs existing query-based error display
- **Keepalive interval**: Appropriate heartbeat frequency for Vercel deployment constraints
- **Word Add-in reconnect UX**: Silent auto-reconnect vs brief notification
- **Word Add-in endpoint**: Same SSE endpoint for both web and add-in vs dedicated

</decisions>

<specifics>
## Specific Ideas

- Phase 9 already emits `nda/analysis.progress` events with stage, percent, and progressMessage
- Current `useAnalysisProgress` hook polls every 3s with detailed message display and queue position
- The `progressMessage` column and `progressStage` enum are already in the DB schema
- Word Add-in has a task pane sidebar where progress bar + stage label should display
- Vercel serverless functions have execution time limits that may affect SSE connection duration

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-progress-streaming*
*Context gathered: 2026-02-05*
