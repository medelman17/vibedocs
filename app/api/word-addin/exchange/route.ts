/**
 * @fileoverview Exchange one-time auth code for session token
 *
 * This endpoint allows the Word Add-in taskpane to exchange a one-time
 * code for session data, bypassing the cookie restrictions in cross-site iframes.
 *
 * The code is generated after OAuth completes and can only be used once.
 */

import { exchangeAuthCode } from "@/lib/auth-code-cache"
import { withErrorHandling, success } from "@/lib/api-utils"
import { ValidationError, UnauthorizedError } from "@/lib/errors"

export const POST = withErrorHandling(async (request: Request) => {
  const body = await request.json()
  const { code } = body

  if (!code || typeof code !== "string") {
    throw new ValidationError("Missing or invalid 'code' parameter")
  }

  const authData = await exchangeAuthCode(code)

  if (!authData) {
    throw new UnauthorizedError("Invalid or expired code")
  }

  return success({
    token: authData.sessionToken,
    user: {
      id: authData.userId,
      email: authData.email,
      name: authData.name,
    },
  })
})
