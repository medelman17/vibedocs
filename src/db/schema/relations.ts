/**
 * @fileoverview Centralized Drizzle ORM Relations for Query Builder Support
 *
 * This file defines all relational mappings between database tables, enabling
 * Drizzle's powerful relational query API. Relations are intentionally separated
 * from table definitions for several important reasons:
 *
 * ## Why Separate Relations?
 *
 * 1. **Avoid Circular Imports**: Tables often reference each other bidirectionally.
 *    Defining relations separately prevents circular dependency issues between
 *    table definition files.
 *
 * 2. **Clean Table Definitions**: Keeps table schemas focused on column definitions,
 *    constraints, and indexes without the complexity of relationship logic.
 *
 * 3. **Centralized Relationship Logic**: All relationship semantics are in one place,
 *    making it easy to understand the full data model and its connections.
 *
 * 4. **Drizzle ORM Requirement**: Drizzle's query builder API requires relations to
 *    be defined using the `relations()` helper function, which must reference both
 *    sides of a relationship.
 *
 * ## Usage with Drizzle Query Builder
 *
 * Once relations are defined, you can use Drizzle's relational query API:
 *
 * @example Basic relational query
 * ```typescript
 * // Find a user with all their organization memberships
 * const userWithOrgs = await db.query.users.findFirst({
 *   where: eq(users.id, userId),
 *   with: {
 *     organizationMemberships: true,
 *   },
 * });
 * ```
 *
 * @example Nested relations
 * ```typescript
 * // Find an organization with members and their user details
 * const org = await db.query.organizations.findFirst({
 *   where: eq(organizations.id, orgId),
 *   with: {
 *     members: {
 *       with: {
 *         user: true,
 *       },
 *     },
 *   },
 * });
 * ```
 *
 * @example Filtering nested relations
 * ```typescript
 * // Find documents with only completed analyses
 * const docs = await db.query.documents.findMany({
 *   with: {
 *     analyses: {
 *       where: eq(analyses.status, 'completed'),
 *     },
 *   },
 * });
 * ```
 *
 * ## Relationship Types
 *
 * - **one-to-many**: Parent has `many()`, child has `one()` with foreign key reference
 * - **many-to-one**: Child references parent via `one()` with `fields` and `references`
 * - **self-referential**: Same table on both sides (e.g., parent/child embeddings)
 * - **named relations**: Multiple relations to same table require `relationName`
 *
 * @see https://orm.drizzle.team/docs/rqb Drizzle Relational Query Builder docs
 * @module src/db/schema/relations
 */

import { relations } from "drizzle-orm"

import { users, accounts, sessions } from "./auth"
import { passwordResetTokens } from "./password-reset"
import { organizations, organizationMembers } from "./organizations"
import { documents, documentChunks } from "./documents"
import { analyses, clauseExtractions } from "./analyses"
import { comparisons } from "./comparisons"
import { generatedNdas } from "./generated"
import { auditLogs } from "./audit"
import { referenceDocuments, referenceEmbeddings } from "./reference"

// ============================================================================
// Auth Relations
// ============================================================================

/**
 * Relations for the `users` table.
 *
 * Users are the central identity entity in the system. Each user can have:
 * - Multiple OAuth accounts (Google, GitHub, etc.)
 * - Multiple active sessions (different devices/browsers)
 * - Membership in multiple organizations
 * - Documents they've uploaded
 * - NDAs they've generated
 *
 * @description One-to-many relationships from user to auth and content entities.
 *
 * @example Query user with all their organizations
 * ```typescript
 * const user = await db.query.users.findFirst({
 *   where: eq(users.id, userId),
 *   with: {
 *     organizationMemberships: {
 *       with: {
 *         organization: true,
 *       },
 *     },
 *   },
 * });
 * // Returns: { id, name, email, organizationMemberships: [{ role, organization: { name } }] }
 * ```
 *
 * @example Query user's recent uploads
 * ```typescript
 * const user = await db.query.users.findFirst({
 *   where: eq(users.id, userId),
 *   with: {
 *     uploadedDocuments: {
 *       orderBy: [desc(documents.createdAt)],
 *       limit: 10,
 *     },
 *   },
 * });
 * ```
 */
