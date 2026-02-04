# Chat Upload E2E Implementation Plan

> **Status:** ✅ COMPLETE (audited 2026-02-04)
>
> Implemented using AI SDK v6 and ai-elements components.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire chat UI to analysis backend so users can upload NDAs, trigger analysis, see progress, and view results.

**Architecture:** Files uploaded via chat → `uploadDocument()` → `triggerAnalysis()` with Inngest event → polling hook tracks progress → `AnalysisView` fetches real results.

**Tech Stack:** Next.js 16 Server Actions, Inngest durable workflows, Zustand state, React polling hook.

---

## Task 1: Add Progress Columns to Analyses Schema

**Files:**
- Modify: `db/schema/analyses.ts:179-337` (analyses table definition)

**Step 1: Write the test**

Create `db/schema/analyses-progress.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { setupTestDatabase, cleanupTestDatabase } from "@/test/setup"
import { analyses } from "./analyses"
import { documents } from "./documents"
import { organizations } from "./organizations"
import { eq } from "drizzle-orm"

describe("analyses progress columns", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"]
  let tenantId: string
  let documentId: string

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    db = setup.db

    // Create org and document
    const [org] = await db.insert(organizations).values({ name: "Test Org" }).returning()
    tenantId = org.id

    const [doc] = await db
      .insert(documents)
      .values({
        tenantId,
        title: "Test NDA",
        fileName: "test.pdf",
        fileType: "application/pdf",
        fileSize: 1000,
        status: "ready",
      })
      .returning()
    documentId = doc.id
  })

  it("stores progressStage and progressPercent", async () => {
    const [analysis] = await db
      .insert(analyses)
      .values({
        tenantId,
        documentId,
        status: "processing",
        progressStage: "classifying",
        progressPercent: 45,
      })
      .returning()

    expect(analysis.progressStage).toBe("classifying")
    expect(analysis.progressPercent).toBe(45)
  })

  it("stores userPrompt in metadata", async () => {
    const [analysis] = await db
      .insert(analyses)
      .values({
        tenantId,
        documentId,
        status: "pending",
        metadata: { userPrompt: "Focus on IP clauses" },
      })
      .returning()

    expect((analysis.metadata as { userPrompt?: string })?.userPrompt).toBe("Focus on IP clauses")
  })

  it("defaults progressPercent to 0", async () => {
    const [analysis] = await db
      .insert(analyses)
      .values({ tenantId, documentId, status: "pending" })
      .returning()

    expect(analysis.progressPercent).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test db/schema/analyses-progress.test.ts`
Expected: FAIL - `progressStage` and `progressPercent` columns don't exist

**Step 3: Add columns to schema**

In `db/schema/analyses.ts`, add after line 298 (after `inngestRunId`):

```typescript
    /**
     * Current progress stage for UI display.
     * Updated by Inngest function as pipeline progresses.
     */
    progressStage: text("progress_stage"),

    /**
     * Progress percentage (0-100) for UI progress bar.
     * @default 0
     */
    progressPercent: integer("progress_percent").default(0),

    /**
     * Additional analysis metadata including user prompts.
     */
    metadata: jsonb("metadata").default({}),
```

**Step 4: Push schema to database**

Run: `pnpm db:push`
Expected: Schema updated successfully

**Step 5: Run test to verify it passes**

Run: `pnpm test db/schema/analyses-progress.test.ts`
Expected: PASS (3 tests)

**Step 6: Commit**

