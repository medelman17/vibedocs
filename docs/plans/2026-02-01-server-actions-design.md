# Server Actions API Design

> Internal API surface for the Next.js UI using Server Actions.
> Created: 2026-02-01

---

## Overview

This document defines the complete Server Actions API for the NDA Analyst application. Server Actions are the preferred pattern for UI-triggered operations, providing type-safe RPC with automatic revalidation.

### Design Principles

1. **Consistent Response Envelope** — All actions return `Promise<ApiResponse<T>>`
2. **Tenant Isolation** — Every action enforces tenant context via DAL
3. **Validation First** — Zod schemas validate all inputs before processing
4. **Fail Fast** — Return early with typed errors, never throw
5. **Optimistic Updates** — Return data shapes that enable UI optimism

### Response Type

All Server Actions use the standard envelope from `docs/api-patterns.md`:

```typescript
// src/lib/api-response.ts
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId: string;
    processingTimeMs: number;
  };
};

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "DUPLICATE"
  | "ANALYSIS_FAILED"
  | "EMBEDDING_FAILED"
  | "LLM_FAILED"
  | "INTERNAL_ERROR";
```

### Helper Functions

```typescript
// src/lib/api-response.ts
export function ok<T>(data: T, meta?: ApiResponse<T>["meta"]): ApiResponse<T> {
  return { success: true, data, meta };
}

export function err<T = never>(
  code: ErrorCode,
  message: string,
  details?: unknown
): ApiResponse<T> {
  return { success: false, error: { code, message, details } };
}
```

---

## File Organization

```
app/
├── (dashboard)/
│   ├── documents/
│   │   └── actions.ts          # Document CRUD + dashboard stats
│   ├── analyses/
│   │   └── actions.ts          # Analysis triggers + results
│   ├── comparisons/
│   │   └── actions.ts          # Comparison operations
│   ├── generate/
│   │   └── actions.ts          # NDA generation
│   └── settings/
│       ├── organization/
│       │   └── actions.ts      # Org management
│       ├── members/
│       │   └── actions.ts      # Member management
│       ├── profile/
│       │   └── actions.ts      # User profile
│       └── notifications/
│           └── actions.ts      # Notification prefs
├── (auth)/
│   └── actions.ts              # Session + invitations
└── (admin)/
    └── audit/
        └── actions.ts          # Audit log viewing
```

---

## Documents (8 actions)

**File:** `app/(dashboard)/documents/actions.ts`

### uploadDocument

Upload an NDA document to Vercel Blob and create database record.

```typescript
export async function uploadDocument(
  formData: FormData
): Promise<ApiResponse<Document>>
```

**Input Schema:**
```typescript
const uploadDocumentSchema = z.object({
  file: z.instanceof(File).refine(
    (f) => ALLOWED_TYPES.includes(f.type),
    "Only PDF and DOCX files accepted"
  ).refine(
    (f) => f.size <= MAX_FILE_SIZE,
    "File must be under 10MB"
  ),
  title: z.string().min(1).max(255).optional(),
});
```

**Flow:**
1. Validate session → `withTenant()`
2. Validate file type/size
3. Compute content hash (SHA-256)
4. Check for duplicate (same hash + tenant)
5. Upload to Vercel Blob
6. Insert document record with status `pending`
7. Send `nda/uploaded` event to Inngest
8. Return document

**Errors:** `UNAUTHORIZED`, `VALIDATION_ERROR`, `DUPLICATE`, `INTERNAL_ERROR`

---

### getDocuments

List documents for current tenant with optional filters.

```typescript
export async function getDocuments(input?: {
  status?: DocumentStatus;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<{ documents: Document[]; total: number }>>
```

**Input Schema:**
```typescript
const getDocumentsSchema = z.object({
  status: z.enum(["pending", "processing", "ready", "error"]).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
}).optional();
```

**Flow:**
1. Validate session → `withTenant()`
2. Query documents with filters, exclude soft-deleted
3. Count total for pagination
4. Return paginated list

---

### getDocument

