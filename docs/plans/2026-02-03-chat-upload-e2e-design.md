# Chat Upload End-to-End Design

> **Status:** ✅ COMPLETE (audited 2026-02-04)
>
> Implemented using AI SDK v6 and ai-elements components.

## Overview

Wire the chat UI to the backend so users can upload NDAs, trigger analysis, see progress, and view results - all within the chat interface.

## User Flow

```
User attaches NDA file in chat
    ↓
User optionally adds text: "Focus on IP clauses"
    ↓
Submit → uploadDocument(file) → documentId
    ↓
triggerAnalysis(documentId, { userPrompt }) → analysisId
    ↓
Auto-open artifact panel with AnalysisView
    ↓
AnalysisView polls progress: "Parsing... Classifying... Scoring..."
    ↓
Analysis complete → show clause cards with risk levels
```

## Architecture Decisions

### Progress Tracking: Polling

- Poll `getAnalysisStatus()` every 2 seconds
- Stop when status is `completed` or `failed`
- Simple, reliable, works immediately

### User Context: Pass Through

- User's text message (e.g., "focus on IP clauses") passed as `userPrompt`
- Stored in analysis metadata
- Available to Gap Analyst for contextual recommendations

### Artifact Behavior: Auto-Open

- When analysis starts, immediately open artifact panel
- Shows progress spinner with stage messages
- Transitions to results when complete

## Implementation Details

### 1. Schema Change

Add progress tracking to analyses:

```typescript
// db/schema/analyses.ts
progressStage: text("progress_stage"), // "parsing" | "classifying" | "scoring" | "analyzing_gaps" | "complete"
progressPercent: integer("progress_percent").default(0),
```

### 2. Wire triggerAnalysis to Inngest

```typescript
// app/(dashboard)/analyses/actions.ts
export async function triggerAnalysis(
  documentId: string,
  options?: { userPrompt?: string }
): Promise<ApiResponse<Analysis>> {
  // ... existing validation ...

  // Create analysis record
  const [analysis] = await db.insert(analyses).values({...}).returning()

  // Send Inngest event (REMOVE THE TODO)
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

  return ok(analysis)
}
```

### 3. Update Inngest to Persist Progress

```typescript
// inngest/functions/analyze-nda.ts
const emitProgress = async (stage, progress, message) => {
  // Persist to DB for polling
  await ctx.db
    .update(analyses)
    .set({ progressStage: stage, progressPercent: progress })
    .where(eq(analyses.id, analysisId))

  // Still emit event for real-time consumers (future SSE)
  await step.sendEvent("emit-progress", {...})
}
```

### 4. Create useAnalysisProgress Hook

```typescript
// hooks/use-analysis-progress.ts
export function useAnalysisProgress(analysisId: string | null) {
  const [state, setState] = useState({
    status: "pending",
    progress: 0,
    stage: "Queued for analysis...",
    isLoading: true,
  })

  useEffect(() => {
    if (!analysisId) return

    const poll = async () => {
      const result = await getAnalysisStatus(analysisId)
      if (result.success) {
        setState({
          status: result.data.status,
          progress: result.data.progress?.percent ?? 0,
          stage: result.data.progress?.step ?? "",
          isLoading: false,
        })
      }
    }

    poll() // Initial fetch
    const interval = setInterval(poll, 2000)

    return () => clearInterval(interval)
  }, [analysisId])

  // Stop polling when terminal state
  useEffect(() => {
    if (state.status === "completed" || state.status === "failed") {
      // Cleanup handled by dependency change
    }
  }, [state.status])

  return state
}
```

### 5. Wire Chat handleSubmit

