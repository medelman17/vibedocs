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