Get a single document by ID.

```typescript
export async function getDocument(
  documentId: string
): Promise<ApiResponse<Document>>
```

**Errors:** `UNAUTHORIZED`, `NOT_FOUND`

---

### getDocumentWithChunks

Get document with all processed text chunks.

```typescript
export async function getDocumentWithChunks(
  documentId: string
): Promise<ApiResponse<Document & { chunks: DocumentChunk[] }>>
```

---

### updateDocumentTitle

Rename a document.

```typescript
export async function updateDocumentTitle(
  documentId: string,
  title: string
): Promise<ApiResponse<Document>>
```

**Input Schema:**
```typescript
const updateTitleSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().min(1).max(255),
});
```

---

### deleteDocument

Soft-delete a document.

```typescript
export async function deleteDocument(
  documentId: string
): Promise<ApiResponse<void>>
```

**Flow:**
1. Validate ownership
2. Set `deletedAt` timestamp
3. Optionally cancel any in-progress analyses

---

### getDocumentDownloadUrl

Get a signed URL to download the original file.

```typescript
export async function getDocumentDownloadUrl(
  documentId: string
): Promise<ApiResponse<{ url: string; expiresAt: string }>>
```

**Flow:**
1. Validate ownership
2. Generate signed Vercel Blob URL (expires in 1 hour)

---

### getDashboardStats

Get aggregate statistics for the dashboard.

```typescript
export async function getDashboardStats(): Promise<ApiResponse<{
  totalDocuments: number;
  documentsByStatus: Record<DocumentStatus, number>;
  averageRiskScore: number | null;
  commonGaps: Array<{ category: string; count: number }>;
  recentAnalyses: Array<{ id: string; documentTitle: string; completedAt: string; riskLevel: string }>;
}>>
```

---

## Analyses (9 actions)

**File:** `app/(dashboard)/analyses/actions.ts`

### triggerAnalysis

Start analysis pipeline for a document.

```typescript
export async function triggerAnalysis(
  documentId: string
): Promise<ApiResponse<Analysis>>
```

**Flow:**
1. Validate document exists and is `ready`
2. Create analysis record with status `pending`
3. Send `analysis/requested` event to Inngest
4. Return analysis with `inngestRunId`

---

### getAnalysis

Get full analysis results.

```typescript
export async function getAnalysis(
  analysisId: string
): Promise<ApiResponse<Analysis>>
```

---

### getAnalysisStatus

Lightweight status check for polling.

```typescript
export async function getAnalysisStatus(
  analysisId: string
): Promise<ApiResponse<{
  status: AnalysisStatus;
  progress?: { step: string; percent: number };
}>>
```

---

### getAnalysisClauses

Get clause extractions with optional filters.

```typescript
export async function getAnalysisClauses(
  analysisId: string,
  filters?: {
    category?: string;
    riskLevel?: RiskLevel;
    minConfidence?: number;
  }
): Promise<ApiResponse<ClauseExtraction[]>>
```

---

### getAnalysisGaps

Get gap analysis results.

```typescript
export async function getAnalysisGaps(
  analysisId: string
): Promise<ApiResponse<{
  missingClauses: string[];
  weakClauses: Array<{ category: string; reason: string }>;
  recommendations: Array<{ category: string; recommendation: string; priority: "low" | "medium" | "high" }>;
}>>
```

---

### getDocumentAnalyses

Get all analysis versions for a document.

```typescript
export async function getDocumentAnalyses(
  documentId: string
): Promise<ApiResponse<Analysis[]>>
```

---

### rerunAnalysis

Create a new analysis version for a document.

```typescript
export async function rerunAnalysis(
  documentId: string
): Promise<ApiResponse<Analysis>>
```

**Flow:**
1. Get latest analysis version number
2. Create new analysis with `version: latest + 1`
3. Trigger Inngest pipeline

---

### cancelAnalysis

Cancel an in-progress analysis.

```typescript
export async function cancelAnalysis(
  analysisId: string
): Promise<ApiResponse<void>>
```

