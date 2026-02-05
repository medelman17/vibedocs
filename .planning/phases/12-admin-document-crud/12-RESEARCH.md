# Phase 12: Admin Document CRUD - Research

**Researched:** 2026-02-05
**Domain:** Admin data table UI, role-gated CRUD operations, cascade deletion
**Confidence:** HIGH

## Summary

This phase builds an admin interface for managing documents within a multi-tenant organization. The codebase already has substantial infrastructure in place: server actions for document CRUD (`app/(main)/(dashboard)/documents/actions.ts`), analysis management (`app/(main)/(dashboard)/analyses/actions.ts`), an `(admin)` route group (`app/(main)/(admin)/`), role-checking via `requireRole()` in the DAL, and shadcn/ui primitives (table, dialog, checkbox, pagination, select, badge, sheet components).

The primary new work is: (1) a data table with TanStack React Table for sortable/filterable/selectable documents, (2) admin-specific server actions using `requireRole(["admin", "owner"])`, (3) a detail panel (sheet or side panel) for document inspection with associated analyses, (4) cascade delete logic that handles the comparisons table FK constraint, and (5) sidebar navigation changes to show an admin link conditionally.

**Primary recommendation:** Use `@tanstack/react-table` with the existing shadcn `Table` components following the shadcn Data Table recipe. Keep all data fetching in server actions with `requireRole()` enforcement. Use URL search params for pagination/filter state (no client-side state management library needed).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Data table layout with sortable columns
- Essential columns: name, upload date, status, file type
- Clicking a document row opens a detail panel with full information
- Search bar plus filter dropdowns for status, file type, date range
- Traditional numbered pagination with page size selector
- Full CRUD: Create (upload), Read (view/download), Update (edit metadata), Delete
- Bulk delete supported -- select multiple documents via checkboxes and delete at once
- Delete confirmation via modal dialog ("Are you sure?" with document name)
- Re-trigger analysis from admin page (creates new analysis on existing document)
- Only owner and admin roles can access the admin page
- Admin sees all documents in the organization (not just their own)
- Admin page lives at a separate /admin route with its own layout
- Admin link hidden completely from non-admin users (not rendered)
- Server-side role check enforced (not just client-side hide)
- Document detail panel shows list of associated analyses with status and link to analysis view
- Deleting a document cascade-deletes all associated analyses, chunks, classifications, etc.
- Admin can delete individual analyses from a document (keeping the document)

### Claude's Discretion
- Which document metadata fields are editable (based on schema inspection)
- Detail panel layout and information hierarchy
- Upload flow design within the admin page (can reuse existing upload components)
- Table empty state design
- Error state handling for failed operations

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-table | ^8.x | Headless data table with sorting, filtering, pagination, row selection | The shadcn Data Table pattern is built on TanStack Table; headless design lets us use existing shadcn Table components |
| shadcn/ui Table | existing | Table markup primitives | Already installed, provides styled `<Table>`, `<TableHead>`, `<TableRow>`, `<TableCell>` |
| shadcn/ui Dialog | existing | Delete confirmation modals | Already installed |
| shadcn/ui Checkbox | existing | Row selection for bulk operations | Already installed |
| shadcn/ui Pagination | existing | Numbered page navigation | Already installed |
| shadcn/ui Select | existing | Page size selector, filter dropdowns | Already installed |
| shadcn/ui Sheet | existing | Detail panel (slide-out from right) | Already installed; good for showing document details without leaving the table |
| shadcn/ui Badge | existing | Status badges | Already installed |
| shadcn/ui Input | existing | Search bar | Already installed |
| lucide-react | existing | Icons | Already installed |

### New Dependency
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-table | ^8.21 | Data table core | Required for sorting, filtering, pagination, row selection |

**No other new dependencies needed.** The existing shadcn components cover all UI needs.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @tanstack/react-table | Manual sort/filter with shadcn Table | Would hand-roll sorting, filtering, pagination, row selection -- much more code, more bugs |
| Sheet (detail panel) | Dedicated page route | Sheet keeps user in context of the table; page route loses table state |
| URL search params (pagination state) | nuqs or client state | URL params are simplest and already supported by Next.js; nuqs not installed |

**Installation:**
```bash
pnpm add @tanstack/react-table
```

## Architecture Patterns