export const usersRelations = relations(users, ({ many }) => ({
  /** OAuth provider accounts linked to this user (Google, GitHub, etc.) */
  accounts: many(accounts),
  /** Active authentication sessions for this user across devices */
  sessions: many(sessions),
  /** Organization memberships with role information */
  organizationMemberships: many(organizationMembers),
  /** Documents uploaded by this user across all organizations */
  uploadedDocuments: many(documents),
  /** NDAs generated/created by this user */
  generatedNdas: many(generatedNdas),
  /** Password reset tokens for this user */
  passwordResetTokens: many(passwordResetTokens),
}))

/**
 * Relations for the `password_reset_tokens` table.
 *
 * Password reset tokens allow users to securely reset their password via email.
 * Tokens are single-use and expire after a set time period (typically 1 hour).
 *
 * @description Many-to-one relationship from token to user.
 */
export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    /** The user this password reset token belongs to */
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  })
)

/**
 * Relations for the `accounts` table (OAuth provider accounts).
 *
 * Each account represents a connection to an OAuth provider (Google, GitHub, etc.)
 * and belongs to exactly one user. Multiple accounts can be linked to the same
 * user for different login methods.
 *
 * @description Many-to-one relationship from OAuth account to user.
 *
 * @example Query account with user details
 * ```typescript
 * const account = await db.query.accounts.findFirst({
 *   where: and(
 *     eq(accounts.provider, 'google'),
 *     eq(accounts.providerAccountId, googleId)
 *   ),
 *   with: {
 *     user: true,
 *   },
 * });
 * // Returns: { provider, providerAccountId, user: { id, name, email } }
 * ```
 */
export const accountsRelations = relations(accounts, ({ one }) => ({
  /** The user this OAuth account belongs to */
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}))

/**
 * Relations for the `sessions` table.
 *
 * Sessions track authenticated user sessions across devices and browsers.
 * Each session belongs to exactly one user and contains the session token
 * and expiration time.
 *
 * @description Many-to-one relationship from session to user.
 *
 * @example Query active sessions for a user
 * ```typescript
 * const activeSessions = await db.query.sessions.findMany({
 *   where: and(
 *     eq(sessions.userId, userId),
 *     gt(sessions.expires, new Date())
 *   ),
 *   with: {
 *     user: {
 *       columns: { id: true, name: true, email: true },
 *     },
 *   },
 * });
 * ```
 */
