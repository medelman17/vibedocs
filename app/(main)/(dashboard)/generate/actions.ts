"use server"

/**
 * NDA Generation Server Actions
 *
 * This module provides server actions for template-based NDA generation.
 * Actions include listing templates, generating NDAs from templates,
 * managing generated NDA lifecycle, and export functionality.
 *
 * @module app/(dashboard)/generate/actions
 */

import { z } from "zod"
import { withTenant, verifySession } from "@/lib/dal"
import { ok, err, wrapError, type ApiResponse } from "@/lib/api-response"
// Note: db import is ONLY for shared reference data queries (templates)
// All tenant-scoped queries MUST use db from withTenant()
import { db as sharedDb } from "@/db"
import { generatedNdas, referenceDocuments } from "@/db/schema"
import { eq, and, desc, inArray } from "drizzle-orm"
import type { GeneratedNda, NewGeneratedNda } from "@/db/schema/generated"

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Schema for party information in NDA generation.
 */
const partySchema = z.object({
  name: z.string().min(1, "Party name is required"),
  address: z.string().optional(),
  jurisdiction: z.string().optional(),
  signerName: z.string().optional(),
  signerTitle: z.string().optional(),
})

/**
 * Schema for NDA generation parameters.
 */
const ndaParametersSchema = z.object({
  disclosingParty: partySchema,
  receivingParty: partySchema,
  effectiveDate: z.string().date("Invalid date format"),
  termYears: z.number().int().min(1).max(10),
  mutual: z.boolean(),
  governingLaw: z.string().min(1, "Governing law is required"),
  disputeResolution: z
    .enum(["litigation", "arbitration", "mediation"])
    .optional(),
  purposeDescription: z.string().optional(),
  excludedCategories: z.array(z.string()).optional(),
  returnOrDestroy: z.enum(["return", "destroy", "certify"]).optional(),
  includeNonSolicit: z.boolean().optional(),
  includeNonCompete: z.boolean().optional(),
  includeIpAssignment: z.boolean().optional(),
})

/**
 * Schema for generating a new NDA.
 */
const generateNdaSchema = z.object({
  templateSource: z.enum(["bonterms", "commonaccord", "custom"]),
  templateId: z.string().uuid().optional(),
  title: z.string().min(1, "Title is required").max(255),
  parameters: ndaParametersSchema,
})

/**
 * Schema for updating a draft NDA.
 */
const updateNdaSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  content: z.string().optional(),
  parameters: ndaParametersSchema.partial().optional(),
})

/**
 * Schema for listing generated NDAs with optional filters.
 */
