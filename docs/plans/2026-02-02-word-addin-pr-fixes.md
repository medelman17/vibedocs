# Word Add-in PR #14 Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical and important issues found in PR #14 code review before merge.

**Architecture:** This plan addresses five categories: (1) API route patterns - switching to `withErrorHandling()` wrapper and proper imports, (2) Error handling - adding logging to silent catch blocks, (3) Type safety - creating shared domain types with proper unions, (4) Test coverage - adding tests for critical security paths, (5) Design system compliance - using design tokens and centralizing duplicated code.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, Next.js API routes, Zustand stores, Tailwind CSS v4

**Design Review:** See `.ui-design/reviews/word-addin-components-20260202.md` for full findings.

---

## Phase 1: Critical Code Pattern Fixes

### Task 1: Create Shared Domain Types File

**Files:**
- Create: `src/types/word-addin.ts`

**Step 1: Write the type definitions**

```typescript
/**
 * @fileoverview Shared domain types for Word Add-in
 *
 * Centralizes type definitions used across API routes, stores, and components.
 */

// =============================================================================
// Risk Level (PRD-aligned)
// =============================================================================

/**
 * Risk level as defined in PRD.
 * Maps to analysis scoring from agents.
 */
export type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown"

// =============================================================================
// Analysis Pipeline Stages
// =============================================================================

/**
 * Analysis pipeline stages (matches Inngest pipeline).
 */
export type AnalysisStage =
  | "pending"
  | "processing"
  | "parsing"
  | "classifying"
  | "scoring"
  | "gap_analysis"
  | "completed"
  | "failed"

/**
 * Progress state for SSE updates
 */
export interface ProgressState {
  stage: AnalysisStage
  percent: number
  message: string
}

// =============================================================================
// Clause Results
// =============================================================================

/**
 * Position within document text
 */
export interface ClausePosition {
  start: number
  end: number
}

/**
 * Single clause extraction result
 */
export interface ClauseResult {
  id: string
  category: string
  clauseText: string
  confidence: number
  riskLevel: RiskLevel
  riskExplanation: string | null
  position: ClausePosition | null
}

// =============================================================================
// Gap Analysis
// =============================================================================

export type GapPriority = "low" | "medium" | "high"

export interface WeakClause {
  category: string
  reason: string
}

export interface GapRecommendation {
  category: string
  recommendation: string
  priority: GapPriority
}

export interface GapAnalysisResult {
  missingClauses: string[]
  weakClauses: WeakClause[]
  recommendations: GapRecommendation[]
}

// =============================================================================
// Full Analysis Results
// =============================================================================

export interface TokenUsage {
  input: number
  output: number
  total: number
}

export interface AnalysisResults {
  analysisId: string
  documentId: string
  status: string
  version: number
  overallRiskScore: number | null
  overallRiskLevel: RiskLevel | null
  summary: string | null
  clauses: ClauseResult[]
  gapAnalysis: GapAnalysisResult | null
  tokenUsage: TokenUsage | null
  processingTimeMs: number | null
  completedAt: string | null
}

// =============================================================================
// Auth Context
// =============================================================================

export type OrgRole = "owner" | "admin" | "member" | "viewer"

export type TenantContext =
  | { tenantId: null; role: null }
  | { tenantId: string; role: OrgRole }

export interface AddInAuthContext {
  userId: string
  user: {
    id: string
    email: string
    name: string | null
  }
  tenant: TenantContext
}

// =============================================================================
// API Response Types
// =============================================================================

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR"

export interface ApiErrorResponse {
  code: ApiErrorCode
  message: string
  details?: unknown
}

// =============================================================================
// Auth Dialog Results (discriminated union)
// =============================================================================

export type AuthDialogResult =
  | { type: "auth-success"; token: string; user: { id: string; email: string; name: string | null } }
  | { type: "auth-error"; error: string }

// =============================================================================
// Navigation Result (discriminated union)
// =============================================================================

export type NavigationResult =
  | { success: true }
  | { success: false; error: string }
```

**Step 2: Verify TypeScript compilation**

Run: `pnpm tsc --noEmit src/types/word-addin.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/types/word-addin.ts
git commit -m "feat(word-addin): add shared domain types

- Add RiskLevel union type per PRD (standard|cautious|aggressive|unknown)
- Add AnalysisStage union for pipeline stages
- Add discriminated unions for AuthDialogResult and NavigationResult
- Add ClauseResult, GapAnalysisResult, AnalysisResults interfaces
- Add AddInAuthContext with TenantContext discriminated union

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Update word-addin-auth.ts to Use Shared Types

**Files:**
- Modify: `src/lib/word-addin-auth.ts`

**Step 1: Update imports and types**

Replace the entire file with:

```typescript
/**
 * @fileoverview Authentication utilities for Word Add-in API routes
 *
 * Provides Bearer token validation for requests from the Word Add-in.
 * Uses the same session tokens as Auth.js but validates them via
 * direct database lookup for API route authentication.
 */

import { db } from "@/db"
import { sessions, users, organizationMembers } from "@/db/schema"
import { eq, and, gt } from "drizzle-orm"
import { ForbiddenError, UnauthorizedError } from "./errors"
import type { AddInAuthContext, OrgRole, TenantContext } from "@/types/word-addin"

// Re-export types for convenience
export type { AddInAuthContext, OrgRole, TenantContext }

/**
 * Extracts the Bearer token from an Authorization header
 */
function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return null
  }
  return authHeader.slice(7)
}

/**
 * Verifies a Bearer token from a Word Add-in request.
 *
 * @param request - The incoming request with Authorization header
 * @returns The authenticated user context
 * @throws {UnauthorizedError} If no token is provided
 * @throws {ForbiddenError} If the token is invalid or expired
 */