export const sessionsRelations = relations(sessions, ({ one }) => ({
  /** The user this session belongs to */
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

// ============================================================================
// Organization Relations
// ============================================================================

/**
 * Relations for the `organizations` table.
 *
 * Organizations are the multi-tenancy boundary in the system. All tenant-scoped
 * data (documents, analyses, comparisons, etc.) belongs to an organization.
 * Users join organizations as members with specific roles.
 *
 * @description One-to-many relationships from organization to all tenant-scoped entities.
 *
 * @example Query organization with members and recent documents
 * ```typescript
 * const org = await db.query.organizations.findFirst({
 *   where: eq(organizations.id, orgId),
 *   with: {
 *     members: {
 *       with: {
 *         user: {
 *           columns: { id: true, name: true, email: true, image: true },
 *         },
 *       },
 *     },
 *     documents: {
 *       orderBy: [desc(documents.createdAt)],
 *       limit: 5,
 *     },
 *   },
 * });
 * ```
 *
 * @example Query organization's analysis statistics
 * ```typescript
 * const orgWithAnalyses = await db.query.organizations.findFirst({
 *   where: eq(organizations.id, orgId),
 *   with: {
 *     analyses: {
 *       where: eq(analyses.status, 'completed'),
 *     },
 *   },
 * });
 * const completedCount = orgWithAnalyses?.analyses.length ?? 0;
 * ```
 */
export const organizationsRelations = relations(organizations, ({ many }) => ({
  /** Users who are members of this organization */
  members: many(organizationMembers),
  /** All documents uploaded to this organization */
  documents: many(documents),
  /** All NDA analyses performed within this organization */
  analyses: many(analyses),
  /** Document comparisons created in this organization */
  comparisons: many(comparisons),
  /** NDAs generated from templates in this organization */
  generatedNdas: many(generatedNdas),
  /** Audit trail of actions within this organization */
  auditLogs: many(auditLogs),
}))

/**
 * Relations for the `organization_members` junction table.
 *
 * This junction table enables many-to-many relationships between users and
 * organizations, with additional metadata like role and invitation info.
 * Note the named "inviter" relation to handle two references to the users table.
 *
 * @description Junction table with many-to-one relations to both organization and user,
 * plus a named relation for the inviting user.
 *
 * **Named Relation: "inviter"**
 * Since this table has two foreign keys to the `users` table (`userId` and `invitedBy`),
 * the `inviter` relation uses `relationName: "inviter"` to disambiguate.
 *
 * @example Query membership with organization and inviter details
 * ```typescript
 * const membership = await db.query.organizationMembers.findFirst({
 *   where: and(
 *     eq(organizationMembers.userId, userId),
 *     eq(organizationMembers.organizationId, orgId)
 *   ),
 *   with: {
 *     organization: true,
 *     user: true,
 *     inviter: {
 *       columns: { id: true, name: true },
 *     },
 *   },
 * });
 * // Returns: { role, organization: {...}, user: {...}, inviter: { id, name } }
 * ```
 *
 * @example Query all members of an organization with roles
 * ```typescript
 * const members = await db.query.organizationMembers.findMany({
 *   where: eq(organizationMembers.organizationId, orgId),
 *   with: {
 *     user: {
 *       columns: { id: true, name: true, email: true, image: true },
 *     },
 *   },
 * });
 * // Returns: [{ role, user: { id, name, email, image } }, ...]
 * ```
 */
export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    /** The organization this membership belongs to */
    organization: one(organizations, {
      fields: [organizationMembers.organizationId],
      references: [organizations.id],
    }),
    /** The user who is a member */
    user: one(users, {
      fields: [organizationMembers.userId],
      references: [users.id],
    }),
    /**
     * The user who invited this member to the organization.
     *
     * Uses named relation "inviter" because this table has two foreign keys
     * to the users table (userId and invitedBy). The relationName ensures
     * Drizzle can distinguish between the member user and the inviting user.
     */
    inviter: one(users, {
      fields: [organizationMembers.invitedBy],
      references: [users.id],
      relationName: "inviter",
    }),
  })
)

// ============================================================================
// Document Relations
// ============================================================================

/**
 * Relations for the `documents` table.
 *
 * Documents are uploaded NDAs and contracts that users want to analyze.
 * Each document belongs to an organization (tenant) and can be chunked for
 * processing, analyzed for clauses/risks, and compared with other documents.
 *
 * **Named Relations: "documentA" and "documentB"**
 * Since comparisons reference two documents, the `comparisonsAsA` and `comparisonsAsB`
 * relations use named relations to distinguish which side of the comparison
 * this document is on.
 *
 * @description Mixed one-to-many relationships to chunks, analyses, extractions,
 * and named relations for comparisons.
 *
 * @example Query document with full analysis results
 * ```typescript
 * const doc = await db.query.documents.findFirst({
 *   where: eq(documents.id, docId),
 *   with: {
 *     uploader: {
 *       columns: { id: true, name: true },
 *     },
 *     analyses: {
 *       with: {
 *         clauseExtractions: true,
 *       },
 *     },
 *   },
 * });
 * ```
 *
 * @example Query document's comparisons (both sides)
 * ```typescript
 * const doc = await db.query.documents.findFirst({
 *   where: eq(documents.id, docId),
 *   with: {
 *     comparisonsAsA: {
 *       with: { documentB: true },
 *     },
 *     comparisonsAsB: {
 *       with: { documentA: true },
 *     },
 *   },
 * });
 * // All comparisons where this doc is involved
 * const allComparisons = [
 *   ...doc.comparisonsAsA,
 *   ...doc.comparisonsAsB,
 * ];
 * ```
 */
