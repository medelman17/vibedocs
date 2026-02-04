// src/proxy.ts
import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const protectedRoutes = ["/chat", "/dashboard", "/documents", "/analysis", "/settings"]
const authRoutes = ["/login", "/signup", "/forgot-password", "/reset-password"]

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname

  const isProtectedRoute = protectedRoutes.some((route) =>
    path.startsWith(route)
  )
  const isAuthRoute = authRoutes.includes(path)

  // Check for session cookie (optimistic check, no DB call)
  const cookieStore = await cookies()
  const sessionToken =
    cookieStore.get("authjs.session-token")?.value ||
    cookieStore.get("__Secure-authjs.session-token")?.value

  // Redirect unauthenticated users from protected routes to login
  if (isProtectedRoute && !sessionToken) {
    const loginUrl = new URL("/login", req.nextUrl)
    loginUrl.searchParams.set("callbackUrl", path)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users from auth routes to chat
  if (isAuthRoute && sessionToken) {
    return NextResponse.redirect(new URL("/chat", req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (Auth.js routes)
     * - api/inngest (Inngest webhook)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, icon, apple-icon (metadata images)
     * - public folder assets (files with extensions)
     */
    "/((?!api/auth|api/inngest|_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\..*$).*)",
  ],
}