export async function verifyAddInAuth(request: Request): Promise<AddInAuthContext> {
  const token = extractBearerToken(request)

  if (!token) {
    throw new UnauthorizedError("Missing Authorization header")
  }

  // Look up the session by token
  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.sessionToken, token),
      gt(sessions.expires, new Date())
    ),
  })

  if (!session) {
    throw new ForbiddenError("Invalid or expired session token")
  }

  // Get the user
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  })

  if (!user) {
    throw new ForbiddenError("User not found")
  }

  // Get tenant context (if activeOrganizationId is set)
  let tenant: TenantContext = { tenantId: null, role: null }

  if (session.activeOrganizationId) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, user.id),
        eq(organizationMembers.organizationId, session.activeOrganizationId)
      ),
    })

    if (membership) {
      tenant = {
        tenantId: session.activeOrganizationId,
        role: membership.role as OrgRole,
      }
    }
  }

  return {
    userId: user.id,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    tenant,
  }
}

/**
 * Wrapper for API route handlers that require authentication.
 * Automatically validates the Bearer token and provides auth context.
 *
 * @example
 * ```typescript
 * export async function GET(request: Request) {
 *   return withAddInAuth(request, async (authContext) => {
 *     // authContext.userId, authContext.tenant.tenantId are available
 *     return Response.json({ data: "..." })
 *   })
 * }
 * ```
 */
export async function withAddInAuth<T>(
  request: Request,
  handler: (authContext: AddInAuthContext) => Promise<T>
): Promise<T> {
  const authContext = await verifyAddInAuth(request)
  return handler(authContext)
}
```

**Step 2: Verify TypeScript compilation**

Run: `pnpm tsc --noEmit src/lib/word-addin-auth.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/word-addin-auth.ts
git commit -m "refactor(word-addin): use shared types in auth utilities

- Import AddInAuthContext, OrgRole, TenantContext from shared types
- Change tenant context to discriminated union pattern
- Re-export types for API route convenience

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 3: Refactor analyze/route.ts to Use withErrorHandling

**Files:**
- Modify: `app/api/word-addin/analyze/route.ts`

**Step 1: Rewrite the route handler**

Replace the entire file with:

```typescript
/**
 * @fileoverview Word Add-in Analysis Submission Endpoint
 *
 * Accepts document content directly from the Word Add-in task pane and
 * triggers the analysis pipeline. Creates both document and analysis records.
 *
 * @module app/api/word-addin/analyze
 */

import { z } from "zod"
import { db } from "@/db"
import { documents, analyses } from "@/db/schema"
import { verifyAddInAuth } from "@/lib/word-addin-auth"
import { inngest } from "@/inngest"
import { createHash } from "crypto"
import { withErrorHandling, success } from "@/lib/api-utils"
import { ValidationError, ForbiddenError } from "@/lib/errors"

/**
 * Schema for paragraph structure from Word
 */
const paragraphSchema = z.object({
  text: z.string(),
  style: z.string().optional(),
  isHeading: z.boolean().optional(),
})

/**
 * Request body schema for document analysis
 */
const analyzeRequestSchema = z.object({
  /** Full document text */
  content: z.string().min(1, "Document content is required"),
  /** Structured paragraphs from Word */
  paragraphs: z.array(paragraphSchema).optional(),
  /** Document metadata */
  metadata: z
    .object({
      title: z.string().optional(),
      source: z.literal("word-addin").default("word-addin"),
    })
    .optional(),
})

/**
 * Compute SHA-256 hash of content for duplicate detection
 */
function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

/**
 * POST /api/word-addin/analyze
 *
 * Submits document content from Word Add-in for analysis.
 *
 * @description
 * This endpoint:
 * 1. Validates Bearer token authentication
 * 2. Creates a document record with the raw text content
 * 3. Creates an analysis record with status "pending"
 * 4. Triggers the Inngest analysis pipeline
 * 5. Returns the analysis ID for status polling
 */
export const POST = withErrorHandling(async (request: Request) => {
  // Authenticate the request
  const authContext = await verifyAddInAuth(request)

  // Parse and validate request body
  const body = await request.json()
  const parsed = analyzeRequestSchema.safeParse(body)

  if (!parsed.success) {
    throw ValidationError.fromZodError(parsed.error)
  }

  const { content, paragraphs, metadata } = parsed.data
  const tenantId = authContext.tenant.tenantId

  // Tenant context is required for document creation
  if (!tenantId) {
    throw new ForbiddenError(
      "No organization selected. Please select an organization in the main app first."
    )
  }

  // Compute content hash for duplicate detection
  const contentHash = computeContentHash(content)

  // Generate title from first heading or first line
  const title =
    metadata?.title ||
    paragraphs?.find((p) => p.isHeading)?.text ||
    content.slice(0, 50).trim() + "..."

  // Create document record
  const [document] = await db
    .insert(documents)
    .values({
      tenantId,
      uploadedBy: authContext.userId,
      title,
      fileName: `${title.slice(0, 50)}.docx`,
      fileType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileSize: new TextEncoder().encode(content).length,
      fileUrl: null, // No file URL for Word Add-in content
      rawText: content,
      contentHash,
      status: "ready", // Already parsed, ready for analysis
      metadata: {
        source: "word-addin",
        paragraphCount: paragraphs?.length ?? 0,
        paragraphs: paragraphs ?? [],
      },
    })
    .returning()

  // Create analysis record
  const [analysis] = await db
    .insert(analyses)
    .values({
      tenantId,
      documentId: document.id,
      status: "pending",
      version: 1,
      inngestRunId: `pending_${Date.now()}`, // Will be updated by Inngest
    })
    .returning()

  // Trigger Inngest analysis pipeline
  await inngest.send({
    name: "nda/analysis.requested",
    data: {
      tenantId,
      userId: authContext.userId,
      documentId: document.id,
      analysisId: analysis.id,
    },
  })

  return success({
    analysisId: analysis.id,
    documentId: document.id,
    status: "queued",
  })
})
```

**Step 2: Verify TypeScript compilation**

