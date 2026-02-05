# Phase 12: Admin Document CRUD - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin interface for managing documents in the system. Admins can list, view, create (upload), edit metadata, and delete documents — plus manage associated analyses. This is a dedicated /admin area restricted to owner and admin roles.

</domain>

<decisions>
## Implementation Decisions

### Document listing
- Data table layout with sortable columns
- Essential columns: name, upload date, status, file type
- Clicking a document row opens a detail panel with full information
- Search bar plus filter dropdowns for status, file type, date range
- Traditional numbered pagination with page size selector

### Document actions
- Full CRUD: Create (upload), Read (view/download), Update (edit metadata), Delete
- Bulk delete supported — select multiple documents via checkboxes and delete at once
- Delete confirmation via modal dialog ("Are you sure?" with document name)
- Re-trigger analysis from admin page (creates new analysis on existing document)

### Access & scope
- Only owner and admin roles can access the admin page
- Admin sees all documents in the organization (not just their own)
- Admin page lives at a separate /admin route with its own layout
- Admin link hidden completely from non-admin users (not rendered)
- Server-side role check enforced (not just client-side hide)

### Related data
- Document detail panel shows list of associated analyses with status and link to analysis view
- Deleting a document cascade-deletes all associated analyses, chunks, classifications, etc.
- Admin can delete individual analyses from a document (keeping the document)

### Claude's Discretion
- Which document metadata fields are editable (based on schema inspection)
- Detail panel layout and information hierarchy
- Upload flow design within the admin page (can reuse existing upload components)
- Table empty state design
- Error state handling for failed operations

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The admin page should feel consistent with the existing VibeDocs UI patterns (shadcn/ui components, Tailwind styling).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-admin-document-crud*
*Context gathered: 2026-02-05*
