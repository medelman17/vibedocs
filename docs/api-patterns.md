# API Patterns

> Extracted from [PRD §12](./PRD.md#12-api-design). This is the authoritative reference for API response shapes, endpoint design, and server action patterns.

## Response Envelope

All API endpoints return a consistent response shape:

```typescript
type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId: string;
    processingTimeMs: number;
  };
};
```

---

## REST Endpoints

### Documents

| Method | Path                    | Description                               |
| ------ | ----------------------- | ----------------------------------------- |
| POST   | `/api/documents/upload` | Upload NDA document (multipart/form-data) |
| GET    | `/api/documents`        | List user's documents (paginated)         |
| GET    | `/api/documents/[id]`   | Get document details + status             |
| DELETE | `/api/documents/[id]`   | Soft-delete a document                    |

### Analyses

| Method | Path                         | Description                            |
| ------ | ---------------------------- | -------------------------------------- |
| POST   | `/api/analyses`              | Trigger analysis for a document        |
| GET    | `/api/analyses/[id]`         | Get analysis results                   |
| GET    | `/api/analyses/[id]/clauses` | Get clause extractions for an analysis |
| GET    | `/api/analyses/[id]/gaps`    | Get gap analysis results               |
| GET    | `/api/analyses/[id]/status`  | Poll analysis progress                 |

### Comparisons

| Method | Path                    | Description                             |
| ------ | ----------------------- | --------------------------------------- |
| POST   | `/api/comparisons`      | Create comparison between two documents |
| GET    | `/api/comparisons/[id]` | Get comparison results                  |

### Generation

| Method | Path                        | Description                            |
| ------ | --------------------------- | -------------------------------------- |
| POST   | `/api/generate`             | Generate NDA with specified parameters |
| GET    | `/api/generate/[id]`        | Get generated NDA                      |
| POST   | `/api/generate/[id]/export` | Export as DOCX or PDF                  |

### Inngest

| Method | Path           | Description                                           |
| ------ | -------------- | ----------------------------------------------------- |
| ANY    | `/api/inngest` | Inngest serve handler (all functions registered here) |

---

## Server Actions (Preferred for UI Mutations)

Server actions are the preferred pattern for mutations triggered from the UI. They run server-side, return typed responses, and integrate with Next.js form handling and revalidation.

```typescript
// app/(dashboard)/documents/actions.ts
"use server";

export async function uploadDocument(
  formData: FormData,
): Promise<ApiResponse<Document>>;

export async function deleteDocument(
  documentId: string,
): Promise<ApiResponse<void>>;

export async function triggerAnalysis(
  documentId: string,
): Promise<ApiResponse<Analysis>>;

export async function createComparison(
  docAId: string,
  docBId: string,
): Promise<ApiResponse<Comparison>>;

export async function generateNDA(
  params: GenerateParams,
): Promise<ApiResponse<GeneratedNDA>>;
```

### When to Use Server Actions vs. API Routes

| Pattern        | Use Case                                          |
| -------------- | ------------------------------------------------- |
| Server Actions | UI-triggered mutations (upload, delete, trigger)   |
| API Routes     | Polling (status), external integrations, webhooks  |
| Inngest Route  | All durable workflow triggers and callbacks        |

### Authentication in API Routes

All API routes and server actions require authenticated sessions. Pattern:

```typescript
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      { status: 401 }
    );
  }
  // ... handler logic with session.user.organizationId as tenant_id
}
```

### Tenant Context in Queries

All database queries in API routes and server actions must set the tenant context:

```typescript
import { withTenant } from "@/lib/tenant-context";

const result = await withTenant(session.user.organizationId, async (db) => {
  return db.select().from(documents).where(eq(documents.id, documentId));
});
```

This wrapper both sets `app.tenant_id` for RLS and adds an explicit `WHERE tenant_id = ?` for defense in depth.

---

## Validation

All request payloads validated with Zod schemas:

```typescript
import { z } from "zod";

export const uploadDocumentSchema = z.object({
  file: z.instanceof(File).refine(
    (f) => ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(f.type),
    "Only PDF and DOCX files are accepted"
  ),
});

export const generateNDASchema = z.object({
  partyA: z.string().min(1),
  partyB: z.string().min(1),
  governingLaw: z.string().min(1),
  effectiveDate: z.string().date(),
  confidentialityPeriod: z.number().int().positive(),
  nonCompeteDuration: z.number().int().nonnegative().optional(),
  disputeResolution: z.enum(["arbitration", "litigation", "mediation"]),
  templateSource: z.enum(["bonterms", "commonaccord"]),
});
```

---

## Error Codes

| Code                  | HTTP | Description                                 |
| --------------------- | ---- | ------------------------------------------- |
| `UNAUTHORIZED`        | 401  | No valid session                            |
| `FORBIDDEN`           | 403  | Valid session but insufficient permissions   |
| `NOT_FOUND`           | 404  | Resource doesn't exist or tenant mismatch   |
| `VALIDATION_ERROR`    | 422  | Request payload failed Zod validation       |
| `RATE_LIMITED`        | 429  | Too many requests                           |
| `ANALYSIS_FAILED`     | 500  | Agent pipeline error (check Inngest dashboard) |
| `EMBEDDING_FAILED`    | 502  | Voyage AI API error                         |
| `LLM_FAILED`          | 502  | Claude API error                            |
| `INTERNAL_ERROR`      | 500  | Unhandled server error                      |
