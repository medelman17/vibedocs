# Testing Patterns

**Analysis Date:** 2026-02-04

## Test Framework

**Runner:**
- Vitest
- Config: `vitest.config.ts` (default, includes database integration tests)
- Config: `vitest.unit.config.ts` (pure unit tests, no database)

**Assertion Library:**
- Vitest built-in assertions (`expect()`)

**Run Commands:**
```bash
pnpm test              # Run all tests with database (sequential, no parallelism)
pnpm test:ci           # Run with coverage report
pnpm test:coverage     # Generate HTML coverage report
pnpm test:unit         # Run pure unit tests (parallel, fast)
pnpm test:integration  # Run integration tests only
```

## Test File Organization

**Location:**
- **Co-located pattern:** Test files live next to source files in same directory
- Examples:
  - `app/api/word-addin/analyze/route.ts` → `app/api/word-addin/analyze/route.test.ts`
  - `app/(main)/(auth)/actions.ts` → `app/(main)/(auth)/actions.test.ts`
  - `lib/document-processing.ts` → `lib/document-processing.test.ts`

**Naming:**
- Database integration tests: `*.test.ts`
- Pure unit tests (no DB): `*.unit.test.ts`

**Directory Structure:**
```
project-root/
├── app/
│   ├── (main)/
│   │   ├── (auth)/
│   │   │   ├── actions.ts
│   │   │   └── actions.test.ts     # Server action tests
│   │   └── chat/
│   │       ├── actions.ts
│   │       └── actions.test.ts
│   ├── api/
│   │   ├── chat/
│   │   │   ├── route.ts
│   │   │   └── route.test.ts       # API handler tests
│   │   └── word-addin/
│   │       └── analyze/
│   │           ├── route.ts
│   │           └── route.test.ts
├── lib/
│   ├── api-utils.ts
│   ├── api-utils.test.ts
│   ├── document-processing.ts
│   └── document-processing.test.ts
└── test/
    ├── setup.ts                     # Database setup (PGlite + Drizzle)
    ├── setup-unit.ts                # Unit test setup (mocks only)
    └── factories.ts                 # Test data factories
```

## Test Setup

**Integration Tests (with database):**

File: `test/setup.ts`

```typescript
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { beforeAll, beforeEach, afterEach, vi } from "vitest"

// Use in-memory PGlite (WASM Postgres)
const client = new PGlite()
export const testDb = drizzle(client, { schema })

// Mock server-only package
vi.mock("server-only", () => ({}))

// Mock bcryptjs with cost 4 (10ms vs 2s with cost 12)
vi.mock("bcryptjs", async () => {
  const actual = await vi.importActual<typeof import("bcryptjs")>("bcryptjs")
  return {
    ...actual,
    hash: (password: string) => actual.hash(password, 4),
  }
})

// Mock database module
vi.mock("@/db/client", () => ({ db: testDb }))

// Transaction rollback pattern for test isolation (~10x faster than DROP/CREATE)
beforeEach(async () => {
  await testDb.execute(sql`BEGIN`)
})

afterEach(async () => {
  await testDb.execute(sql`ROLLBACK`)
})
```

**Key features:**
- Schema created once globally (survives across test files in same worker)
- Test isolation via transaction rollback (not table truncation)
- PGlite is in-memory, no Docker needed
- Bcryptjs cost factor lowered for speed

**Unit Tests (no database):**

File: `test/setup-unit.ts`

```typescript
import { vi } from "vitest"

// Mock server-only
vi.mock("server-only", () => ({}))

// Mock bcryptjs with cost 4
vi.mock("bcryptjs", async () => {
  const actual = await vi.importActual<typeof import("bcryptjs")>("bcryptjs")
  return {
    ...actual,
    hash: (password: string) => actual.hash(password, 4),
  }
})

// Mock database (throws if accidentally used)
vi.mock("@/db/client", () => ({
  db: {
    execute: () => {
      throw new Error("Unit test attempted to use database")
    },
  },
}))
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest"
import { testDb } from "@/test/setup"
import { createTestUser, createTestOrg } from "@/test/factories"

describe("Feature/Component Name", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset any shared state
  })

  describe("Nested group (e.g., 'authentication')", () => {
    it("should do specific behavior", async () => {
      // Arrange
      const user = await createTestUser()

      // Act
      const result = await someAction(user)

      // Assert
      expect(result).toBeDefined()
    })
  })
})
```

**Patterns:**

From `app/(main)/(auth)/actions.test.ts`:

```typescript
describe("getUserOrganizations", () => {
  it("returns all organizations the user is a member of", async () => {
    // Arrange
    const user = await createTestUser()
    const org1 = await createTestOrg({ name: "Org 1" })
    const org2 = await createTestOrg({ name: "Org 2" })
    await createTestMembership(org1.id, user.id, "owner")
    await createTestMembership(org2.id, user.id, "member")
    setupSessionContext({ user })

    // Act
    const { getUserOrganizations } = await import("./actions")
    const result = await getUserOrganizations()

    // Assert
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data.map((o) => o.organization.name)).toContain("Org 1")
    }
  })
})
```

