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

// System tenant ID for auth events that don't have a tenant context
const SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000000"
const SYSTEM_RECORD_ID = "00000000-0000-0000-0000-000000000000"

/**
 * Log a security-related event to the audit log
 */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      tenantId: event.tenantId ?? SYSTEM_TENANT_ID,
      tableName: event.tableName ?? "auth",
      recordId: event.recordId ?? event.userId ?? SYSTEM_RECORD_ID,
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