```bash
git add db/schema/analyses.ts db/schema/analyses-progress.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add progress tracking columns to analyses

- progressStage: current pipeline stage (parsing, classifying, etc.)
- progressPercent: 0-100 for progress bar
- metadata: JSONB for userPrompt and other context

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update Inngest Event Types for userPrompt

**Files:**
- Modify: `inngest/types.ts:47-76` (analysisRequestedPayload)

**Step 1: Update the schema**

In `inngest/types.ts`, modify `analysisRequestedPayload` to add `userPrompt`:

```typescript
export const analysisRequestedPayload = baseTenantPayload.extend({
  /** Document to analyze */
  documentId: z.string().uuid(),
  /** Analysis record ID (pre-created with status='pending') - optional for Word Add-in */
  analysisId: z.string().uuid().optional(),
  /** Optional: specific analysis version (for re-analysis) */
  version: z.number().int().positive().optional(),
  /** Source of the document */
  source: z.enum(["web", "web-upload", "word-addin"]).default("web"),
  /** User's optional prompt/instructions for the analysis */
  userPrompt: z.string().optional(),
  /** Word Add-in content (required when source='word-addin') */
  content: z
    .object({
      rawText: z.string(),
      paragraphs: z.array(
        z.object({
          text: z.string(),
          style: z.string(),
          isHeading: z.boolean(),
        })
      ),
    })
    .optional(),
  /** Word Add-in metadata (optional) */
  metadata: z
    .object({
      title: z.string(),
      author: z.string().optional(),
    })
    .optional(),
});
```

**Step 2: Verify types compile**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add inngest/types.ts
git commit -m "$(cat <<'EOF'
feat(inngest): add userPrompt to analysis request payload

Allows passing user instructions (e.g., "focus on IP clauses")
through to the analysis pipeline.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire triggerAnalysis to Send Inngest Event

**Files:**
- Modify: `app/(main)/(dashboard)/analyses/actions.ts:131-196`
- Test: `app/(main)/(dashboard)/analyses/actions.test.ts`

**Step 1: Write the test**

Add to `app/(main)/(dashboard)/analyses/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { triggerAnalysis } from "./actions"

// Mock inngest
vi.mock("@/inngest", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["run_123"] }),
  },
}))

// Mock withTenant
vi.mock("@/lib/dal", () => ({
  withTenant: vi.fn().mockResolvedValue({
    db: {
      query: {
        documents: { findFirst: vi.fn() },
        analyses: { findFirst: vi.fn() },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "analysis-123", version: 1 }]),
        }),
      }),
    },
    tenantId: "tenant-123",
    userId: "user-123",
  }),
}))

describe("triggerAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends inngest event with userPrompt", async () => {
    const { inngest } = await import("@/inngest")
    const { withTenant } = await import("@/lib/dal")

    // Setup mocks to return valid document
    const mockDb = (await withTenant()).db
    ;(mockDb.query.documents.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "doc-123",
      status: "ready",
    })
    ;(mockDb.query.analyses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const result = await triggerAnalysis("doc-123", { userPrompt: "Focus on IP" })

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "nda/analysis.requested",
        data: expect.objectContaining({
          documentId: "doc-123",
          userPrompt: "Focus on IP",
          source: "web-upload",
        }),
      })
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test app/(main)/(dashboard)/analyses/actions.test.ts`
Expected: FAIL - inngest.send not called

**Step 3: Update triggerAnalysis implementation**

In `app/(main)/(dashboard)/analyses/actions.ts`, modify the function signature and add Inngest send:

```typescript
import { inngest } from "@/inngest"