**Key practices:**
- Comment sections: Arrange, Act, Assert
- Use Truthy assertions: `expect(bool).toBe(true)` not `expect(bool).toBeTruthy()`
- Type guard assertions for discriminated unions:
  ```typescript
  if (result.success) {
    // TypeScript narrows to success case
    expect(result.data.organizationId).toBe(org.id)
  }
  ```

## Mocking

**Framework:** Vitest's `vi` object

**Mock setup patterns:**

API routes with dependencies:

```typescript
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"

// Mock verifyAddInAuth
vi.mock("@/lib/word-addin-auth", () => ({
  verifyAddInAuth: vi.fn(),
}))

// Mock inngest client
vi.mock("@/inngest", () => ({
  inngest: {
    send: vi.fn(),
  },
}))

// Mock database
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
  },
}))

describe("POST /api/word-addin/analyze", () => {
  let mockVerifyAddInAuth: Mock

  beforeEach(async () => {
    vi.resetAllMocks()

    // Get mocked functions
    const { verifyAddInAuth } = await import("@/lib/word-addin-auth")
    mockVerifyAddInAuth = verifyAddInAuth as Mock
  })

  it("returns 401 when not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/errors")
    mockVerifyAddInAuth.mockRejectedValue(
      new UnauthorizedError("Missing Authorization header")
    )

    const request = createMockRequest({ content: "Test" })
    const response = await POST(request, { params: Promise.resolve({}) })

    expect(response.status).toBe(401)
  })
})
```

**Patterns:**
- Mock at module level (before test file evaluation)
- Use `vi.resetAllMocks()` in `beforeEach` to clear state
- Get mocked functions via dynamic `import()` in tests
- Chain mock methods: `.mockReturnValue()`, `.mockResolvedValue()`, `.mockRejectedValue()`
- Spy on console for side effect testing:
  ```typescript
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  // ... test that logs error ...
  expect(consoleSpy).toHaveBeenCalled()
  consoleSpy.mockRestore()
  ```

**What to Mock:**
- External dependencies: Auth, HTTP clients, external APIs
- Database operations (when not doing integration tests)
- File system operations
- Current time (use `vi.useFakeTimers()`)
- Console methods for testing logging

**What NOT to Mock:**
- Database setup (use `testDb` from setup)
- Custom error classes (import real ones)
- Core business logic (test actual behavior)
- Utility functions (test them directly)

## Fixtures and Factories

**Test Data Creation:**

File: `test/factories.ts`

```typescript
let counter = 0
const uniqueId = () => ++counter

export async function createTestUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await testDb
    .insert(users)
    .values({
      email: `test-${uniqueId()}@example.com`,
      name: "Test User",
      ...overrides,
    })
    .returning()
  return user
}

export async function createTestOrg(overrides: Partial<typeof organizations.$inferInsert> = {}) {
  const [org] = await testDb
    .insert(organizations)
    .values({
      name: "Test Org",
      slug: `test-org-${uniqueId()}`,
      ...overrides,
    })
    .returning()
  return org
}

// Composite factory for complete tenant context
export async function createTestTenantContext(options: {
  role?: "owner" | "admin" | "member" | "viewer"
  userOverrides?: Partial<typeof users.$inferInsert>
  orgOverrides?: Partial<typeof organizations.$inferInsert>
} = {}) {
  const user = await createTestUser(options.userOverrides)
  const org = await createTestOrg(options.orgOverrides)
  const membership = await createTestMembership(
    org.id,
    user.id,
    options.role ?? "owner"
  )

  return { user, org, membership }
}
```

**Location:** `test/factories.ts`

**Usage:**
```typescript
const user = await createTestUser()
const org = await createTestOrg({ name: "Acme" })
const membership = await createTestMembership(org.id, user.id, "admin")
```

**Available factories:**
- `createTestUser(overrides)` - User account
- `createTestOrg(overrides)` - Organization
- `createTestMembership(orgId, userId, role, overrides)` - Org membership
- `createTestDocument(tenantId, overrides)` - NDA document
- `createTestChunk(tenantId, documentId, index, overrides)` - Document chunk
- `createTestAnalysis(tenantId, documentId, overrides)` - Analysis result
- `createTestClauseExtraction(tenantId, analysisId, documentId, overrides)` - Extracted clause
- `createTestTenantContext(options)` - Complete user + org + membership
- `createTestComparison(tenantId, docAId, docBId, overrides)` - Document comparison
- `createTestReferenceDocument(overrides)` - Reference corpus entry
- `createTestGeneratedNda(tenantId, createdBy, overrides)` - Generated NDA

**Reset counter between test files:**
```typescript
import { resetFactoryCounter } from "@/test/factories"

beforeEach(() => {
  resetFactoryCounter() // Ensures email uniqueness across test runs
})
```

## Coverage

**Requirements:** No hard coverage requirement enforced in CI, but coverage reports generated

**View Coverage:**
```bash
# Generate HTML report
pnpm test:coverage

# Open in browser (depends on CI environment)
open coverage/index.html
```

**Excluded from coverage:**
- Schema files (not business logic): `db/schema/*.ts`
- Barrel file: `db/schema/index.ts`
- Test files and test utilities

