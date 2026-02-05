---
phase: 11
plan: 06
subsystem: document-rendering
tags: [chat-tab, clause-context, useChat, AI-SDK-6, zustand, analysis-panel]

dependency_graph:
  requires:
    - "11-02 (useClauseSelection store with askAboutClause action)"
    - "11-03 (ClauseHighlight component with tooltip)"
    - "11-04 (AnalysisTabs with Chat tab placeholder)"
  provides:
    - "ChatTab component for embedded analysis chat"
    - "'Ask about this' flow from clause tooltip to chat"
    - "Lazy-mounted chat with auto-send for clause context"
  affects:
    - "11-07 (bidirectional clause navigation may extend chat context)"
    - "11-08 (responsive layout may need mobile chat adjustments)"

tech_stack:
  added: []
  patterns:
    - "useChat with DefaultChatTransport for embedded chat"
    - "Zustand store-driven tab switching (askAboutClause -> activeTab)"
    - "Lazy component mounting (unmount when tab not active)"
    - "Streamdown for compact markdown rendering"

key_files:
  created:
    - "components/analysis/chat-tab.tsx"
  modified:
    - "components/analysis/analysis-tabs.tsx"
    - "components/document/clause-highlight.tsx"
    - "components/document/document-renderer.tsx"

decisions:
  - id: "11-06-01"
    description: "useState for conversationId instead of useRef (react-hooks/refs ESLint v7 rule)"
    rationale: "ESLint react-hooks v7 flags ref access inside useMemo as render-time access even when inside callback; useState avoids the lint error with minimal overhead (transport recreated once per conversation)"
  - id: "11-06-02"
    description: "clauseText is optional prop on ClauseHighlight (Ask about this only shows when provided)"
    rationale: "Backward compatible - existing callers not using the feature continue to work without changes"
  - id: "11-06-03"
    description: "ChatTab lazy-mounted only when Chat tab active"
    rationale: "Avoids useChat WebSocket/fetch overhead when user is on other tabs"

metrics:
  duration: "6.7 min"
  completed: "2026-02-05"
---

# Phase 11 Plan 06: Chat Tab Integration with "Ask About This" Clause Flow Summary

Embedded chat in analysis panel with clause-context auto-send via zustand store actions.

## What Was Built

1. **ChatTab Component** (`components/analysis/chat-tab.tsx`): A lightweight chat component designed for the analysis panel tab. Uses `useChat` from `@ai-sdk/react` with `DefaultChatTransport` pointing to the existing `/api/chat` route. Features compact message rendering with Streamdown markdown, auto-scroll to bottom, auto-resize textarea, and an empty state showing the document title.

2. **"Ask About This" Flow**: When a user clicks "Ask about this" in a clause tooltip, the `askAboutClause` zustand action sets `activeTab: 'chat'` and `pendingClauseContext`. AnalysisTabs switches to the Chat tab, and ChatTab picks up the pending context via a `useEffect` that auto-sends "Explain this clause: > {clauseText}" and clears the context.

3. **Lazy Chat Mounting**: ChatTab is only rendered when the Chat tab is active (`activeTab === "chat"`), preventing unnecessary useChat connections when users are browsing other tabs.

## Task Summary

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Create ChatTab component | be65bc7 | New `chat-tab.tsx` with useChat, Streamdown, pendingClauseContext handling |
| 2 | Wire ChatTab + "Ask about this" | d7a4142 | Replace placeholder in analysis-tabs.tsx, add button to clause-highlight tooltip, pass clauseText from document-renderer |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 11-06-01 | useState for conversationId instead of useRef | ESLint react-hooks v7 flags ref access inside useMemo; useState avoids the lint error with minimal overhead |
| 11-06-02 | clauseText as optional prop on ClauseHighlight | Backward compatible - "Ask about this" only shows when clauseText is provided |
| 11-06-03 | ChatTab lazy-mounted only when active | Avoids useChat WebSocket/fetch overhead when user is on other tabs |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint react-hooks/refs false positive with useRef in useMemo**
- **Found during:** Task 1
- **Issue:** ESLint plugin react-hooks v7.0.1 `refs` rule flagged `conversationIdRef.current` access inside `useMemo` callback, even though the ref was only read inside a nested `body: () => {}` callback (not during render)
- **Fix:** Switched from `useRef` to `useState` for conversationId, passing it directly as `body: { conversationId, analysisId }` instead of a callback. Transport recreates when conversationId changes (only once per new conversation).
- **Files modified:** `components/analysis/chat-tab.tsx`
- **Commit:** be65bc7

## Verification Results

- `pnpm build`: Passed (no type errors, no ESLint errors in new/modified files)
- `npx tsc --noEmit`: No errors in chat-tab.tsx, analysis-tabs.tsx, clause-highlight.tsx, document-renderer.tsx
- `npx eslint`: 0 errors across all modified files (1 pre-existing warning in document-renderer.tsx for TanStack Virtual)

## Next Phase Readiness

- Chat tab is functional and wired to the "Ask about this" clause flow
- Remaining plans 11-07 (bidirectional clause navigation) and 11-08 (responsive layout) can build on this foundation
- No blockers identified