// Update the function signature
export async function triggerAnalysis(
  documentId: string,
  options?: { userPrompt?: string }
): Promise<ApiResponse<Analysis>> {
  // ... existing validation ...

  // Create new analysis record (existing code)
  const [analysis] = await db
    .insert(analyses)
    .values({
      tenantId,
      documentId,
      status: "pending",
      version: nextVersion,
      metadata: options?.userPrompt ? { userPrompt: options.userPrompt } : {},
      inngestRunId: `pending_${Date.now()}`, // Will be updated by Inngest
    })
    .returning();

  // Send Inngest event (REPLACE THE TODO)
  await inngest.send({
    name: "nda/analysis.requested",
    data: {
      tenantId,
      documentId,
      analysisId: analysis.id,
      source: "web-upload",
      userPrompt: options?.userPrompt,
    },
  })

  revalidatePath("/dashboard");
  revalidatePath("/analyses");

  return ok(analysis);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test app/(main)/(dashboard)/analyses/actions.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/(main)/(dashboard)/analyses/actions.ts app/(main)/(dashboard)/analyses/actions.test.ts
git commit -m "$(cat <<'EOF'
feat(actions): wire triggerAnalysis to send Inngest event

- Sends nda/analysis.requested event with documentId, tenantId, userPrompt
- Stores userPrompt in analysis metadata
- Removes TODO placeholder

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update Inngest Function to Persist Progress

**Files:**
- Modify: `inngest/functions/analyze-nda.ts:61-78` (emitProgress helper)

**Step 1: Update emitProgress to persist to DB**

In `inngest/functions/analyze-nda.ts`, modify the `emitProgress` helper:

```typescript
// Helper to emit progress events AND persist to DB
const emitProgress = async (
  stage: ProgressStage,
  progress: number,
  message: string
) => {
  // Persist progress to DB for polling
  await ctx.db
    .update(analyses)
    .set({
      progressStage: stage,
      progressPercent: progress,
      updatedAt: new Date(),
    })
    .where(eq(analyses.id, analysisId))

  // Also emit event for real-time consumers (future SSE)
  await step.sendEvent('emit-progress', {
    name: 'nda/analysis.progress',
    data: {
      documentId,
      analysisId,
      tenantId,
      stage,
      progress,
      message,
    },
  })
}
```

**Step 2: Verify types compile**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Run existing tests**

Run: `pnpm test inngest/functions/analyze-nda.test.ts`
Expected: PASS (existing tests should still work)

**Step 4: Commit**

```bash
git add inngest/functions/analyze-nda.ts
git commit -m "$(cat <<'EOF'
feat(inngest): persist progress to DB during analysis

emitProgress now updates analyses.progressStage and progressPercent
so the frontend can poll for progress via getAnalysisStatus.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update getAnalysisStatus to Return Real Progress

**Files:**
- Modify: `app/(main)/(dashboard)/analyses/actions.ts:239-284`

**Step 1: Update the action to use real progress data**

Replace the placeholder progress logic:

```typescript
export async function getAnalysisStatus(
  analysisId: string
): Promise<ApiResponse<AnalysisStatusResponse>> {
  if (!z.string().uuid().safeParse(analysisId).success) {
    return err("VALIDATION_ERROR", "Invalid analysis ID");
  }

  const { db, tenantId } = await withTenant();

  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
    columns: {
      status: true,
      progressStage: true,
      progressPercent: true,
    },
  });

  if (!analysis) {
    return err("NOT_FOUND", "Analysis not found");
  }

  // Map progress stage to human-readable message
  const stageMessages: Record<string, string> = {
    parsing: "Parsing document...",
    classifying: "Classifying clauses...",
    scoring: "Assessing risk levels...",
    analyzing_gaps: "Analyzing gaps...",
    complete: "Analysis complete",
    failed: "Analysis failed",
  }

  const progress: AnalysisStatusResponse["progress"] = {
    step: analysis.progressStage
      ? stageMessages[analysis.progressStage] || analysis.progressStage
      : analysis.status === "pending"
        ? "Queued for analysis..."
        : "Processing...",
    percent: analysis.progressPercent ?? 0,
  }

  return ok({
    status: analysis.status as AnalysisStatus,
    progress,
  });
}
```

**Step 2: Run existing tests**

Run: `pnpm test app/(main)/(dashboard)/analyses/actions.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add app/(main)/(dashboard)/analyses/actions.ts
git commit -m "$(cat <<'EOF'
feat(actions): return real progress in getAnalysisStatus

Uses progressStage and progressPercent from DB instead of placeholder.
Maps stages to human-readable messages for UI display.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Create useAnalysisProgress Hook

**Files:**
- Create: `hooks/use-analysis-progress.ts`
- Create: `hooks/use-analysis-progress.test.ts`

**Step 1: Write the test**