**Flow:**
1. Validate analysis is `pending` or `processing`
2. Cancel Inngest run via API
3. Update status to `cancelled`

---

### exportAnalysisPdf

Generate a PDF report of the analysis.

```typescript
export async function exportAnalysisPdf(
  analysisId: string
): Promise<ApiResponse<{ url: string; expiresAt: string }>>
```

**Flow:**
1. Validate analysis is `completed`
2. Generate PDF using pdf-lib
3. Upload to Vercel Blob
4. Return signed URL

---

## Comparisons (6 actions)

**File:** `app/(dashboard)/comparisons/actions.ts`

### createComparison

Compare two uploaded documents.

```typescript
export async function createComparison(
  documentAId: string,
  documentBId: string
): Promise<ApiResponse<Comparison>>
```

**Input Schema:**
```typescript
const createComparisonSchema = z.object({
  documentAId: z.string().uuid(),
  documentBId: z.string().uuid(),
}).refine(
  (d) => d.documentAId !== d.documentBId,
  "Cannot compare document with itself"
);
```

---

### compareWithTemplate

Compare an uploaded document against a reference template.

```typescript
export async function compareWithTemplate(
  documentId: string,
  templateId: string
): Promise<ApiResponse<Comparison>>
```

**Note:** `templateId` references `reference_documents` table (Bonterms, CommonAccord).

---

### getComparison

Get full comparison results.

```typescript
export async function getComparison(
  comparisonId: string
): Promise<ApiResponse<Comparison & {
  documentA: Document;
  documentB: Document;
}>>
```

---

### getComparisonStatus

Lightweight status check.

```typescript
export async function getComparisonStatus(
  comparisonId: string
): Promise<ApiResponse<{ status: ComparisonStatus }>>
```

---

### getDocumentComparisons

Get all comparisons involving a document.

```typescript
export async function getDocumentComparisons(
  documentId: string
): Promise<ApiResponse<Comparison[]>>
```

---

### deleteComparison

Remove a comparison.

```typescript
export async function deleteComparison(
  comparisonId: string
): Promise<ApiResponse<void>>
```

---

## Generation (8 actions)

**File:** `app/(dashboard)/generate/actions.ts`

### getTemplates

List available NDA templates.

```typescript
export async function getTemplates(
  source?: "bonterms" | "commonaccord"
): Promise<ApiResponse<Template[]>>
```

**Note:** Queries `reference_documents` table filtered by source.

---

### getTemplate

Get a single template with preview.

```typescript
export async function getTemplate(
  templateId: string
): Promise<ApiResponse<Template & { preview: string }>>
```

---

### generateNda

Generate an NDA from a template.

```typescript
export async function generateNda(input: {
  templateSource: "bonterms" | "commonaccord";
  parameters: NdaParameters;
}): Promise<ApiResponse<GeneratedNda>>
```

**Input Schema:**
```typescript
const generateNdaSchema = z.object({
  templateSource: z.enum(["bonterms", "commonaccord"]),
  parameters: z.object({
    disclosingParty: partySchema,
    receivingParty: partySchema,
    effectiveDate: z.string().date(),
    termYears: z.number().int().min(1).max(10),
    mutual: z.boolean(),
    governingLaw: z.string().min(1),
    disputeResolution: z.enum(["litigation", "arbitration", "mediation"]).optional(),
    includeNonSolicit: z.boolean().optional(),
    includeNonCompete: z.boolean().optional(),
  }),
});
```

---

### getGeneratedNda

Get a generated NDA by ID.

```typescript
export async function getGeneratedNda(
  ndaId: string
): Promise<ApiResponse<GeneratedNda>>
```

---

### getGeneratedNdas

List user's generated NDAs.

```typescript
export async function getGeneratedNdas(input?: {
  status?: "draft" | "finalized" | "archived";
  limit?: number;
}): Promise<ApiResponse<GeneratedNda[]>>
```

---

### updateGeneratedNda

Edit a draft NDA.