See `vitest.config.ts` for coverage exclusions.

## Test Types

**Unit Tests (`.unit.test.ts`):**

Scope: Pure functions with no database or external dependencies

Configuration:
- File pattern: `*.unit.test.ts`
- Setup file: `test/setup-unit.ts`
- Parallelism: Enabled (`fileParallelism: true`)
- Speed: Very fast (no database initialization)

Example use:
```typescript
// lib/utils.unit.test.ts
import { describe, it, expect } from "vitest"
import { parseDate } from "@/lib/utils"

describe("parseDate", () => {
  it("parses valid ISO date", () => {
    const result = parseDate("2026-02-04")
    expect(result).toEqual(new Date(2026, 1, 4))
  })
})
```

Run with: `pnpm test:unit`

**Integration Tests (`.test.ts`):**

Scope: Database queries, API routes, server actions, multi-layer interactions

Configuration:
- File pattern: `*.test.ts` (default)
- Setup file: `test/setup.ts`
- Parallelism: Disabled (`fileParallelism: false`)
- Database: PGlite in-memory instance
- Isolation: Transaction rollback per test

Example use:
```typescript
// app/(main)/(auth)/actions.test.ts
import { testDb } from "@/test/setup"
import { createTestUser, createTestOrg } from "@/test/factories"

describe("switchOrganization", () => {
  it("allows switching to an organization the user is a member of", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(org.id, user.id, "member")

    const { switchOrganization } = await import("./actions")
    const result = await switchOrganization({ orgId: org.id })

    expect(result.success).toBe(true)
  })
})
```

Run with: `pnpm test`

**E2E Tests:**
- Not currently in use (comment in CLAUDE.md)
- Would use browser automation if added

## Common Patterns

**Async Testing:**

All tests are `async` by default:

```typescript
it("should handle async operations", async () => {
  const user = await createTestUser()
  const org = await createTestOrg()
  await createTestMembership(org.id, user.id, "member")

  // Vitest waits for promise automatically
  const result = await someAsyncAction()
  expect(result).toBeDefined()
})
```

**Error Testing:**

Using discriminated unions:

```typescript
it("returns error when action fails", async () => {
  const result = await mayFailAction()

  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.code).toBe("NOT_FOUND")
    expect(result.error.message).toContain("not found")
  }
})
```

Thrown errors:

```typescript
it("throws when authentication fails", async () => {
  mockVerifyAddInAuth.mockRejectedValue(
    new UnauthorizedError("Missing token")
  )

  const request = createMockRequest({ content: "Test" })
  const response = await POST(request, { params: Promise.resolve({}) })

  expect(response.status).toBe(401)
})
```

**Request/Response Mocking (API routes):**

```typescript
function createMockRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/endpoint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

it("processes request correctly", async () => {
  const request = createMockRequest({ data: "test" })
  const response = await POST(request, { params: Promise.resolve({}) })

  expect(response.status).toBe(200)
  const json = await response.json()
  expect(json.success).toBe(true)
})
```

**Chained Mock Behavior:**

```typescript
const mockReturning = vi.fn()
  .mockResolvedValueOnce([mockUser])      // First call
  .mockResolvedValueOnce([mockOrg])       // Second call

const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
mockDbInsert.mockReturnValue({ values: mockValues })

// Multiple calls handled in order
```

**Session Context Setup (for authenticated tests):**

```typescript
let mockSessionContext: SessionContextType | null = null

vi.mock("@/lib/dal", () => ({
  verifySession: vi.fn(async () => {
    if (!mockSessionContext) {
      throw new Error("REDIRECT:/login")
    }
    return mockSessionContext
  }),
}))

function setupSessionContext(params: { user: User; activeOrganizationId?: string | null }): void {
  mockSessionContext = {
    userId: params.user.id,
    user: params.user,
    activeOrganizationId: params.activeOrganizationId ?? null,
  }
}

describe("authenticated actions", () => {
  beforeEach(() => {
    mockSessionContext = null
  })

  it("requires authentication", async () => {
    const { myAction } = await import("./actions")
    await expect(myAction()).rejects.toThrow("REDIRECT:/login")
  })

  it("works with authenticated user", async () => {
    const user = await createTestUser()
    setupSessionContext({ user })

    const { myAction } = await import("./actions")
    const result = await myAction()

    expect(result.success).toBe(true)
  })
})
```

## Best Practices

1. **Clear test names:** Use `it("should X when Y"` format
2. **Test behavior, not implementation:** Test what users/APIs care about
3. **Avoid test interdependence:** Each test should run in isolation
4. **Use factories for complex data:** Reduces test boilerplate
5. **Group related tests:** Use nested `describe()` blocks
6. **Mock external dependencies:** Keep tests fast and deterministic
7. **Reset mocks properly:** `vi.clearAllMocks()` in `beforeEach`
8. **Use `vi.resetModules()`:** When mocks need fresh state between tests
9. **Suppress console noise:** Spy on console.error/warn for side-effect testing
10. **Type-safe assertions:** Leverage TypeScript type narrowing with discriminated unions

---

*Testing analysis: 2026-02-04*
