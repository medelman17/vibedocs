/**
 * @fileoverview Email utilities for NDA Analyst using Resend
 *
 * This module provides email sending functionality for various application
 * events including organization invitations, password resets, and analysis
 * completion notifications.
 *
 * @module lib/email
 * @see {@link https://resend.com/docs} - Resend API documentation
 */

import { Resend } from "resend"

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY)

// Email from address - use env var if available, otherwise default
const FROM_ADDRESS =
  process.env.EMAIL_FROM_ADDRESS || "NDA Analyst <noreply@ndaanalyst.com>"

// ============================================================================
// Types
// ============================================================================

/**
 * Supported email template types
 */
export type EmailTemplate =
  | "organization-invitation"
  | "password-reset"
  | "analysis-complete"
  | "welcome"

/**
 * Options for sending a templated email
 */
export interface SendEmailOptions {
  to: string
  template: EmailTemplate
  data: Record<string, unknown>
}

/**
 * Result of sending an email
 */
export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

// ============================================================================
// Template Generators
// ============================================================================

/**
 * Generate HTML email content for organization invitation
 */
function generateInvitationEmail(data: {
  inviterName: string
  organizationName: string
  inviteUrl: string
}): { subject: string; html: string; text: string } {
  const { inviterName, organizationName, inviteUrl } = data

  const subject = `You've been invited to join ${organizationName} on NDA Analyst`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 32px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 16px; font-size: 24px; color: #111;">You're Invited!</h1>
    <p style="margin: 0 0 16px; font-size: 16px;">
      <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on NDA Analyst.
    </p>
    <p style="margin: 0 0 24px; font-size: 14px; color: #666;">
      NDA Analyst helps legal teams analyze, compare, and generate NDAs with AI-powered insights.
    </p>
    <a href="${inviteUrl}" style="display: inline-block; background-color: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 16px;">
      Accept Invitation
    </a>
  </div>
  <p style="font-size: 12px; color: #999; margin: 0;">
    If you didn't expect this invitation, you can safely ignore this email.
  </p>
</body>
</html>
`.trim()

  const text = `
You've been invited to join ${organizationName} on NDA Analyst

${inviterName} has invited you to join ${organizationName}.

Accept the invitation by visiting: ${inviteUrl}

If you didn't expect this invitation, you can safely ignore this email.
`.trim()

  return { subject, html, text }
}

/**
 * Generate HTML email content for password reset
 */
function generatePasswordResetEmail(data: {
  resetUrl: string
  expiresIn: string
}): { subject: string; html: string; text: string } {
  const { resetUrl, expiresIn } = data

  const subject = "Reset your NDA Analyst password"

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 32px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 16px; font-size: 24px; color: #111;">Reset Your Password</h1>
    <p style="margin: 0 0 16px; font-size: 16px;">
      We received a request to reset your password. Click the button below to choose a new password.
    </p>
    <a href="${resetUrl}" style="display: inline-block; background-color: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 16px; margin-bottom: 16px;">
      Reset Password
    </a>
    <p style="margin: 16px 0 0; font-size: 14px; color: #666;">
      This link will expire in ${expiresIn}.
    </p>
  </div>
  <p style="font-size: 12px; color: #999; margin: 0;">
    If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
  </p>
</body>
</html>
`.trim()

  const text = `
Reset your NDA Analyst password

We received a request to reset your password.

Reset your password by visiting: ${resetUrl}

This link will expire in ${expiresIn}.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
`.trim()

  return { subject, html, text }
}

/**
 * Generate HTML email content for analysis completion notification
 */
function generateAnalysisCompleteEmail(data: {
  documentTitle: string
  analysisUrl: string
  riskLevel: string
}): { subject: string; html: string; text: string } {
  const { documentTitle, analysisUrl, riskLevel } = data

  const subject = `Analysis Complete: ${documentTitle}`

  // Map risk levels to colors
  const riskColors: Record<string, string> = {
    standard: "#22c55e",
    cautious: "#f59e0b",
    aggressive: "#ef4444",
    unknown: "#6b7280",
  }
  const riskColor = riskColors[riskLevel] || riskColors.unknown

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 32px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 16px; font-size: 24px; color: #111;">Analysis Complete</h1>
    <p style="margin: 0 0 16px; font-size: 16px;">
      Your NDA analysis for <strong>${documentTitle}</strong> is ready.
    </p>
    <p style="margin: 0 0 24px; font-size: 14px;">
      Overall Risk Assessment:
      <span style="display: inline-block; background-color: ${riskColor}; color: #fff; padding: 4px 12px; border-radius: 4px; font-weight: 500; text-transform: capitalize;">
        ${riskLevel}
      </span>
    </p>
    <a href="${analysisUrl}" style="display: inline-block; background-color: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 16px;">
      View Analysis
    </a>
  </div>
  <p style="font-size: 12px; color: #999; margin: 0;">
    You received this email because you submitted a document for analysis on NDA Analyst.
  </p>
</body>
</html>
`.trim()

  const text = `
Analysis Complete: ${documentTitle}

Your NDA analysis is ready.

Document: ${documentTitle}
Overall Risk Assessment: ${riskLevel}

View the full analysis at: ${analysisUrl}

You received this email because you submitted a document for analysis on NDA Analyst.
`.trim()

  return { subject, html, text }
}

/**
 * Generate HTML email content for welcome email
 */
function generateWelcomeEmail(data: {
  userName?: string
}): { subject: string; html: string; text: string } {
  const { userName } = data

  const subject = "Welcome to NDA Analyst"
  const greeting = userName ? `Hi ${userName},` : "Hi there,"

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 32px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 16px; font-size: 24px; color: #111;">Welcome to NDA Analyst!</h1>
    <p style="margin: 0 0 16px; font-size: 16px;">
      ${greeting}
    </p>
    <p style="margin: 0 0 16px; font-size: 16px;">
      Thank you for signing up. NDA Analyst helps you analyze, compare, and generate NDAs with AI-powered insights.
    </p>
    <p style="margin: 0 0 24px; font-size: 14px; color: #666;">
      Get started by uploading your first NDA for analysis.
    </p>
  </div>
  <p style="font-size: 12px; color: #999; margin: 0;">
    Need help? Reply to this email or check out our documentation.
  </p>
</body>
</html>
`.trim()

  const text = `
Welcome to NDA Analyst!

${greeting}

Thank you for signing up. NDA Analyst helps you analyze, compare, and generate NDAs with AI-powered insights.

Get started by uploading your first NDA for analysis.

Need help? Reply to this email or check out our documentation.
`.trim()

  return { subject, html, text }
}

