# Auth Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all security gaps identified in the auth audit to make the authentication system production-ready.

**Architecture:** Enhance the existing Auth.js v5 + Drizzle setup with: (1) stronger password policy with validation enforcement, (2) rate limiting via Vercel KV, (3) user registration flow with server actions, (4) GitHub OAuth provider, (5) password reset flow with secure tokens, (6) security event audit logging.

**Tech Stack:** Auth.js v5, Drizzle ORM, bcryptjs, Vercel KV (rate limiting), Resend (email), Zod (validation), Vitest (testing)

**Priority Order:** Security-critical items first (rate limiting, password validation), then missing features (registration, GitHub OAuth, password reset).

---

## Phase 1: Security Hardening (Critical)

### Task 1: Strengthen Password Validation

**Files:**
- Modify: `src/lib/password.ts`
- Modify: `src/lib/password.test.ts`

**Step 1: Write failing test for special character requirement**

Add to `src/lib/password.test.ts`:

```typescript
it("requires special character", () => {
  const result = validatePassword("SecurePass123")
  expect(result.valid).toBe(false)
  expect(result.errors).toContain(
    "Password must contain at least one special character"
  )
})

it("accepts password with special character", () => {
  const result = validatePassword("SecurePass123!")
  expect(result.valid).toBe(true)
  expect(result.errors).toHaveLength(0)
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/password.test.ts`
Expected: FAIL - "SecurePass123" currently passes validation

**Step 3: Add special character requirement**

Modify `src/lib/password.ts` - add after the number check:

```typescript
if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
  errors.push("Password must contain at least one special character")
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/password.test.ts`
Expected: PASS

**Step 5: Update existing test that now fails**

Update the "accepts valid password" test:

```typescript
it("accepts valid password", () => {
  const result = validatePassword("SecurePass123!")
  expect(result.valid).toBe(true)
  expect(result.errors).toHaveLength(0)
})
```

**Step 6: Run all password tests**

Run: `pnpm test src/lib/password.test.ts`
Expected: All PASS

**Step 7: Commit**

```bash
git add src/lib/password.ts src/lib/password.test.ts
git commit -m "feat(auth): add special character requirement to password validation"
```

---

### Task 2: Add Failed Login Tracking Schema

**Files:**
- Modify: `src/db/schema/auth.ts`
- Modify: `src/test/setup.ts`

**Step 1: Add login attempt columns to users schema**

Modify `src/db/schema/auth.ts` - add to users table definition:

```typescript
export const users = pgTable("users", {
  ...primaryId,
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  passwordHash: text("password_hash"),
  // Login security fields
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastLoginIp: text("last_login_ip"),
  ...timestamps,
})
```

**Step 2: Update test schema**

Modify `src/test/setup.ts` - update users table:

```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  email_verified TIMESTAMPTZ,
  image TEXT,
  password_hash TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

**Step 3: Generate migration**

Run: `pnpm db:generate`
Expected: Migration file created in `src/db/migrations/`

**Step 4: Push schema changes**

Run: `pnpm db:push`
Expected: Schema updated successfully

**Step 5: Run existing tests**

Run: `pnpm test`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/db/schema/auth.ts src/test/setup.ts src/db/migrations/
git commit -m "feat(auth): add login tracking columns to users table"
```

---

### Task 3: Create Login Rate Limiting Service

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `src/lib/rate-limit.test.ts`

**Step 1: Write failing test for rate limiting**

Create `src/lib/rate-limit.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest"
import { checkLoginRateLimit, recordLoginAttempt, resetLoginAttempts } from "./rate-limit"

// Mock the db
vi.mock("@/db/client", () => ({
  db: {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
  },
}))

describe("rate limiting", () => {
  describe("checkLoginRateLimit", () => {
    it("allows login when under limit", async () => {
      const { db } = await import("@/db/client")
      vi.mocked(db.query.users.findFirst).mockResolvedValue({
        id: "user-1",
        failedLoginAttempts: 2,
        lockedUntil: null,
      })

      const result = await checkLoginRateLimit("test@example.com")
      expect(result.allowed).toBe(true)
      expect(result.remainingAttempts).toBe(3)
    })

    it("blocks login when limit exceeded", async () => {
      const { db } = await import("@/db/client")
      vi.mocked(db.query.users.findFirst).mockResolvedValue({
        id: "user-1",
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      })

      const result = await checkLoginRateLimit("test@example.com")
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it("allows login after lockout expires", async () => {
      const { db } = await import("@/db/client")
      vi.mocked(db.query.users.findFirst).mockResolvedValue({
        id: "user-1",
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() - 1000), // Expired
      })

      const result = await checkLoginRateLimit("test@example.com")
      expect(result.allowed).toBe(true)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/rate-limit.test.ts`