Create `hooks/use-analysis-progress.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { useAnalysisProgress } from "./use-analysis-progress"

// Mock the server action
vi.mock("@/app/(main)/(dashboard)/analyses/actions", () => ({
  getAnalysisStatus: vi.fn(),
}))

describe("useAnalysisProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("returns initial loading state", () => {
    const { getAnalysisStatus } = require("@/app/(main)/(dashboard)/analyses/actions")
    getAnalysisStatus.mockResolvedValue({
      success: true,
      data: { status: "pending", progress: { step: "Queued...", percent: 0 } },
    })

    const { result } = renderHook(() => useAnalysisProgress("analysis-123"))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.status).toBe("pending")
  })

  it("polls and updates progress", async () => {
    const { getAnalysisStatus } = require("@/app/(main)/(dashboard)/analyses/actions")
    getAnalysisStatus
      .mockResolvedValueOnce({
        success: true,
        data: { status: "processing", progress: { step: "Parsing...", percent: 20 } },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { status: "processing", progress: { step: "Classifying...", percent: 45 } },
      })

    const { result } = renderHook(() => useAnalysisProgress("analysis-123"))

    await waitFor(() => {
      expect(result.current.progress).toBe(20)
    })

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    await waitFor(() => {
      expect(result.current.progress).toBe(45)
    })
  })

  it("stops polling when completed", async () => {
    const { getAnalysisStatus } = require("@/app/(main)/(dashboard)/analyses/actions")
    getAnalysisStatus.mockResolvedValue({
      success: true,
      data: { status: "completed", progress: { step: "Complete", percent: 100 } },
    })

    const { result } = renderHook(() => useAnalysisProgress("analysis-123"))

    await waitFor(() => {
      expect(result.current.status).toBe("completed")
    })

    // Advance time, should not poll again
    const callCount = getAnalysisStatus.mock.calls.length
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(getAnalysisStatus.mock.calls.length).toBe(callCount)
  })

  it("returns null values when analysisId is null", () => {
    const { result } = renderHook(() => useAnalysisProgress(null))

    expect(result.current.status).toBe("pending")
    expect(result.current.isLoading).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test hooks/use-analysis-progress.test.ts`
Expected: FAIL - module not found

**Step 3: Create the hook**

Create `hooks/use-analysis-progress.ts`:

```typescript
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { getAnalysisStatus } from "@/app/(main)/(dashboard)/analyses/actions"
import type { AnalysisStatus } from "@/app/(main)/(dashboard)/analyses/actions"

const POLL_INTERVAL_MS = 2000

interface AnalysisProgressState {
  status: AnalysisStatus
  progress: number
  stage: string
  isLoading: boolean
  error: string | null
}

/**
 * Hook for polling analysis progress.
 * Polls every 2 seconds while status is "pending" or "processing".
 * Stops polling when status is "completed" or "failed".
 */
export function useAnalysisProgress(analysisId: string | null): AnalysisProgressState {
  const [state, setState] = useState<AnalysisProgressState>({
    status: "pending",
    progress: 0,
    stage: "",
    isLoading: true,
    error: null,
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const poll = useCallback(async () => {
    if (!analysisId) return

    try {
      const result = await getAnalysisStatus(analysisId)

      if (result.success) {
        setState({
          status: result.data.status,
          progress: result.data.progress?.percent ?? 0,
          stage: result.data.progress?.step ?? "",
          isLoading: false,
          error: null,
        })
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error.message,
        }))
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }))
    }
  }, [analysisId])

  useEffect(() => {
    if (!analysisId) {
      setState({
        status: "pending",
        progress: 0,
        stage: "",
        isLoading: false,
        error: null,
      })
      return
    }

    // Initial fetch
    poll()

    // Set up polling
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [analysisId, poll])

  // Stop polling when in terminal state
  useEffect(() => {
    if (state.status === "completed" || state.status === "failed") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [state.status])

  return state
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test hooks/use-analysis-progress.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add hooks/use-analysis-progress.ts hooks/use-analysis-progress.test.ts
git commit -m "$(cat <<'EOF'
feat(hooks): add useAnalysisProgress polling hook

- Polls getAnalysisStatus every 2 seconds
- Returns status, progress, stage, isLoading, error
- Stops polling on completed/failed status

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire Chat handleSubmit to Upload + Trigger

**Files:**
- Modify: `app/(main)/chat/page.tsx:54-112`

**Step 1: Add imports and update handleSubmit**

In `app/(main)/chat/page.tsx`, add imports and update the handler:

```typescript
// Add imports at top
import { uploadDocument } from "@/app/(main)/(dashboard)/documents/actions"
import { triggerAnalysis } from "@/app/(main)/(dashboard)/analyses/actions"

