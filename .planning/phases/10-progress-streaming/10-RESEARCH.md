# Phase 10: Progress Streaming - Research

**Researched:** 2026-02-05
**Domain:** Server-Sent Events (SSE), Inngest Realtime, real-time streaming on Vercel
**Confidence:** HIGH

## Summary

This phase replaces the polling-based progress system (3s interval via `useAnalysisProgress` hook calling `getAnalysisStatus` server action) with real-time SSE streaming for analysis progress. The pipeline already emits `nda/analysis.progress` events via Inngest `step.sendEvent()` and persists progress to the database via `emitProgress()` (Phase 9 verified).

Two viable SSE sources were evaluated: **Inngest Realtime** (publish/subscribe with managed infrastructure) and a **custom Next.js SSE route handler** (database polling wrapped in SSE). The recommendation is to use **Inngest Realtime** as the primary transport, which eliminates the need for a custom SSE endpoint and provides built-in auth token scoping, automatic reconnection semantics, and a React hook (`useInngestSubscription`).

Key architectural decision: the pipeline already writes progress to the DB AND emits Inngest events. Inngest Realtime lets us subscribe directly to those events from the client without any intermediate SSE endpoint. Polling is retained as a degraded fallback for connection failures.

**Primary recommendation:** Use Inngest Realtime with `@inngest/realtime` package. Add `realtimeMiddleware()` to the Inngest client, define typed channels scoped by analysis ID, replace `step.sendEvent('nda/analysis.progress')` with `publish()`, and use `useInngestSubscription()` hook on the client.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@inngest/realtime` | ^0.4.5 | Publish/subscribe streaming from Inngest functions | First-party integration with existing Inngest pipeline; handles auth, reconnection, delivery |
| `inngest` | ^3.50.0 (installed) | Durable workflow engine | Already in use; v3.50.0 exceeds v3.32.0 minimum for realtime |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@inngest/realtime/middleware` | (part of @inngest/realtime) | `realtimeMiddleware()` for Inngest client | Required to enable `publish()` in function handlers |
| `@inngest/realtime/hooks` | (part of @inngest/realtime) | `useInngestSubscription()` React hook | Client-side subscription in web UI |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inngest Realtime | Custom Next.js SSE route handler | More control but requires managing DB polling within SSE stream, Vercel timeout limits (300s default), heartbeat management, auth token validation, reconnection logic. The existing Word Add-in status endpoint (`/api/word-addin/status/[id]/route.ts`) already does this but with 2s DB polling inside the SSE — essentially "SSE-wrapped polling" which defeats the purpose. |
| Inngest Realtime | Vercel Edge SSE | 25s initial response requirement, 300s streaming limit, no Node.js APIs |
| `useInngestSubscription` | `@microsoft/fetch-event-source` | Only needed if building custom SSE endpoint. Inngest Realtime uses its own transport protocol. |

**Installation:**
```bash
pnpm add @inngest/realtime
```

## Architecture Patterns

### Recommended Project Structure
```
inngest/
├── client.ts              # Add realtimeMiddleware()
├── channels.ts            # NEW: Typed channel + topic definitions
├── functions/
│   └── analyze-nda.ts     # Replace step.sendEvent with publish()
lib/
├── realtime/
│   └── tokens.ts          # NEW: Server-side token generation helpers
app/
├── (main)/(dashboard)/analyses/
│   └── actions.ts         # Add fetchRealtimeToken server action
hooks/
├── use-analysis-progress.ts  # Refactor to use Inngest Realtime (primary) + polling (fallback)
app/(word-addin)/word-addin/taskpane/
├── hooks/
│   └── useAnalysisProgress.ts  # Refactor to use fetch-based SSE (Inngest tokens)
```

### Pattern 1: Inngest Realtime Channel Definition
**What:** Define typed channels scoped by analysis ID for progress streaming
**When to use:** Every analysis run gets its own channel for isolated progress updates
**Example:**
```typescript
// Source: Inngest Realtime docs - https://www.inngest.com/docs/features/realtime
import { channel, topic } from "@inngest/realtime"
import { z } from "zod"

// Channel per analysis — scoped so clients only see their own progress
export const analysisChannel = channel(
  (analysisId: string) => `analysis:${analysisId}`
).addTopic(
  topic("progress").schema(
    z.object({
      stage: z.string(),
      percent: z.number().min(0).max(100),
      message: z.string(),
      metadata: z.object({
        chunksProcessed: z.number().optional(),
        totalChunks: z.number().optional(),
      }).optional(),
    })
  )
)
```

