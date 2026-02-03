// src/test/mocks/dal.ts
/**
 * Mock utilities for the Data Access Layer (DAL).
 *
 * These mocks replace the auth-dependent DAL functions with test-friendly
 * versions that don't require actual session/auth state.
 */

import { vi } from "vitest"
import { testDb } from "../setup"

// ============================================================================
// Types
// ============================================================================

export interface MockSessionContext {
  userId: string
  user: {
    id: string
    name: string
    email: string
  }
  activeOrganizationId: string | null
}

export interface MockTenantContext extends MockSessionContext {
  db: typeof testDb
  tenantId: string
  role: "owner" | "admin" | "member" | "viewer"
}

// ============================================================================
// Mock State
// ============================================================================

let mockSessionContext: MockSessionContext | null = null
let mockTenantContext: MockTenantContext | null = null

// ============================================================================
// Setup Functions
// ============================================================================

/**
 * Set up a mock session context for verifySession().
 */
export function setMockSession(context: MockSessionContext): void {
  mockSessionContext = context
}

/**
 * Set up a mock tenant context for withTenant() and requireRole().
 */
export function setMockTenant(context: Omit<MockTenantContext, "db">): void {
  mockTenantContext = {
    ...context,
    db: testDb,
  }
  // Also set session context
  mockSessionContext = {
    userId: context.userId,
    user: context.user,
    activeOrganizationId: context.tenantId,
  }
}

/**
 * Clear all mock contexts.
 */
export function clearMockContexts(): void {
  mockSessionContext = null
  mockTenantContext = null
}

// ============================================================================
// Mock Implementations
// ============================================================================

/**
 * Mock implementation of verifySession.
 * Throws redirect-like error if no session is set.
 */
export const mockVerifySession = vi.fn(async () => {
  if (!mockSessionContext) {
    throw new Error("REDIRECT:/login")
  }
  return mockSessionContext
})

/**
 * Mock implementation of withTenant.
 * Throws redirect-like error if no tenant context is set.
 */
export const mockWithTenant = vi.fn(async () => {
  if (!mockTenantContext) {
    throw new Error("REDIRECT:/onboarding")
  }
  return mockTenantContext
})

/**
 * Mock implementation of requireRole.
 * Throws redirect-like error if role is not allowed.
 */
export const mockRequireRole = vi.fn(
  async (allowedRoles: ("owner" | "admin" | "member" | "viewer")[]) => {
    if (!mockTenantContext) {
      throw new Error("REDIRECT:/onboarding")
    }
    if (!allowedRoles.includes(mockTenantContext.role)) {
      throw new Error("REDIRECT:/dashboard?error=unauthorized")
    }
    return mockTenantContext
  }
)

// ============================================================================
// Module Mock Setup
// ============================================================================

/**
 * Creates the mock object for vi.mock("@/lib/dal", ...).
 * Call this in your test file's vi.mock() setup.
 */
export function createDalMock() {
  return {
    verifySession: mockVerifySession,
    withTenant: mockWithTenant,
    requireRole: mockRequireRole,
  }
}

/**
 * Helper to set up a complete tenant context from factory-created data.
 * Use this after creating test data with factories.
 */
export function setupTenantContext(params: {
  user: { id: string; name: string | null; email: string }
  org: { id: string }
  membership: { role: string }
}): void {
  setMockTenant({
    userId: params.user.id,
    user: {
      id: params.user.id,
      name: params.user.name ?? "Test User",
      email: params.user.email,
    },
    tenantId: params.org.id,
    activeOrganizationId: params.org.id,
    role: params.membership.role as "owner" | "admin" | "member" | "viewer",
  })
}

/**
 * Helper to set up session-only context (for actions that only need verifySession).
 */
export function setupSessionContext(params: {
  user: { id: string; name: string | null; email: string }
  activeOrganizationId?: string | null
}): void {
  setMockSession({
    userId: params.user.id,
    user: {
      id: params.user.id,
      name: params.user.name ?? "Test User",
      email: params.user.email,
    },
    activeOrganizationId: params.activeOrganizationId ?? null,
  })
}
