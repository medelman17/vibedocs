---
phase: 12-admin-document-crud
plan: "01"
subsystem: admin-foundation
tags:
  - admin
  - crud
  - server-actions
  - role-enforcement
  - hard-delete
requires:
  - phase: 11
    plan: all
    reason: Admin infrastructure and role-based access
provides:
  - Admin server actions foundation
  - Role-gated admin layout
  - Hard delete with cascade cleanup
  - Bulk operations for document management
affects:
  - phase: 12
    plan: "02"
    reason: Data table UI will consume these server actions
tech-stack:
  added:
    - "@tanstack/react-table@^8.21.3"
  patterns:
    - requireRole(['admin', 'owner']) for admin actions
    - Hard delete with comparison cleanup before document delete
    - Blob file deletion before DB row deletion
    - Bulk operations with per-item error collection
key-files:
  created:
    - app/(main)/(admin)/admin/actions.ts
    - app/(main)/(admin)/admin/actions.test.ts
    - app/(main)/(admin)/admin/layout.tsx
  modified:
    - package.json
    - pnpm-lock.yaml
key-decisions:
  - title: Admin sees all org documents
    rationale: Admin actions use requireRole instead of withTenant, no uploadedBy filter
    impact: Admin can manage any document in the organization
  - title: Hard delete with cascade cleanup
    rationale: Comparisons FK constraint requires manual cleanup before document delete
    impact: adminDeleteDocument handles comparisons (documentAId and documentBId) plus blob plus DB row
  - title: Admin can delete last analysis
    rationale: Unlike dashboard deleteAnalysis, admin has full control
    impact: No guard against deleting the final analysis for a document
  - title: TanStack Table dependency
    rationale: Shadcn data table pattern requires TanStack Table for sorting/filtering/pagination
    impact: Enables headless table with full typing support in next plan
duration: 10min
completed: 2026-02-05
---

# Phase 12 Plan 01: Admin Server Actions Foundation Summary

**One-liner:** Admin CRUD server actions with requireRole enforcement, hard delete with cascade cleanup (comparisons + blob), and bulk operations for document management.

## Performance

**Execution time:** ~10 minutes
**Tasks completed:** 2 of 2
**Commits:** 2 atomic commits

**Timeline:**
- Start: 2026-02-05T23:01:41Z
- End: 2026-02-05T23:11:01Z

## Accomplishments

### Task 1: Install TanStack Table and Create Admin Server Actions

Installed `@tanstack/react-table@^8.21.3` for the data table UI (plan 02).

Created `app/(main)/(admin)/admin/actions.ts` with 7 admin server actions:

1. **adminGetDocuments** - Paginated document listing
   - Search by title (ILIKE)
   - Filter by status, fileType, dateRange (7d/30d/90d/all)
   - Sort by title, status, fileType, createdAt, fileSize (asc/desc)
   - Returns `{ documents: Document[], total: number }`
   - Admin sees **ALL** org documents (no uploadedBy filter)

2. **adminGetDocumentDetail** - Single document with analyses
   - Fetches document by id
   - Fetches associated analyses ordered by version desc
   - Returns `{ document: Document, analyses: Analysis[] }`

3. **adminUpdateDocumentTitle** - Edit title only
   - Only `title` is safely editable per RESEARCH.md
   - Updates `updatedAt` timestamp
   - Revalidates `/admin` path

4. **adminDeleteDocument** - Hard delete with cascade cleanup
   - **Step 1:** Verify document exists
   - **Step 2:** Delete comparisons where `documentAId = docId OR documentBId = docId`
   - **Step 3:** Delete blob file (try/catch, file may not exist)
   - **Step 4:** Hard delete document (cascades to chunks, analyses, classifications via FK)
   - Addresses research pitfall 6: blob deleted before DB row

5. **adminBulkDeleteDocuments** - Batch delete with error collection
   - Loops through documentIds array
   - Continues on failure, collecting per-document errors
   - Returns `{ deleted: number, errors: string[] }`

6. **adminDeleteAnalysis** - Delete individual analysis
   - **No last-analysis guard** (unlike dashboard version)
   - Admin can delete the final analysis for a document

7. **adminTriggerAnalysis** - Re-trigger analysis on existing document
   - Verifies document status is "ready" or "complete"
   - Gets next version number (max existing version + 1)
   - Creates new analysis record with status "pending"
   - Sends inngest event: `nda/analysis.requested` with source "web"
   - Safe inngest import from barrel per CLAUDE.md

### Task 2: Admin Layout and Action Tests

Created `app/(main)/(admin)/admin/layout.tsx`:
- Server Component layout enforcing `requireRole(["admin", "owner"])`
- Redirects non-admin users to `/dashboard?error=unauthorized`
- Simple flex layout with overflow-auto main area

Created `app/(main)/(admin)/admin/actions.test.ts`:
- Uses PGlite in-memory database (no Docker needed)
- Factory pattern: `createTestUser`, `createTestOrg`, `createTestDocument`, `createTestAnalysis`
- Mock setup: `requireRole`, `deleteFile`, `inngest.send`, `revalidatePath`
- **11 comprehensive tests:**
  1. Pagination returns documents + total count
  2. Search filter (ILIKE on title)
  3. Status filter
  4. Title update
  5. Cascade delete removes comparisons before document
  6. Cascade delete handles `documentAId` references
  7. Cascade delete handles `documentBId` references
  8. Bulk delete with partial failures
  9. Admin can delete last analysis
  10. Trigger analysis creates new version
  11. Trigger analysis sends inngest event