// ============================================================================
// Email Sending Functions
// ============================================================================

/**
 * Send an email using a template.
 *
 * @param options - Email options including recipient, template, and data
 * @returns Result indicating success or failure with optional message ID
 *
 * @example
 * const result = await sendEmail({
 *   to: "user@example.com",
 *   template: "organization-invitation",
 *   data: {
 *     inviterName: "John Doe",
 *     organizationName: "Acme Corp",
 *     inviteUrl: "https://app.ndaanalyst.com/invitations/abc123"
 *   }
 * })
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const { to, template, data } = options

  try {
    let emailContent: { subject: string; html: string; text: string }

    switch (template) {
      case "organization-invitation":
        emailContent = generateInvitationEmail(
          data as {
            inviterName: string
            organizationName: string
            inviteUrl: string
          }
        )
        break
      case "password-reset":
        emailContent = generatePasswordResetEmail(
          data as { resetUrl: string; expiresIn: string }
        )
        break
      case "analysis-complete":
        emailContent = generateAnalysisCompleteEmail(
          data as { documentTitle: string; analysisUrl: string; riskLevel: string }
        )
        break
      case "welcome":
        emailContent = generateWelcomeEmail(data as { userName?: string })
        break
      default:
        console.error("[email] Unknown template:", template)
        return { success: false, error: `Unknown template: ${template}` }
    }

    const { data: sendData, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    })

    if (error) {
      console.error("[email] Failed to send email:", error)
      return { success: false, error: error.message }
    }

    return { success: true, messageId: sendData?.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[email] Exception sending email:", message)
    return { success: false, error: message }
  }
}

/**
 * Send organization invitation email.
 *
 * @param params - Invitation parameters
 * @returns Result indicating success or failure
 *
 * @example
 * await sendInvitationEmail({
 *   to: "newmember@example.com",
 *   inviterName: "John Doe",
 *   organizationName: "Acme Corp",
 *   inviteUrl: "https://app.ndaanalyst.com/invitations/abc123"
 * })
 */
export async function sendInvitationEmail(params: {
  to: string
  inviterName: string
  organizationName: string
  inviteUrl: string
}): Promise<{ success: boolean; error?: string }> {
  const result = await sendEmail({
    to: params.to,
    template: "organization-invitation",
    data: {
      inviterName: params.inviterName,
      organizationName: params.organizationName,
      inviteUrl: params.inviteUrl,
    },
  })

  return { success: result.success, error: result.error }
}

/**
 * Send password reset email.
 *
 * @param params - Reset parameters
 * @returns Result indicating success or failure
 *
 * @example
 * await sendPasswordResetEmail({
 *   to: "user@example.com",
 *   resetUrl: "https://app.ndaanalyst.com/reset-password?token=abc123",
 *   expiresIn: "1 hour"
 * })
 */
export async function sendPasswordResetEmail(params: {
  to: string
  resetUrl: string
  expiresIn: string
}): Promise<{ success: boolean; error?: string }> {
  const result = await sendEmail({
    to: params.to,
    template: "password-reset",
    data: {
      resetUrl: params.resetUrl,
      expiresIn: params.expiresIn,
    },
  })

  return { success: result.success, error: result.error }
}

/**
 * Send analysis complete notification.
 *
 * @param params - Analysis notification parameters
 * @returns Result indicating success or failure
 *
 * @example
 * await sendAnalysisCompleteEmail({
 *   to: "user@example.com",
 *   documentTitle: "Vendor NDA - Acme Corp",
 *   analysisUrl: "https://app.ndaanalyst.com/analyses/abc123",
 *   riskLevel: "cautious"
 * })
 */
export async function sendAnalysisCompleteEmail(params: {
  to: string
  documentTitle: string
  analysisUrl: string
  riskLevel: string
}): Promise<{ success: boolean; error?: string }> {
  const result = await sendEmail({
    to: params.to,
    template: "analysis-complete",
    data: {
      documentTitle: params.documentTitle,
      analysisUrl: params.analysisUrl,
      riskLevel: params.riskLevel,
    },
  })

  return { success: result.success, error: result.error }
}