### Recommended Project Structure
```
app/(main)/(admin)/
  admin/
    layout.tsx              # Admin layout with requireRole check + admin sidebar nav
    page.tsx                # Admin documents page (RSC with data fetching)
    loading.tsx             # Loading skeleton for the data table
    documents-table.tsx     # Client component: TanStack Table + shadcn Table
    columns.tsx             # Column definitions (ColumnDef[])
    toolbar.tsx             # Search bar + filter dropdowns
    document-detail.tsx     # Sheet/panel showing document details + analyses
    delete-dialog.tsx       # Confirmation dialog for single/bulk delete
    actions.ts              # Admin-specific server actions (with requireRole)
    actions.test.ts         # Tests for admin actions
components/shell/
  app-sidebar.tsx           # Updated: conditional admin link for owner/admin roles
```

### Pattern 1: Admin Layout with Role Gate
**What:** Server Component layout that enforces role check before rendering children.
**When to use:** Every admin route must be protected.
**Example:**
```typescript
// app/(main)/(admin)/admin/layout.tsx
import { requireRole } from "@/lib/dal"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Redirects to /dashboard?error=unauthorized if not admin/owner
  await requireRole(["admin", "owner"])

  return (
    <div className="flex h-full">
      {/* optional: admin nav sidebar */}
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}
```

### Pattern 2: Server Action with Role Enforcement
**What:** All admin CRUD actions call `requireRole()` instead of `withTenant()`.
**When to use:** Every admin action.
**Example:**
```typescript
// app/(main)/(admin)/admin/actions.ts
"use server"
import { requireRole } from "@/lib/dal"
import { ok, err, type ApiResponse } from "@/lib/api-response"

export async function adminGetDocuments(input: {
  page: number
  pageSize: number
  search?: string
  status?: string
  fileType?: string
}): Promise<ApiResponse<{ documents: Document[]; total: number }>> {
  const { db, tenantId } = await requireRole(["admin", "owner"])

  // Build query with filters, pagination, sorting
  // Return paginated results with total count
}
```

### Pattern 3: TanStack Table with shadcn Primitives
**What:** Headless table hook renders into shadcn Table components.
**When to use:** The main documents data table.
**Example:**
```typescript
// columns.tsx
import { ColumnDef } from "@tanstack/react-table"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"

export const columns: ColumnDef<Document>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "title",
    header: "Name",
    // sortable by default
  },
  {
    accessorKey: "createdAt",
    header: "Upload Date",
    cell: ({ row }) => formatDate(row.getValue("createdAt")),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <Badge variant={statusVariant(row.getValue("status"))}>{row.getValue("status")}</Badge>,
  },
  {
    accessorKey: "fileType",
    header: "Type",
    cell: ({ row }) => formatFileType(row.getValue("fileType")),
  },
]
```

### Pattern 4: Server-Side Pagination with URL State
**What:** Pagination and filter state lives in URL search params, processed by the RSC page.
**When to use:** The admin documents page.
**Example:**
```typescript
// app/(main)/(admin)/admin/page.tsx
import { adminGetDocuments } from "./actions"

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; size?: string; search?: string; status?: string; fileType?: string }>
}) {
  const params = await searchParams
  const page = parseInt(params.page ?? "1", 10)
  const pageSize = parseInt(params.size ?? "20", 10)

  const result = await adminGetDocuments({
    page,
    pageSize,
    search: params.search,
    status: params.status,
    fileType: params.fileType,
  })

  if (!result.success) {
    // handle error
  }

  return (
    <DocumentsTable
      data={result.data.documents}
      total={result.data.total}
      page={page}
      pageSize={pageSize}
    />
  )
}
```

### Pattern 5: Cascade Delete with Comparison Check
**What:** Before hard-deleting a document, check for referencing comparisons.
**When to use:** Admin document delete.
**Example:**
```typescript
// Check for comparisons referencing this document
const referencingComparisons = await db
  .select({ id: comparisons.id })
  .from(comparisons)
  .where(
    and(
      eq(comparisons.tenantId, tenantId),
      or(
        eq(comparisons.documentAId, documentId),
        eq(comparisons.documentBId, documentId),
      ),
    ),
  )
  .limit(1)

if (referencingComparisons.length > 0) {
  // Delete comparisons first, or return error asking admin to remove comparisons
  await db.delete(comparisons).where(
    and(
      eq(comparisons.tenantId, tenantId),
      or(
        eq(comparisons.documentAId, documentId),
        eq(comparisons.documentBId, documentId),
      ),
    ),
  )
}

// Now safe to hard-delete document (cascades to chunks, analyses, classifications)
await db.delete(documents).where(eq(documents.id, documentId))
```

