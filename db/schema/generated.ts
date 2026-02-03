/**
 * @fileoverview Generated NDA Schema - Template-Based NDA Generation
 *
 * This module defines the database schema for NDAs generated from templates.
 * The NDA generation workflow allows users to create new NDAs by:
 *
 * 1. Selecting a template source (Bonterms, CommonAccord, or custom)
 * 2. Providing generation parameters (parties, dates, jurisdiction, terms)
 * 3. Generating markdown content from the template engine
 * 4. Optionally rendering to HTML for preview/export
 *
 * Generated NDAs go through a lifecycle:
 * - `draft`: Initial generation, can be edited and regenerated
 * - `finalized`: Locked for signing/distribution
 * - `archived`: No longer active, kept for audit trail
 *
 * @module src/db/schema/generated
 * @see {@link file://docs/PRD.md} Product requirements for NDA generation
 */

import { pgTable, text, uuid, jsonb, index } from "drizzle-orm/pg-core"
import { primaryId, timestamps, tenantId } from "../_columns"
import { users } from "./auth"

/**
 * Generated NDAs table - stores NDAs created from templates.
 *
 * This table captures the full context of NDA generation including the source
 * template, all parameters used, and both markdown and HTML versions of the
 * generated content. Each generated NDA is tenant-scoped and tracks the user
 * who created it.
 *
 * @description
 * The template-based NDA generation workflow:
 *
 * 1. **Template Selection**: User selects from available templates
 *    - `bonterms`: Industry-standard Bonterms Cloud Terms templates
 *    - `commonaccord`: CommonAccord open-source legal templates
 *    - `custom`: Organization-specific uploaded templates
 *
 * 2. **Parameter Input**: User provides required fields stored in `parameters`
 *
 * 3. **Content Generation**: Template engine produces markdown in `content`
 *
 * 4. **HTML Rendering**: Optional `contentHtml` for preview and PDF export
 *
 * 5. **Lifecycle Management**: Status transitions from draft to finalized
 *
 * @example
 * // Create a new draft NDA
 * import { db } from "@/db/client"
 * import { generatedNdas } from "@/db/schema"
 *
 * const newNda = await db.insert(generatedNdas).values({
 *   tenantId: "org_123",
 *   createdBy: "user_456",
 *   title: "Mutual NDA - Acme Corp",
 *   templateSource: "bonterms",
 *   parameters: {
 *     disclosingParty: { name: "My Company Inc.", jurisdiction: "Delaware" },
 *     receivingParty: { name: "Acme Corp", jurisdiction: "California" },
 *     effectiveDate: "2026-02-01",
 *     termYears: 2,
 *     governingLaw: "Delaware",
 *     mutual: true,
 *   },
 *   content: "# Mutual Non-Disclosure Agreement\n\n...",
 *   contentHtml: "<h1>Mutual Non-Disclosure Agreement</h1>...",
 *   status: "draft",
 * }).returning()
 *
 * @example
 * // Query all draft NDAs for a tenant
 * import { eq, and } from "drizzle-orm"
 *
 * const drafts = await db
 *   .select()
 *   .from(generatedNdas)
 *   .where(
 *     and(
 *       eq(generatedNdas.tenantId, "org_123"),
 *       eq(generatedNdas.status, "draft")
 *     )
 *   )
 *   .orderBy(generatedNdas.createdAt)
 *
 * @example
 * // Finalize a draft NDA
 * await db
 *   .update(generatedNdas)
 *   .set({ status: "finalized", updatedAt: new Date() })
 *   .where(eq(generatedNdas.id, ndaId))
 *
 * @example
 * // Find NDAs created by a specific user
 * const userNdas = await db
 *   .select({
 *     id: generatedNdas.id,
 *     title: generatedNdas.title,
 *     status: generatedNdas.status,
 *     createdAt: generatedNdas.createdAt,
 *   })
 *   .from(generatedNdas)
 *   .where(eq(generatedNdas.createdBy, userId))
 */