// Replace handleSubmit function
const handleSubmit = async (message: PromptInputMessage) => {
  if (!message.text.trim() && message.files.length === 0) return

  // Handle file upload flow
  if (message.files.length > 0) {
    const file = message.files[0] // MVP: single file
    setStatus("submitted")

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message.text || `Analyze ${file.filename}`,
      files: message.files.map((f) => ({
        url: f.url,
        filename: f.filename,
        mediaType: f.mediaType,
      })),
    }
    setMessages((prev) => [...prev, userMessage])

    try {
      // Fetch the blob from the URL and create FormData
      const response = await fetch(file.url)
      const blob = await response.blob()
      const formData = new FormData()
      formData.append("file", blob, file.filename || "document")

      // Upload document
      const uploadResult = await uploadDocument(formData)
      if (!uploadResult.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Failed to upload: ${uploadResult.error.message}`,
          },
        ])
        setStatus("ready")
        return
      }

      // Trigger analysis
      const analysisResult = await triggerAnalysis(uploadResult.data.id, {
        userPrompt: message.text || undefined,
      })
      if (!analysisResult.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Failed to start analysis: ${analysisResult.error.message}`,
          },
        ])
        setStatus("ready")
        return
      }

      // Add assistant message
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I'm analyzing "${uploadResult.data.title}". This usually takes about 30 seconds...`,
        },
      ])

      // Auto-open artifact panel
      openArtifact({
        type: "analysis",
        id: analysisResult.data.id,
        title: uploadResult.data.title,
      })

      setStatus("ready")
      return
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `An error occurred: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      ])
      setStatus("ready")
      return
    }
  }

  // Regular text message handling (existing mock behavior)
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: message.text,
  }
  setMessages((prev) => [...prev, userMessage])
  setStatus("submitted")

  await new Promise((resolve) => setTimeout(resolve, 500))
  setStatus("streaming")
  await new Promise((resolve) => setTimeout(resolve, 300))

  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: `I received your message: "${message.text}". Upload an NDA to analyze it!`,
  }
  setMessages((prev) => [...prev, assistantMessage])
  setStatus("ready")
}
```

**Step 2: Verify the page compiles**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/(main)/chat/page.tsx
git commit -m "$(cat <<'EOF'
feat(chat): wire file upload to analysis pipeline

- Uploads file via uploadDocument server action
- Triggers analysis with optional user prompt
- Auto-opens artifact panel with analysis ID
- Shows error messages on failure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire AnalysisView to Real Data

**Files:**
- Modify: `components/artifact/analysis-view.tsx`

**Step 1: Replace mock data with real fetching**

Replace the entire file content:

```typescript
"use client"

import * as React from "react"
import {
  BarChartIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  HelpCircleIcon,
  XCircleIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { useAnalysisProgress } from "@/hooks/use-analysis-progress"
import {
  getAnalysis,
  getAnalysisClauses,
  type Analysis,
  type ClauseExtraction,
} from "@/app/(main)/(dashboard)/analyses/actions"

type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown"

interface AnalysisViewProps {
  analysisId: string
  className?: string
}

const riskConfig: Record<
  RiskLevel,
  {
    label: string
    bgColor: string
    textColor: string
    borderColor: string
    icon: React.ElementType
    description: string
  }
> = {
  standard: {
    label: "Standard",
    bgColor: "oklch(0.90 0.08 175)",
    textColor: "oklch(0.45 0.14 175)",
    borderColor: "oklch(0.85 0.10 175)",
    icon: CheckCircleIcon,
    description: "Within market norms",
  },
  cautious: {
    label: "Cautious",
    bgColor: "oklch(0.90 0.08 65)",
    textColor: "oklch(0.50 0.14 65)",
    borderColor: "oklch(0.85 0.10 65)",
    icon: AlertTriangleIcon,
    description: "Review recommended",
  },
  aggressive: {
    label: "Aggressive",
    bgColor: "oklch(0.90 0.08 25)",
    textColor: "oklch(0.50 0.14 25)",
    borderColor: "oklch(0.85 0.10 25)",
    icon: AlertCircleIcon,
    description: "Negotiation recommended",
  },
  unknown: {
    label: "Unknown",
    bgColor: "oklch(0.92 0.01 280)",
    textColor: "oklch(0.45 0.01 280)",
    borderColor: "oklch(0.88 0.02 280)",
    icon: HelpCircleIcon,
    description: "Could not classify",
  },
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const config = riskConfig[level] || riskConfig.unknown
  const Icon = config.icon
  return (
    <Badge
      variant="outline"
      className="gap-1"
      style={{
        background: config.bgColor,
        color: config.textColor,
        borderColor: config.borderColor,
      }}
    >
      <Icon className="size-3" />
      {config.label}
    </Badge>
  )
}

function ClauseCard({ clause }: { clause: ClauseExtraction }) {
  const [open, setOpen] = React.useState(false)
  const riskLevel = (clause.riskLevel as RiskLevel) || "unknown"

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <CardTitle className="min-w-0 truncate text-sm font-medium">
              {clause.category}
            </CardTitle>
            <RiskBadge level={riskLevel} />
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {clause.riskExplanation || clause.clauseText.slice(0, 100)}
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <CollapsibleTrigger className="flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {open ? (
              <ChevronDownIcon className="size-3" />
            ) : (
              <ChevronRightIcon className="size-3" />
            )}
            {open ? "Hide details" : "Show details"}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="space-y-3 text-sm">
              <div>
                <p className="mb-1 font-medium text-muted-foreground">Clause Text</p>
                <blockquote className="border-l-2 border-muted pl-3 italic text-muted-foreground">
                  {clause.clauseText}
                </blockquote>
              </div>
              {clause.riskExplanation && (
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">
                    Risk Assessment
                  </p>
                  <p>{clause.riskExplanation}</p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  )
}

function ProgressView({ stage, progress }: { stage: string; progress: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <Loader2Icon
        className="size-8 animate-spin"
        style={{ color: "oklch(0.55 0.24 293)" }}
      />
      <p className="mt-4 text-sm text-muted-foreground">{stage || "Processing..."}</p>
      <Progress value={progress} className="mt-4 w-48" />
      <p className="mt-2 text-xs text-muted-foreground">{progress}%</p>
    </div>
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div
        className="mb-4 rounded-full p-4"
        style={{ background: "oklch(0.92 0.08 25)" }}
      >
        <XCircleIcon className="size-8" style={{ color: "oklch(0.50 0.14 25)" }} />
      </div>
      <h3 className="mb-2 text-lg font-medium">Analysis Failed</h3>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

export function AnalysisView({ analysisId, className }: AnalysisViewProps) {
  const { status, progress, stage, error } = useAnalysisProgress(analysisId)
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null)
  const [clauses, setClauses] = React.useState<ClauseExtraction[]>([])
  const [fetchError, setFetchError] = React.useState<string | null>(null)

  // Fetch full data once complete
  React.useEffect(() => {
    if (status === "completed") {
      Promise.all([getAnalysis(analysisId), getAnalysisClauses(analysisId)])
        .then(([analysisResult, clausesResult]) => {
          if (analysisResult.success) {
            setAnalysis(analysisResult.data)
          } else {
            setFetchError(analysisResult.error.message)
          }
          if (clausesResult.success) {
            setClauses(clausesResult.data)
          }
        })
        .catch((err) => {
          setFetchError(err.message)
        })
    }
  }, [status, analysisId])

  // Progress state
  if (status === "pending" || status === "processing") {
    return (
      <div className={cn("h-full", className)}>
        <ProgressView stage={stage} progress={progress} />
      </div>
    )
  }

  // Error state
  if (status === "failed" || error || fetchError) {
    return (
      <div className={cn("h-full", className)}>
        <ErrorView message={error || fetchError || "Analysis failed. Please try again."} />
      </div>
    )
  }

  // Loading results
  if (!analysis) {
    return (
      <div className={cn("h-full", className)}>
        <ProgressView stage="Loading results..." progress={100} />
      </div>
    )
  }

  // Calculate risk summary
  const riskCounts = clauses.reduce(
    (acc, clause) => {
      const level = (clause.riskLevel as RiskLevel) || "unknown"
      acc[level]++
      return acc
    },
    { standard: 0, cautious: 0, aggressive: 0, unknown: 0 } as Record<RiskLevel, number>
  )

  return (
    <div className={cn("flex h-full min-w-0 flex-col", className)}>
      {/* Summary bar */}
      <div className="border-b bg-muted/50 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="truncate font-medium">Analysis Results</h3>
          {analysis.overallRiskLevel && (
            <RiskBadge level={analysis.overallRiskLevel as RiskLevel} />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["standard", "cautious", "aggressive", "unknown"] as RiskLevel[]).map(
            (level) =>
              riskCounts[level] > 0 && (
                <div
                  key={level}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <RiskBadge level={level} />
                  <span>{riskCounts[level]}</span>
                </div>
              )
          )}
        </div>
        {analysis.overallRiskScore !== null && (
          <p className="mt-2 text-xs text-muted-foreground">
            Overall Risk Score: {analysis.overallRiskScore.toFixed(1)}%
          </p>
        )}
      </div>

      {/* Clause list */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {clauses.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No clauses extracted.
            </p>
          ) : (
            clauses.map((clause) => <ClauseCard key={clause.id} clause={clause} />)
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
```