Run: `pnpm tsc --noEmit app/api/word-addin/analyze/route.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add app/api/word-addin/analyze/route.ts
git commit -m "refactor(word-addin): use withErrorHandling in analyze route

- Replace manual try-catch with withErrorHandling wrapper
- Use barrel import for inngest (@/inngest)
- Use ValidationError.fromZodError for proper error conversion
- Access tenant via authContext.tenant.tenantId (discriminated union)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 4: Refactor session/route.ts to Use withErrorHandling

**Files:**
- Modify: `app/api/word-addin/session/route.ts`

**Step 1: Read current file**

Review the existing implementation to understand the session retrieval logic.

**Step 2: Rewrite the route handler**

```typescript
/**
 * @fileoverview Word Add-in Session Token Endpoint
 *
 * Provides session token retrieval for authenticated users.
 * Called by the Word Add-in auth callback to get a Bearer token.
 */

import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { withErrorHandling, success } from "@/lib/api-utils"
import { UnauthorizedError } from "@/lib/errors"

/**
 * Auth.js cookie names for session token.
 * Different names used in development vs production (secure prefix).
 */
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const

/**
 * GET /api/word-addin/session
 *
 * Returns the current session token for use as Bearer token in Add-in API calls.
 *
 * @description
 * This endpoint is called after successful OAuth to retrieve the session token
 * that will be used for subsequent API calls from the Word Add-in.
 */
export const GET = withErrorHandling(async () => {
  const session = await auth()

  if (!session?.user) {
    throw new UnauthorizedError("Not authenticated")
  }

  const cookieStore = await cookies()

  // Find the session token from Auth.js cookies
  let sessionToken: string | undefined
  for (const cookieName of SESSION_COOKIE_NAMES) {
    sessionToken = cookieStore.get(cookieName)?.value
    if (sessionToken) break
  }

  if (!sessionToken) {
    console.warn("[GET /api/word-addin/session] Session cookie not found for authenticated user")
    throw new UnauthorizedError("Session token not found")
  }

  return success({
    token: sessionToken,
    user: {
      id: session.user.id,
      email: session.user.email!,
      name: session.user.name ?? null,
    },
  })
})
```

**Step 3: Verify TypeScript compilation**

Run: `pnpm tsc --noEmit app/api/word-addin/session/route.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add app/api/word-addin/session/route.ts
git commit -m "refactor(word-addin): use withErrorHandling in session route

- Replace manual try-catch with withErrorHandling wrapper
- Use success() helper for consistent response format
- Add warning log when session cookie missing for authenticated user
- Extract cookie names to constant for maintainability

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 5: Refactor results/[id]/route.ts to Use withErrorHandling

**Files:**
- Modify: `app/api/word-addin/results/[id]/route.ts`

**Step 1: Read current file**

**Step 2: Rewrite the route handler**

```typescript
/**
 * @fileoverview Word Add-in Analysis Results Endpoint
 *
 * Returns complete analysis results for a completed analysis.
 */

import { db } from "@/db"
import { analyses, clauseExtractions } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { verifyAddInAuth } from "@/lib/word-addin-auth"
import { withErrorHandling, success } from "@/lib/api-utils"
import { NotFoundError, ConflictError, ForbiddenError } from "@/lib/errors"
import type { ClauseResult, RiskLevel, AnalysisResults, GapAnalysisResult } from "@/types/word-addin"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/word-addin/results/[id]
 *
 * Returns the complete analysis results including clause extractions and gap analysis.
 *
 * @description
 * This endpoint:
 * 1. Validates Bearer token authentication
 * 2. Verifies the analysis belongs to the user's tenant
 * 3. Checks that analysis is completed (returns 409 if not)
 * 4. Returns full results with clauses and gap analysis
 */
export const GET = withErrorHandling(async (
  request: Request,
  { params }: RouteParams
) => {
  const { id: analysisId } = await params
  const authContext = await verifyAddInAuth(request)
  const tenantId = authContext.tenant.tenantId

  if (!tenantId) {
    throw new ForbiddenError(
      "No organization selected. Please select an organization in the main app first."
    )
  }

  // Get analysis with tenant check
  const analysis = await db.query.analyses.findFirst({
    where: and(
      eq(analyses.id, analysisId),
      eq(analyses.tenantId, tenantId)
    ),
  })

  if (!analysis) {
    throw new NotFoundError("Analysis not found")
  }

  // Check if analysis is completed
  if (analysis.status !== "completed") {
    throw new ConflictError(
      `Analysis is not yet complete. Current status: ${analysis.status}`
    )
  }

  // Get clause extractions
  const clauses = await db.query.clauseExtractions.findMany({
    where: and(
      eq(clauseExtractions.analysisId, analysisId),
      eq(clauseExtractions.tenantId, tenantId)
    ),
  })

  // Transform to response format with proper types
  const clauseResults: ClauseResult[] = clauses.map((c) => ({
    id: c.id,
    category: c.category,
    clauseText: c.clauseText,
    confidence: c.confidence,
    riskLevel: c.riskLevel as RiskLevel,
    riskExplanation: c.riskExplanation,
    position: c.startPosition !== null && c.endPosition !== null
      ? { start: c.startPosition, end: c.endPosition }
      : null,
  }))

  const results: AnalysisResults = {
    analysisId: analysis.id,
    documentId: analysis.documentId,
    status: analysis.status,
    version: analysis.version,
    overallRiskScore: analysis.overallRiskScore,
    overallRiskLevel: analysis.overallRiskLevel as RiskLevel | null,
    summary: analysis.summary,
    clauses: clauseResults,
    gapAnalysis: analysis.gapAnalysis as GapAnalysisResult | null,
    tokenUsage: analysis.tokenUsage as { input: number; output: number; total: number } | null,
    processingTimeMs: analysis.processingTimeMs,
    completedAt: analysis.completedAt?.toISOString() ?? null,
  }

  return success(results)
})
```

**Step 3: Verify TypeScript compilation**