Expected: FAIL - module not found

**Step 3: Implement rate limiting service**

Create `src/lib/rate-limit.ts`:

```typescript
// src/lib/rate-limit.ts
import { db } from "@/db/client"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"

const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export type RateLimitResult = {
  allowed: boolean
  remainingAttempts?: number
  retryAfter?: number // seconds until retry allowed
}

/**
 * Check if a login attempt is allowed for the given email
 */
export async function checkLoginRateLimit(email: string): Promise<RateLimitResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: {
      id: true,
      failedLoginAttempts: true,
      lockedUntil: true,
    },
  })

  // User doesn't exist - allow attempt (will fail auth anyway)
  if (!user) {
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS }
  }

  // Check if currently locked out
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000)
    return { allowed: false, retryAfter }
  }

  // Check attempt count
  if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
    // Should be locked but lockout expired - reset and allow
    await resetLoginAttempts(email)
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS }
  }

  return {
    allowed: true,
    remainingAttempts: MAX_LOGIN_ATTEMPTS - user.failedLoginAttempts,
  }
}

/**
 * Record a failed login attempt
 */
export async function recordLoginAttempt(
  email: string,
  success: boolean,
  ip?: string
): Promise<void> {
  if (success) {
    // Reset on successful login
    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.email, email))
    return
  }

  // Increment failed attempts
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { failedLoginAttempts: true },
  })

  if (!user) return

  const newAttempts = user.failedLoginAttempts + 1
  const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS

  await db
    .update(users)
    .set({
      failedLoginAttempts: newAttempts,
      lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
      updatedAt: new Date(),
    })
    .where(eq(users.email, email))
}

/**
 * Reset login attempts for a user
 */
export async function resetLoginAttempts(email: string): Promise<void> {
  await db
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.email, email))
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/rate-limit.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts
git commit -m "feat(auth): add login rate limiting service"
```

---

### Task 4: Integrate Rate Limiting into Auth

**Files:**
- Modify: `src/lib/auth.ts`

**Step 1: Import rate limiting functions**

Add to top of `src/lib/auth.ts`:

```typescript
import { checkLoginRateLimit, recordLoginAttempt } from "./rate-limit"
```

**Step 2: Add rate limiting to credentials authorize**

Replace the `authorize` function in `src/lib/auth.ts`:

```typescript
authorize: async (credentials, request) => {
  if (!credentials?.email || !credentials?.password) {
    return null
  }

  const email = credentials.email as string

  // Check rate limit before attempting auth
  const rateLimit = await checkLoginRateLimit(email)
  if (!rateLimit.allowed) {
    throw new Error(`Too many login attempts. Try again in ${rateLimit.retryAfter} seconds.`)
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
    return null
  }

  // Get IP from request if available
  const ip = request?.headers?.get?.("x-forwarded-for") ?? undefined
  await recordLoginAttempt(email, true, ip)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
  }
},
```

**Step 3: Run the app to verify no errors**

Run: `pnpm dev`
Expected: App starts without errors

**Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): integrate rate limiting into credentials login"
```

---

### Task 5: Add Security Audit Logging

**Files:**
- Create: `src/lib/audit.ts`
- Create: `src/lib/audit.test.ts`

**Step 1: Write failing test for audit logging**

Create `src/lib/audit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock db before importing audit module
const mockInsert = vi.fn().mockReturnThis()
const mockValues = vi.fn().mockResolvedValue([])

vi.mock("@/db/client", () => ({
  db: {
    insert: mockInsert,
    values: mockValues,
  },
}))

vi.mock("@/db/schema", () => ({
  auditLogs: { tableName: "audit_logs" },
}))

describe("audit logging", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockReturnValue({ values: mockValues })
  })

  it("logs security events", async () => {
    const { logSecurityEvent } = await import("./audit")

    await logSecurityEvent({
      action: "LOGIN_SUCCESS",
      userId: "user-123",
      tenantId: "org-456",
      metadata: { ip: "127.0.0.1" },
    })

    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_SUCCESS",
        userId: "user-123",
        tenantId: "org-456",
      })
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/audit.test.ts`
Expected: FAIL - module not found

**Step 3: Implement audit logging**

Create `src/lib/audit.ts`:

```typescript
// src/lib/audit.ts
import { db } from "@/db/client"
import { auditLogs } from "@/db/schema"

