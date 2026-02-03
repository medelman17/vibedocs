/**
 * Server Component that runs AFTER OAuth completes
 *
 * This page:
 * 1. Gets the session (we have cookie access here in SSR)
 * 2. Generates a one-time code
 * 3. Redirects to callback with the code in URL
 *
 * This bypasses the cookie restrictions in the Office dialog.
 */

import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { cookies } from "next/headers"
import { storeAuthCode } from "@/lib/auth-code-cache"

export default async function WordAddInAuthCompletePage() {
  // Get the session - we're in a server component so cookies work
  const session = await auth()

  if (!session?.user) {
    // Not authenticated - redirect to callback with error
    redirect("/word-addin/auth/callback?error=not_authenticated")
  }

  // Get the session token from cookies
  const cookieStore = await cookies()
  const sessionToken =
    cookieStore.get("authjs.session-token")?.value ||
    cookieStore.get("__Secure-authjs.session-token")?.value

  if (!sessionToken) {
    redirect("/word-addin/auth/callback?error=no_session_token")
  }

  // Generate one-time code and store session data
  const code = await storeAuthCode({
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    sessionToken,
  })

  console.log(`[AuthComplete] Generated code for user: ${session.user.email}`)

  // Redirect to callback with the code
  redirect(`/word-addin/auth/callback?code=${code}`)
}
