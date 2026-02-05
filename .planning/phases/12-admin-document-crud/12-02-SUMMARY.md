---
phase: 12-admin-document-crud
plan: "02"
subsystem: admin-ui
tags:
  - admin
  - data-table
  - tanstack-table
  - server-side-pagination
  - url-state
requires:
  - phase: 12
    plan: "01"
    reason: Admin server actions for data fetching
provides:
  - Admin documents data table with TanStack Table
  - Server-side pagination, sorting, filtering
  - URL-based state management
  - Row selection for bulk operations
  - Search and filter toolbar
affects:
  - phase: 12
    plan: "03"
    reason: Detail panel and bulk delete will extend this UI
tech-stack:
  added: []
  patterns:
    - TanStack Table in manual mode (server-side pagination/sorting)
    - URL search params for all table state
    - Debounced search input (300ms)
    - Numbered pagination with page size selector
    - Row selection with checkbox column
key-files:
  created:
    - app/(main)/(admin)/admin/columns.tsx
    - app/(main)/(admin)/admin/documents-table.tsx
    - app/(main)/(admin)/admin/toolbar.tsx
    - app/(main)/(admin)/admin/loading.tsx
    - app/(main)/(admin)/admin/page.tsx
  modified: []
key-decisions:
  - title: Server-side pagination and sorting
    rationale: Large document sets require server-side operations; client-side would load all data
    impact: TanStack Table runs in manual mode, all operations update URL params and trigger RSC refetch
  - title: URL-based state for all filters
    rationale: Makes table state shareable and bookmarkable; standard pattern for data tables
    impact: Page, pageSize, search, status, fileType, dateRange, sortBy, sortOrder all in URL search params
  - title: Empty state differentiation
    rationale: Users need different messages for "no documents yet" vs "no matches for filters"
    impact: Empty state checks for active filter params and renders appropriate message with clear filters option
  - title: Selection state via callback
    rationale: DocumentsTable is client component managing row selection; parent needs selected IDs for bulk operations
    impact: onSelectionChange callback prop exposes selected document IDs to parent
duration: 3min
completed: 2026-02-05
---

# Phase 12 Plan 02: Admin Data Table UI Summary

**One-liner:** TanStack Table-powered admin documents view with server-side pagination/sorting/filtering, URL-based state, debounced search, and row selection for bulk operations.

## Performance

**Execution time:** ~3 minutes (208 seconds)
**Tasks completed:** 2 of 2
**Commits:** 2 atomic commits

**Timeline:**
- Start: 2026-02-05T23:15:21Z
- End: 2026-02-05T23:18:49Z

## Accomplishments

### Task 1: Column definitions and documents table client component

**Column definitions** (`columns.tsx`):
- **Select column:** Checkbox for row selection (header toggles all page rows, cell toggles individual row)
- **Title column:** Document name with truncation at 60 chars, tooltip on overflow
- **Upload date column:** Formatted as "Feb 5, 2026" using Intl.DateTimeFormat
- **Status column:** Badge with variant mapping:
  - "pending" → default variant
  - "parsing"/"embedding"/"analyzing" → secondary variant, label "Processing"
  - "ready"/"complete" → outline variant + green text, label "Complete"
  - "failed" → destructive variant
  - "cancelled" → secondary variant
- **File type column:** MIME type formatted to human-readable (PDF, DOCX)
- **File size column:** Bytes formatted to KB/MB with 1 decimal place

**Documents table** (`documents-table.tsx`):
- TanStack Table with `manualPagination: true` and `manualSorting: true` for server-side operations
- Sorting: Click column headers to toggle sort direction, updates URL params (sortBy, sortOrder)
- Row selection: TanStack Table's built-in selection state, checkbox column excluded from row click handler
- Row click: Calls `onRowClick(row.original.id)` for navigation to detail panel (future implementation)
- Empty states:
  - **No filters active:** "No documents yet. Upload your first NDA to get started."
  - **Filters active:** "No documents match your filters." with clear filters button
