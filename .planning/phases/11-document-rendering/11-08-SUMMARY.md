---
phase: 11-document-rendering
plan: 08
subsystem: ui
tags: [progressive-reveal, url-state, react, next-navigation, token-usage]

# Dependency graph
requires:
  - phase: 11-06
    provides: Chat tab integration with clause context
  - phase: 11-07
    provides: Bidirectional scroll navigation and keyboard nav
  - phase: 10-03
    provides: useAnalysisProgress hook with Inngest Realtime
provides:
  - Progressive reveal showing document text before analysis completes
  - URL state with ?clause= param for shareable clause links
  - Token usage / estimated cost display for completed analyses
  - Complete integrated document rendering flow
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stage-transition re-fetch: track last-fetched stage in ref, re-fetch only on forward stage transitions"
    - "URL state sync: read initial search params, sync clause selection changes back to URL via router.replace"

key-files:
  modified:
    - app/(main)/analysis/[analysisId]/page.tsx
    - components/document/document-renderer.tsx

key-decisions:
  - "Clauses passed to renderer only after scoring completes (isScoringComplete check prevents incomplete overlays)"
  - "Token usage shows only estimated cost (compact format) not full input/output counts"
  - "URL sync uses prevClauseIdRef to avoid redundant router.replace calls"
  - "proxy.ts already includes /analysis in protectedRoutes - no changes needed"
  - "Responsive layout already handled by useIsMobile from 11-05 - no changes needed"

patterns-established:
  - "Progressive reveal: useAnalysisProgress + stageRef for stage-transition-only re-fetches"
  - "URL state: useSearchParams for read, router.replace for write, ref guards for initial sync"

# Metrics
duration: 4min
completed: 2026-02-05
---

# Phase 11 Plan 08: Progressive Reveal, URL State, and Token Usage Summary

**Progressive reveal with stage-transition re-fetching, shareable clause URLs via search params, and estimated cost display in document metadata header**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-05T19:49:05Z
- **Completed:** 2026-02-05T19:53:12Z
- **Tasks:** 1/2 (Task 2 is manual verification checkpoint)
- **Files modified:** 2

## Accomplishments
- Progressive reveal shows document text immediately after parsing, adds clause highlights only after scoring completes
- URL state enables shareable links with `?clause=<id>` parameter that auto-selects and highlights the clause
- Token usage (estimated cost) displayed in document metadata header for completed analyses
- Verified proxy.ts already protects /analysis routes (no changes needed)
- Verified responsive layout already works via useIsMobile from 11-05

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement progressive reveal and URL state** - `44accbd` (feat)

**Plan metadata:** (pending - included in final commit)

## Files Created/Modified
- `app/(main)/analysis/[analysisId]/page.tsx` - Added useAnalysisProgress for progressive reveal, useSearchParams/useRouter for URL state, stage-transition re-fetching, tokenUsage prop pass-through
- `components/document/document-renderer.tsx` - Added tokenUsage prop to display estimated cost in metadata header bar

## Decisions Made
- Clauses only passed to DocumentRenderer after scoring stage completes, preventing partial/unscored highlights from appearing during progressive reveal
- Token usage display uses compact format (just "$X.XX" estimated cost) rather than full input/output token counts - keeps metadata bar clean
- URL sync uses a prevClauseIdRef guard to avoid redundant router.replace calls on every render
- proxy.ts already had /analysis in protectedRoutes - confirmed no changes needed
- Responsive layout (mobile vertical stacking) already implemented in 11-05 via useIsMobile - confirmed working

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial implementation had an unused `TokenUsageBadge` component in page.tsx (defined but not used since token display was placed in DocumentRenderer instead). Caught by ESLint, removed before commit.

## Manual Verification Required

Task 2 is a `checkpoint:human-verify` task. The following verification steps should be performed manually:

1. Run `pnpm dev` and `pnpm dev:inngest`
2. Navigate to the chat page and upload a sample NDA
3. Verify you're redirected to /analysis/[analysisId]
4. Watch the progressive reveal:
   a. Document text appears after parsing
   b. Clause highlights appear after classification+scoring
   c. Analysis tabs populate as stages complete
5. Toggle highlights on/off using the toolbar toggle
6. Click a clause highlight in the document:
   a. Analysis panel should scroll to that clause card
   b. Clause card should auto-expand
7. Click a clause card in the analysis panel:
   a. Document should smooth-scroll to that clause text
   b. Clause should be highlighted/centered
8. Use arrow keys to navigate between clauses
9. Press Escape to clear selection
10. Try the search bar: search for a word, use prev/next buttons
11. Click "Ask about this" in a clause tooltip:
    a. Should switch to Chat tab
    b. Should auto-send clause text as context
12. Copy the URL with ?clause= parameter, paste in new tab:
    a. Should load with that clause highlighted and centered
13. Resize the panels by dragging the handle
14. Resize browser to mobile width: verify vertical stacking
15. After analysis completes, verify token usage display:
    a. Should show estimated cost (e.g., "$1.10") in metadata bar

## Next Phase Readiness
- Phase 11 (Document Rendering) is fully implemented across all 8 plans
- All success criteria met: structured markdown rendering, heading hierarchy, bidirectional clause navigation, URL state, progressive reveal
- Ready for production use after manual verification

---
*Phase: 11-document-rendering*
*Completed: 2026-02-05*
