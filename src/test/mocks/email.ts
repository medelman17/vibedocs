// src/test/mocks/email.ts
/**
 * Mock utilities for email service.
 */

import { vi } from "vitest"

// Track sent emails for assertions
export const sentEmails: Array<{
  to: string
  template: string
  data: Record<string, unknown>
}> = []

export const mockSendEmail = vi.fn(
  async (options: { to: string; template: string; data: Record<string, unknown> }) => {
    sentEmails.push(options)
    return { success: true, messageId: `mock-${Date.now()}` }
  }
)

export const mockSendInvitationEmail = vi.fn(
  async (params: {
    to: string
    inviterName: string
    organizationName: string
    inviteUrl: string
  }) => {
    sentEmails.push({
      to: params.to,
      template: "organization-invitation",
      data: params,
    })
    return { success: true }
  }
)

export const mockSendPasswordResetEmail = vi.fn(
  async (params: { to: string; resetUrl: string; expiresIn: string }) => {
    sentEmails.push({
      to: params.to,
      template: "password-reset",
      data: params,
    })
    return { success: true }
  }
)

export const mockSendAnalysisCompleteEmail = vi.fn(
  async (params: {
    to: string
    documentTitle: string
    analysisUrl: string
    riskLevel: string
  }) => {
    sentEmails.push({
      to: params.to,
      template: "analysis-complete",
      data: params,
    })
    return { success: true }
  }
)

export function clearMockEmails(): void {
  sentEmails.length = 0
  mockSendEmail.mockClear()
  mockSendInvitationEmail.mockClear()
  mockSendPasswordResetEmail.mockClear()
  mockSendAnalysisCompleteEmail.mockClear()
}

/**
 * Creates the mock object for vi.mock("@/lib/email", ...).
 */
export function createEmailMock() {
  return {
    sendEmail: mockSendEmail,
    sendInvitationEmail: mockSendInvitationEmail,
    sendPasswordResetEmail: mockSendPasswordResetEmail,
    sendAnalysisCompleteEmail: mockSendAnalysisCompleteEmail,
  }
}