export const documentsRelations = relations(documents, ({ one, many }) => ({
  /** The organization (tenant) this document belongs to */
  organization: one(organizations, {
    fields: [documents.tenantId],
    references: [organizations.id],
  }),
  /** The user who uploaded this document */
  uploader: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
  }),
  /** Text chunks extracted from this document for processing */
  chunks: many(documentChunks),
  /** Analysis runs performed on this document */
  analyses: many(analyses),
  /** Individual clause extractions found in this document */
  clauseExtractions: many(clauseExtractions),
  /**
   * Comparisons where this document is "Document A" (first/baseline).
   *
   * Uses named relation "documentA" because comparisons have two document
   * foreign keys. Query both `comparisonsAsA` and `comparisonsAsB` to get
   * all comparisons involving this document.
   */
  comparisonsAsA: many(comparisons, { relationName: "documentA" }),
  /**
   * Comparisons where this document is "Document B" (second/comparison target).
   *
   * Uses named relation "documentB" because comparisons have two document
   * foreign keys. Query both `comparisonsAsA` and `comparisonsAsB` to get
   * all comparisons involving this document.
   */
  comparisonsAsB: many(comparisons, { relationName: "documentB" }),
}))

/**
 * Relations for the `document_chunks` table.
 *
 * Document chunks are segments of text extracted from documents for processing.
 * Each chunk belongs to a document and can have clause extractions associated
 * with it (clauses found within that specific chunk).
 *
 * @description Many-to-one relationship to parent document, one-to-many to extractions.
 *
 * @example Query chunk with its parent document
 * ```typescript
 * const chunk = await db.query.documentChunks.findFirst({
 *   where: eq(documentChunks.id, chunkId),
 *   with: {
 *     document: {
 *       columns: { id: true, fileName: true },
 *     },
 *   },
 * });
 * ```
 *
 * @example Query chunks with their extracted clauses
 * ```typescript
 * const chunksWithClauses = await db.query.documentChunks.findMany({
 *   where: eq(documentChunks.documentId, docId),
 *   with: {
 *     clauseExtractions: {
 *       orderBy: [asc(clauseExtractions.startOffset)],
 *     },
 *   },
 *   orderBy: [asc(documentChunks.chunkIndex)],
 * });
 * ```
 */
export const documentChunksRelations = relations(
  documentChunks,
  ({ one, many }) => ({
    /** The document this chunk was extracted from */
    document: one(documents, {
      fields: [documentChunks.documentId],
      references: [documents.id],
    }),
    /** Clause extractions found within this chunk */
    clauseExtractions: many(clauseExtractions),
  })
)

// ============================================================================
// Analysis Relations
// ============================================================================

/**
 * Relations for the `analyses` table.
 *
 * Analyses represent complete NDA analysis runs, including clause extraction,
 * risk scoring, and gap analysis. Each analysis belongs to an organization
 * and targets a specific document.
 *
 * @description Many-to-one to organization and document, one-to-many to clause extractions.
 *
 * @example Query analysis with full results
 * ```typescript
 * const analysis = await db.query.analyses.findFirst({
 *   where: eq(analyses.id, analysisId),
 *   with: {
 *     document: {
 *       columns: { id: true, fileName: true },
 *     },
 *     clauseExtractions: {
 *       orderBy: [asc(clauseExtractions.clauseType)],
 *     },
 *   },
 * });
 * ```
 *
 * @example Query recent analyses for an organization
 * ```typescript
 * const recentAnalyses = await db.query.analyses.findMany({
 *   where: eq(analyses.tenantId, orgId),
 *   with: {
 *     document: true,
 *   },
 *   orderBy: [desc(analyses.createdAt)],
 *   limit: 10,
 * });
 * ```
 */