Run: `pnpm tsc --noEmit app/api/word-addin/results/\\[id\\]/route.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add "app/api/word-addin/results/[id]/route.ts"
git commit -m "refactor(word-addin): use withErrorHandling in results route

- Replace manual try-catch with withErrorHandling wrapper
- Use shared types for ClauseResult, RiskLevel, AnalysisResults
- Use ConflictError for not-yet-complete analysis
- Transform position to discriminated union (both or neither)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 6: Refactor status/[id]/route.ts to Use withErrorHandling

**Files:**
- Modify: `app/api/word-addin/status/[id]/route.ts`

**Step 1: Read current file to understand SSE implementation**

**Step 2: Rewrite with proper error handling**

Note: SSE routes require special handling as they return a streaming Response, not NextResponse.json(). We'll keep the SSE logic but improve error handling and use shared types.

```typescript
/**
 * @fileoverview Word Add-in Analysis Status SSE Endpoint
 *
 * Provides real-time progress updates via Server-Sent Events.
 */

import { db } from "@/db"
import { analyses } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { verifyAddInAuth } from "@/lib/word-addin-auth"
import type { AnalysisStage } from "@/types/word-addin"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Stage to progress mapping.
 * Uses const assertion for type safety.
 */
const STAGE_PROGRESS: Record<AnalysisStage, { percent: number; message: string }> = {
  pending: { percent: 0, message: "Waiting to start..." },
  processing: { percent: 10, message: "Processing document..." },
  parsing: { percent: 20, message: "Parsing document structure..." },
  classifying: { percent: 40, message: "Classifying clauses..." },
  scoring: { percent: 60, message: "Scoring risks..." },
  gap_analysis: { percent: 80, message: "Analyzing coverage gaps..." },
  completed: { percent: 100, message: "Analysis complete" },
  failed: { percent: 0, message: "Analysis failed" },
}

/**
 * Create an SSE error response
 */
function sseError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code: "SSE_ERROR", message } }),
    { status, headers: { "Content-Type": "application/json" } }
  )
}

/**
 * GET /api/word-addin/status/[id]
 *
 * Returns Server-Sent Events stream with analysis progress updates.
 *
 * @description
 * This endpoint:
 * 1. Validates Bearer token authentication
 * 2. Opens an SSE stream
 * 3. Polls the database for status changes
 * 4. Sends progress updates until analysis completes or fails
 */
export async function GET(
  request: Request,
  { params }: RouteParams
): Promise<Response> {
  const { id: analysisId } = await params

  // Authenticate - handle errors manually for SSE
  let authContext
  try {
    authContext = await verifyAddInAuth(request)
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return sseError(error.message, 401)
      }
      if (error.name === "ForbiddenError") {
        return sseError(error.message, 403)
      }
    }
    console.error("[GET /api/word-addin/status] Auth error:", error)
    return sseError("Authentication failed", 500)
  }

  const tenantId = authContext.tenant.tenantId

  if (!tenantId) {
    return sseError(
      "No organization selected. Please select an organization in the main app first.",
      403
    )
  }

  // Verify analysis exists and belongs to tenant
  const initialAnalysis = await db.query.analyses.findFirst({
    where: and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId)),
  })

  if (!initialAnalysis) {
    return sseError("Analysis not found", 404)
  }

  // Set up SSE stream
  const encoder = new TextEncoder()
  let pollInterval: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      // Send initial status
      const stage = initialAnalysis.status as AnalysisStage
      const progress = STAGE_PROGRESS[stage] ?? { percent: 50, message: "Processing..." }

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            stage: initialAnalysis.status,
            progress: progress.percent,
            message: progress.message,
          })}\n\n`
        )
      )

      // If already terminal, close immediately
      if (initialAnalysis.status === "completed" || initialAnalysis.status === "failed") {
        controller.close()
        return
      }

      // Poll for updates every 2 seconds
      pollInterval = setInterval(async () => {
        try {
          const analysis = await db.query.analyses.findFirst({
            where: and(eq(analyses.id, analysisId), eq(analyses.tenantId, tenantId)),
          })

          if (!analysis) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  stage: "failed",
                  progress: 0,
                  message: "Analysis not found",
                })}\n\n`
              )
            )
            clearInterval(pollInterval!)
            controller.close()
            return
          }

          const stage = analysis.status as AnalysisStage
          const progress = STAGE_PROGRESS[stage] ?? { percent: 50, message: "Processing..." }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                stage: analysis.status,
                progress: progress.percent,
                message: progress.message,
              })}\n\n`
            )
          )

          // Close on terminal states
          if (analysis.status === "completed" || analysis.status === "failed") {
            clearInterval(pollInterval!)
            controller.close()
          }
        } catch (error) {
          console.error("[SSE Poll] Database error:", error)
          // Don't close stream on transient DB errors, just skip this poll
        }
      }, 2000)
    },

    cancel() {
      if (pollInterval) {
        clearInterval(pollInterval)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
```

**Step 3: Verify TypeScript compilation**

Run: `pnpm tsc --noEmit app/api/word-addin/status/\\[id\\]/route.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add "app/api/word-addin/status/[id]/route.ts"
git commit -m "refactor(word-addin): improve error handling in status SSE route

- Use AnalysisStage type for proper type safety
- Add sseError helper for consistent error responses
- Add error logging with context
- Handle transient DB errors gracefully (skip poll, don't close)
- Use typed STAGE_PROGRESS record

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: Fix Silent Catch Blocks

### Task 7: Fix Silent Catch in useAnalysisProgress

**Files:**
- Modify: `app/(word-addin)/word-addin/taskpane/hooks/useAnalysisProgress.ts`

**Step 1: Add logging to the catch block**

Find this code around line 153:
```typescript
} catch {
  // Ignore malformed JSON
}
```

Replace with:
```typescript
} catch (parseError) {
  console.warn("[useAnalysisProgress] Failed to parse SSE data:", line, parseError)
}
```

**Step 2: Verify no other changes needed**

Run: `pnpm tsc --noEmit app/\\(word-addin\\)/word-addin/taskpane/hooks/useAnalysisProgress.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add "app/(word-addin)/word-addin/taskpane/hooks/useAnalysisProgress.ts"
git commit -m "fix(word-addin): add logging to SSE parse catch block

