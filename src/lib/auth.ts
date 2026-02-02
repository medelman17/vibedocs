// src/lib/auth.ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  organizations,
  organizationMembers,
} from "@/db/schema"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { checkLoginRateLimit, recordLoginAttempt } from "./rate-limit"
import { logSecurityEvent } from "./audit"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = credentials.email as string
        const ip = request?.headers?.get?.("x-forwarded-for") ?? undefined

        // Check rate limit before attempting auth
        const rateLimit = await checkLoginRateLimit(email)
        if (!rateLimit.allowed) {
          await logSecurityEvent({
            action: "LOGIN_BLOCKED",
            metadata: { email, reason: "rate_limit", retryAfter: rateLimit.retryAfter },
            ipAddress: ip,
          })
          throw new Error(
            `Too many login attempts. Try again in ${rateLimit.retryAfter} seconds.`
          )
        }

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        })

        if (!user?.passwordHash) {
          // Record failed attempt even for non-existent users (timing attack prevention)
          await recordLoginAttempt(email, false)
          return null
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!isValid) {
          await recordLoginAttempt(email, false)
          await logSecurityEvent({
            action: "LOGIN_FAILED",
            metadata: { email, reason: "invalid_password" },
            ipAddress: ip,
          })
          return null
        }

        // Record successful login
        await recordLoginAttempt(email, true, ip)
        await logSecurityEvent({
          action: "LOGIN_SUCCESS",
          userId: user.id,
          metadata: { email },
          ipAddress: ip,
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id

        // Get active organization from session
        const dbSession = await db.query.sessions.findFirst({
          where: eq(sessions.userId, user.id),
        })

        if (dbSession?.activeOrganizationId) {
          session.activeOrganizationId = dbSession.activeOrganizationId
        } else {
          // Get first organization user belongs to
          const membership = await db.query.organizationMembers.findFirst({
            where: eq(organizationMembers.userId, user.id),
          })
          if (membership) {
            session.activeOrganizationId = membership.organizationId
          }
        }
      }
      return session
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id || !user.email) return

      // Create default organization for new user
      const slug = user.name
        ? user.name.toLowerCase().replace(/\s+/g, "-")
        : user.email.split("@")[0]

      const [org] = await db
        .insert(organizations)
        .values({
          name: user.name ? `${user.name}'s Workspace` : "My Workspace",
          slug: `${slug}-${Date.now()}`,
        })
        .returning()

      // Add user as owner
      await db.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: "owner",
        acceptedAt: new Date(),
      })
    },
  },
})

// Type augmentation for session
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
    }
    activeOrganizationId?: string
  }
}