### Pattern 2: Publishing from Pipeline
**What:** Replace `step.sendEvent('nda/analysis.progress')` with `publish()` in emitProgress
**When to use:** Every progress emission point in analyze-nda.ts
**Example:**
```typescript
// Source: Inngest Realtime docs - https://www.inngest.com/docs/features/realtime
import { analysisChannel } from "@/inngest/channels"

// Inside analyzeNda function handler — publish() comes from middleware injection
const emitProgress = async (
  stage: ProgressStage,
  progress: number,
  message: string
) => {
  const clampedProgress = Math.max(0, Math.min(100, progress))
  const stepSuffix = `${stage}-${progressCounter++}`

  // Persist to DB (keep for late join + fallback)
  await step.run(`update-progress-${stepSuffix}`, async () => {
    await ctx.db.update(analyses).set({
      progressStage: stage,
      progressPercent: clampedProgress,
      progressMessage: message,
      updatedAt: new Date(),
    }).where(eq(analyses.id, analysisId))
  })

  // Publish to Inngest Realtime (replaces step.sendEvent)
  await publish(
    analysisChannel(analysisId).progress({
      stage,
      percent: clampedProgress,
      message,
    })
  )
}
```

### Pattern 3: Server-Side Token Generation
**What:** Next.js server action that generates scoped subscription tokens
**When to use:** Called by client hooks to get auth-scoped access to analysis channels
**Example:**
```typescript
// Source: Inngest Realtime docs - https://www.inngest.com/docs/features/realtime/react-hooks
"use server"
import { getSubscriptionToken, type Realtime } from "@inngest/realtime"
import { inngest } from "@/inngest/client"
import { analysisChannel } from "@/inngest/channels"
import { withTenant } from "@/lib/dal"

export type AnalysisToken = Realtime.Token<typeof analysisChannel, ["progress"]>

export async function fetchAnalysisToken(
  analysisId: string
): Promise<AnalysisToken> {
  // Auth check: verifies session and tenant ownership
  const { tenantId } = await withTenant()

  // Verify analysis belongs to tenant (omitted for brevity)

  return await getSubscriptionToken(inngest, {
    channel: analysisChannel(analysisId),
    topics: ["progress"],
  })
}
```

### Pattern 4: Client-Side Subscription (Web UI)
**What:** Use `useInngestSubscription` hook for real-time progress
**When to use:** Web UI analysis progress display
**Example:**
```typescript
// Source: Inngest Realtime docs - https://www.inngest.com/docs/features/realtime/react-hooks
"use client"
import { useInngestSubscription } from "@inngest/realtime/hooks"
import { fetchAnalysisToken } from "@/app/(main)/(dashboard)/analyses/actions"

function AnalysisProgress({ analysisId }: { analysisId: string }) {
  const { data, error, latestData } = useInngestSubscription({
    refreshToken: () => fetchAnalysisToken(analysisId),
  })

  // latestData has the most recent progress event
  const progress = latestData?.data

  return (
    <div>
      <p>{progress?.message}</p>
      <ProgressBar value={progress?.percent ?? 0} />
    </div>
  )
}
```

### Pattern 5: Word Add-in Subscription
**What:** Word Add-in uses fetch-based SSE or the Inngest subscribe API directly
**When to use:** Task pane progress display
**Example:**
```typescript
// Word Add-in cannot use Next.js server actions directly.
// Option A: Dedicated API route that generates token for Bearer auth flow
// Option B: Use @inngest/realtime subscribe() directly (non-React)
import { subscribe } from "@inngest/realtime"
import { inngest } from "@/inngest/client"

// After getting a subscription token via API route:
const stream = await subscribe(inngest, {
  channel: `analysis:${analysisId}`,
  topics: ["progress"],
  token: tokenFromApi,
})

for await (const event of stream) {
  updateProgressUI(event.data)
}
```