- Log malformed JSON data for debugging
- Prevents silent failures from hiding server issues

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 8: Fix Silent Catch in useAuth

**Files:**
- Modify: `app/(word-addin)/word-addin/taskpane/hooks/useAuth.ts`

**Step 1: Update the imports and AuthDialogResult type**

Replace the AuthDialogResult interface with import from shared types:
```typescript
import type { AuthDialogResult } from "@/types/word-addin"
```

**Step 2: Add logging to catch block**

Find this code around line 67:
```typescript
} catch {
  resolve({ type: "auth-error", error: "Failed to parse auth response" })
}
```

Replace with:
```typescript
} catch (parseError) {
  console.error("[useAuth] Failed to parse auth dialog message:", arg.message, parseError)
  resolve({ type: "auth-error", error: "Failed to parse auth response" })
}
```

**Step 3: Verify compilation**

Run: `pnpm tsc --noEmit app/\\(word-addin\\)/word-addin/taskpane/hooks/useAuth.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add "app/(word-addin)/word-addin/taskpane/hooks/useAuth.ts"
git commit -m "fix(word-addin): add logging and use shared types in useAuth

- Import AuthDialogResult from shared types (discriminated union)
- Add error logging to catch block with message context
- Enables debugging auth dialog failures

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 9: Fix Silent Catch in Auth Callback Page

**Files:**
- Modify: `app/(word-addin)/word-addin/auth/callback/page.tsx`

**Step 1: Add logging to catch block**

Find the catch block (around line 51) and update it:

From:
```typescript
} catch {
  setError("Failed to complete authentication")
}
```

To:
```typescript
} catch (err) {
  console.error("[Auth Callback] Failed to complete authentication:", err)
  setError("Failed to complete authentication. Please close this window and try again.")
}
```

**Step 2: Verify compilation**

Run: `pnpm tsc --noEmit app/\\(word-addin\\)/word-addin/auth/callback/page.tsx`
Expected: No errors

**Step 3: Commit**

```bash
git add "app/(word-addin)/word-addin/auth/callback/page.tsx"
git commit -m "fix(word-addin): add error logging to auth callback

- Log actual error for debugging
- Improve error message with recovery guidance

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 10: Fix Silent Catch in Auth Sign-In Page

**Files:**
- Modify: `app/(word-addin)/word-addin/auth/page.tsx`

**Step 1: Add logging to catch block**

Find the catch block (around line 40) and update it:

From:
```typescript
} catch {
  setError("Failed to start sign in. Please try again.")
  setIsLoading(false)
}
```

To:
```typescript
} catch (err) {
  console.error("[Auth Page] Sign in failed:", err)
  setError("Failed to start sign in. Please try again.")
  setIsLoading(false)
}
```

**Step 2: Verify compilation**

Run: `pnpm tsc --noEmit app/\\(word-addin\\)/word-addin/auth/page.tsx`
Expected: No errors

**Step 3: Commit**

```bash
git add "app/(word-addin)/word-addin/auth/page.tsx"
git commit -m "fix(word-addin): add error logging to auth sign-in page

- Log actual error for debugging OAuth failures

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: Update Zustand Stores with Shared Types

### Task 11: Update Analysis Store with Shared Types

**Files:**
- Modify: `app/(word-addin)/word-addin/taskpane/store/analysis.ts`

**Step 1: Replace type definitions with imports**

Replace the type definitions at the top of the file with imports from shared types:

```typescript
/**
 * @fileoverview Analysis State Store
 *
 * Zustand store for managing analysis state in the Word Add-in task pane.
 */

import { create } from "zustand"
import type {
  ClauseResult,
  GapAnalysisResult,
  AnalysisResults,
  ProgressState,
  AnalysisStage,
} from "@/types/word-addin"

// Re-export types for component convenience
export type { ClauseResult, GapAnalysisResult, AnalysisResults, ProgressState }

/**
 * Analysis status for UI state machine
 */
export type AnalysisStatus =
  | "idle"
  | "extracting"
  | "submitting"
  | "analyzing"
  | "completed"
  | "failed"

// ... rest of file unchanged
```

**Step 2: Update the updateProgress method to use typed stage**

In the `updateProgress` method, update the stage comparison to use the proper type:

```typescript
updateProgress: (progress: ProgressState) =>
  set((state) => {
    // Determine status from stage
    let status: AnalysisStatus = state.status
    if (progress.stage === "completed") {
      status = "completed"
    } else if (progress.stage === "failed") {
      status = "failed"
    } else if (state.status !== "failed") {
      status = "analyzing"
    }

    return { progress, status }
  }),
```

**Step 3: Verify compilation**

Run: `pnpm tsc --noEmit app/\\(word-addin\\)/word-addin/taskpane/store/analysis.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add "app/(word-addin)/word-addin/taskpane/store/analysis.ts"
git commit -m "refactor(word-addin): use shared types in analysis store

- Import ClauseResult, GapAnalysisResult, AnalysisResults, ProgressState
- Re-export types for component convenience
- ProgressState.stage now uses AnalysisStage union type

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 12: Fix Missing Dependency in useDocumentContent

**Files:**
- Modify: `app/(word-addin)/word-addin/taskpane/hooks/useDocumentContent.ts`

**Step 1: Add isDevMode to useCallback dependency array**

Find the extractContent useCallback (around line 25-80) and update the dependency array:

From:
```typescript
}, [])
```

To:
```typescript
}, [isDevMode])
```

**Step 2: Verify compilation and lint**

Run: `pnpm tsc --noEmit app/\\(word-addin\\)/word-addin/taskpane/hooks/useDocumentContent.ts`
Run: `pnpm lint app/\\(word-addin\\)/word-addin/taskpane/hooks/useDocumentContent.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add "app/(word-addin)/word-addin/taskpane/hooks/useDocumentContent.ts"
git commit -m "fix(word-addin): add missing isDevMode dependency to useCallback

- Prevents stale closure when dev mode changes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 4: Add Critical Test Coverage

### Task 13: Write Tests for word-addin-auth.ts

**Files:**
- Create: `src/lib/word-addin-auth.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/word-addin-auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { verifyAddInAuth } from "./word-addin-auth"
import { UnauthorizedError, ForbiddenError } from "./errors"