```typescript
// app/(main)/chat/page.tsx
const handleSubmit = async (message: PromptInputMessage) => {
  // If files attached, run analysis flow
  if (message.files.length > 0) {
    const file = message.files[0] // MVP: single file

    // Upload document
    const formData = new FormData()
    formData.append("file", await fetchFileBlob(file.url))
    formData.append("title", file.filename ?? "Uploaded NDA")

    const uploadResult = await uploadDocument(formData)
    if (!uploadResult.success) {
      // Show error message
      return
    }

    // Trigger analysis
    const analysisResult = await triggerAnalysis(uploadResult.data.id, {
      userPrompt: message.text || undefined,
    })
    if (!analysisResult.success) {
      // Show error message
      return
    }

    // Add user message to chat
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: "user",
      content: message.text || `Analyze ${file.filename}`,
      files: message.files,
    }])

    // Add assistant message
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "I'm analyzing your NDA. This usually takes about 30 seconds...",
    }])

    // Auto-open artifact panel
    openArtifact({
      type: "analysis",
      id: analysisResult.data.id,
      title: uploadResult.data.title,
    })

    return
  }

  // Regular text message handling...
}
```

### 6. Wire AnalysisView to Real Data

```typescript
// components/artifact/analysis-view.tsx
export function AnalysisView({ analysisId }: { analysisId: string }) {
  const { status, progress, stage } = useAnalysisProgress(analysisId)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [clauses, setClauses] = useState<ClauseExtraction[]>([])

  // Fetch full data once complete
  useEffect(() => {
    if (status === "completed") {
      getAnalysis(analysisId).then(result => {
        if (result.success) setAnalysis(result.data)
      })
      getAnalysisClauses(analysisId).then(result => {
        if (result.success) setClauses(result.data)
      })
    }
  }, [status, analysisId])

  // Progress state
  if (status === "pending" || status === "processing") {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Loader2Icon className="size-8 animate-spin text-fuchsia-500" />
        <p className="mt-4 text-sm text-muted-foreground">{stage}</p>
        <Progress value={progress} className="mt-4 w-48" />
      </div>
    )
  }

  // Error state
  if (status === "failed") {
    return <ErrorView message="Analysis failed. Please try again." />
  }

  // Results state
  return (
    <div className="flex h-full flex-col">
      <SummaryBar analysis={analysis} clauses={clauses} />
      <ScrollArea className="flex-1">
        {clauses.map(clause => (
          <ClauseCard key={clause.id} clause={clause} />
        ))}
      </ScrollArea>
    </div>
  )
}
```

## Progress Stage Mapping

| Inngest Stage | Progress | UI Message |
|---------------|----------|------------|
| `pending` | 0% | "Queued for analysis..." |
| `parsing` | 20% | "Parsing document..." |
| `classifying` | 45% | "Classifying clauses..." |
| `scoring` | 70% | "Assessing risk levels..." |
| `analyzing_gaps` | 90% | "Analyzing gaps..." |
| `complete` | 100% | "Analysis complete" |

## Files to Modify

| File | Change |
|------|--------|
| `db/schema/analyses.ts` | Add `progressStage`, `progressPercent` columns |
| `app/(dashboard)/analyses/actions.ts` | Wire Inngest send, add `userPrompt` param |
| `inngest/functions/analyze-nda.ts` | Persist progress to DB |
| `hooks/use-analysis-progress.ts` | New file - polling hook |
| `app/(main)/chat/page.tsx` | Wire handleSubmit to upload → trigger → artifact |
| `components/artifact/analysis-view.tsx` | Replace mock with real data + progress |

## Implementation Order

1. Schema: Add progress columns + push migration
2. Backend: Wire `triggerAnalysis` to send Inngest event
3. Backend: Update Inngest to persist progress to DB
4. Frontend: Create `useAnalysisProgress` hook
5. Frontend: Wire chat `handleSubmit`
6. Frontend: Wire `AnalysisView` to real data

## Out of Scope (Future)

- Multiple file upload (MVP: single file)
- SSE for real-time progress (using polling for now)
- Conversation memory (chat is stateless for MVP)
- Re-analysis from chat (use dashboard for now)
