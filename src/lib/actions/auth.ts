"use server"

import { db } from "@/db/client"
import { users, organizations, organizationMembers } from "@/db/schema"
import { eq } from "drizzle-orm"
import { hashPassword, validatePassword } from "@/lib/password"
import { logSecurityEvent } from "@/lib/audit"
import { z } from "zod"

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  name: z.string().min(1, "Name is required").optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>

export type RegisterResult = {
  success: boolean
  user?: { id: string; email: string }
  error?: string
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  // Validate input schema
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) {
    const issues = parsed.error.issues
    return {
      success: false,
      error: issues[0]?.message ?? "Invalid input",
    }
  }

  const { email, password, name } = parsed.data

  // Validate password strength
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: passwordValidation.errors.join(". "),
    }
  }

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  if (existingUser) {
    return {
      success: false,
      error: "An account with this email is already registered",
    }
  }

  // Hash password
  const passwordHash = await hashPassword(password)

  // Create user
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name: name ?? null,
    })
    .returning({ id: users.id, email: users.email })

  // Create default organization
  const slug = name
    ? name.toLowerCase().replace(/\s+/g, "-")
    : email.split("@")[0]

  const [org] = await db
    .insert(organizations)
    .values({
      name: name ? `${name}'s Workspace` : "My Workspace",
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

  // Log registration event
  await logSecurityEvent({
    action: "REGISTRATION",
    userId: user.id,
    tenantId: org.id,
    metadata: { email },
  })

  return {
    success: true,
    user: { id: user.id, email: user.email },
  }
}
