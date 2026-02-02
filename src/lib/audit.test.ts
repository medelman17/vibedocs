import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock db before importing audit module
const mockInsert = vi.fn().mockReturnThis()
const mockValues = vi.fn().mockResolvedValue([])

vi.mock("@/db/client", () => ({
  db: {
    insert: mockInsert,
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

  it("handles missing optional fields", async () => {
    const { logSecurityEvent } = await import("./audit")

    await logSecurityEvent({
      action: "LOGIN_FAILED",
    })

    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_FAILED",
      })
    )
  })

  it("does not throw on database error", async () => {
    mockValues.mockRejectedValueOnce(new Error("DB error"))
    const { logSecurityEvent } = await import("./audit")

    // Should not throw
    await expect(
      logSecurityEvent({ action: "LOGIN_SUCCESS" })
    ).resolves.not.toThrow()
  })
})