```typescript
export async function updateGeneratedNda(
  ndaId: string,
  updates: {
    title?: string;
    content?: string;
    parameters?: Partial<NdaParameters>;
  }
): Promise<ApiResponse<GeneratedNda>>
```

**Constraints:** Only allowed when status is `draft`.

---

### finalizeNda

Lock an NDA for signing.

```typescript
export async function finalizeNda(
  ndaId: string
): Promise<ApiResponse<GeneratedNda>>
```

**Flow:**
1. Validate status is `draft`
2. Render final HTML
3. Update status to `finalized`

---

### exportGeneratedNda

Export as DOCX or PDF.

```typescript
export async function exportGeneratedNda(
  ndaId: string,
  format: "docx" | "pdf"
): Promise<ApiResponse<{ url: string; expiresAt: string }>>
```

---

## Organizations (8 actions)

**File:** `app/(dashboard)/settings/organization/actions.ts`

### createOrganization

Create a new organization.

```typescript
export async function createOrganization(input: {
  name: string;
  slug: string;
}): Promise<ApiResponse<Organization>>
```

**Flow:**
1. Validate slug uniqueness
2. Create organization
3. Add current user as `owner`
4. Switch session to new org

---

### getOrganization

Get current organization details.

```typescript
export async function getOrganization(): Promise<ApiResponse<Organization>>
```

---

### updateOrganization

Update organization settings.

```typescript
export async function updateOrganization(updates: {
  name?: string;
  slug?: string;
}): Promise<ApiResponse<Organization>>
```

**Requires:** `admin` or `owner` role.

---

### deleteOrganization

Soft-delete an organization.

```typescript
export async function deleteOrganization(): Promise<ApiResponse<void>>
```

**Requires:** `owner` role.
**Flow:**
1. Confirm user is owner
2. Set `deletedAt` on organization
3. Remove from user's session

---

## Members (4 actions)

**File:** `app/(dashboard)/settings/members/actions.ts`

### getOrganizationMembers

List all members of current organization.

```typescript
export async function getOrganizationMembers(): Promise<ApiResponse<Array<{
  id: string;
  user: { id: string; name: string; email: string; image?: string };
  role: "owner" | "admin" | "member";
  acceptedAt: string | null;
}>>>
```

---

### inviteMember

Invite a user to the organization.

```typescript
export async function inviteMember(input: {
  email: string;
  role: "admin" | "member";
}): Promise<ApiResponse<{ membershipId: string }>>
```

**Requires:** `admin` or `owner` role.
**Flow:**
1. Check if user exists, create if not
2. Create pending membership
3. Send invitation email via Resend

---

### updateMemberRole

Change a member's role.

```typescript
export async function updateMemberRole(
  userId: string,
  role: "admin" | "member"
): Promise<ApiResponse<void>>
```

**Requires:** `owner` role (only owners can change roles).
**Constraints:** Cannot change owner's role.

---

### removeMember

Remove a member from the organization.

```typescript
export async function removeMember(
  userId: string
): Promise<ApiResponse<void>>
```

**Requires:** `admin` or `owner` role.
**Constraints:** Cannot remove the last owner.

---

## User/Session (6 actions)

**File:** `app/(auth)/actions.ts`

### switchOrganization

Switch the active organization in session.

```typescript
export async function switchOrganization(
  orgId: string
): Promise<ApiResponse<void>>
```

**Flow:**
1. Validate user is member of org
2. Update `session.activeOrganizationId`

---

### getUserOrganizations

Get all organizations the user belongs to.

```typescript
export async function getUserOrganizations(): Promise<ApiResponse<Array<{
  organization: Organization;
  role: "owner" | "admin" | "member";
}>>>
```

---

### acceptInvitation

Accept a pending organization invitation.

```typescript
export async function acceptInvitation(
  membershipId: string
): Promise<ApiResponse<{ organizationId: string }>>
```

---

### declineInvitation

Decline a pending invitation.

```typescript
export async function declineInvitation(
  membershipId: string
): Promise<ApiResponse<void>>
```

---

### updateProfile

Update user profile.