**Step 2: Verify it compiles**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/artifact/analysis-view.tsx
git commit -m "$(cat <<'EOF'
feat(artifact): wire AnalysisView to real data

- Uses useAnalysisProgress hook for progress tracking
- Fetches analysis and clauses via server actions on completion
- Shows progress bar during analysis
- Shows error state on failure
- Displays real clause data with risk badges

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Run Full Test Suite and Integration Check

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Run build**

Run: `pnpm build`
Expected: Build succeeds

**Step 4: Commit any fixes if needed**

If there are lint or type errors, fix them and commit.

---

## Task 10: Manual E2E Verification

**Step 1: Start dev servers**

Run: `pnpm dev:all`
Expected: Next.js on :3000, Inngest on :8288

**Step 2: Login and navigate to chat**

1. Open http://localhost:3000
2. Login with test credentials
3. Navigate to /chat

**Step 3: Upload a test NDA**

1. Click the + button in chat
2. Select "Upload documents"
3. Choose a PDF or DOCX file
4. Optionally add text: "Focus on confidentiality terms"
5. Submit

**Step 4: Verify flow**

1. User message appears with file attachment
2. Assistant message: "I'm analyzing..."
3. Artifact panel opens automatically
4. Progress bar shows: Parsing → Classifying → Scoring → Gaps
5. Results display with clause cards

**Step 5: Check Inngest dashboard**

1. Open http://localhost:8288
2. Verify `nda/analysis.requested` event was sent
3. Verify `analyze-nda` function ran
4. Check progress events were emitted

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `db/schema/analyses.ts` | Add progressStage, progressPercent, metadata columns |
| 2 | `inngest/types.ts` | Add userPrompt to analysis request payload |
| 3 | `analyses/actions.ts` | Wire triggerAnalysis to send Inngest event |
| 4 | `analyze-nda.ts` | Persist progress to DB in emitProgress |
| 5 | `analyses/actions.ts` | Return real progress in getAnalysisStatus |
| 6 | `hooks/use-analysis-progress.ts` | Create polling hook |
| 7 | `chat/page.tsx` | Wire handleSubmit to upload + trigger |
| 8 | `analysis-view.tsx` | Wire to real data + progress hook |
| 9 | - | Run full test suite |
| 10 | - | Manual E2E verification |

All tasks follow TDD: test first, then implement, then commit.
