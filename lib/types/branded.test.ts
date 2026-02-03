// src/lib/types/branded.test.ts
import { describe, it, expect } from "vitest"
import {
  asTenantId,
  asUserId,
  asDocumentId,
  type TenantId,
} from "./branded"

describe("Branded Types", () => {
  describe("asTenantId", () => {
    it("creates a TenantId from string", () => {
      const id = asTenantId("org-123")
      expect(id).toBe("org-123")
    })

    it("returns a value that satisfies TenantId type", () => {
      const id: TenantId = asTenantId("org-123")
      expect(typeof id).toBe("string")
    })
  })

  describe("asUserId", () => {
    it("creates a UserId from string", () => {
      const id = asUserId("user-456")
      expect(id).toBe("user-456")
    })
  })

  describe("asDocumentId", () => {
    it("creates a DocumentId from string", () => {
      const id = asDocumentId("doc-789")
      expect(id).toBe("doc-789")
    })
  })

  describe("type safety", () => {
    it("branded types are structurally strings", () => {
      const tenantId = asTenantId("t1")
      const userId = asUserId("u1")
      const docId = asDocumentId("d1")

      // All are strings at runtime
      expect(typeof tenantId).toBe("string")
      expect(typeof userId).toBe("string")
      expect(typeof docId).toBe("string")
    })
  })
})