const listNdasSchema = z.object({
  status: z.enum(["draft", "finalized", "archived"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})

/**
 * Schema for export format selection.
 */
const exportNdaSchema = z.object({
  id: z.string().uuid(),
  format: z.enum(["docx", "pdf"]),
})

// =============================================================================
// Response Types
// =============================================================================

/**
 * Template summary for listing.
 */
export interface TemplateSummary {
  id: string
  source: string
  title: string
  metadata: Record<string, unknown>
}

/**
 * Template with preview content.
 */
export interface TemplateWithPreview extends TemplateSummary {
  rawText: string | null
}

/**
 * Generated NDA summary for listing.
 */
export interface GeneratedNdaSummary {
  id: string
  title: string
  templateSource: string
  status: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Export result placeholder.
 */
export interface ExportResult {
  url: string
  filename: string
  format: "docx" | "pdf"
}

// =============================================================================
// Template Actions (Shared Reference Data - No Tenant Isolation)
// =============================================================================

/**
 * Get available NDA templates.
 *
 * Templates are shared reference data from the reference_documents table.
 * Filters by source to show only template documents (bonterms, commonaccord).
 *
 * @param source - Optional source filter
 * @returns List of available templates
 */
export async function getTemplates(
  source?: "bonterms" | "commonaccord"
): Promise<ApiResponse<TemplateSummary[]>> {
  try {
    // Verify user is authenticated (templates are readable by any authenticated user)
    await verifySession()

    const templateSources = source ? [source] : ["bonterms", "commonaccord"]

    const templates = await sharedDb
      .select({
        id: referenceDocuments.id,
        source: referenceDocuments.source,
        title: referenceDocuments.title,
        metadata: referenceDocuments.metadata,
      })
      .from(referenceDocuments)
      .where(inArray(referenceDocuments.source, templateSources))
      .orderBy(referenceDocuments.title)

    return ok(
      templates.map((t) => ({
        id: t.id,
        source: t.source,
        title: t.title,
        metadata: (t.metadata ?? {}) as Record<string, unknown>,
      }))
    )
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Get a single template with preview content.
 *
 * @param id - Template document ID
 * @returns Template with raw text for preview
 */
export async function getTemplate(
  id: string
): Promise<ApiResponse<TemplateWithPreview>> {
  try {
    await verifySession()

    // Validate UUID format
    const parseResult = z.string().uuid().safeParse(id)
    if (!parseResult.success) {
      return err("VALIDATION_ERROR", "Invalid template ID format")
    }

    const template = await sharedDb
      .select({
        id: referenceDocuments.id,
        source: referenceDocuments.source,
        title: referenceDocuments.title,
        rawText: referenceDocuments.rawText,
        metadata: referenceDocuments.metadata,
      })
      .from(referenceDocuments)
      .where(eq(referenceDocuments.id, id))
      .limit(1)

    if (template.length === 0) {
      return err("NOT_FOUND", "Template not found")
    }

    const t = template[0]
    return ok({
      id: t.id,
      source: t.source,
      title: t.title,
      rawText: t.rawText,
      metadata: (t.metadata ?? {}) as Record<string, unknown>,
    })
  } catch (error) {
    return wrapError(error)
  }
}

// =============================================================================
// Generated NDA Actions (Tenant-Scoped)
// =============================================================================

/**
 * Generate a new NDA from a template.
 *
 * Creates a new generated_ndas record with status 'draft'.
 * The content is generated from the template with the provided parameters.
 *
 * @param input - Generation parameters including template source and party info
 * @returns The newly created NDA record
 */
export async function generateNda(
  input: z.infer<typeof generateNdaSchema>
): Promise<ApiResponse<GeneratedNda>> {
  try {
    const { db, userId, tenantId } = await withTenant()

    // Validate input
    const parseResult = generateNdaSchema.safeParse(input)
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0]
      return err("VALIDATION_ERROR", issue?.message ?? "Invalid input", [
        {
          field: issue?.path.join("."),
          message: issue?.message ?? "Validation failed",
        },
      ])
    }

    const { templateSource, title, parameters } = parseResult.data

    // Generate markdown content from template
    // In a full implementation, this would use a template engine
    // For now, we generate a placeholder structure
    const content = generateNdaMarkdown(templateSource, parameters)

    const newNda: NewGeneratedNda = {
      tenantId,
      createdBy: userId,
      title,
      templateSource,
      parameters,
      content,
      status: "draft",
    }

    const [created] = await db.insert(generatedNdas).values(newNda).returning()

    return ok(created)
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Get a generated NDA by ID.
 *
 * @param id - NDA UUID
 * @returns The generated NDA record
 */
export async function getGeneratedNda(
  id: string
): Promise<ApiResponse<GeneratedNda>> {
  try {
    const { db, tenantId } = await withTenant()

    // Validate UUID format
    const parseResult = z.string().uuid().safeParse(id)
    if (!parseResult.success) {
      return err("VALIDATION_ERROR", "Invalid NDA ID format")
    }

    const nda = await db
      .select()
      .from(generatedNdas)
      .where(
        and(eq(generatedNdas.id, id), eq(generatedNdas.tenantId, tenantId))
      )
      .limit(1)

    if (nda.length === 0) {
      return err("NOT_FOUND", "Generated NDA not found")
    }

    return ok(nda[0])
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * List generated NDAs for the current tenant.
 *
 * @param options - Optional filters and pagination
 * @returns List of generated NDA summaries
 */
export async function getGeneratedNdas(
  options?: z.input<typeof listNdasSchema>
): Promise<ApiResponse<GeneratedNdaSummary[]>> {
  try {
    const { db, tenantId } = await withTenant()

    // Validate options
    const parseResult = listNdasSchema.safeParse(options ?? {})
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0]
      return err("VALIDATION_ERROR", issue?.message ?? "Invalid options")
    }

    const { status, limit, offset } = parseResult.data

    const conditions = [eq(generatedNdas.tenantId, tenantId)]
    if (status) {
      conditions.push(eq(generatedNdas.status, status))
    }

    const ndas = await db
      .select({
        id: generatedNdas.id,
        title: generatedNdas.title,
        templateSource: generatedNdas.templateSource,
        status: generatedNdas.status,
        createdAt: generatedNdas.createdAt,
        updatedAt: generatedNdas.updatedAt,
      })
      .from(generatedNdas)
      .where(and(...conditions))
      .orderBy(desc(generatedNdas.createdAt))
      .limit(limit)
      .offset(offset)

    return ok(ndas)
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Update a draft NDA.
 *
 * Only allowed when the NDA status is 'draft'.
 *
 * @param input - Update parameters
 * @returns The updated NDA record
 */
export async function updateGeneratedNda(
  input: z.infer<typeof updateNdaSchema>
): Promise<ApiResponse<GeneratedNda>> {
  try {
    const { db, tenantId } = await withTenant()

    // Validate input
    const parseResult = updateNdaSchema.safeParse(input)
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0]
      return err("VALIDATION_ERROR", issue?.message ?? "Invalid input")
    }

    const { id, ...updates } = parseResult.data

    // Check current status
    const existing = await db
      .select({ status: generatedNdas.status })
      .from(generatedNdas)
      .where(
        and(eq(generatedNdas.id, id), eq(generatedNdas.tenantId, tenantId))
      )
      .limit(1)

    if (existing.length === 0) {
      return err("NOT_FOUND", "Generated NDA not found")
    }

    if (existing[0].status !== "draft") {
      return err(
        "BAD_REQUEST",
        "Cannot update NDA - only draft NDAs can be edited"
      )
    }

    // Build update object
    const updateData: Partial<NewGeneratedNda> = {
      updatedAt: new Date(),
    }

    if (updates.title !== undefined) {
      updateData.title = updates.title
    }
    if (updates.content !== undefined) {
      updateData.content = updates.content
    }
    if (updates.parameters !== undefined) {
      // Merge with existing parameters
      const currentNda = await db
        .select({ parameters: generatedNdas.parameters })
        .from(generatedNdas)
        .where(eq(generatedNdas.id, id))
        .limit(1)

      updateData.parameters = {
        ...(currentNda[0]?.parameters as Record<string, unknown>),
        ...updates.parameters,
      }
    }

    const [updated] = await db
      .update(generatedNdas)
      .set(updateData)
      .where(
        and(eq(generatedNdas.id, id), eq(generatedNdas.tenantId, tenantId))
      )
      .returning()

    return ok(updated)
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Duplicate an existing NDA.
 *
 * Creates a copy of the NDA with status set to 'draft' and " (Copy)" appended to title.
 *
 * @param id - ID of the NDA to duplicate
 * @returns The newly created duplicate NDA
 */
export async function duplicateGeneratedNda(
  id: string
): Promise<ApiResponse<GeneratedNda>> {
  try {
    const { db, userId, tenantId } = await withTenant()

    // Validate UUID format
    const parseResult = z.string().uuid().safeParse(id)
    if (!parseResult.success) {
      return err("VALIDATION_ERROR", "Invalid NDA ID format")
    }

    // Get the original NDA
    const original = await db
      .select()
      .from(generatedNdas)
      .where(
        and(eq(generatedNdas.id, id), eq(generatedNdas.tenantId, tenantId))
      )
      .limit(1)

    if (original.length === 0) {
      return err("NOT_FOUND", "Generated NDA not found")
    }

    const source = original[0]

    // Create duplicate with modified title
    const duplicateNda: NewGeneratedNda = {
      tenantId,
      createdBy: userId,
      title: `${source.title} (Copy)`,
      templateSource: source.templateSource,
      parameters: source.parameters,
      content: source.content,
      contentHtml: source.contentHtml,
      status: "draft",
    }

    const [created] = await db
      .insert(generatedNdas)
      .values(duplicateNda)
      .returning()

    return ok(created)
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Finalize an NDA for signing.
 *
 * Changes status from 'draft' to 'finalized'. Once finalized, the NDA cannot be edited.
 *
 * @param id - ID of the NDA to finalize
 * @returns The finalized NDA record
 */
export async function finalizeNda(
  id: string
): Promise<ApiResponse<GeneratedNda>> {
  try {
    const { db, tenantId } = await withTenant()

    // Validate UUID format
    const parseResult = z.string().uuid().safeParse(id)
    if (!parseResult.success) {
      return err("VALIDATION_ERROR", "Invalid NDA ID format")
    }

    // Check current status
    const existing = await db
      .select({ status: generatedNdas.status })
      .from(generatedNdas)
      .where(
        and(eq(generatedNdas.id, id), eq(generatedNdas.tenantId, tenantId))
      )
      .limit(1)

    if (existing.length === 0) {
      return err("NOT_FOUND", "Generated NDA not found")
    }

    if (existing[0].status !== "draft") {
      return err(
        "BAD_REQUEST",
        "Cannot finalize NDA - only draft NDAs can be finalized"
      )
    }

    const [updated] = await db
      .update(generatedNdas)
      .set({
        status: "finalized",
        updatedAt: new Date(),
      })
      .where(
        and(eq(generatedNdas.id, id), eq(generatedNdas.tenantId, tenantId))
      )
      .returning()

    return ok(updated)
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Archive a generated NDA.
 *
 * Can archive from any status (draft, finalized).
 *
 * @param id - ID of the NDA to archive
 * @returns The archived NDA record
 */
export async function archiveGeneratedNda(
  id: string
): Promise<ApiResponse<GeneratedNda>> {
  try {
    const { db, tenantId } = await withTenant()

    // Validate UUID format
    const parseResult = z.string().uuid().safeParse(id)
    if (!parseResult.success) {
      return err("VALIDATION_ERROR", "Invalid NDA ID format")
    }

    // Check NDA exists
    const existing = await db
      .select({ status: generatedNdas.status })
      .from(generatedNdas)
      .where(
        and(eq(generatedNdas.id, id), eq(generatedNdas.tenantId, tenantId))
      )
      .limit(1)

    if (existing.length === 0) {
      return err("NOT_FOUND", "Generated NDA not found")
    }

    if (existing[0].status === "archived") {
      return err("BAD_REQUEST", "NDA is already archived")
    }

    const [updated] = await db
      .update(generatedNdas)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(
        and(eq(generatedNdas.id, id), eq(generatedNdas.tenantId, tenantId))
      )
      .returning()

    return ok(updated)
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Permanently delete a generated NDA.
 *
 * This is a destructive operation and cannot be undone.
 *
 * @param id - ID of the NDA to delete
 * @returns Success indicator
 */
export async function deleteGeneratedNda(
  id: string
): Promise<ApiResponse<{ deleted: true }>> {
  try {
    const { db, tenantId } = await withTenant()

    // Validate UUID format
    const parseResult = z.string().uuid().safeParse(id)
    if (!parseResult.success) {
      return err("VALIDATION_ERROR", "Invalid NDA ID format")
    }

    // Check NDA exists
    const existing = await db
      .select({ id: generatedNdas.id })
      .from(generatedNdas)
      .where(
        and(eq(generatedNdas.id, id), eq(generatedNdas.tenantId, tenantId))
      )
      .limit(1)

    if (existing.length === 0) {
      return err("NOT_FOUND", "Generated NDA not found")
    }

    await db
      .delete(generatedNdas)
      .where(
        and(eq(generatedNdas.id, id), eq(generatedNdas.tenantId, tenantId))
      )

    return ok({ deleted: true })
  } catch (error) {
    return wrapError(error)
  }
}

/**
 * Export a generated NDA as DOCX or PDF.
 *
 * This is a placeholder implementation. The actual export functionality
 * would integrate with a document generation service.
 *
 * @param input - Export parameters including ID and format
 * @returns Export result with download URL
 */
export async function exportGeneratedNda(
  input: z.infer<typeof exportNdaSchema>
): Promise<ApiResponse<ExportResult>> {
  try {
    const { db, tenantId } = await withTenant()

    // Validate input
    const parseResult = exportNdaSchema.safeParse(input)
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0]
      return err("VALIDATION_ERROR", issue?.message ?? "Invalid input")
    }

    const { id, format } = parseResult.data

    // Get the NDA
    const nda = await db
      .select({
        id: generatedNdas.id,
        title: generatedNdas.title,
        content: generatedNdas.content,
        status: generatedNdas.status,
      })
      .from(generatedNdas)
      .where(
        and(eq(generatedNdas.id, id), eq(generatedNdas.tenantId, tenantId))
      )
      .limit(1)

    if (nda.length === 0) {
      return err("NOT_FOUND", "Generated NDA not found")
    }

    // Placeholder: In a real implementation, this would:
    // 1. Convert markdown content to the target format
    // 2. Upload to blob storage (Vercel Blob)
    // 3. Return a signed URL for download

    // For now, return a placeholder response
    const filename = `${nda[0].title.replace(/[^a-zA-Z0-9]/g, "_")}.${format}`

    return err(
      "SERVICE_UNAVAILABLE",
      `Export to ${format.toUpperCase()} is not yet implemented. Filename would be: ${filename}`
    )
  } catch (error) {
    return wrapError(error)
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate NDA markdown content from template and parameters.
 *
 * This is a placeholder implementation. In a full implementation,
 * this would use a proper template engine (e.g., Handlebars, Mustache)
 * to render the template with the provided parameters.
 *
 * @param templateSource - Template source (bonterms, commonaccord, custom)
 * @param parameters - NDA generation parameters
 * @returns Generated markdown content
 */
function generateNdaMarkdown(
  templateSource: string,
  parameters: z.infer<typeof ndaParametersSchema>
): string {
  const {
    disclosingParty,
    receivingParty,
    effectiveDate,
    termYears,
    mutual,
    governingLaw,
    disputeResolution,
    purposeDescription,
    includeNonSolicit,
    includeNonCompete,
  } = parameters

  const title = mutual
    ? "MUTUAL NON-DISCLOSURE AGREEMENT"
    : "NON-DISCLOSURE AGREEMENT"

  const parties = mutual
    ? `This ${title} ("Agreement") is entered into as of ${effectiveDate} ("Effective Date") by and between:

**${disclosingParty.name}**${disclosingParty.jurisdiction ? ` (${disclosingParty.jurisdiction})` : ""} ("Party A")

and

**${receivingParty.name}**${receivingParty.jurisdiction ? ` (${receivingParty.jurisdiction})` : ""} ("Party B")

collectively referred to as the "Parties" and individually as a "Party".`
    : `This ${title} ("Agreement") is entered into as of ${effectiveDate} ("Effective Date") by and between:

**${disclosingParty.name}**${disclosingParty.jurisdiction ? ` (${disclosingParty.jurisdiction})` : ""} ("Disclosing Party")

and

**${receivingParty.name}**${receivingParty.jurisdiction ? ` (${receivingParty.jurisdiction})` : ""} ("Receiving Party")`

  const sections = [
    `# ${title}`,
    `*Template Source: ${templateSource}*`,
    "",
    parties,
    "",
    "## RECITALS",
    "",
    `WHEREAS, the Parties wish to explore a potential business relationship${purposeDescription ? ` related to ${purposeDescription}` : ""};`,
    "",
    "WHEREAS, in connection with such exploration, each Party may disclose certain confidential and proprietary information to the other Party;",
    "",
    "NOW, THEREFORE, in consideration of the mutual covenants and agreements herein contained, the Parties agree as follows:",
    "",
    "## 1. DEFINITION OF CONFIDENTIAL INFORMATION",
    "",
    '"Confidential Information" means any and all non-public information, in any form or medium, whether written, oral, electronic, or visual, that is disclosed by one Party to the other Party, including but not limited to: business plans, financial information, technical data, trade secrets, know-how, research, product plans, products, services, customers, markets, software, developments, inventions, processes, formulas, technology, designs, drawings, engineering, hardware configuration information, marketing, finances, or other business information.',
    "",
    "## 2. OBLIGATIONS OF RECEIVING PARTY",
    "",
    "The Receiving Party agrees to:",
    "",
    "- Hold the Confidential Information in strict confidence;",
    "- Not disclose the Confidential Information to any third parties without the prior written consent of the Disclosing Party;",
    "- Use the Confidential Information only for the purposes described herein;",
    "- Take reasonable measures to protect the secrecy of the Confidential Information.",
    "",
    "## 3. EXCLUSIONS",
    "",
    "The obligations under this Agreement do not apply to information that:",
    "",
    "- Was publicly known at the time of disclosure;",
    "- Becomes publicly known through no fault of the Receiving Party;",
    "- Was already known to the Receiving Party at the time of disclosure;",
    "- Is independently developed by the Receiving Party without use of the Confidential Information;",
    "- Is disclosed pursuant to a valid court order or governmental requirement.",
    "",
    `## 4. TERM`,
    "",
    `This Agreement shall remain in effect for a period of ${termYears} year${termYears > 1 ? "s" : ""} from the Effective Date. The confidentiality obligations shall survive the termination of this Agreement.`,
    "",
    "## 5. RETURN OF INFORMATION",
    "",
    "Upon request or termination of this Agreement, the Receiving Party shall promptly return or destroy all Confidential Information and any copies thereof.",
    "",
  ]

  // Optional clauses
  if (includeNonSolicit) {
    sections.push(
      "## 6. NON-SOLICITATION",
      "",
      "During the term of this Agreement and for a period of one (1) year thereafter, neither Party shall, directly or indirectly, solicit for employment any employee of the other Party without the prior written consent of such other Party.",
      ""
    )
  }

  if (includeNonCompete) {
    sections.push(
      `## ${includeNonSolicit ? "7" : "6"}. NON-COMPETE`,
      "",
      "During the term of this Agreement, neither Party shall engage in any business activities that directly compete with the other Party in the subject matter of the potential business relationship.",
      ""
    )
  }

  // Governing law
  const lawSection = includeNonSolicit && includeNonCompete ? 8 : includeNonSolicit || includeNonCompete ? 7 : 6
  sections.push(
    `## ${lawSection}. GOVERNING LAW`,
    "",
    `This Agreement shall be governed by and construed in accordance with the laws of ${governingLaw}${disputeResolution ? `. Any disputes arising under this Agreement shall be resolved through ${disputeResolution}` : ""}.`,
    "",
    `## ${lawSection + 1}. ENTIRE AGREEMENT`,
    "",
    "This Agreement constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior negotiations, representations, or agreements relating thereto.",
    "",
    "---",
    "",
    "**IN WITNESS WHEREOF**, the Parties have executed this Agreement as of the Effective Date.",
    "",
    `**${disclosingParty.name}**`,
    "",
    `By: _________________________`,
    disclosingParty.signerName ? `Name: ${disclosingParty.signerName}` : "Name: _________________________",
    disclosingParty.signerTitle ? `Title: ${disclosingParty.signerTitle}` : "Title: _________________________",
    "Date: _________________________",
    "",
    `**${receivingParty.name}**`,
    "",
    `By: _________________________`,
    receivingParty.signerName ? `Name: ${receivingParty.signerName}` : "Name: _________________________",
    receivingParty.signerTitle ? `Title: ${receivingParty.signerTitle}` : "Title: _________________________",
    "Date: _________________________",
  )

  return sections.join("\n")
}
