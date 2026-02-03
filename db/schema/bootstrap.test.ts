/**
 * @fileoverview Tests for Bootstrap Progress Schema
 * @module db/schema/bootstrap.test
 */

import { describe, it, expect, beforeEach } from "vitest"
import { db } from "@/db/client"
import { bootstrapProgress } from "./bootstrap"
import { eq } from "drizzle-orm"

describe("bootstrapProgress schema", () => {
  beforeEach(async () => {
    await db.delete(bootstrapProgress)
  })

  it("creates a progress record with required fields", async () => {
    const [record] = await db
      .insert(bootstrapProgress)
      .values({
        source: "cuad",
        status: "pending",
      })
      .returning()

    expect(record.id).toBeDefined()
    expect(record.source).toBe("cuad")
    expect(record.status).toBe("pending")
    expect(record.processedRecords).toBe(0)
    expect(record.embeddedRecords).toBe(0)
    expect(record.errorCount).toBe(0)
    expect(record.lastBatchIndex).toBe(0)
  })

  it("updates progress fields", async () => {
    const [record] = await db
      .insert(bootstrapProgress)
      .values({ source: "cuad", status: "in_progress" })
      .returning()

    await db
      .update(bootstrapProgress)
      .set({
        processedRecords: 100,
        embeddedRecords: 100,
        lastBatchIndex: 1,
      })
      .where(eq(bootstrapProgress.id, record.id))

    const [updated] = await db
      .select()
      .from(bootstrapProgress)
      .where(eq(bootstrapProgress.id, record.id))

    expect(updated.processedRecords).toBe(100)
    expect(updated.embeddedRecords).toBe(100)
    expect(updated.lastBatchIndex).toBe(1)
  })

  it("tracks all status values", async () => {
    const statuses = ["pending", "in_progress", "completed", "failed"] as const

    for (const status of statuses) {
      const [record] = await db
        .insert(bootstrapProgress)
        .values({
          source: `test-${status}`,
          status,
        })
        .returning()

      expect(record.status).toBe(status)
    }
  })

  it("stores optional fields", async () => {
    const now = new Date()
    const [record] = await db
      .insert(bootstrapProgress)
      .values({
        source: "cuad",
        status: "completed",
        totalRecords: 15000,
        processedRecords: 15000,
        embeddedRecords: 15000,
        errorCount: 5,
        lastProcessedHash: "abc123",
        lastBatchIndex: 30,
        startedAt: now,
        completedAt: now,
      })
      .returning()

    expect(record.totalRecords).toBe(15000)
    expect(record.lastProcessedHash).toBe("abc123")
    expect(record.startedAt).toEqual(now)
    expect(record.completedAt).toEqual(now)
  })
})