**All tests pass** (only pre-existing gap-analyst test failures remain).

## Task Commits

| Task | Commit | Description | Files |
|------|--------|-------------|-------|
| 1 | `0ae8ee6` | Install TanStack Table and create admin server actions | package.json, pnpm-lock.yaml, actions.ts |
| 2 | `b028a4a` | Add admin layout and action tests | layout.tsx, actions.test.ts |

## Files Created

1. **app/(main)/(admin)/admin/actions.ts** - 595 lines
   - 7 admin server actions
   - All use `requireRole(["admin", "owner"])`
   - Hard delete with cascade cleanup
   - Bulk operations with error collection

2. **app/(main)/(admin)/admin/actions.test.ts** - 429 lines
   - 11 comprehensive tests using PGlite
   - Factory pattern for test data
   - Mock setup for DAL, blob, inngest, Next.js cache

3. **app/(main)/(admin)/admin/layout.tsx** - 13 lines
   - Server-side role gate
   - Simple flex layout

## Files Modified

1. **package.json** - Added `@tanstack/react-table@^8.21.3`
2. **pnpm-lock.yaml** - Lock file updated

## Decisions Made

### Admin Sees All Org Documents
**Context:** Dashboard actions filter by `uploadedBy` to show only user's documents.
**Decision:** Admin actions use `requireRole(["admin", "owner"])` but do NOT filter by `uploadedBy`.
**Rationale:** Admins need full visibility into all organization documents.
**Impact:** `adminGetDocuments` returns ALL documents in the tenant, not just admin's uploads.

### Hard Delete with Cascade Cleanup
**Context:** Comparisons table has FK constraints to documents without `onDelete: cascade`.
**Decision:** Before hard-deleting a document, explicitly delete comparisons where `documentAId = docId OR documentBId = docId`.
**Rationale:** Avoids FK constraint violation. Database cascades handle chunks/analyses/classifications.
**Impact:** `adminDeleteDocument` requires 4 steps: verify → delete comparisons → delete blob → delete document.

### Blob File Deleted Before DB Row
**Context:** Research pitfall 6 warns about orphaned blob files.
**Decision:** Delete blob file BEFORE deleting DB row (with try/catch for missing files).
**Rationale:** If blob delete fails, DB row still exists as reference. If DB row deleted first, blob URL is lost.
**Impact:** Graceful handling of cases where blob is already gone.

### Admin Can Delete Last Analysis
**Context:** Dashboard `deleteAnalysis` blocks deleting the last analysis for a document.
**Decision:** `adminDeleteAnalysis` has no last-analysis guard.
**Rationale:** Locked decision from CONTEXT.md: "Admin can delete individual analyses from a document."
**Impact:** Admin can remove all analyses, leaving document with no analysis records.

### Inngest Source Field
**Context:** Initial implementation used `source: "admin-retrigger"` which isn't in the enum.
**Decision:** Use `source: "web"` for admin-triggered analyses.
**Rationale:** `analysisRequestedPayload` only allows `"web" | "web-upload" | "word-addin"`.
**Impact:** Admin re-triggered analyses appear as web-sourced in inngest events.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

### Issue 1: TypeScript Error on Inngest Source Field
**Symptom:** `Type '"admin-retrigger"' is not assignable to type '"web" | "web-upload" | "word-addin"'`
**Root cause:** `analysisRequestedPayload` schema defines a strict enum for source field.
**Resolution:** Changed to `source: "web"` per the allowed values.
**Prevented by:** Schema inspection before implementation.

### Issue 2: Test Failures Due to Invalid UUID
**Symptom:** PGlite error `invalid input syntax for type uuid: "test-tenant-id"`
**Root cause:** Tests used string literals instead of proper UUIDs.
**Resolution:** Refactored tests to use factory pattern (`createTestUser`, `createTestOrg`, etc.) which generate valid UUIDs.
**Reference:** Followed existing test pattern from `app/(main)/(dashboard)/analyses/actions.test.ts`.

## Next Phase Readiness

**Status:** ✅ Ready for Plan 02

**Blockers:** None

**Recommendations for Plan 02:**
1. Import admin server actions for data fetching
2. Use TanStack Table with `manualPagination`, `manualSorting`, `manualFiltering`
3. Column definitions should include select checkbox column for bulk operations
4. Delete confirmation dialog should show document title
5. Re-use existing shadcn components: Table, Dialog, Checkbox, Pagination, Select, Badge, Sheet

**Handoff artifacts:**
- Server actions ready: `adminGetDocuments`, `adminGetDocumentDetail`, `adminUpdateDocumentTitle`, `adminDeleteDocument`, `adminBulkDeleteDocuments`, `adminDeleteAnalysis`, `adminTriggerAnalysis`
- Layout enforces role gate
- TanStack Table installed
- Test infrastructure validated

## Self-Check: PASSED

**Created files verified:**
- ✅ app/(main)/(admin)/admin/actions.ts (exists)
- ✅ app/(main)/(admin)/admin/actions.test.ts (exists)
- ✅ app/(main)/(admin)/admin/layout.tsx (exists)

**Commits verified:**
- ✅ 0ae8ee6 (feat(12-01): install TanStack Table and create admin server actions)
- ✅ b028a4a (test(12-01): add admin layout and action tests)