- Pagination:
  - **Left:** "Showing X-Y of Z documents" + "{N} selected" when rows selected
  - **Center:** Numbered page buttons (first, last, current ± 1-2, ellipsis for gaps)
  - **Right:** Page size selector (10, 20, 50, 100 rows per page)
- All pagination/sort changes update URL search params via `useRouter().replace()` with `useSearchParams()` to preserve existing params
- `onSelectionChange` callback prop exposes selected document IDs to parent component

### Task 2: Toolbar, loading skeleton, and admin page RSC

**Toolbar** (`toolbar.tsx`):
- **Search bar:** Debounced input (300ms delay) that updates `search` URL param and resets page to 1
- **Status filter:** Select with options: All statuses, Pending, Processing, Complete, Failed, Cancelled
- **File type filter:** Select with options: All types, PDF, DOCX (stores MIME type values in URL)
- **Date range filter:** Select with preset ranges: All time, Last 7 days, Last 30 days, Last 90 days
- **Bulk delete button:** Shown only when `selectedCount > 0`, destructive variant with trash icon and count
- All filter changes update URL params and reset page to 1 via `useRouter().replace()`

**Loading skeleton** (`loading.tsx`):
- Header: Title + badge skeleton
- Toolbar: Search input + 3 select placeholders
- Table: Header row + 6 data rows with skeleton cells matching column widths
- Pagination: Info text + page numbers + page size selector skeletons

**Admin page** (`page.tsx`):
- Server Component (RSC) that:
  1. Reads URL search params (Next.js 16 pattern: `searchParams` is a Promise)
  2. Parses pagination (page, size), search, filters (status, fileType, dateRange), sorting (sortBy, sortOrder)
  3. Calls `adminGetDocuments()` with parsed params
  4. Renders error state if `!result.success` (Alert with error message)
  5. Renders page header with title + total count badge
  6. Renders `AdminDocumentsView` client component with fetched data
- **AdminDocumentsView** client component:
  - Wraps Toolbar and DocumentsTable (interactive parts)
  - Tracks selected document IDs via state
  - Handles row click (logs document ID, future: navigate to detail panel)
  - Handles bulk delete click (logs selected IDs, future: trigger bulk delete dialog)
  - Passes `onSelectionChange` callback to DocumentsTable

## Task Commits

| Task | Commit | Description | Files |
|------|--------|-------------|-------|
| 1 | `7e8d2a5` | Column definitions and documents table with TanStack Table | columns.tsx, documents-table.tsx |
| 2 | `1493f0e` | Toolbar, loading skeleton, and admin page RSC | toolbar.tsx, loading.tsx, page.tsx, documents-table.tsx |

## Files Created

1. **app/(main)/(admin)/admin/columns.tsx** - 178 lines
   - TanStack Table column definitions
   - Select, title, createdAt, status, fileType, fileSize columns
   - Helper functions: formatFileSize, formatFileType, getStatusBadgeVariant, getStatusLabel

2. **app/(main)/(admin)/admin/documents-table.tsx** - 381 lines
   - Client component rendering TanStack Table
   - Manual pagination and sorting (server-side)
   - Row selection with callback to parent
   - Numbered pagination with page size selector
   - Empty state differentiation (no-documents vs no-filter-matches)

3. **app/(main)/(admin)/admin/toolbar.tsx** - 159 lines
   - Search bar with 300ms debounce
   - Status, file type, date range filter selects
   - Bulk delete button (visible when selectedCount > 0)

4. **app/(main)/(admin)/admin/loading.tsx** - 64 lines
   - Loading skeleton for page transition states

5. **app/(main)/(admin)/admin/page.tsx** - 148 lines
   - Server Component fetching data via adminGetDocuments
   - AdminDocumentsView client component for interactive parts
   - Selection state management and callbacks

## Files Modified

None - all new files created.

## Decisions Made

### Server-side pagination and sorting
**Context:** Admin may have large document sets across entire organization.
**Decision:** Use TanStack Table in manual mode with `manualPagination: true` and `manualSorting: true`.
**Rationale:** Client-side pagination would require loading all documents into memory. Server-side operations scale to any dataset size.
**Impact:** All pagination/sort/filter changes update URL params and trigger RSC refetch. Table receives paginated slice from server.

