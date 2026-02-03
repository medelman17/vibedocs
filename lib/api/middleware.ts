/**
 * Composable API middleware with type inference.
 *
 * Middleware transforms context types, enabling compile-time
 * verification of auth, tenant, role, and validation requirements.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import {
  withTenant as dalWithTenant,
  requireRole as dalRequireRole,
} from "@/lib/dal"
import {
  asUserId,
  type UserId,
  type Role,
  type TenantContext,
  type RoleContext,
} from "@/lib/types"
import { error } from "@/lib/api-utils"
import { UnauthorizedError, ValidationError } from "@/lib/errors"

/**
 * Base context with just the request.
 */
export type BaseContext = {
  request: NextRequest
}

/**
 * Context after authentication.
 */
export type AuthContext = BaseContext & {
  userId: UserId
}

/**
 * Context with tenant scope.
 */
export type TenantCtx = AuthContext & TenantContext

/**
 * Context with specific roles.
 */
export type RoleCtx<R extends Role> = AuthContext & RoleContext<R>

/**
 * Middleware function signature.
 * Returns either an extended context or a Response (to short-circuit).
 */
export type Middleware<In, Out> = (ctx: In) => Promise<Out | NextResponse>

/**
 * Compose two middlewares.
 */
export function compose<A, B, C>(
  m1: Middleware<A, B>,
  m2: Middleware<B, C>
): Middleware<A, C> {
  return async (ctx: A) => {
    const result1 = await m1(ctx)
    if (result1 instanceof NextResponse) return result1
    return m2(result1)
  }
}

/**
 * Pipe multiple middlewares left-to-right.
 */
export function pipe<A, B>(m1: Middleware<A, B>): Middleware<A, B>
export function pipe<A, B, C>(
  m1: Middleware<A, B>,
  m2: Middleware<B, C>
): Middleware<A, C>
export function pipe<A, B, C, D>(
  m1: Middleware<A, B>,
  m2: Middleware<B, C>,
  m3: Middleware<C, D>
): Middleware<A, D>
export function pipe<A, B, C, D, E>(
  m1: Middleware<A, B>,
  m2: Middleware<B, C>,
  m3: Middleware<C, D>,
  m4: Middleware<D, E>
): Middleware<A, E>
export function pipe(
  ...middlewares: Middleware<unknown, unknown>[]
): Middleware<unknown, unknown> {
  return async (ctx) => {
    let current = ctx
    for (const mw of middlewares) {
      const result = await mw(current)
      if (result instanceof NextResponse) return result
      current = result
    }
    return current
  }
}

/**
 * Require authentication.
 */
export const withAuth: Middleware<BaseContext, AuthContext> = async (ctx) => {
  const session = await auth()

  if (!session?.user?.id) {
    return error(new UnauthorizedError())
  }

  return {
    ...ctx,
    userId: asUserId(session.user.id),
  }
}

/**
 * Require tenant context.
 */
export const withTenantCtx: Middleware<AuthContext, TenantCtx> = async (
  ctx
) => {
  try {
    const tenantCtx = await dalWithTenant()
    return { ...ctx, ...tenantCtx }
  } catch {
    // dalWithTenant redirects on failure, but in API routes we return error
    return error(new UnauthorizedError("No active organization"))
  }
}

/**
 * Require specific roles.
 */
export function withRoles<R extends Role>(
  roles: readonly R[]
): Middleware<AuthContext, RoleCtx<R>> {
  return async (ctx) => {
    try {
      const roleCtx = await dalRequireRole(roles)
      return { ...ctx, ...roleCtx }
    } catch {
      return error(new UnauthorizedError("Insufficient permissions"))
    }
  }
}

/**
 * Validate request body with Zod schema.
 */
export function withBody<T>(
  schema: z.ZodSchema<T>
): Middleware<BaseContext, BaseContext & { body: T }> {
  return async (ctx) => {
    let json: unknown
    try {
      json = await ctx.request.json()
    } catch {
      json = {}
    }

    const result = schema.safeParse(json)

    if (!result.success) {
      return error(
        new ValidationError(
          "Invalid request body",
          result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          }))
        )
      )
    }

    return { ...ctx, body: result.data }
  }
}

/**
 * Validate query parameters with Zod schema.
 */
export function withQuery<T>(
  schema: z.ZodSchema<T>
): Middleware<BaseContext, BaseContext & { query: T }> {
  return async (ctx) => {
    const params = Object.fromEntries(ctx.request.nextUrl.searchParams)
    const result = schema.safeParse(params)

    if (!result.success) {
      return error(
        new ValidationError(
          "Invalid query parameters",
          result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          }))
        )
      )
    }

    return { ...ctx, query: result.data }
  }
}