```typescript
export async function updateProfile(updates: {
  name?: string;
  image?: string;
}): Promise<ApiResponse<User>>
```

**File:** `app/(dashboard)/settings/profile/actions.ts`

---

### changePassword

Change password for email/password users.

```typescript
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ApiResponse<void>>
```

**Input Schema:**
```typescript
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain uppercase letter")
    .regex(/[a-z]/, "Password must contain lowercase letter")
    .regex(/[0-9]/, "Password must contain number"),
});
```

**Flow:**
1. Verify current password with bcrypt
2. Validate new password strength
3. Hash and update password

---

## Notifications (3 actions)

**File:** `app/(dashboard)/settings/notifications/actions.ts`

### getNotificationPreferences

Get user's notification settings.

```typescript
export async function getNotificationPreferences(): Promise<ApiResponse<{
  emailAnalysisComplete: boolean;
  emailWeeklyDigest: boolean;
  emailInvitations: boolean;
}>>
```

---

### updateNotificationPreferences

Update notification settings.

```typescript
export async function updateNotificationPreferences(prefs: {
  emailAnalysisComplete?: boolean;
  emailWeeklyDigest?: boolean;
  emailInvitations?: boolean;
}): Promise<ApiResponse<void>>
```

---

### getNotifications

Get user's notifications (in-app).

```typescript
export async function getNotifications(input?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<ApiResponse<Notification[]>>
```

---

## Audit (1 action)

**File:** `app/(admin)/audit/actions.ts`

### getAuditLogs

View audit log history.

```typescript
export async function getAuditLogs(input?: {
  tableName?: string;
  action?: "INSERT" | "UPDATE" | "DELETE" | "ACCESS";
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<{
  logs: AuditLog[];
  total: number;
}>>
```

**Requires:** `admin` or `owner` role.

---

## Summary

| Domain | Actions | File |
|--------|---------|------|
| Documents | 8 | `documents/actions.ts` |
| Analyses | 9 | `analyses/actions.ts` |
| Comparisons | 6 | `comparisons/actions.ts` |
| Generation | 8 | `generate/actions.ts` |
| Organizations | 4 | `settings/organization/actions.ts` |
| Members | 4 | `settings/members/actions.ts` |
| User/Session | 6 | `(auth)/actions.ts` + `settings/profile/actions.ts` |
| Notifications | 3 | `settings/notifications/actions.ts` |
| Audit | 1 | `(admin)/audit/actions.ts` |

**Total: 57 Server Actions**

---

## Implementation Notes

### Action Template

```typescript
"use server";

import { z } from "zod";
import { verifySession, withTenant } from "@/lib/dal";
import { ok, err, type ApiResponse } from "@/lib/api-response";

const inputSchema = z.object({
  // ...
});

export async function actionName(
  input: z.infer<typeof inputSchema>
): Promise<ApiResponse<ReturnType>> {
  // 1. Auth check
  const session = await verifySession();
  if (!session) {
    return err("UNAUTHORIZED", "Not authenticated");
  }

  // 2. Input validation
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
  }

  // 3. Tenant context
  const { db, tenantId } = await withTenant();

  try {
    // 4. Business logic
    const result = await db./* query */;

    // 5. Return success
    return ok(result);
  } catch (error) {
    console.error("[actionName]", error);
    return err("INTERNAL_ERROR", "Something went wrong");
  }
}
```

### Revalidation

After mutations, use `revalidatePath` or `revalidateTag`:

```typescript
import { revalidatePath } from "next/cache";

// After document upload
revalidatePath("/dashboard");
revalidatePath("/documents");

// After analysis complete (from Inngest callback)
revalidateTag(`analysis-${analysisId}`);
```

### Rate Limiting

Consider rate limiting for expensive operations:

| Action | Limit |
|--------|-------|
| `uploadDocument` | 10/min |
| `triggerAnalysis` | 5/min |
| `generateNda` | 10/min |
| `exportAnalysisPdf` | 5/min |

Implement with Upstash Redis or similar.