### URL-based state for all filters
**Context:** Data tables often have complex state (page, search, filters, sort).
**Decision:** Store ALL table state in URL search params: page, size, search, status, fileType, dateRange, sortBy, sortOrder.
**Rationale:** Makes table state shareable (copy URL to colleague), bookmarkable (return to specific view), and follows Next.js App Router patterns.
**Impact:** `useSearchParams()` reads state, `router.replace()` updates state. RSC re-fetches on param change. No local state for filters.

### Empty state differentiation
**Context:** Empty table can mean "no documents exist" or "no matches for current filters".
**Decision:** Check for active filter params (`search`, `status`, `fileType`, `dateRange`) to determine which empty state to show.
**Rationale:** Users need different actions: "Upload first document" vs "Clear filters to see results".
**Impact:** `hasActiveFilters` memo checks `useSearchParams()` values. Empty state shows appropriate message + optional clear filters button.

### Selection state via callback
**Context:** DocumentsTable is a client component managing row selection via TanStack Table. Parent (AdminDocumentsView) needs selected IDs for bulk operations.
**Decision:** Add `onSelectionChange?: (selectedIds: string[]) => void` prop to DocumentsTable. Call it via useEffect when `selectedRowIds` changes.
**Rationale:** Standard React pattern for lifting state up. Table owns selection state, parent receives updates via callback.
**Impact:** Parent can pass `selectedIds.length` to Toolbar for "Delete (N)" button and `selectedIds` to future bulk delete dialog.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

### Issue 1: ESLint error on `any` type
**Symptom:** Pre-commit hook failed: `documents: any[]` parameter in AdminDocumentsView flagged by `@typescript-eslint/no-explicit-any`.
**Root cause:** Function signature used `any[]` for documents parameter type.
**Resolution:** Imported `AdminDocument` type from columns.tsx and used `documents: AdminDocument[]`.
**Prevented by:** Running TypeScript check before committing.

### Issue 2: React Compiler warning for TanStack Table
**Symptom:** ESLint warning about `useReactTable()` returning functions that cannot be memoized safely.
**Root cause:** React Compiler (experimental) flags TanStack Table's API as incompatible with automatic memoization.
**Resolution:** Added `// eslint-disable-next-line react-hooks/incompatible-library` directive above `useReactTable()` call.
**Rationale:** This is expected behavior for TanStack Table. The warning is informational, not a bug.

## Next Phase Readiness

**Status:** ✅ Ready for Plan 03

**Blockers:** None

**Recommendations for Plan 03:**
1. Detail panel: Implement Sheet component for document details + analyses list
2. Bulk delete: Use Dialog component with confirmation, call `adminBulkDeleteDocuments()`
3. Re-trigger analysis: Use `adminTriggerAnalysis()` from detail panel actions
4. Title editing: Inline editing or dialog with `adminUpdateDocumentTitle()`
5. Navigation: Implement `onRowClick` to open detail panel (Sheet or route to `/admin/documents/[id]`)

**Handoff artifacts:**
- Data table fully functional with server-side operations
- Row selection ready for bulk delete
- Empty states guide users appropriately
- All state in URL for shareability
- Loading skeleton for page transitions

## Self-Check: PASSED

**Created files verified:**
- ✅ app/(main)/(admin)/admin/columns.tsx (exists)
- ✅ app/(main)/(admin)/admin/documents-table.tsx (exists)
- ✅ app/(main)/(admin)/admin/toolbar.tsx (exists)
- ✅ app/(main)/(admin)/admin/loading.tsx (exists)
- ✅ app/(main)/(admin)/admin/page.tsx (exists)

**Commits verified:**
- ✅ 7e8d2a5 (feat(12-02): add column definitions and documents table with TanStack Table)
- ✅ 1493f0e (feat(12-02): add toolbar, loading skeleton, and admin page RSC)
