/**
 * Route handler factory with middleware composition.
 */

import { NextRequest, NextResponse } from "next/server"
import { type Middleware, type BaseContext } from "./middleware"
import { success, error, type ApiResponse } from "@/lib/api-utils"
import { toAppError } from "@/lib/errors"

/**
 * Create a route handler with middleware chain.
 *
 * @example
 * ```typescript
 * export const GET = createHandler(
 *   pipe(withAuth, withTenantCtx),
 *   async (ctx) => {
 *     const docs = await getDocuments(ctx.tenantId)
 *     return docs
 *   }
 * )
 * ```
 */
export function createHandler<Ctx, T>(
  middleware: Middleware<BaseContext, Ctx>,
  handler: (ctx: Ctx) => Promise<T>
): (request: NextRequest) => Promise<NextResponse<ApiResponse<T>>> {
  return async (request) => {
    try {
      const ctx = await middleware({ request })

      // Middleware returned early response
      if (ctx instanceof NextResponse) {
        return ctx as NextResponse<ApiResponse<T>>
      }

      const data = await handler(ctx)
      return success(data)
    } catch (err) {
      const appError = toAppError(err)

      // Log server errors
      if (appError.statusCode >= 500) {
        console.error("[API Error]", {
          code: appError.code,
          message: appError.message,
          url: request.url,
          method: request.method,
        })
      }

      return error(appError)
    }
  }
}