export const analysesRelations = relations(analyses, ({ one, many }) => ({
  /** The organization (tenant) this analysis belongs to */
  organization: one(organizations, {
    fields: [analyses.tenantId],
    references: [organizations.id],
  }),
  /** The document that was analyzed */
  document: one(documents, {
    fields: [analyses.documentId],
    references: [documents.id],
  }),
  /** Individual clause extractions from this analysis */
  clauseExtractions: many(clauseExtractions),
}))

/**
 * Relations for the `clause_extractions` table.
 *
 * Clause extractions are individual contract clauses identified during analysis.
 * Each extraction is categorized according to the CUAD 41-category taxonomy and
 * includes risk scores, evidence citations, and location information.
 *
 * @description Many-to-one relationships to organization, analysis, document, and chunk.
 *
 * @example Query extraction with full context
 * ```typescript
 * const extraction = await db.query.clauseExtractions.findFirst({
 *   where: eq(clauseExtractions.id, extractionId),
 *   with: {
 *     analysis: true,
 *     document: {
 *       columns: { id: true, fileName: true },
 *     },
 *     chunk: {
 *       columns: { id: true, content: true },
 *     },
 *   },
 * });
 * ```
 *
 * @example Query high-risk clauses in a document
 * ```typescript
 * const highRiskClauses = await db.query.clauseExtractions.findMany({
 *   where: and(
 *     eq(clauseExtractions.documentId, docId),
 *     gte(clauseExtractions.riskScore, 0.8)
 *   ),
 *   with: {
 *     chunk: true,
 *   },
 *   orderBy: [desc(clauseExtractions.riskScore)],
 * });
 * ```
 */
export const clauseExtractionsRelations = relations(
  clauseExtractions,
  ({ one }) => ({
    /** The organization (tenant) this extraction belongs to */
    organization: one(organizations, {
      fields: [clauseExtractions.tenantId],
      references: [organizations.id],
    }),
    /** The analysis run that produced this extraction */
    analysis: one(analyses, {
      fields: [clauseExtractions.analysisId],
      references: [analyses.id],
    }),
    /** The source document containing this clause */
    document: one(documents, {
      fields: [clauseExtractions.documentId],
      references: [documents.id],
    }),
    /** The specific chunk where this clause was found */
    chunk: one(documentChunks, {
      fields: [clauseExtractions.chunkId],
      references: [documentChunks.id],
    }),
  })
)

// ============================================================================
// Comparison Relations
// ============================================================================

/**
 * Relations for the `comparisons` table.
 *
 * Comparisons enable side-by-side analysis of two NDAs, highlighting
 * differences in clause coverage, risk levels, and terms. Each comparison
 * references two documents ("A" and "B") and belongs to an organization.
 *
 * **Named Relations: "documentA" and "documentB"**
 * Since comparisons have two foreign keys to the documents table, named
 * relations are required to distinguish between them. Document A is typically
 * the baseline/reference, and Document B is the one being compared against it.
 *
 * @description Many-to-one relationships to organization and both documents,
 * using named relations for document disambiguation.
 *
 * @example Query comparison with both documents
 * ```typescript
 * const comparison = await db.query.comparisons.findFirst({
 *   where: eq(comparisons.id, comparisonId),
 *   with: {
 *     documentA: {
 *       columns: { id: true, fileName: true },
 *       with: { analyses: true },
 *     },
 *     documentB: {
 *       columns: { id: true, fileName: true },
 *       with: { analyses: true },
 *     },
 *   },
 * });
 * // Returns: {
 * //   id, status,
 * //   documentA: { fileName, analyses: [...] },
 * //   documentB: { fileName, analyses: [...] }
 * // }
 * ```
 *
 * @example Query all comparisons for an organization
 * ```typescript
 * const comparisons = await db.query.comparisons.findMany({
 *   where: eq(comparisons.tenantId, orgId),
 *   with: {
 *     documentA: { columns: { id: true, fileName: true } },
 *     documentB: { columns: { id: true, fileName: true } },
 *   },
 *   orderBy: [desc(comparisons.createdAt)],
 * });
 * ```
 */
