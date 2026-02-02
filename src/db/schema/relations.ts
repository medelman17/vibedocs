// src/db/schema/relations.ts
// Centralized Drizzle relations for query builder support
import { relations } from "drizzle-orm"

import { users, accounts, sessions } from "./auth"
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

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  organizationMemberships: many(organizationMembers),
  uploadedDocuments: many(documents),
  generatedNdas: many(generatedNdas),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

// ============================================================================
// Organization Relations
// ============================================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  documents: many(documents),
  analyses: many(analyses),
  comparisons: many(comparisons),
  generatedNdas: many(generatedNdas),
  auditLogs: many(auditLogs),
}))

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [organizationMembers.userId],
      references: [users.id],
    }),
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

export const documentsRelations = relations(documents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [documents.tenantId],
    references: [organizations.id],
  }),
  uploader: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
  }),
  chunks: many(documentChunks),
  analyses: many(analyses),
  clauseExtractions: many(clauseExtractions),
  comparisonsAsA: many(comparisons, { relationName: "documentA" }),
  comparisonsAsB: many(comparisons, { relationName: "documentB" }),
}))

export const documentChunksRelations = relations(
  documentChunks,
  ({ one, many }) => ({
    document: one(documents, {
      fields: [documentChunks.documentId],
      references: [documents.id],
    }),
    clauseExtractions: many(clauseExtractions),
  })
)

// ============================================================================
// Analysis Relations
// ============================================================================

export const analysesRelations = relations(analyses, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [analyses.tenantId],
    references: [organizations.id],
  }),
  document: one(documents, {
    fields: [analyses.documentId],
    references: [documents.id],
  }),
  clauseExtractions: many(clauseExtractions),
}))

export const clauseExtractionsRelations = relations(
  clauseExtractions,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [clauseExtractions.tenantId],
      references: [organizations.id],
    }),
    analysis: one(analyses, {
      fields: [clauseExtractions.analysisId],
      references: [analyses.id],
    }),
    document: one(documents, {
      fields: [clauseExtractions.documentId],
      references: [documents.id],
    }),
    chunk: one(documentChunks, {
      fields: [clauseExtractions.chunkId],
      references: [documentChunks.id],
    }),
  })
)

// ============================================================================
// Comparison Relations
// ============================================================================

export const comparisonsRelations = relations(comparisons, ({ one }) => ({
  organization: one(organizations, {
    fields: [comparisons.tenantId],
    references: [organizations.id],
  }),
  documentA: one(documents, {
    fields: [comparisons.documentAId],
    references: [documents.id],
    relationName: "documentA",
  }),
  documentB: one(documents, {
    fields: [comparisons.documentBId],
    references: [documents.id],
    relationName: "documentB",
  }),
}))

// ============================================================================
// Generated NDA Relations
// ============================================================================

export const generatedNdasRelations = relations(generatedNdas, ({ one }) => ({
  organization: one(organizations, {
    fields: [generatedNdas.tenantId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [generatedNdas.createdBy],
    references: [users.id],
  }),
}))

// ============================================================================
// Audit Log Relations
// ============================================================================

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.tenantId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}))

// ============================================================================
// Shared Reference Relations
// ============================================================================

export const referenceDocumentsRelations = relations(
  referenceDocuments,
  ({ many }) => ({
    embeddings: many(referenceEmbeddings),
  })
)

export const referenceEmbeddingsRelations = relations(
  referenceEmbeddings,
  ({ one, many }) => ({
    document: one(referenceDocuments, {
      fields: [referenceEmbeddings.documentId],
      references: [referenceDocuments.id],
    }),
    parent: one(referenceEmbeddings, {
      fields: [referenceEmbeddings.parentId],
      references: [referenceEmbeddings.id],
      relationName: "parentChild",
    }),
    children: many(referenceEmbeddings, { relationName: "parentChild" }),
  })
)