export const generatedNdas = pgTable(
  "generated_ndas",
  {
    /**
     * Primary key - UUID v7 for time-ordered uniqueness.
     * @see {@link primaryId} from _columns.ts
     */
    ...primaryId,

    /**
     * Tenant identifier for multi-tenancy isolation.
     * All queries should filter by tenantId for RLS enforcement.
     * @see {@link tenantId} from _columns.ts
     */
    ...tenantId,

    /**
     * User who created/generated this NDA.
     * References the users table for audit trail.
     * Can be null for system-generated or migrated NDAs.
     */
    createdBy: uuid("created_by").references(() => users.id),

    /**
     * Human-readable title for the generated NDA.
     * Typically includes the counterparty name and NDA type.
     * @example "Mutual NDA - Acme Corp"
     * @example "One-Way NDA - Contractor Services"
     */
    title: text("title").notNull(),

    /**
     * Source template used for generation.
     *
     * Valid values:
     * - `"bonterms"` - Bonterms Cloud Terms standardized templates
     * - `"commonaccord"` - CommonAccord open-source legal prose
     * - `"custom"` - Organization-uploaded custom templates
     *
     * @type {"bonterms" | "commonaccord" | "custom"}
     */
    templateSource: text("template_source").notNull(),

    /**
     * Generation parameters as JSONB - all inputs used to generate the NDA.
     *
     * Schema varies by template but typically includes:
     *
     * ```typescript
     * interface NdaParameters {
     *   // Party information
     *   disclosingParty: {
     *     name: string           // Legal entity name
     *     address?: string       // Business address
     *     jurisdiction: string   // State/country of incorporation
     *     signerName?: string    // Authorized signatory
     *     signerTitle?: string   // Title of signatory
     *   }
     *   receivingParty: {
     *     name: string
     *     address?: string
     *     jurisdiction: string
     *     signerName?: string
     *     signerTitle?: string
     *   }
     *
     *   // Agreement terms
     *   effectiveDate: string    // ISO date "YYYY-MM-DD"
     *   termYears: number        // Duration of confidentiality obligation
     *   mutual: boolean          // true = mutual, false = one-way
     *
     *   // Legal provisions
     *   governingLaw: string     // Jurisdiction for disputes
     *   disputeResolution?: "litigation" | "arbitration" | "mediation"
     *   venue?: string           // Court/arbitration location
     *
     *   // Scope customization
     *   purposeDescription?: string   // Permitted use of confidential info
     *   excludedCategories?: string[] // Carve-outs from confidential info
     *   returnOrDestroy?: "return" | "destroy" | "certify"
     *
     *   // Optional clauses
     *   includeNonSolicit?: boolean
     *   includeNonCompete?: boolean
     *   includeIpAssignment?: boolean
     * }
     * ```
     *
     * @type {Record<string, unknown>}
     */
    parameters: jsonb("parameters").notNull(),

    /**
     * Generated NDA content in Markdown format.
     *
     * This is the primary content field, generated by the template engine.
     * Markdown is used for:
     * - Easy editing and diff comparison
     * - Version control friendliness
     * - Rendering to multiple output formats
     *
     * The content includes the full NDA text with all clauses,
     * recitals, definitions, and signature blocks.
     */
    content: text("content").notNull(),

    /**
     * Rendered HTML version of the NDA content.
     *
     * Optional field populated when:
     * - User requests a preview
     * - Preparing for PDF export
     * - Embedding in email or document
     *
     * Generated from `content` using a markdown processor with
     * legal document styling (proper indentation, numbered sections).
     *
     * Can be null if HTML rendering hasn't been requested yet.
     */
    contentHtml: text("content_html"),

    /**
     * Current lifecycle status of the generated NDA.
     *
     * Valid values:
     * - `"draft"` - Initial state, can be edited and regenerated
     * - `"finalized"` - Locked for signing, no further edits
     * - `"archived"` - No longer active, retained for records
     *
     * Status transitions:
     * - draft -> finalized (user finalizes for signing)
     * - finalized -> archived (after execution or expiration)
     * - draft -> archived (user abandons draft)
     *
     * @type {"draft" | "finalized" | "archived"}
     * @default "draft"
     */
    status: text("status").notNull().default("draft"),

    /**
     * Timestamp columns: createdAt, updatedAt.
     * @see {@link timestamps} from _columns.ts
     */
    ...timestamps,
  },
  (table) => [
    /**
     * Index for tenant-scoped queries.
     * Essential for RLS performance when filtering by organization.
     */
    index("idx_generated_tenant").on(table.tenantId),

    /**
     * Composite index for status filtering within a tenant.
     * Optimizes common queries like "all drafts for this org".
     */
    index("idx_generated_status").on(table.tenantId, table.status),
  ]
)

/**
 * TypeScript type for inserting a new generated NDA.
 * @example
 * const newNda: NewGeneratedNda = {
 *   tenantId: "org_123",
 *   title: "Mutual NDA - Partner Co",
 *   templateSource: "bonterms",
 *   parameters: { ... },
 *   content: "# NDA Content...",
 * }
 */
export type NewGeneratedNda = typeof generatedNdas.$inferInsert

/**
 * TypeScript type for a generated NDA selected from the database.
 * Includes all fields with their resolved types.
 */
export type GeneratedNda = typeof generatedNdas.$inferSelect
