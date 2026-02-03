/**
 * Branded types for nominal typing of IDs.
 *
 * Prevents accidentally mixing TenantId, UserId, DocumentId at compile time.
 * Zero runtime cost - brands are erased during compilation.
 *
 * @example
 * ```typescript
 * const tenantId = asTenantId("org-123")
 * const userId = asUserId("user-456")
 *
 * // Compile error: UserId not assignable to TenantId
 * eq(documents.tenantId, userId)
 * ```
 */

declare const __brand: unique symbol

/**
 * Brand a base type with a unique tag for nominal typing.
 */
type Brand<T, B> = T & { readonly [__brand]: B }

/**
 * UUID that represents a tenant (organization).
 * Cannot be confused with UserId or DocumentId at compile time.
 */
export type TenantId = Brand<string, "TenantId">

/**
 * UUID that represents a user.
 * Cannot be confused with TenantId or DocumentId at compile time.
 */
export type UserId = Brand<string, "UserId">

/**
 * UUID that represents a document.
 * Cannot be confused with TenantId or UserId at compile time.
 */
export type DocumentId = Brand<string, "DocumentId">

/**
 * UUID that represents an analysis.
 */
export type AnalysisId = Brand<string, "AnalysisId">

/**
 * UUID that represents an organization.
 * Alias for TenantId for semantic clarity.
 */
export type OrganizationId = TenantId

/**
 * Create a TenantId from a string.
 */
export function asTenantId(id: string): TenantId {
  return id as TenantId
}

/**
 * Create a UserId from a string.
 */
export function asUserId(id: string): UserId {
  return id as UserId
}

/**
 * Create a DocumentId from a string.
 */
export function asDocumentId(id: string): DocumentId {
  return id as DocumentId
}

/**
 * Create an AnalysisId from a string.
 */
export function asAnalysisId(id: string): AnalysisId {
  return id as AnalysisId
}
