/**
 * @fileoverview Word Add-in Analysis Submission Endpoint
 *
 * Accepts document content directly from the Word Add-in task pane and
 * triggers the analysis pipeline. Creates both document and analysis records.
 *
 * @module app/api/word-addin/analyze
 */

import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { db } from "@/db"
import { documents, analyses } from "@/db/schema"
import { verifyAddInAuth } from "@/lib/word-addin-auth"
import { inngest } from "@/inngest"
import { withErrorHandling, success } from "@/lib/api-utils"
import { ValidationError, ForbiddenError } from "@/lib/errors"
import { createHash } from "crypto"

/**
 * Schema for paragraph structure from Word
 */
const paragraphSchema = z.object({
  text: z.string(),
  style: z.string().optional(),
  isHeading: z.boolean().optional(),
  outlineLevel: z.number().optional(),
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
  /** Document properties from Word */
  properties: z
    .object({
      author: z.string().optional(),
      creationDate: z.string().optional(), // ISO string
      lastModifiedBy: z.string().optional(),
      lastModified: z.string().optional(), // ISO string
      wordVersion: z.string().optional(),
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
 * 2. Checks for existing analysis with same content hash (deduplication)
 * 3. Creates a document record with the raw text content
 * 4. Creates an analysis record with status "pending"
 * 5. Triggers the Inngest analysis pipeline
 * 6. Returns the analysis ID for status polling
 *
 * @example
 * ```typescript
 * const response = await fetch("/api/word-addin/analyze", {
 *   method: "POST",
 *   headers: {
 *     "Authorization": `Bearer ${token}`,
 *     "Content-Type": "application/json",
 *   },
 *   body: JSON.stringify({
 *     content: documentText,
 *     paragraphs: structuredParagraphs,
 *     metadata: { title: "Contract Review" },
 *     properties: { author: "Legal Dept", wordVersion: "16.0" },
 *   }),
 * })
 * ```
 */
export const POST = withErrorHandling(async (request: Request) => {
  // Authenticate the request (throws UnauthorizedError/ForbiddenError if invalid)
  const authContext = await verifyAddInAuth(request)

  // Parse and validate request body
  const body = await request.json()
  const parsed = analyzeRequestSchema.safeParse(body)

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.map(String).join("."),
      message: issue.message,
    }))
    throw new ValidationError("Invalid request body", details)
  }

  const { content, paragraphs, metadata, properties } = parsed.data
  const tenantId = authContext.tenant.tenantId

  // Tenant context is required for document creation
  if (!tenantId) {
    throw new ForbiddenError(
      "No organization selected. Please select an organization in the main app first."
    )
  }

  // Compute content hash for duplicate detection
  const contentHash = computeContentHash(content)

  // Check for existing analysis with same content
  const existingDoc = await db.query.documents.findFirst({
    where: and(eq(documents.tenantId, tenantId), eq(documents.contentHash, contentHash)),
    with: {
      analyses: {
        orderBy: (analyses, { desc }) => [desc(analyses.createdAt)],
        limit: 1,
      },
    },
  })

  // If document exists with completed analysis, return existing results
  if (existingDoc?.analyses?.[0]?.status === "completed") {
    return success({
      analysisId: existingDoc.analyses[0].id,
      documentId: existingDoc.id,
      status: "existing",
      message: "Document was previously analyzed. Returning existing results.",
    })
  }

  // If document exists but analysis is pending/failed, check if we should re-analyze
  if (existingDoc?.analyses?.[0]) {
    const lastAnalysis = existingDoc.analyses[0]
    if (lastAnalysis.status === "pending" || lastAnalysis.status === "processing") {
      return success({
        analysisId: lastAnalysis.id,
        documentId: existingDoc.id,
        status: "in_progress",
        message: "Document analysis is already in progress.",
      })
    }
    // Failed analysis - fall through to create new one
  }

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
        wordProperties: properties ?? {},
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
      source: "word-addin" as const,
      content: {
        rawText: content,
        paragraphs: (paragraphs ?? []).map((p) => ({
          text: p.text,
          style: p.style ?? "Normal",
          isHeading: p.isHeading ?? false,
          outlineLevel: p.outlineLevel ?? 0,
        })),
      },
      metadata: {
        title,
        author: properties?.author,
        wordVersion: properties?.wordVersion,
      },
    },
  })

  return success({
    analysisId: analysis.id,
    documentId: document.id,
    status: "queued",
  })
})