### Anti-Patterns to Avoid
- **SSE-wrapped DB polling:** The existing Word Add-in endpoint (`/api/word-addin/status/[id]`) polls the DB every 2s inside an SSE stream. This is "fake SSE" — it adds SSE overhead without eliminating polling. Replace with Inngest Realtime.
- **Removing DB persistence:** Keep writing progress to the database. It serves as the source of truth for late joins, reconnections, and the fallback polling path. Inngest Realtime is at-most-once delivery — messages can be missed.
- **EventSource for authenticated endpoints:** Native browser `EventSource` API does not support custom headers. Don't use it for authenticated SSE. Use `useInngestSubscription` (which handles token-based auth) or `@microsoft/fetch-event-source` if building custom SSE.
- **Long-lived SSE on Vercel without Inngest:** Custom SSE route handlers on Vercel are bounded by function max duration (300s default, 800s max on Pro). A typical analysis takes 1-5 minutes. Borderline for default limits. Inngest Realtime bypasses this entirely since the stream comes from Inngest infrastructure, not your Vercel function.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE transport from Inngest functions | Custom ReadableStream SSE endpoint with DB polling | `@inngest/realtime` publish/subscribe | Inngest already has the events; Realtime connects pipeline to client without intermediate infrastructure |
| Auth-scoped channel tokens | Custom signed URL with JWT | `getSubscriptionToken()` from `@inngest/realtime` | Handles token expiry, channel scoping, and topic-level access control |
| React SSE hook with reconnection | Custom EventSource wrapper with retry logic | `useInngestSubscription()` from `@inngest/realtime/hooks` | Handles token refresh, reconnection, state management |
| Server-side throttling | Custom debounce/throttle in emitProgress | Inngest Realtime at-most-once delivery | Messages are ephemeral; UI can handle any frequency. If throttling needed, throttle on publish side in emitProgress |

**Key insight:** The project already uses Inngest for the entire pipeline. Inngest Realtime is the natural choice because the progress events are already Inngest events — adding realtime is adding a transport layer, not a new system.

## Common Pitfalls

### Pitfall 1: At-Most-Once Delivery Gaps
**What goes wrong:** Inngest Realtime has at-most-once delivery semantics. If a client disconnects briefly, it may miss progress events.
**Why it happens:** Inngest Realtime is ephemeral messaging — messages are not persisted after delivery.
**How to avoid:** Keep DB persistence (already in place via `emitProgress`). On reconnect, the `useInngestSubscription` hook re-fetches a token and reconnects. Combine with an initial state fetch from the DB so the client always has the latest state. The user decision "late join = send current-state snapshot first" addresses this.
**Warning signs:** Client shows stale progress percentage after network glitch.

### Pitfall 2: Vercel Function Timeout for Custom SSE
**What goes wrong:** If using a custom SSE route handler (not Inngest Realtime), the Vercel function will timeout after 300s (default) or 800s (max on Pro).
**Why it happens:** SSE connections are long-lived. Vercel serverless functions have max execution duration limits.
**How to avoid:** Use Inngest Realtime (streams from Inngest infrastructure, not your Vercel function). The token-generating server action is a normal short-lived request.
**Warning signs:** 504 errors after 5 minutes of streaming.

### Pitfall 3: Channel Naming Collisions
**What goes wrong:** Multiple analyses using the same channel name receive each other's progress events.
**Why it happens:** Generic channel names like `"progress"` instead of analysis-scoped names.
**How to avoid:** Use `analysis:${analysisId}` channel naming pattern. Each analysis gets its own isolated channel.
**Warning signs:** UI shows progress from a different analysis.

### Pitfall 4: Word Add-in Token Acquisition
**What goes wrong:** Word Add-in cannot use Next.js server actions (they require cookie-based session auth). Token acquisition fails.
**Why it happens:** Word Add-in uses Bearer token auth (via `verifyAddInAuth`), not cookie sessions.
**How to avoid:** Create a dedicated API route (`/api/word-addin/realtime-token/[id]`) that accepts Bearer auth and returns a subscription token. The existing `verifyAddInAuth` middleware handles the auth validation.
**Warning signs:** 401 errors when Word Add-in tries to subscribe.