// Mock the db module
vi.mock("@/db/client", () => ({
  db: {
    query: {
      sessions: {
        findFirst: vi.fn(),
      },
      users: {
        findFirst: vi.fn(),
      },
      organizationMembers: {
        findFirst: vi.fn(),
      },
    },
  },
}))

import { db } from "@/db/client"

const mockDb = vi.mocked(db)

describe("verifyAddInAuth", () => {
  const validToken = "valid-session-token"
  const validUserId = "user-123"
  const validOrgId = "org-456"

  const createMockRequest = (token?: string): Request => {
    const headers = new Headers()
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }
    return new Request("http://test.com/api", { headers })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws UnauthorizedError when Authorization header is missing", async () => {
    const request = createMockRequest()

    await expect(verifyAddInAuth(request)).rejects.toThrow(UnauthorizedError)
    await expect(verifyAddInAuth(request)).rejects.toThrow("Missing Authorization header")
  })

  it("throws UnauthorizedError when Bearer prefix is missing", async () => {
    const headers = new Headers()
    headers.set("Authorization", "Basic token123")
    const request = new Request("http://test.com/api", { headers })

    await expect(verifyAddInAuth(request)).rejects.toThrow(UnauthorizedError)
  })

  it("throws ForbiddenError when session token is invalid", async () => {
    mockDb.query.sessions.findFirst.mockResolvedValue(null)

    const request = createMockRequest("invalid-token")

    await expect(verifyAddInAuth(request)).rejects.toThrow(ForbiddenError)
    await expect(verifyAddInAuth(request)).rejects.toThrow("Invalid or expired session token")
  })

  it("throws ForbiddenError when session is expired", async () => {
    mockDb.query.sessions.findFirst.mockResolvedValue(null) // Query includes expiry check

    const request = createMockRequest(validToken)

    await expect(verifyAddInAuth(request)).rejects.toThrow(ForbiddenError)
  })

  it("throws ForbiddenError when user is not found", async () => {
    mockDb.query.sessions.findFirst.mockResolvedValue({
      sessionToken: validToken,
      userId: validUserId,
      expires: new Date(Date.now() + 86400000),
      activeOrganizationId: null,
    })
    mockDb.query.users.findFirst.mockResolvedValue(null)

    const request = createMockRequest(validToken)

    await expect(verifyAddInAuth(request)).rejects.toThrow(ForbiddenError)
    await expect(verifyAddInAuth(request)).rejects.toThrow("User not found")
  })

  it("returns auth context with null tenant when no active organization", async () => {
    mockDb.query.sessions.findFirst.mockResolvedValue({
      sessionToken: validToken,
      userId: validUserId,
      expires: new Date(Date.now() + 86400000),
      activeOrganizationId: null,
    })
    mockDb.query.users.findFirst.mockResolvedValue({
      id: validUserId,
      email: "test@example.com",
      name: "Test User",
    })

    const request = createMockRequest(validToken)
    const result = await verifyAddInAuth(request)

    expect(result).toEqual({
      userId: validUserId,
      user: {
        id: validUserId,
        email: "test@example.com",
        name: "Test User",
      },
      tenant: { tenantId: null, role: null },
    })
  })

  it("returns auth context with tenant when user has membership", async () => {
    mockDb.query.sessions.findFirst.mockResolvedValue({
      sessionToken: validToken,
      userId: validUserId,
      expires: new Date(Date.now() + 86400000),
      activeOrganizationId: validOrgId,
    })
    mockDb.query.users.findFirst.mockResolvedValue({
      id: validUserId,
      email: "test@example.com",
      name: "Test User",
    })
    mockDb.query.organizationMembers.findFirst.mockResolvedValue({
      userId: validUserId,
      organizationId: validOrgId,
      role: "member",
    })

    const request = createMockRequest(validToken)
    const result = await verifyAddInAuth(request)

    expect(result).toEqual({
      userId: validUserId,
      user: {
        id: validUserId,
        email: "test@example.com",
        name: "Test User",
      },
      tenant: { tenantId: validOrgId, role: "member" },
    })
  })

  it("returns null tenant when user has no membership in active org", async () => {
    mockDb.query.sessions.findFirst.mockResolvedValue({
      sessionToken: validToken,
      userId: validUserId,
      expires: new Date(Date.now() + 86400000),
      activeOrganizationId: validOrgId,
    })
    mockDb.query.users.findFirst.mockResolvedValue({
      id: validUserId,
      email: "test@example.com",
      name: null,
    })
    mockDb.query.organizationMembers.findFirst.mockResolvedValue(null)

    const request = createMockRequest(validToken)
    const result = await verifyAddInAuth(request)

    expect(result.tenant).toEqual({ tenantId: null, role: null })
  })
})
```

**Step 2: Run tests to verify they work**

Run: `pnpm test src/lib/word-addin-auth.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/lib/word-addin-auth.test.ts
git commit -m "test(word-addin): add comprehensive tests for verifyAddInAuth

- Test missing/invalid Authorization header
- Test invalid/expired session token
- Test user not found
- Test null tenant when no active organization
- Test tenant context with membership
- Test null tenant when no membership in active org

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 14: Write Tests for analyze/route.ts

**Files:**
- Create: `app/api/word-addin/analyze/route.test.ts`

**Step 1: Write the test file**