export type SecurityAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGIN_BLOCKED"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_UNLOCKED"
  | "SESSION_CREATED"
  | "SESSION_EXPIRED"
  | "REGISTRATION"

export interface SecurityEvent {
  action: SecurityAction
  userId?: string
  tenantId?: string
  tableName?: string
  recordId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

/**
 * Log a security-related event to the audit log
 */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      tenantId: event.tenantId ?? "00000000-0000-0000-0000-000000000000", // System tenant for auth events
      tableName: event.tableName ?? "auth",
      recordId: event.recordId ?? event.userId ?? "00000000-0000-0000-0000-000000000000",
      action: event.action,
      userId: event.userId ?? null,
      ipAddress: event.ipAddress ?? null,
      newValues: event.metadata ?? null,
      oldValues: null,
    })
  } catch (error) {
    // Don't let audit logging failures break auth flow
    console.error("Failed to log security event:", error)
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/audit.test.ts`
Expected: PASS

**Step 5: Integrate audit logging into auth**

Modify `src/lib/auth.ts` - add import:

```typescript
import { logSecurityEvent } from "./audit"
```

Update the `authorize` function to log events:

```typescript
// After rate limit check fails:
if (!rateLimit.allowed) {
  await logSecurityEvent({
    action: "LOGIN_BLOCKED",
    metadata: { email, reason: "rate_limit", retryAfter: rateLimit.retryAfter },
    ipAddress: ip,
  })
  throw new Error(`Too many login attempts. Try again in ${rateLimit.retryAfter} seconds.`)
}

// After successful login (before return):
await logSecurityEvent({
  action: "LOGIN_SUCCESS",
  userId: user.id,
  ipAddress: ip,
  metadata: { email },
})

// After failed password check:
await logSecurityEvent({
  action: "LOGIN_FAILED",
  metadata: { email, reason: "invalid_password" },
  ipAddress: ip,
})
```

**Step 6: Run the app to verify**

Run: `pnpm dev`
Expected: App starts, no errors

**Step 7: Commit**

```bash
git add src/lib/audit.ts src/lib/audit.test.ts src/lib/auth.ts
git commit -m "feat(auth): add security event audit logging"
```

---

## Phase 2: User Registration Flow

### Task 6: Create Registration Server Action

**Files:**
- Create: `src/lib/actions/auth.ts`
- Create: `src/lib/actions/auth.test.ts`

**Step 1: Write failing test for registration**

Create `src/lib/actions/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock dependencies
vi.mock("@/db/client")
vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed_password"),
  validatePassword: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}))