### Pitfall 5: Middleware Registration Order
**What goes wrong:** `publish()` is undefined in function handlers.
**Why it happens:** `realtimeMiddleware()` not added to the Inngest client, or added after other middleware that interferes.
**How to avoid:** Add `realtimeMiddleware()` to the `middleware` array in `inngest/client.ts`. Verify `publish` appears in function handler destructured params.
**Warning signs:** `publish is not a function` runtime error.

### Pitfall 6: Barrel Export Risk with @inngest/realtime
**What goes wrong:** Importing from `@inngest/realtime` in the Inngest barrel export (`@/inngest/index.ts`) could pull in browser-incompatible dependencies.
**Why it happens:** The project has a documented barrel export anti-pattern (Issue #43).
**How to avoid:** Keep channel definitions in a separate file (`inngest/channels.ts`). Import `realtimeMiddleware` only in `inngest/client.ts`. Do not re-export realtime types from the barrel. Import `useInngestSubscription` only in client components.
**Warning signs:** Production crash with module resolution errors.

## Code Examples

### Complete Inngest Client Setup with Realtime
```typescript
// Source: Inngest Realtime docs - https://www.inngest.com/docs/features/realtime
// File: inngest/client.ts
import { Inngest, EventSchemas } from "inngest"
import { realtimeMiddleware } from "@inngest/realtime/middleware"
import type { InngestEvents } from "./types"

export const inngest = new Inngest({
  id: "nda-analyst",
  schemas: new EventSchemas().fromRecord<InngestEvents>(),
  middleware: [realtimeMiddleware()],
})
```

### Throttled emitProgress with publish()
```typescript
// File: inngest/functions/analyze-nda.ts (inside function handler)
// Throttle: max 1 publish per second (user decision)
let lastPublishTime = 0

const emitProgress = async (
  stage: ProgressStage,
  progress: number,
  message: string
) => {
  const clampedProgress = Math.max(0, Math.min(100, progress))
  const stepSuffix = `${stage}-${progressCounter++}`

  // Always persist to DB (source of truth for late join)
  await step.run(`update-progress-${stepSuffix}`, async () => {
    await ctx.db.update(analyses).set({
      progressStage: stage,
      progressPercent: clampedProgress,
      progressMessage: message,
      updatedAt: new Date(),
    }).where(eq(analyses.id, analysisId))
  })

  // Throttle realtime publish to max 1/second
  const now = Date.now()
  if (now - lastPublishTime >= 1000 || stage === 'complete' || stage === 'failed') {
    await publish(
      analysisChannel(analysisId).progress({
        stage,
        percent: clampedProgress,
        message,
      })
    )
    lastPublishTime = now
  }
}
```

### Word Add-in Token API Route
```typescript
// File: app/api/word-addin/realtime-token/[id]/route.ts
import { getSubscriptionToken } from "@inngest/realtime"
import { inngest } from "@/inngest/client"
import { analysisChannel } from "@/inngest/channels"
import { verifyAddInAuth } from "@/lib/word-addin-auth"
import { analyses } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { db } from "@/db"
import { error } from "@/lib/api-utils"
import { NotFoundError, ForbiddenError, toAppError } from "@/lib/errors"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: analysisId } = await params
  try {
    const authContext = await verifyAddInAuth(request)
    const tenantId = authContext.tenant.tenantId
    if (!tenantId) throw new ForbiddenError("No organization selected")

    // Verify analysis belongs to tenant
    const analysis = await db.query.analyses.findFirst({
      where: and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId)),
      columns: { id: true },
    })
    if (!analysis) throw new NotFoundError("Analysis not found")

    const token = await getSubscriptionToken(inngest, {
      channel: analysisChannel(analysisId),
      topics: ["progress"],
    })

    return Response.json({ token })
  } catch (err) {
    return error(toAppError(err))
  }
}
```

### Refactored Web UI Hook (Inngest Realtime + Polling Fallback)
```typescript
// File: hooks/use-analysis-progress.ts
"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { useInngestSubscription } from "@inngest/realtime/hooks"
import { fetchAnalysisToken } from "@/app/(main)/(dashboard)/analyses/actions"
import { getAnalysisStatus } from "@/app/(main)/(dashboard)/analyses/actions"
import type { AnalysisStatus } from "@/app/(main)/(dashboard)/analyses/actions"

const FALLBACK_POLL_INTERVAL_MS = 5000 // Slower fallback polling

interface AnalysisProgressState {
  status: AnalysisStatus
  progress: number
  stage: string
  message: string
  queuePosition: number | undefined
  isLoading: boolean
  error: string | null
}

export function useAnalysisProgress(analysisId: string | null): AnalysisProgressState {
  const [state, setState] = useState<AnalysisProgressState>({
    status: "pending", progress: 0, stage: "", message: "",
    queuePosition: undefined, isLoading: true, error: null,
  })

  // Inngest Realtime subscription
  const { latestData, error: realtimeError } = useInngestSubscription({
    refreshToken: analysisId
      ? () => fetchAnalysisToken(analysisId)
      : undefined,
    enabled: !!analysisId,
  })

  // Update state from realtime events
  useEffect(() => {
    if (latestData?.data) {
      const { stage, percent, message } = latestData.data
      setState(prev => ({
        ...prev,
        status: stage === "complete" ? "completed"
          : stage === "failed" ? "failed"
          : "processing",
        progress: percent,
        stage,
        message,
        isLoading: false,
        error: null,
      }))
    }
  }, [latestData])

  // Fallback: initial state fetch + slower polling if realtime fails
  // ... (polling logic at 5s as degraded fallback)

  return state
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DB polling in SSE wrapper | Inngest Realtime publish/subscribe | Inngest Realtime preview (May 2025) | Eliminates intermediate SSE endpoint; pipeline events stream directly to client |
| `EventSource` with no auth | Token-scoped subscriptions | Inngest Realtime | Secure channel access without custom auth plumbing |
| Custom reconnection logic | `useInngestSubscription` hook | Inngest Realtime | Automatic token refresh and reconnection handling |
| Vercel serverless SSE (timeout risk) | Inngest-managed streaming | Inngest Realtime | No Vercel function timeout constraints on streaming duration |

**Deprecated/outdated:**
- The existing `/api/word-addin/status/[id]` SSE endpoint is "SSE-wrapped polling" — it polls the DB every 2s inside a ReadableStream. This should be replaced with the Inngest Realtime approach.
- The `step.sendEvent('nda/analysis.progress')` calls in emitProgress can be removed once `publish()` is in place (they served as a future hook for "real-time consumers" per the code comment on line 370).

## Open Questions

1. **Inngest Realtime Preview Status**
   - What we know: Inngest Realtime is in "developer preview" (May 2025 announcement, widely available). API may change.
   - What's unclear: Whether it will reach GA before this ships, and if the `@inngest/realtime` API surface is stable enough for production use.
   - Recommendation: Proceed with it. The project is already on Inngest v3.50.0. Preview status means the API may evolve, but the core publish/subscribe pattern is stable. Keep polling as fallback to mitigate any preview-stage issues. If preview breaks, the fallback polling still works.

2. **Word Add-in `useInngestSubscription` Compatibility**
   - What we know: The Word Add-in task pane is a React app, but it runs in an Office.js WebView with some browser API restrictions.
   - What's unclear: Whether `useInngestSubscription` works in the Office.js WebView environment (EventSource/WebSocket support varies).
   - Recommendation: Test in Office.js WebView. If `useInngestSubscription` works, use it directly. If not, use the non-React `subscribe()` API from `@inngest/realtime` with the fetch-based stream reader (already proven to work in the existing `useAnalysisProgress` hook which uses `fetch` + `ReadableStream`).

3. **Throttle Implementation Inside Inngest Steps**
   - What we know: The user decided on max 1 event/second throttling. The `emitProgress` function runs inside Inngest steps.
   - What's unclear: Whether `Date.now()` timing is reliable across Inngest step replays (memoization may affect timestamps).
   - Recommendation: Throttle at the `publish()` call level, not the DB persistence level. Always write to DB. Only conditionally publish. Use a simple counter-based approach (publish on every Nth call) if timestamp-based throttling proves unreliable in step context. Terminal events (complete, failed, cancelled) always publish regardless of throttle.

## Recommendations for Discretion Items

Based on research, here are concrete recommendations for each discretion area:

| Discretion Item | Recommendation | Rationale |
|-----------------|----------------|-----------|
| **SSE source** | Inngest Realtime | First-party integration, eliminates custom SSE endpoint, handles auth and reconnection |
| **Reconnection strategy** | Token refresh + state snapshot on reconnect | `useInngestSubscription` handles token refresh automatically; initial state comes from DB fetch (late join decision) |
| **Auth mechanism** | Inngest subscription tokens (web: server action, add-in: API route) | Token-scoped to specific channels; works for both consumers without custom JWT |
| **Connection lifecycle** | Auto-close on terminal events (complete/failed/cancelled) | Publish terminal event then stop; hook detects terminal state and stops listening |
| **Polling fate** | Keep as degraded fallback at 5s interval | Inngest Realtime is preview; polling provides resilience. Increase interval from 2s to 5s since it's fallback only |
| **Hook strategy** | Refactor `useAnalysisProgress` in-place | Same interface, different transport. No need for a new hook — consumers don't care about transport mechanism |
| **Event detail level** | Stage + chunk-level (publish both) | Throttle to 1/sec handles frequency. Chunk-level messages ("Classifying clause 7 of 15...") are already emitted and valuable for UX |
| **Event payload** | Progress metadata only (stage, percent, message) | Keep payloads small. Full result summaries add payload bloat for no UI benefit during progress |
| **Error streaming** | Errors via SSE (publish failed stage) | Pipeline already emits `emitProgress('failed', ...)`. Terminal error event flows through same channel |
| **Keepalive interval** | Not needed with Inngest Realtime | Inngest manages the connection. If using polling fallback, 5s interval serves as implicit keepalive |
| **Word Add-in reconnect UX** | Silent auto-reconnect | The `subscribe()` API handles reconnection. Only show error if reconnection fails after multiple attempts |
| **Word Add-in endpoint** | Dedicated token API route + same Inngest channel | Same Inngest Realtime channel, but token acquisition differs (API route with Bearer auth vs server action with session) |

## Sources

### Primary (HIGH confidence)
- Inngest Realtime documentation (Context7: `/websites/inngest`) — publish/subscribe API, middleware setup, React hooks, token generation
- Inngest Realtime official docs — https://www.inngest.com/docs/features/realtime — full feature documentation
- Inngest Realtime examples — https://www.inngest.com/docs/examples/realtime — code patterns
- Vercel Functions Limitations — https://vercel.com/docs/functions/limitations — timeout limits (300s default, 800s max Pro)
- Vercel Streaming Functions — https://vercel.com/docs/functions/streaming-functions — SSE streaming on Vercel
- `@inngest/realtime` npm — https://www.npmjs.com/package/@inngest/realtime — v0.4.5 latest, 85 versions published

### Secondary (MEDIUM confidence)
- Inngest Realtime blog announcement — https://www.inngest.com/blog/announcing-realtime — developer preview status, at-most-once delivery
- Vercel Fluid Compute docs — https://vercel.com/docs/fluid-compute — extended duration limits
- `@microsoft/fetch-event-source` — https://github.com/Azure/fetch-event-source — EventSource with auth headers (alternative if needed)

### Tertiary (LOW confidence)
- Medium article on SSE streaming in Next.js/Vercel — https://medium.com/@oyetoketoby80/fixing-slow-sse-server-sent-events-streaming-in-next-js-and-vercel-99f42fbdb996 — practical tips

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Inngest Realtime is well-documented, first-party, and the project already uses Inngest v3.50.0
- Architecture: HIGH — Pattern follows Inngest's official examples exactly; project structure is natural extension of existing code
- Pitfalls: MEDIUM — At-most-once delivery concern is documented but real-world behavior in preview needs validation; Word Add-in WebView compatibility is untested

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days — Inngest Realtime is preview but core API appears stable)