### Anti-Patterns to Avoid
- **Client-only role check:** Never rely on hiding UI to enforce access. Always `requireRole()` server-side.
- **Soft delete for admin cascade:** The CONTEXT says "cascade-deletes all associated analyses, chunks, classifications." Soft delete does NOT trigger FK cascades. Use hard delete for the cascade behavior.
- **Loading all documents in RSC:** Always paginate server-side. Never `SELECT *` and paginate client-side.
- **Multiple sequential server calls for filters:** Bundle search, status, fileType, date range, pagination into a single server action call.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sortable/filterable table | Custom sort/filter state management | @tanstack/react-table | Handles multi-column sort, filter composition, row selection, pagination model out of the box |
| Row selection with bulk operations | Custom checkbox tracking | TanStack Table row selection model | Built-in `getIsSelected()`, `toggleAllPageRowsSelected()`, `getSelectedRowModel()` |
| Upload flow | New upload UI | Reuse existing `uploadDocument()` from `documents/actions.ts` | Already handles validation, blob upload, duplicate detection, content hashing |
| Delete confirmation modal | Custom modal logic | shadcn AlertDialog | Already installed; has accessible confirm/cancel pattern |
| Date formatting | Custom date formatter | `Intl.DateTimeFormat` or existing formatters | Browser-native, locale-aware |
| Analysis re-trigger | New inngest event pattern | Reuse `triggerAnalysis()` from `analyses/actions.ts` | Already handles version increment, inngest event sending, validation |

**Key insight:** Most of the backend logic already exists in the dashboard's server actions. The admin versions primarily differ by: (1) using `requireRole` instead of `withTenant`, (2) not filtering by `uploadedBy` (admin sees all org docs), and (3) adding hard-delete and bulk operations.

## Common Pitfalls

