/**
 * Data Access Layer type definitions.
 *
 * Defines context types returned by DAL functions with proper
 * type narrowing for roles and tenant isolation.
 */

import type { TenantId, UserId } from "./branded"
import type { db } from "@/db"

/**
 * Organization roles as a const tuple for type inference.
 */
export const ROLES = ["owner", "admin", "member", "viewer"] as const

/**
 * Role type derived from ROLES tuple.
 */
export type Role = (typeof ROLES)[number]

/**
 * Session user shape from Auth.js.
 * Matches the augmented Session type in auth.ts.
 */
export interface SessionUser {
  id: string
  email: string // Required after session verification (matches auth.ts)
  name?: string | null
  image?: string | null
}

/**
 * Authenticated session context.
 * Returned by verifySession() - proves user is logged in.
 */
export interface SessionContext {
  userId: UserId
  user: SessionUser
  activeOrganizationId: TenantId | null
}

/**
 * Tenant-scoped context with RLS guaranteed set.
 * Returned by withTenant() - proves tenant context exists.
 */
export interface TenantContext extends SessionContext {
  activeOrganizationId: TenantId // Narrowed to non-null
  tenantId: TenantId // Alias for clarity
  role: Role
  db: typeof db
}

/**
 * Role-restricted context - generic over allowed roles.
 * Returned by requireRole() - proves user has specific role.
 */
export interface RoleContext<R extends Role> extends TenantContext {
  role: R // Narrowed to specific roles
}

/**
 * Check if a role is in the allowed list.
 */
export function isAllowedRole<R extends Role>(
  role: Role,
  allowedRoles: readonly R[]
): role is R {
  return allowedRoles.includes(role as R)
}
