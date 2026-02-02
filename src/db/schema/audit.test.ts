// src/db/schema/audit.test.ts
import { describe, it, expect } from "vitest"
import { testDb } from "@/test/setup"
import { auditLogs } from "./index"
import { createTestOrg, createTestDocument } from "@/test/factories"

describe("auditLogs schema", () => {
  it("creates audit log entry", async () => {
    const org = await createTestOrg()
    const doc = await createTestDocument(org.id)

    const [log] = await testDb
      .insert(auditLogs)
      .values({
        tenantId: org.id,
        tableName: "documents",
        recordId: doc.id,
        action: "INSERT",
      })
      .returning()

    expect(log.id).toBeDefined()
    expect(log.action).toBe("INSERT")
  })

  it("stores old_values and new_values as JSONB", async () => {
    const org = await createTestOrg()
    const doc = await createTestDocument(org.id)

    const [log] = await testDb
      .insert(auditLogs)
      .values({
        tenantId: org.id,
        tableName: "documents",
        recordId: doc.id,
        action: "UPDATE",
        oldValues: { status: "pending" },
        newValues: { status: "complete" },
      })
      .returning()

    expect(log.oldValues).toEqual({ status: "pending" })
    expect(log.newValues).toEqual({ status: "complete" })
  })

  it("sets performedAt automatically", async () => {
    const org = await createTestOrg()
    const doc = await createTestDocument(org.id)

    const [log] = await testDb
      .insert(auditLogs)
      .values({
        tenantId: org.id,
        tableName: "documents",
        recordId: doc.id,
        action: "INSERT",
      })
      .returning()

    expect(log.performedAt).toBeInstanceOf(Date)
  })

  it("allows null userId for system actions", async () => {
    const org = await createTestOrg()
    const doc = await createTestDocument(org.id)

    const [log] = await testDb
      .insert(auditLogs)
      .values({
        tenantId: org.id,
        tableName: "documents",
        recordId: doc.id,
        action: "SYSTEM_CLEANUP",
        userId: null,
      })
      .returning()

    expect(log.userId).toBeNull()
  })
})