### Pitfall 1: Comparisons FK Blocks Document Deletion
**What goes wrong:** Hard-deleting a document fails with a foreign key violation because `comparisons.documentAId` or `comparisons.documentBId` references it WITHOUT `onDelete: cascade`.
**Why it happens:** The `comparisons` table uses default FK behavior (RESTRICT), unlike other tables that specify `onDelete: "cascade"`.
**How to avoid:** Before hard-deleting a document, query the `comparisons` table for references and delete those comparison records first. Alternatively, also delete the conversations that reference the document (but those use `onDelete: "set null"` so they're safe).
**Warning signs:** "foreign key constraint" PostgreSQL error on delete.

### Pitfall 2: Soft Delete vs Hard Delete Confusion
**What goes wrong:** Using `softDeleteDocument()` for admin cascade delete, which just sets `deletedAt` and doesn't cascade anything.
**Why it happens:** The existing dashboard `deleteDocument` action uses soft delete.
**How to avoid:** Admin delete must use `db.delete(documents).where(...)` for a real DELETE that triggers cascade FKs. Clean up blob storage separately. Also delete comparisons first (see Pitfall 1).
**Warning signs:** Analyses and chunks remain after "deleting" a document.

### Pitfall 3: Barrel Export Hazard
**What goes wrong:** Importing `inngest` from the barrel for the re-trigger analysis action pulls in heavy deps.
**Why it happens:** The CLAUDE.md explicitly warns about this pattern.
**How to avoid:** Import `inngest` from `@/inngest` (the barrel is safe for the client). But do NOT import functions from the barrel. If you need to send events, `import { inngest } from "@/inngest"` is fine -- just don't import functions.
**Warning signs:** Build-time errors about DOMMatrix or other browser-only APIs.

### Pitfall 4: Missing Server-Side Sort
**What goes wrong:** Sorting only works client-side on the current page of results, not across all documents.
**Why it happens:** TanStack Table sorting is client-side by default.
**How to avoid:** Pass sort column/direction to the server action and apply `ORDER BY` in the Drizzle query. Use TanStack Table in `manualSorting` mode.
**Warning signs:** Sorting only reorders the visible page, not the full dataset.

### Pitfall 5: Missing Total Count for Pagination
**What goes wrong:** Pagination shows wrong page count or "Load More" instead of numbered pages.
**Why it happens:** Forgetting to return `total` count alongside paginated results.
**How to avoid:** Always run a parallel `count(*)` query (or use `FILTER` aggregation) and return `{ documents, total }`.
**Warning signs:** "Page 1 of ?" or pagination controls missing.

### Pitfall 6: Blob File Orphans on Hard Delete
**What goes wrong:** Database record deleted but file remains in Vercel Blob storage.
**Why it happens:** Only deleting the DB row without cleaning up blob storage.
**How to avoid:** Delete the blob file BEFORE deleting the DB row (so if blob delete fails, the DB row still exists as a reference). Use try/catch to handle cases where blob is already gone.
**Warning signs:** Growing blob storage costs with no corresponding documents.

## Code Examples

### Editable Document Metadata Fields
Based on schema inspection of `db/schema/documents.ts`, the following fields are safe for admin editing:

| Field | Editable | Rationale |
|-------|----------|-----------|
| `title` | YES | Display name, no downstream impact |
| `fileName` | NO | Tied to blob storage path; changing breaks download |
| `fileType` | NO | Derived from actual file; changing would be misleading |
| `fileSize` | NO | Actual file property |
| `fileUrl` | NO | Blob storage URL |
| `contentHash` | NO | Derived from file content |
| `rawText` | NO | Extracted by parser agent |
| `status` | MAYBE | Admin could reset a stuck "processing" document to "pending" for retry |
| `errorMessage` | NO | Set by pipeline |
| `metadata` | NO | Set by pipeline agents |

**Recommendation:** Only `title` is safely editable. Status reset (processing -> pending) could be a separate "Reset" action. The existing `updateDocumentTitle` server action already handles title updates.

### Detail Panel Information Hierarchy
Recommended layout for the document detail Sheet:

```
Sheet (right side, ~480px wide)
├── Header: Document title + status badge
├── Section: Document Info
│   ├── File name
│   ├── File type (formatted: "PDF" / "DOCX")
│   ├── File size (formatted: "2.4 MB")
│   ├── Uploaded by (user name)
│   ├── Upload date (formatted)
│   └── Content hash (truncated)
├── Section: Actions
│   ├── Download button
│   ├── Edit title button (inline edit or small form)
│   ├── Re-run analysis button
│   └── Delete button (opens confirmation dialog)
├── Section: Analyses (count badge)
│   └── List of analyses:
│       ├── Version # | Status badge | Date | Risk score
│       ├── Link to analysis view
│       └── Delete analysis button (individual)
└── Section: Error Info (only if status === "failed")
    └── Error message
```

### Admin Data Table Query Pattern
```typescript
// Efficient paginated query with total count
export async function adminGetDocuments(input: {
  page: number
  pageSize: number
  search?: string
  status?: string
  fileType?: string
  sortBy?: string
  sortOrder?: "asc" | "desc"
}): Promise<ApiResponse<{ documents: Document[]; total: number }>> {
  const { db, tenantId } = await requireRole(["admin", "owner"])

  const { page, pageSize, search, status, fileType, sortBy, sortOrder } = input
  const offset = (page - 1) * pageSize

  // Build conditions
  const conditions = [
    eq(documents.tenantId, tenantId),
    isNull(documents.deletedAt),
  ]

  if (search) {
    conditions.push(ilike(documents.title, `%${search}%`))
  }
  if (status) {
    conditions.push(eq(documents.status, status))
  }
  if (fileType) {
    conditions.push(eq(documents.fileType, fileType))
  }

  // Determine sort
  const sortColumn = sortBy === "title" ? documents.title
    : sortBy === "status" ? documents.status
    : sortBy === "fileType" ? documents.fileType
    : documents.createdAt // default
  const orderFn = sortOrder === "asc" ? asc : desc

  // Parallel queries: data + count
  const [rows, [countResult]] = await Promise.all([
    db.select()
      .from(documents)
      .where(and(...conditions))
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: count() })
      .from(documents)
      .where(and(...conditions)),
  ])

  return ok({
    documents: rows,
    total: Number(countResult?.count ?? 0),
  })
}
```

### Bulk Delete Pattern
```typescript
export async function adminBulkDeleteDocuments(
  documentIds: string[]
): Promise<ApiResponse<{ deleted: number; errors: string[] }>> {
  const { db, tenantId } = await requireRole(["admin", "owner"])

  const errors: string[] = []
  let deleted = 0

  for (const docId of documentIds) {
    try {
      // Get document for blob cleanup
      const [doc] = await db.select({ id: documents.id, fileUrl: documents.fileUrl, title: documents.title })
        .from(documents)
        .where(and(eq(documents.id, docId), eq(documents.tenantId, tenantId)))
        .limit(1)

      if (!doc) {
        errors.push(`Document ${docId}: not found`)
        continue
      }

      // Delete comparisons referencing this document
      await db.delete(comparisons).where(
        and(
          eq(comparisons.tenantId, tenantId),
          or(
            eq(comparisons.documentAId, docId),
            eq(comparisons.documentBId, docId),
          ),
        ),
      )

      // Delete blob file
      if (doc.fileUrl) {
        try { await deleteFile(doc.fileUrl) } catch { /* file may not exist */ }
      }

      // Hard delete (cascades to chunks, analyses, classifications)
      await db.delete(documents).where(eq(documents.id, docId))
      deleted++
    } catch (error) {
      errors.push(`Document ${docId}: ${error instanceof Error ? error.message : "unknown error"}`)
    }
  }

  revalidatePath("/admin")
  return ok({ deleted, errors })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom table with manual sort/filter | TanStack Table v8 + shadcn | Stable since 2023 | Headless table with full typing support |
| Client-side only pagination | Server-side pagination + manual mode | Standard pattern | Scalable to thousands of documents |
| CSS Grid tables | `<table>` with shadcn styling | shadcn convention | Semantic HTML, accessible by default |

## Open Questions

1. **Bulk delete transaction scope**
   - What we know: Each document delete involves comparisons cleanup + blob delete + DB delete
   - What's unclear: Should all deletes be in a single DB transaction, or is per-document error handling acceptable?
   - Recommendation: Per-document with error collection (as shown in pattern above). Transactions across blob + DB are not possible anyway.

2. **Date range filter implementation**
   - What we know: User wants date range filter dropdown
   - What's unclear: Whether this should be a calendar date picker or preset ranges ("Last 7 days", "Last 30 days", etc.)
   - Recommendation: Use preset ranges (simpler UX). Can add `shadcn Calendar` + `DatePicker` later if needed. The existing `components/ui/calendar.tsx` is available.

3. **Admin link in sidebar vs. separate admin navigation**
   - What we know: Admin link should be hidden from non-admin users
   - What's unclear: Whether it should be a sidebar menu item or a separate nav bar within the admin layout
   - Recommendation: Add a sidebar menu item in `app-sidebar.tsx` (gated on role), and use a simple breadcrumb or tab bar within the admin layout for sub-pages (future: audit logs, user management).

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `db/schema/documents.ts`, `db/schema/analyses.ts`, `db/schema/comparisons.ts` -- cascade delete chain verified
- Codebase inspection: `lib/dal.ts` -- `requireRole()` pattern verified
- Codebase inspection: `app/(main)/(dashboard)/documents/actions.ts` -- existing CRUD actions reviewed
- Codebase inspection: `app/(main)/(dashboard)/analyses/actions.ts` -- triggerAnalysis, deleteAnalysis patterns reviewed
- Codebase inspection: `app/(main)/(admin)/audit/actions.ts` -- existing admin action pattern with `requireRole(["admin", "owner"])`
- Codebase inspection: `components/shell/app-sidebar.tsx` -- sidebar structure for admin link placement
- Codebase inspection: `components/ui/` -- confirmed table, dialog, checkbox, pagination, select, badge, sheet all installed

### Secondary (MEDIUM confidence)
- [shadcn/ui Data Table documentation](https://ui.shadcn.com/docs/components/radix/data-table) -- TanStack Table integration pattern
- [TanStack Table](https://tanstack.com/table/latest) -- headless table library for sorting, filtering, pagination

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- based on installed dependencies and existing patterns in codebase
- Architecture: HIGH -- follows established project conventions (route groups, server actions, DAL)
- Pitfalls: HIGH -- verified by inspecting FK constraints and cascade behavior in schema files
- Code examples: HIGH -- derived from actual codebase patterns

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (stable domain, no rapidly changing dependencies)
