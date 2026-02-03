/**
 * Database Query Functions - Barrel Export
 *
 * This module consolidates all pre-built query functions for the VibeDocs
 * application. Query functions provide a clean abstraction over raw Drizzle
 * queries with built-in tenant isolation and common patterns.
 *
 * @remarks
 * **Tenant Isolation Requirement**: All query functions in this module enforce
 * tenant isolation by requiring a `tenantId` parameter. This ensures data
 * separation between organizations in the multi-tenant architecture. Never
 * bypass tenant checks - use the DAL's `withTenant()` to obtain the current
 * tenant context before calling these functions.
 *
 * ## Query Modules
 *
 * - **similarity** - Vector similarity search using pgvector/cosineDistance
 *   - `findSimilarChunks()` - Search within tenant documents
 *   - `findSimilarReferences()` - Search shared reference corpus (CUAD, templates)
 *   - `findMatchingCategories()` - Match clauses to CUAD categories
 *   - `findSimilarTemplates()` - Find relevant NDA templates
 *
 * - **documents** - Document CRUD operations
 *   - `getDocumentsByTenant()` - List documents with filtering/pagination
 *   - `getDocumentById()` - Fetch single document
 *   - `getDocumentWithChunks()` - Document with all parsed chunks
 *   - `updateDocumentStatus()` - Update processing status
 *   - `softDeleteDocument()` - Soft delete (sets deletedAt)
 *   - `createDocumentChunks()` - Batch insert parsed chunks
 *   - `updateChunkEmbedding()` - Set embedding after async generation
 *
 * - **analyses** - Analysis and clause extraction operations
 *   - `getAnalysisByDocument()` - Get latest analysis for a document
 *   - `getAnalysisById()` - Fetch single analysis
 *   - `getAnalysisWithClauses()` - Analysis with all extracted clauses
 *   - `createAnalysis()` - Create new analysis record
 *   - `updateAnalysisStatus()` - Update status and results
 *   - `createClauseExtractions()` - Batch insert extracted clauses
 *   - `getClausesByCategory()` - Filter clauses by CUAD category
 *   - `getHighRiskClauses()` - Get aggressive-risk clauses
 *
 * @example Importing specific functions
 * ```typescript
 * // Import individual functions directly from the queries module
 * import { findSimilarChunks, getDocumentById } from "@/db/queries"
 *
 * // Use with tenant context from DAL
 * const { tenantId } = await withTenant()
 * const similar = await findSimilarChunks(embedding, tenantId, { limit: 5 })
 * const doc = await getDocumentById(documentId, tenantId)
 * ```
 *
 * @example Importing via namespace
 * ```typescript
 * // Import as namespace from main db module
 * import { queries } from "@/db"
 *
 * // Access functions via namespace
 * const { tenantId } = await withTenant()
 * const docs = await queries.getDocumentsByTenant(tenantId, { status: "complete" })
 * const analysis = await queries.getAnalysisWithClauses(analysisId, tenantId)
 * const matches = await queries.findMatchingCategories(clauseEmbedding)
 * ```
 *
 * @example Full workflow example
 * ```typescript
 * import { queries } from "@/db"
 * import { withTenant } from "@/lib/dal"
 *
 * async function analyzeDocument(documentId: string) {
 *   const { tenantId } = await withTenant()
 *
 *   // Get document with chunks
 *   const doc = await queries.getDocumentWithChunks(documentId, tenantId)
 *   if (!doc) throw new Error("Document not found")
 *
 *   // Create analysis record
 *   const analysis = await queries.createAnalysis(tenantId, documentId)
 *
 *   // Find similar CUAD categories for each chunk
 *   for (const chunk of doc.chunks) {
 *     if (chunk.embedding) {
 *       const categories = await queries.findMatchingCategories(chunk.embedding)
 *       // Process matched categories...
 *     }
 *   }
 *
 *   return analysis
 * }
 * ```
 *
 * @module db/queries
 */

export * from "./similarity"
export * from "./documents"
export * from "./analyses"