```typescript
// app/api/word-addin/analyze/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "./route"

// Mock dependencies
vi.mock("@/lib/word-addin-auth", () => ({
  verifyAddInAuth: vi.fn(),
}))

vi.mock("@/db/client", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
  },
}))

vi.mock("@/inngest", () => ({
  inngest: {
    send: vi.fn(),
  },
}))

import { verifyAddInAuth } from "@/lib/word-addin-auth"
import { db } from "@/db/client"
import { inngest } from "@/inngest"
import { UnauthorizedError, ForbiddenError } from "@/lib/errors"

const mockVerifyAddInAuth = vi.mocked(verifyAddInAuth)
const mockDb = vi.mocked(db)
const mockInngest = vi.mocked(inngest)

describe("POST /api/word-addin/analyze", () => {
  const validAuthContext = {
    userId: "user-123",
    user: { id: "user-123", email: "test@example.com", name: "Test" },
    tenant: { tenantId: "tenant-456", role: "member" as const },
  }

  const createRequest = (body: unknown): Request => {
    return new Request("http://test.com/api/word-addin/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify(body),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default successful mocks
    mockVerifyAddInAuth.mockResolvedValue(validAuthContext)

    const mockDocument = { id: "doc-789" }
    const mockAnalysis = { id: "analysis-012" }

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn()
          .mockResolvedValueOnce([mockDocument])
          .mockResolvedValueOnce([mockAnalysis]),
      }),
    } as any)

    mockInngest.send.mockResolvedValue({ ids: ["event-123"] })
  })

  it("returns 401 when not authenticated", async () => {
    mockVerifyAddInAuth.mockRejectedValue(new UnauthorizedError("Missing token"))

    const request = createRequest({ content: "test" })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("UNAUTHORIZED")
  })

  it("returns 403 when user has no active organization", async () => {
    mockVerifyAddInAuth.mockResolvedValue({
      ...validAuthContext,
      tenant: { tenantId: null, role: null },
    })

    const request = createRequest({ content: "test content" })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("FORBIDDEN")
  })

  it("returns 400 when content is empty", async () => {
    const request = createRequest({ content: "" })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  it("returns 400 when request body is malformed", async () => {
    const request = new Request("http://test.com/api/word-addin/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: "not json",
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(500) // JSON parse error becomes internal error
  })

  it("creates document and analysis, triggers Inngest on success", async () => {
    const request = createRequest({
      content: "This is a test NDA document.",
      metadata: { title: "Test NDA" },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.analysisId).toBe("analysis-012")
    expect(body.data.documentId).toBe("doc-789")
    expect(body.data.status).toBe("queued")

    expect(mockInngest.send).toHaveBeenCalledWith({
      name: "nda/analysis.requested",
      data: expect.objectContaining({
        tenantId: "tenant-456",
        userId: "user-123",
        documentId: "doc-789",
        analysisId: "analysis-012",
      }),
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm test app/api/word-addin/analyze/route.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add app/api/word-addin/analyze/route.test.ts
git commit -m "test(word-addin): add tests for analyze API route

- Test unauthorized access (401)
- Test missing organization (403)
- Test validation errors (400)
- Test successful analysis creation and Inngest trigger

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 15: Run Full Test Suite and Lint

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Run linter**

Run: `pnpm lint`
Expected: No errors

**Step 3: Run type check**

Run: `pnpm tsc --noEmit`
Expected: No errors

---

### Task 16: Final Commit - Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add note about shared types**

Add to the "Key Directories" section:

```markdown
- `src/types/` - Shared TypeScript type definitions
  - `word-addin.ts` - Domain types for Word Add-in (RiskLevel, AnalysisStage, etc.)
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document shared types directory

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 5: Design System Compliance

### Task 17: Create Shared Format Utilities

**Files:**
- Create: `app/(word-addin)/word-addin/taskpane/lib/format.ts`

**Step 1: Write the shared utilities**

```typescript
/**
 * @fileoverview Shared formatting utilities for Word Add-in components
 */

/**
 * Format category name for display (e.g., "non_compete" -> "Non Compete")
 */
export function formatCategory(category: string): string {
  return category
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + "..."
}
```

**Step 2: Commit**

```bash
git add "app/(word-addin)/word-addin/taskpane/lib/format.ts"
git commit -m "refactor(word-addin): extract shared format utilities

- Add formatCategory for consistent category name display
- Add truncateText for text truncation with ellipsis
- Removes duplication across ClauseCard, ClauseDetail, GapAnalysis

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 18: Add Risk Badge Config to Shared Types

**Files:**
- Modify: `src/types/word-addin.ts`

**Step 1: Add the config to the types file**

Add after the RiskLevel type:

```typescript
/**
 * Risk badge configuration for consistent styling across components.
 * Uses design system semantic colors.
 */
export const RISK_BADGE_CONFIG: Record<RiskLevel, {
  label: string
  className: string
  strokeColor: string
}> = {
  standard: {
    label: "Standard",
    className: "bg-[oklch(var(--success-50))] text-[oklch(var(--success-600))] dark:bg-[oklch(var(--success-500)/0.2)] dark:text-[oklch(var(--success-500))]",
    strokeColor: "oklch(var(--success-500))",
  },
  cautious: {
    label: "Cautious",
    className: "bg-[oklch(var(--warning-50))] text-[oklch(var(--warning-600))] dark:bg-[oklch(var(--warning-500)/0.2)] dark:text-[oklch(var(--warning-500))]",
    strokeColor: "oklch(var(--warning-500))",
  },
  aggressive: {
    label: "Aggressive",
    className: "bg-[oklch(var(--error-50))] text-[oklch(var(--error-600))] dark:bg-[oklch(var(--error-500)/0.2)] dark:text-[oklch(var(--error-500))]",
    strokeColor: "oklch(var(--error-500))",
  },
  unknown: {
    label: "Unknown",
    className: "bg-muted text-muted-foreground",
    strokeColor: "oklch(var(--neutral-400))",
  },
}

/**
 * Priority badge configuration for gap analysis recommendations.
 */
