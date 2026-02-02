// src/lib/password.test.ts
import { describe, it, expect } from "vitest"
import { hashPassword, verifyPassword, validatePassword } from "./password"

describe("password utilities", () => {
  describe("hashPassword", () => {
    it("hashes a password", async () => {
      const password = "SecurePass123"
      const hash = await hashPassword(password)

      expect(hash).not.toBe(password)
      expect(hash).toMatch(/^\$2[aby]?\$/)
    })
  })

  describe("verifyPassword", () => {
    it("verifies correct password", async () => {
      const password = "SecurePass123"
      const hash = await hashPassword(password)

      const isValid = await verifyPassword(password, hash)
      expect(isValid).toBe(true)
    })

    it("rejects incorrect password", async () => {
      const password = "SecurePass123"
      const hash = await hashPassword(password)

      const isValid = await verifyPassword("WrongPass456", hash)
      expect(isValid).toBe(false)
    })
  })

  describe("validatePassword", () => {
    it("accepts valid password", () => {
      const result = validatePassword("SecurePass123!")
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("rejects short password", () => {
      const result = validatePassword("Short1A")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("Password must be at least 8 characters")
    })

    it("requires uppercase letter", () => {
      const result = validatePassword("lowercase123")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain(
        "Password must contain at least one uppercase letter"
      )
    })

    it("requires lowercase letter", () => {
      const result = validatePassword("UPPERCASE123")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain(
        "Password must contain at least one lowercase letter"
      )
    })

    it("requires number", () => {
      const result = validatePassword("NoNumbersHere")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain(
        "Password must contain at least one number"
      )
    })

    it("requires special character", () => {
      const result = validatePassword("SecurePass123")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain(
        "Password must contain at least one special character"
      )
    })

    it("accepts password with special character", () => {
      const result = validatePassword("SecurePass123!")
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })
})
