---
phase: 06-cuad-classification
plan: 04
subsystem: classification-ui
tags: [queries, server-actions, react, cuad, classification-view, confidence-badges]
depends_on:
  requires: ["06-01"]
  provides: ["Classification queries by category and position", "Classification server action", "Dual-view classification UI with confidence badges"]
  affects: ["07-risk-scoring", "08-gap-analysis"]
tech-stack:
  added: []
  patterns: ["Dual-view toggle UI pattern", "Confidence badge with threshold flag"]
key-files:
  created:
    - db/queries/classifications.ts
  modified:
    - app/(main)/(dashboard)/analyses/actions.ts
    - components/artifact/analysis-view.tsx
decisions:
  - id: "06-04-01"
    decision: "Classification queries use shared db client directly (not withTenant db)"
    reason: "Query functions in db/queries/ follow existing pattern of importing from db/client; tenant filtering via explicit tenantId parameter"
  - id: "06-04-02"
    decision: "ClassificationView fetches data on mount and view toggle via useEffect"
    reason: "Client-side fetching matches existing AnalysisView pattern (getAnalysis/getAnalysisClauses); avoids prop drilling classification data"
  - id: "06-04-03"
    decision: "No barrel export addition for db/queries/classifications"
    reason: "Per CLAUDE.md barrel export rules, import directly from db/queries/classifications where needed"
metrics:
  duration: "4.6 min"
  completed: "2026-02-05"
---

# Phase 6 Plan 4: Classification Queries & UI Summary

Classification queries, server actions, and dual-view UI for displaying multi-label CUAD chunk classifications with confidence badges and uncategorized chunk visibility.

## What Was Done

### Task 1: Classification Query Functions and Server Action (7e11539)

Created `db/queries/classifications.ts` with two query functions:

- **`getClassificationsByCategory(analysisId, tenantId)`**: Returns classifications grouped by CUAD category, alphabetically ordered. Within each category, classifications sorted by confidence descending. Uncategorized chunks appear as their own group.

- **`getClassificationsByPosition(analysisId, tenantId)`**: Returns classifications in document order (by chunkIndex), with primary labels sorted before secondary labels within each chunk position.

Added `getAnalysisClassifications` server action to `app/(main)/(dashboard)/analyses/actions.ts`:
- Validates analysisId as UUID
- Verifies analysis exists and belongs to tenant via `withTenant()`
- Delegates to appropriate query function based on `view` parameter ("category" | "position")
- Re-exports `ChunkClassificationRow` and `ClassificationsByCategory` types for client consumption

### Task 2: Classification View Components (19031cd)

Enhanced `components/artifact/analysis-view.tsx` with five new components:

- **`ConfidenceBadge`**: Displays confidence percentage. Below `CLASSIFICATION_THRESHOLDS.LOW_CONFIDENCE` (0.7), shows amber styling with AlertTriangleIcon and "Review" text.

- **`ClassificationCard`**: Collapsible card showing category name, primary/secondary indicator, confidence badge, rationale text, and expandable chunk position details.

- **`CategoryGroupView`**: Renders classifications grouped by category with count badges.

- **`DocumentOrderView`**: Renders classifications in sequential document order.

- **`ClassificationView`**: Main container with toggle buttons for switching between "By Category" and "Document Order" views. Fetches data via server action on mount and view change.

Integrated `ClassificationView` into the main `AnalysisView` component between the summary bar and clause list, wrapped in a bordered section with "CUAD Classifications" header.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `pnpm build` passes without errors
- `getClassificationsByCategory` and `getClassificationsByPosition` exported from `db/queries/classifications.ts`
- `getAnalysisClassifications` server action exported from analyses actions
- Classification view renders with toggle between "By Category" and "Document Order"
- Low-confidence (< 0.7) classifications show amber "Review" badge with AlertTriangleIcon
- "Uncategorized" entries appear in both views when present
- Existing clause cards and risk view remain unchanged

## Success Criteria Met

- [x] CLS-06: Document-level clause list supports both category-grouped and document-order views with toggle
- [x] CLS-05: Low-confidence classifications visually flagged
- [x] CLS-04: Multi-category clauses show primary and secondary labels
- [x] Uncategorized chunks explicitly visible (CONTEXT.md decision)
- [x] View-only interaction (no user override per CONTEXT.md)
- [x] No breaking changes to existing analysis view functionality

## Next Phase Readiness

Phase 6 (CUAD Classification) is now complete. All 4 plans delivered:
- 06-01: Schema and types
- 06-02: Enhanced batch classifier
- 06-03: Pipeline integration with persistence
- 06-04: Classification queries and UI (this plan)

Ready for Phase 7 (Risk Scoring) which will consume classification results from `chunkClassifications` table.