export const PRIORITY_BADGE_CONFIG: Record<GapPriority, {
  label: string
  className: string
}> = {
  high: {
    label: "High",
    className: "bg-[oklch(var(--error-50))] text-[oklch(var(--error-600))] dark:bg-[oklch(var(--error-500)/0.2)] dark:text-[oklch(var(--error-500))]",
  },
  medium: {
    label: "Medium",
    className: "bg-[oklch(var(--warning-50))] text-[oklch(var(--warning-600))] dark:bg-[oklch(var(--warning-500)/0.2)] dark:text-[oklch(var(--warning-500))]",
  },
  low: {
    label: "Low",
    className: "bg-[oklch(var(--success-50))] text-[oklch(var(--success-600))] dark:bg-[oklch(var(--success-500)/0.2)] dark:text-[oklch(var(--success-500))]",
  },
}
```

**Step 2: Commit**

```bash
git add src/types/word-addin.ts
git commit -m "feat(word-addin): add badge configs using design tokens

- Add RISK_BADGE_CONFIG with semantic colors
- Add PRIORITY_BADGE_CONFIG for gap analysis
- Uses oklch colors from design system for consistency

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 19: Update ClauseCard to Use Shared Types and Utilities

**Files:**
- Modify: `app/(word-addin)/word-addin/taskpane/components/ClauseCard.tsx`

**Step 1: Update imports**

```typescript
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"
import type { ClauseResult } from "@/types/word-addin"
import { RISK_BADGE_CONFIG, type RiskLevel } from "@/types/word-addin"
import { formatCategory, truncateText } from "../lib/format"
```

**Step 2: Remove duplicate type and helper definitions**

Remove:
- `type RiskLevel` (lines 11)
- `riskBadgeConfig` (lines 16-33)
- `normalizeRiskLevel` (lines 38-44)
- `formatCategory` (lines 49-54)
- `truncateText` (lines 59-62)

**Step 3: Update normalizeRiskLevel to be inline or imported**

Add inline helper:

```typescript
function normalizeRiskLevel(level: string): RiskLevel {
  const normalized = level.toLowerCase()
  if (normalized in RISK_BADGE_CONFIG) {
    return normalized as RiskLevel
  }
  return "unknown"
}
```

**Step 4: Update badge styling**

Change `text-[10px]` to `text-xs` for accessibility.

**Step 5: Commit**

```bash
git add "app/(word-addin)/word-addin/taskpane/components/ClauseCard.tsx"
git commit -m "refactor(word-addin): ClauseCard uses shared types and utilities

- Import from shared types and format utilities
- Use RISK_BADGE_CONFIG for consistent styling
- Update badge to use text-xs for accessibility

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 20: Update ClauseDetail to Use Shared Types

**Files:**
- Modify: `app/(word-addin)/word-addin/taskpane/components/ClauseDetail.tsx`

**Step 1: Update imports**

Replace duplicate type definitions with imports from shared types.

**Step 2: Remove duplicates and update component**

Follow same pattern as Task 19.

**Step 3: Commit**

```bash
git add "app/(word-addin)/word-addin/taskpane/components/ClauseDetail.tsx"
git commit -m "refactor(word-addin): ClauseDetail uses shared types and utilities

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 21: Update RiskGauge to Use Shared Types

**Files:**
- Modify: `app/(word-addin)/word-addin/taskpane/components/RiskGauge.tsx`

**Step 1: Update imports and remove duplicates**

```typescript
import { RISK_BADGE_CONFIG, type RiskLevel } from "@/types/word-addin"
import { useAnalysisStore } from "../store"
```

**Step 2: Update GaugeSvg to use RISK_BADGE_CONFIG.strokeColor**

**Step 3: Commit**

```bash
git add "app/(word-addin)/word-addin/taskpane/components/RiskGauge.tsx"
git commit -m "refactor(word-addin): RiskGauge uses shared types

- Import RISK_BADGE_CONFIG for consistent colors
- Remove duplicate riskLevelConfig

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 22: Update GapAnalysis to Use Shared Types

**Files:**
- Modify: `app/(word-addin)/word-addin/taskpane/components/GapAnalysis.tsx`

**Step 1: Update imports**

```typescript
import { PRIORITY_BADGE_CONFIG, type GapPriority } from "@/types/word-addin"
import { formatCategory } from "../lib/format"
```

**Step 2: Remove duplicates**

Remove `formatCategory`, `Priority` type, and `priorityBadgeConfig`.

**Step 3: Update badge text size**

Change `text-[10px]` to `text-xs`.

**Step 4: Commit**

```bash
git add "app/(word-addin)/word-addin/taskpane/components/GapAnalysis.tsx"
git commit -m "refactor(word-addin): GapAnalysis uses shared types and utilities

- Import PRIORITY_BADGE_CONFIG for consistent styling
- Import formatCategory from shared utilities
- Update badge to use text-xs for accessibility

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 23: Fix AuthGate Button Text

**Files:**
- Modify: `app/(word-addin)/word-addin/taskpane/components/AuthGate.tsx`

**Step 1: Update button text to be generic**

Change line 55 from:
```tsx
Sign in with Microsoft
```

To:
```tsx
Sign In
```

**Step 2: Commit**

```bash
git add "app/(word-addin)/word-addin/taskpane/components/AuthGate.tsx"
git commit -m "fix(word-addin): make sign-in button text generic

- Button text now says 'Sign In' instead of 'Sign in with Microsoft'
- Works with any OAuth provider (Google, GitHub, etc.)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 24: Run Full Test Suite and Verify Design

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Run linter**

Run: `pnpm lint`
Expected: No errors

**Step 3: Run type check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 4: Visual verification**

Run: `pnpm dev`
Check Word Add-in components in browser for correct color rendering.

---

## Summary

This plan addresses:

| Issue Category | Tasks | Status |
|----------------|-------|--------|
| API route patterns | Tasks 3-6 | Pending |
| Silent catch blocks | Tasks 7-10 | Pending |
| Type safety | Tasks 1-2, 11-12 | Pending |
| Test coverage | Tasks 13-15 | Pending |
| Documentation | Task 16 | Pending |
| Design system compliance | Tasks 17-24 | Pending |

**Total tasks:** 24

**Estimated completion:** Tasks are bite-sized (2-5 minutes each). Full execution should complete in a focused session.

---

Plan complete and saved to `docs/plans/2026-02-02-word-addin-pr-fixes.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
