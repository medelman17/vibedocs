// test/setup-unit.ts
// Minimal setup for pure unit tests that don't need database access
// Much faster than full setup.ts - use for tests that don't touch the DB
import { vi } from "vitest"

// Mock server-only package (used by lib/dal.ts)
vi.mock("server-only", () => ({}))

// Mock bcryptjs with lower cost factor for faster tests
vi.mock("bcryptjs", async () => {
  const actual = await vi.importActual<typeof import("bcryptjs")>("bcryptjs")
  return {
    ...actual,
    hash: (password: string) => actual.hash(password, 4),
  }
})

// Mock the db module with a placeholder (tests using this setup shouldn't use db)
vi.mock("@/db/client", () => ({
  db: {
    // Throw if accidentally used - unit tests shouldn't touch DB
    execute: () => {
      throw new Error(
        "Unit test attempted to use database. Use integration tests instead."
      )
    },
  },
}))
