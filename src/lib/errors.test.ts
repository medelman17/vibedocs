import { describe, it, expect } from "vitest"
import {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  isAppError,
  toAppError,
} from "./errors"

describe("Error Classes", () => {
  describe("AppError", () => {
    it("creates error with all properties", () => {
      const error = new AppError("BAD_REQUEST", "Something went wrong", 400, [
        { field: "email", message: "Invalid" },
      ])

      expect(error.code).toBe("BAD_REQUEST")
      expect(error.message).toBe("Something went wrong")
      expect(error.statusCode).toBe(400)
      expect(error.details).toEqual([{ field: "email", message: "Invalid" }])
      expect(error.isOperational).toBe(true)
      expect(error.name).toBe("AppError")
    })

    it("serializes to JSON correctly", () => {
      const error = new AppError("NOT_FOUND", "User not found", 404)
      const json = error.toJSON()

      expect(json).toEqual({
        code: "NOT_FOUND",
        message: "User not found",
      })
    })

    it("includes details in JSON when present", () => {
      const error = new AppError("VALIDATION_ERROR", "Invalid", 400, [
        { field: "name", message: "Required" },
      ])
      const json = error.toJSON()

      expect(json.details).toEqual([{ field: "name", message: "Required" }])
    })
  })

  describe("Specialized Error Classes", () => {
    it("BadRequestError has correct defaults", () => {
      const error = new BadRequestError()
      expect(error.code).toBe("BAD_REQUEST")
      expect(error.statusCode).toBe(400)
      expect(error.message).toBe("Bad request")
    })

    it("ValidationError has correct defaults", () => {
      const error = new ValidationError("Invalid input", [
        { field: "email", message: "Invalid format" },
      ])
      expect(error.code).toBe("VALIDATION_ERROR")
      expect(error.statusCode).toBe(400)
      expect(error.details).toHaveLength(1)
    })

    it("ValidationError.fromZodError converts Zod errors", () => {
      // Zod 4 uses .issues instead of .errors
      const zodError = {
        issues: [
          { path: ["user", "email"], message: "Invalid email" },
          { path: ["user", "name"], message: "Required" },
        ],
      }

      const error = ValidationError.fromZodError(zodError)

      expect(error.details).toEqual([
        { field: "user.email", message: "Invalid email" },
        { field: "user.name", message: "Required" },
      ])
    })

    it("UnauthorizedError has correct defaults", () => {
      const error = new UnauthorizedError()
      expect(error.code).toBe("UNAUTHORIZED")
      expect(error.statusCode).toBe(401)
    })

    it("ForbiddenError has correct defaults", () => {
      const error = new ForbiddenError()
      expect(error.code).toBe("FORBIDDEN")
      expect(error.statusCode).toBe(403)
    })

    it("NotFoundError has correct defaults", () => {
      const error = new NotFoundError("Document not found")
      expect(error.code).toBe("NOT_FOUND")
      expect(error.statusCode).toBe(404)
      expect(error.message).toBe("Document not found")
    })

    it("ConflictError has correct defaults", () => {
      const error = new ConflictError("Email already exists")
      expect(error.code).toBe("CONFLICT")
      expect(error.statusCode).toBe(409)
    })

    it("RateLimitError has correct defaults and retryAfter", () => {
      const error = new RateLimitError("Too many requests", 60)
      expect(error.code).toBe("RATE_LIMITED")
      expect(error.statusCode).toBe(429)
      expect(error.retryAfter).toBe(60)
    })

    it("InternalError has correct defaults", () => {
      const error = new InternalError()
      expect(error.code).toBe("INTERNAL_ERROR")
      expect(error.statusCode).toBe(500)
    })

    it("ServiceUnavailableError has correct defaults", () => {
      const error = new ServiceUnavailableError()
      expect(error.code).toBe("SERVICE_UNAVAILABLE")
      expect(error.statusCode).toBe(503)
    })
  })

  describe("isAppError", () => {
    it("returns true for AppError instances", () => {
      expect(isAppError(new AppError("BAD_REQUEST", "test", 400))).toBe(true)
      expect(isAppError(new NotFoundError())).toBe(true)
      expect(isAppError(new ValidationError())).toBe(true)
    })

    it("returns false for non-AppError values", () => {
      expect(isAppError(new Error("test"))).toBe(false)
      expect(isAppError("string")).toBe(false)
      expect(isAppError(null)).toBe(false)
      expect(isAppError(undefined)).toBe(false)
      expect(isAppError({ code: "ERROR" })).toBe(false)
    })
  })

  describe("toAppError", () => {
    it("returns AppError unchanged", () => {
      const original = new NotFoundError("Test")
      const result = toAppError(original)
      expect(result).toBe(original)
    })

    it("wraps regular Error in InternalError", () => {
      const result = toAppError(new Error("Something broke"))
      expect(result).toBeInstanceOf(InternalError)
      expect(result.code).toBe("INTERNAL_ERROR")
    })

    it("wraps non-Error values in InternalError", () => {
      expect(toAppError("string error")).toBeInstanceOf(InternalError)
      expect(toAppError(null)).toBeInstanceOf(InternalError)
      expect(toAppError({ custom: "error" })).toBeInstanceOf(InternalError)
    })
  })
})
