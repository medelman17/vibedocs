// src/inngest/utils/errors.test.ts
import { describe, it, expect } from "vitest"
import {
  RetriableError,
  NonRetriableError,
  ValidationError,
  NotFoundError,
  ApiError,
  isRetriableError,
  wrapWithErrorHandling,
} from "./errors"

describe("Error Classes", () => {
  describe("RetriableError", () => {
    it("should be marked as retriable", () => {
      const error = new RetriableError("Temporary failure")
      expect(error.isRetriable).toBe(true)
      expect(error.name).toBe("RetriableError")
    })

    it("should include context", () => {
      const error = new RetriableError("Failed", { attempt: 3 })
      expect(error.context).toEqual({ attempt: 3 })
    })
  })

  describe("NonRetriableError", () => {
    it("should be marked as non-retriable", () => {
      const error = new NonRetriableError("Invalid input")
      expect(error.isRetriable).toBe(false)
      expect(error.name).toBe("NonRetriableError")
    })
  })

  describe("ValidationError", () => {
    it("should include validation errors", () => {
      const error = new ValidationError("Invalid payload", [
        { path: "tenantId", message: "Required" },
      ])
      expect(error.isRetriable).toBe(false)
      expect(error.validationErrors).toHaveLength(1)
      expect(error.validationErrors[0].path).toBe("tenantId")
    })

    it("should create from Zod error", () => {
      const zodError = {
        issues: [
          { path: ["user", "email"], message: "Invalid email" },
          { path: ["age"], message: "Must be positive" },
        ],
      }
      const error = ValidationError.fromZodError(zodError)
      expect(error.validationErrors).toHaveLength(2)
      expect(error.validationErrors[0].path).toBe("user.email")
      expect(error.validationErrors[1].path).toBe("age")
    })
  })

  describe("NotFoundError", () => {
    it("should include resource details", () => {
      const error = new NotFoundError("Document", "doc-123")
      expect(error.isRetriable).toBe(false)
      expect(error.resourceType).toBe("Document")
      expect(error.resourceId).toBe("doc-123")
      expect(error.message).toContain("Document not found")
    })
  })

  describe("ApiError", () => {
    it("should be retriable for 5xx errors", () => {
      const error = new ApiError("Claude", "Server error", 500)
      expect(error.isRetriable).toBe(true)
    })

    it("should be retriable for 429 (rate limit)", () => {
      const error = new ApiError("Voyage", "Rate limited", 429)
      expect(error.isRetriable).toBe(true)
    })

    it("should not be retriable for 4xx errors (except 408, 429)", () => {
      const error = new ApiError("Claude", "Bad request", 400)
      expect(error.isRetriable).toBe(false)
    })

    it("should be retriable for 408 (timeout)", () => {
      const error = new ApiError("Voyage", "Request timeout", 408)
      expect(error.isRetriable).toBe(true)
    })

    it("should be retriable when no status code", () => {
      const error = new ApiError("Unknown", "Connection failed")
      expect(error.isRetriable).toBe(true)
    })
  })
})

describe("isRetriableError", () => {
  it("should return true for RetriableError", () => {
    expect(isRetriableError(new RetriableError("temp"))).toBe(true)
  })

  it("should return false for NonRetriableError", () => {
    expect(isRetriableError(new NonRetriableError("perm"))).toBe(false)
  })

  it("should return true for unknown errors (conservative)", () => {
    expect(isRetriableError(new Error("unknown"))).toBe(true)
  })
})

describe("wrapWithErrorHandling", () => {
  it("should pass through successful results", async () => {
    const result = await wrapWithErrorHandling("test", async () => "success")
    expect(result).toBe("success")
  })

  it("should convert timeout errors to RetriableError", async () => {
    await expect(
      wrapWithErrorHandling("test", async () => {
        throw new Error("Connection timeout")
      })
    ).rejects.toThrow(RetriableError)
  })

  it("should convert not found errors to NonRetriableError", async () => {
    await expect(
      wrapWithErrorHandling("test", async () => {
        throw new Error("Resource not found")
      })
    ).rejects.toThrow(NonRetriableError)
  })

  it("should pass through already-classified errors", async () => {
    const original = new ValidationError("Invalid", [])
    await expect(
      wrapWithErrorHandling("test", async () => {
        throw original
      })
    ).rejects.toBe(original)
  })

  it("should wrap unknown errors as RetriableError", async () => {
    await expect(
      wrapWithErrorHandling("test", async () => {
        throw new Error("Something unexpected")
      })
    ).rejects.toThrow(RetriableError)
  })
})