export const comparisonsRelations = relations(comparisons, ({ one }) => ({
  /** The organization (tenant) this comparison belongs to */
  organization: one(organizations, {
    fields: [comparisons.tenantId],
    references: [organizations.id],
  }),
  /**
   * The first document in the comparison (baseline/reference).
   *
   * Uses named relation "documentA" to distinguish from documentB.
   * In the UI, this is typically shown on the left side or as the
   * reference document.
   */
  documentA: one(documents, {
    fields: [comparisons.documentAId],
    references: [documents.id],
    relationName: "documentA",
  }),
  /**
   * The second document in the comparison (being compared).
   *
   * Uses named relation "documentB" to distinguish from documentA.
   * In the UI, this is typically shown on the right side or as the
   * document being compared against the baseline.
   */
  documentB: one(documents, {
    fields: [comparisons.documentBId],
    references: [documents.id],
    relationName: "documentB",
  }),
}))

// ============================================================================
// Generated NDA Relations
// ============================================================================

/**
 * Relations for the `generated_ndas` table.
 *
 * Generated NDAs are documents created from templates, customized based on
 * user requirements and learned patterns from analyzed NDAs. Each generated
 * NDA belongs to an organization and tracks who created it.
 *
 * @description Many-to-one relationships to organization and creator user.
 *
 * @example Query generated NDA with creator details
 * ```typescript
 * const nda = await db.query.generatedNdas.findFirst({
 *   where: eq(generatedNdas.id, ndaId),
 *   with: {
 *     organization: {
 *       columns: { id: true, name: true },
 *     },
 *     creator: {
 *       columns: { id: true, name: true, email: true },
 *     },
 *   },
 * });
 * ```
 *
 * @example Query recent generated NDAs for a user
 * ```typescript
 * const userNdas = await db.query.generatedNdas.findMany({
 *   where: eq(generatedNdas.createdBy, userId),
 *   with: {
 *     organization: true,
 *   },
 *   orderBy: [desc(generatedNdas.createdAt)],
 *   limit: 10,
 * });
 * ```
 */
export const generatedNdasRelations = relations(generatedNdas, ({ one }) => ({
  /** The organization (tenant) this generated NDA belongs to */
  organization: one(organizations, {
    fields: [generatedNdas.tenantId],
    references: [organizations.id],
  }),
  /** The user who created/generated this NDA */
  creator: one(users, {
    fields: [generatedNdas.createdBy],
    references: [users.id],
  }),
}))

// ============================================================================
// Audit Log Relations
// ============================================================================

/**
 * Relations for the `audit_logs` table.
 *
 * Audit logs track user actions within an organization for compliance and
 * debugging purposes. Each log entry records who performed what action,
 * when, and on which resource.
 *
 * @description Many-to-one relationships to organization and acting user.
 *
 * @example Query audit logs with user details
 * ```typescript
 * const logs = await db.query.auditLogs.findMany({
 *   where: eq(auditLogs.tenantId, orgId),
 *   with: {
 *     user: {
 *       columns: { id: true, name: true, email: true },
 *     },
 *   },
 *   orderBy: [desc(auditLogs.createdAt)],
 *   limit: 100,
 * });
 * ```
 *
 * @example Query specific user's actions
 * ```typescript
 * const userActions = await db.query.auditLogs.findMany({
 *   where: and(
 *     eq(auditLogs.tenantId, orgId),
 *     eq(auditLogs.userId, userId)
 *   ),
 *   with: {
 *     user: true,
 *     organization: true,
 *   },
 *   orderBy: [desc(auditLogs.createdAt)],
 * });
 * ```
 */
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  /** The organization (tenant) this log entry belongs to */
  organization: one(organizations, {
    fields: [auditLogs.tenantId],
    references: [organizations.id],
  }),
  /** The user who performed the logged action */
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}))

// ============================================================================
// Shared Reference Relations
// ============================================================================