describe("auth actions", () => {
  describe("register", () => {
    it("creates user with valid input", async () => {
      const { register } = await import("./auth")

      const result = await register({
        email: "test@example.com",
        password: "SecurePass123!",
        name: "Test User",
      })

      expect(result.success).toBe(true)
      expect(result.user).toBeDefined()
    })

    it("rejects invalid password", async () => {
      const { validatePassword } = await import("@/lib/password")
      vi.mocked(validatePassword).mockReturnValue({
        valid: false,
        errors: ["Password too weak"],
      })

      const { register } = await import("./auth")

      const result = await register({
        email: "test@example.com",
        password: "weak",
        name: "Test User",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Password too weak")
    })

    it("rejects duplicate email", async () => {
      const { register } = await import("./auth")

      // First registration
      await register({
        email: "dupe@example.com",
        password: "SecurePass123!",
        name: "User 1",
      })

      // Second registration with same email
      const result = await register({
        email: "dupe@example.com",
        password: "SecurePass123!",
        name: "User 2",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("already registered")
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/actions/auth.test.ts`
Expected: FAIL - module not found

**Step 3: Implement registration action**

Create `src/lib/actions/auth.ts`:

```typescript
// src/lib/actions/auth.ts
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
    return {
      success: false,
      error: parsed.error.errors[0].message,
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
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/actions/auth.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/actions/auth.ts src/lib/actions/auth.test.ts
git commit -m "feat(auth): add user registration server action"
```

---

### Task 7: Create Registration Page UI

**Files:**
- Create: `app/(auth)/signup/page.tsx`
- Create: `app/(auth)/layout.tsx`

**Step 1: Create auth layout**

Create `app/(auth)/layout.tsx`:

```typescript
// app/(auth)/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  )
}
```

**Step 2: Create signup page**

Create `app/(auth)/signup/page.tsx`:

```typescript
// app/(auth)/signup/page.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { register } from "@/lib/actions/auth"

export default function SignupPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await register({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      name: formData.get("name") as string || undefined,
    })

    setLoading(false)

    if (!result.success) {
      setError(result.error ?? "Registration failed")
      return
    }

    // Redirect to login after successful registration
    router.push("/login?registered=true")
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
        <CardDescription>
          Enter your details to create your NDA Analyst account
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="John Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="john@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
            />
            <p className="text-xs text-muted-foreground">
              Must be at least 8 characters with uppercase, lowercase, number, and special character.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
```

**Step 3: Verify page renders**

Run: `pnpm dev`
Navigate to: `http://localhost:3000/signup`
Expected: Registration form displays

**Step 4: Commit**

```bash
git add app/\(auth\)/signup/page.tsx app/\(auth\)/layout.tsx
git commit -m "feat(auth): add user registration page"
```

---

### Task 8: Create Login Page UI

**Files:**
- Create: `app/(auth)/login/page.tsx`

**Step 1: Create login page**

Create `app/(auth)/login/page.tsx`:

```typescript
// app/(auth)/login/page.tsx
"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard"
  const registered = searchParams.get("registered") === "true"

  async function handleCredentialsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError(result.error)
      return
    }

    router.push(callbackUrl)
  }

  async function handleGoogleSignIn() {
    setLoading(true)
    await signIn("google", { callbackUrl })
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
        <CardDescription>
          Sign in to your NDA Analyst account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {registered && (
          <Alert>
            <AlertDescription>
              Account created successfully! Please sign in.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>

        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="john@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-center text-muted-foreground w-full">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
```

**Step 2: Verify page renders**

Run: `pnpm dev`
Navigate to: `http://localhost:3000/login`
Expected: Login form displays with Google button and credentials form

**Step 3: Commit**

```bash
git add app/\(auth\)/login/page.tsx
git commit -m "feat(auth): add login page with Google OAuth and credentials"
```

---

## Phase 3: Additional OAuth Provider

### Task 9: Add GitHub OAuth Provider

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `.env.example`

**Step 1: Add GitHub provider import and configuration**

Modify `src/lib/auth.ts` - add import:

```typescript
import GitHub from "next-auth/providers/github"
```

Add to providers array:

```typescript
providers: [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID!,
    clientSecret: process.env.AUTH_GOOGLE_SECRET!,
  }),
  GitHub({
    clientId: process.env.AUTH_GITHUB_ID!,
    clientSecret: process.env.AUTH_GITHUB_SECRET!,
  }),
  Credentials({
    // ... existing config
  }),
],
```

**Step 2: Update .env.example**

Add to `.env.example`:

```env
# GitHub OAuth
AUTH_GITHUB_ID="your-github-client-id"
AUTH_GITHUB_SECRET="your-github-client-secret"
```

**Step 3: Add GitHub button to login page**

Modify `app/(auth)/login/page.tsx` - add after Google button:

```typescript
<Button
  variant="outline"
  className="w-full"
  onClick={() => signIn("github", { callbackUrl })}
  disabled={loading}
>
  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
    <path
      d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
      fill="currentColor"
    />
  </svg>
  Continue with GitHub
</Button>
```

**Step 4: Verify app runs**

Run: `pnpm dev`
Expected: App starts, GitHub button visible on login page

**Step 5: Commit**

```bash
git add src/lib/auth.ts .env.example app/\(auth\)/login/page.tsx
git commit -m "feat(auth): add GitHub OAuth provider"
```

---

## Phase 4: Password Reset Flow

### Task 10: Create Password Reset Token Schema

**Files:**
- Create: `src/db/schema/password-reset.ts`
- Modify: `src/db/schema/index.ts`
- Modify: `src/test/setup.ts`

**Step 1: Create password reset tokens table**

Create `src/db/schema/password-reset.ts`:

```typescript
// src/db/schema/password-reset.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { users } from "./auth"

/**
 * Password reset tokens for secure password recovery
 * Tokens expire after 1 hour and are single-use
 */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
```

**Step 2: Export from schema index**

Modify `src/db/schema/index.ts` - add:

```typescript
export * from "./password-reset"
```

**Step 3: Update test setup**

Add to `src/test/setup.ts` after verification_tokens:

```sql
await testDb.execute(sql`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`)
```

**Step 4: Generate and push migration**

Run: `pnpm db:generate && pnpm db:push`
Expected: Migration created and applied

**Step 5: Commit**

```bash
git add src/db/schema/password-reset.ts src/db/schema/index.ts src/test/setup.ts src/db/migrations/
git commit -m "feat(auth): add password reset tokens schema"
```

---

### Task 11: Create Password Reset Service

**Files:**
- Create: `src/lib/password-reset.ts`
- Create: `src/lib/password-reset.test.ts`

**Step 1: Write failing test**

Create `src/lib/password-reset.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { randomBytes } from "crypto"

vi.mock("crypto", () => ({
  randomBytes: vi.fn(() => Buffer.from("mock-token-bytes")),
}))

describe("password reset", () => {
  describe("generateResetToken", () => {
    it("creates a token for valid email", async () => {
      const { generateResetToken } = await import("./password-reset")

      const result = await generateResetToken("test@example.com")

      expect(result.success).toBe(true)
      expect(result.token).toBeDefined()
    })

    it("fails silently for non-existent email", async () => {
      const { generateResetToken } = await import("./password-reset")

      const result = await generateResetToken("nonexistent@example.com")

      // Returns success but no actual token created (security)
      expect(result.success).toBe(true)
    })
  })

  describe("validateResetToken", () => {
    it("rejects expired token", async () => {
      const { validateResetToken } = await import("./password-reset")

      const result = await validateResetToken("expired-token")

      expect(result.valid).toBe(false)
      expect(result.error).toContain("expired")
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/password-reset.test.ts`
Expected: FAIL - module not found

**Step 3: Implement password reset service**

Create `src/lib/password-reset.ts`:

```typescript
// src/lib/password-reset.ts
import { randomBytes } from "crypto"
import { db } from "@/db/client"
import { users, passwordResetTokens } from "@/db/schema"
import { eq, and, gt, isNull } from "drizzle-orm"
import { hashPassword } from "./password"
import { logSecurityEvent } from "./audit"

const TOKEN_EXPIRY_HOURS = 1

/**
 * Generate a password reset token for the given email
 * Returns success even for non-existent emails (security)
 */
export async function generateResetToken(
  email: string
): Promise<{ success: boolean; token?: string }> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  })

  // Return success even if user doesn't exist (prevents email enumeration)
  if (!user) {
    return { success: true }
  }

  // Generate secure random token
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

  // Invalidate any existing tokens for this user
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, user.id))

  // Create new token
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    token,
    expiresAt,
  })

  await logSecurityEvent({
    action: "PASSWORD_RESET_REQUESTED",
    userId: user.id,
    metadata: { email },
  })

  return { success: true, token }
}

/**
 * Validate a password reset token
 */
export async function validateResetToken(
  token: string
): Promise<{ valid: boolean; userId?: string; error?: string }> {
  const resetToken = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.token, token),
      isNull(passwordResetTokens.usedAt)
    ),
  })

  if (!resetToken) {
    return { valid: false, error: "Invalid or expired token" }
  }

  if (resetToken.expiresAt < new Date()) {
    return { valid: false, error: "Token has expired" }
  }

  return { valid: true, userId: resetToken.userId }
}

/**
 * Reset password using a valid token
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const validation = await validateResetToken(token)

  if (!validation.valid || !validation.userId) {
    return { success: false, error: validation.error }
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword)

  // Update user password
  await db
    .update(users)
    .set({
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, validation.userId))

  // Mark token as used
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.token, token))

  await logSecurityEvent({
    action: "PASSWORD_RESET_COMPLETED",
    userId: validation.userId,
  })

  return { success: true }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/password-reset.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/password-reset.ts src/lib/password-reset.test.ts
git commit -m "feat(auth): add password reset token service"
```

---

### Task 12: Create Password Reset Pages

**Files:**
- Create: `app/(auth)/forgot-password/page.tsx`
- Create: `app/(auth)/reset-password/page.tsx`
- Create: `src/lib/actions/password-reset.ts`

**Step 1: Create server actions for password reset**

Create `src/lib/actions/password-reset.ts`:

```typescript
// src/lib/actions/password-reset.ts
"use server"

import { generateResetToken, resetPassword } from "@/lib/password-reset"
import { validatePassword } from "@/lib/password"

export async function requestPasswordReset(email: string): Promise<{
  success: boolean
  error?: string
}> {
  if (!email || !email.includes("@")) {
    return { success: false, error: "Invalid email address" }
  }

  const result = await generateResetToken(email)

  // In production, send email here with the token
  // For now, just log it (remove in production!)
  if (result.token) {
    console.log(`[DEV] Password reset token for ${email}: ${result.token}`)
  }

  // Always return success to prevent email enumeration
  return { success: true }
}

export async function completePasswordReset(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  // Validate password strength
  const validation = validatePassword(newPassword)
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(". ") }
  }

  return resetPassword(token, newPassword)
}
```

**Step 2: Create forgot password page**

Create `app/(auth)/forgot-password/page.tsx`:

```typescript
// app/(auth)/forgot-password/page.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { requestPasswordReset } from "@/lib/actions/password-reset"

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    await requestPasswordReset(formData.get("email") as string)

    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If an account exists with that email, we&apos;ve sent password reset instructions.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/login" className="text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you reset instructions.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="john@example.com"
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send reset instructions"}
          </Button>
          <Link href="/login" className="text-sm text-muted-foreground hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}
```

**Step 3: Create reset password page**

Create `app/(auth)/reset-password/page.tsx`:

```typescript
// app/(auth)/reset-password/page.tsx
"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { completePasswordReset } from "@/lib/actions/password-reset"

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid link</CardTitle>
          <CardDescription>
            This password reset link is invalid or has expired.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            Request a new link
          </Link>
        </CardFooter>
      </Card>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const password = formData.get("password") as string
    const confirmPassword = formData.get("confirmPassword") as string

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setLoading(false)
      return
    }

    const result = await completePasswordReset(token, password)
    setLoading(false)

    if (!result.success) {
      setError(result.error ?? "Failed to reset password")
      return
    }

    router.push("/login?reset=true")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your new password below.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
            />
            <p className="text-xs text-muted-foreground">
              Must be at least 8 characters with uppercase, lowercase, number, and special character.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Resetting..." : "Reset password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
```

**Step 4: Verify pages render**

Run: `pnpm dev`
Navigate to: `http://localhost:3000/forgot-password` and `http://localhost:3000/reset-password?token=test`
Expected: Both pages render correctly

**Step 5: Commit**

```bash
git add src/lib/actions/password-reset.ts app/\(auth\)/forgot-password/page.tsx app/\(auth\)/reset-password/page.tsx
git commit -m "feat(auth): add password reset pages and server actions"
```

---

## Phase 5: Session Configuration

### Task 13: Configure Session Expiration

**Files:**
- Modify: `src/lib/auth.ts`

**Step 1: Add explicit session configuration**

Modify `src/lib/auth.ts` - update session config:

```typescript
session: {
  strategy: "database",
  maxAge: 30 * 24 * 60 * 60, // 30 days
  updateAge: 24 * 60 * 60, // Update session every 24 hours
},
```

**Step 2: Verify app runs**

Run: `pnpm dev`
Expected: App starts without errors

**Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): configure explicit session expiration (30 days)"
```

---

## Final Task: Update Proxy for New Routes

### Task 14: Update Auth Route Matching

**Files:**
- Modify: `src/proxy.ts`

**Step 1: Add new auth routes**

Modify `src/proxy.ts`:

```typescript
const authRoutes = ["/login", "/signup", "/forgot-password", "/reset-password"]
```

**Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "fix(auth): add new auth routes to proxy"
```

---

## Summary

This plan addresses the following gaps identified in the audit:

| Gap | Task | Priority |
|-----|------|----------|
| Weak password policy | Task 1 | Critical |
| No account lockout | Tasks 2-4 | Critical |
| No rate limiting | Tasks 2-4 | Critical |
| No security logging | Task 5 | Critical |
| No registration flow | Tasks 6-8 | High |
| Missing GitHub OAuth | Task 9 | Medium |
| No password reset | Tasks 10-12 | High |
| No session config | Task 13 | Medium |

**Estimated time:** 2-3 hours for a developer familiar with the codebase.

**Testing strategy:** Each task includes unit tests. After completion, run full test suite and manual E2E testing of all auth flows.
