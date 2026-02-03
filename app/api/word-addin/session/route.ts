/**
 * @fileoverview API endpoint to retrieve session token for Word Add-in
 *
 * This endpoint returns the current session token from the cookie,
 * allowing the auth callback page to send it back to the task pane.
 * The token can then be used for Bearer authentication in subsequent API calls.
 */

import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { withErrorHandling, success } from "@/lib/api-utils"
import { UnauthorizedError } from "@/lib/errors"

export const GET = withErrorHandling(async () => {
  // Get the current session to verify user is authenticated
  const session = await auth()

  if (!session?.user) {
    throw new UnauthorizedError("Not authenticated")
  }

  // Get the session token from cookies
  // Auth.js uses different cookie names based on environment
  const cookieStore = await cookies()
  const sessionToken =
    cookieStore.get("authjs.session-token")?.value ||
    cookieStore.get("__Secure-authjs.session-token")?.value

  if (!sessionToken) {
    throw new UnauthorizedError("Session token not found")
  }

  return success({
    token: sessionToken,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
  })
})