/**
 * Relations for the `reference_documents` table.
 *
 * Reference documents are shared, curated datasets used across all tenants
 * (e.g., CUAD dataset, ContractNLI, NDA templates). These are not tenant-scoped
 * and provide the foundation for clause classification and risk assessment.
 *
 * @description One-to-many relationship to reference embeddings.
 *
 * @example Query reference document with embeddings
 * ```typescript
 * const refDoc = await db.query.referenceDocuments.findFirst({
 *   where: eq(referenceDocuments.id, docId),
 *   with: {
 *     embeddings: {
 *       orderBy: [asc(referenceEmbeddings.chunkIndex)],
 *     },
 *   },
 * });
 * ```
 *
 * @example Query all reference documents of a specific type
 * ```typescript
 * const cuadDocs = await db.query.referenceDocuments.findMany({
 *   where: eq(referenceDocuments.sourceDataset, 'cuad'),
 *   with: {
 *     embeddings: {
 *       columns: { id: true, chunkIndex: true },
 *     },
 *   },
 * });
 * ```
 */
export const referenceDocumentsRelations = relations(
  referenceDocuments,
  ({ many }) => ({
    /** Vector embeddings generated from this reference document */
    embeddings: many(referenceEmbeddings),
  })
)

/**
 * Relations for the `reference_embeddings` table.
 *
 * Reference embeddings store vector representations of reference document chunks,
 * enabling semantic similarity search for clause classification and risk assessment.
 * Embeddings support hierarchical structures via parent-child relationships for
 * advanced retrieval strategies (e.g., sentence-level with document-level context).
 *
 * **Self-Referential Named Relation: "parentChild"**
 * Embeddings can have parent-child relationships within the same table (e.g.,
 * document-level embeddings as parents of sentence-level embeddings). The
 * `relationName: "parentChild"` enables querying in both directions.
 *
 * @description Many-to-one to parent document, self-referential parent-child hierarchy.
 *
 * @example Query embedding with parent context
 * ```typescript
 * const embedding = await db.query.referenceEmbeddings.findFirst({
 *   where: eq(referenceEmbeddings.id, embeddingId),
 *   with: {
 *     document: true,
 *     parent: true, // Get the parent embedding if this is a child
 *   },
 * });
 * ```
 *
 * @example Query document-level embedding with all children
 * ```typescript
 * const docEmbedding = await db.query.referenceEmbeddings.findFirst({
 *   where: and(
 *     eq(referenceEmbeddings.documentId, docId),
 *     isNull(referenceEmbeddings.parentId) // Top-level embedding
 *   ),
 *   with: {
 *     children: {
 *       orderBy: [asc(referenceEmbeddings.chunkIndex)],
 *     },
 *   },
 * });
 * ```
 *
 * @example Query embeddings for similarity search results
 * ```typescript
 * // After vector similarity search returns IDs:
 * const embeddings = await db.query.referenceEmbeddings.findMany({
 *   where: inArray(referenceEmbeddings.id, similarityResultIds),
 *   with: {
 *     document: {
 *       columns: { id: true, title: true, sourceDataset: true },
 *     },
 *     parent: true, // Include parent context if exists
 *   },
 * });
 * ```
 */
export const referenceEmbeddingsRelations = relations(
  referenceEmbeddings,
  ({ one, many }) => ({
    /** The reference document this embedding was generated from */
    document: one(referenceDocuments, {
      fields: [referenceEmbeddings.documentId],
      references: [referenceDocuments.id],
    }),
    /**
     * Parent embedding for hierarchical retrieval.
     *
     * Uses self-referential named relation "parentChild" to enable both
     * upward (child to parent) and downward (parent to children) traversal.
     * Typically used for late-chunking strategies where sentence embeddings
     * reference their paragraph or document-level context.
     */
    parent: one(referenceEmbeddings, {
      fields: [referenceEmbeddings.parentId],
      references: [referenceEmbeddings.id],
      relationName: "parentChild",
    }),
    /**
     * Child embeddings for hierarchical retrieval.
     *
     * Uses self-referential named relation "parentChild" to find all
     * finer-grained embeddings that belong to this parent embedding.
     */
    children: many(referenceEmbeddings, { relationName: "parentChild" }),
  })
)
