// src/lib/api-utils.test.ts
import { describe, it, expect, vi } from "vitest"
import {
  success,
  error,
  withErrorHandling,
  actionSuccess,
  actionError,
  withActionErrorHandling,
} from "./api-utils"
import { NotFoundError, ValidationError } from "./errors"

describe("api-utils", () => {
  describe("success", () => {
    it("creates a success response with data", async () => {
      const data = { id: "123", name: "Test" }
      const response = success(data)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ success: true, data })
    })

    it("allows custom status code", async () => {
      const response = success({ created: true }, 201)

      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.success).toBe(true)
    })
  })

  describe("error", () => {
    it("creates an error response from AppError", async () => {
      const appError = new NotFoundError("Resource not found")
      const response = error(appError)

      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe("NOT_FOUND")
      expect(body.error.message).toBe("Resource not found")
    })

    it("uses statusCode from AppError", async () => {
      const appError = new ValidationError("Invalid input")
      const response = error(appError)

      expect(response.status).toBe(400)
    })
  })

  describe("withErrorHandling", () => {
    it("returns handler result on success", async () => {
      const handler = vi.fn().mockResolvedValue(success({ data: "test" }))
      const wrapped = withErrorHandling(handler)

      const mockRequest = new Request("http://test.com/api")
      const response = await wrapped(mockRequest)

      expect(handler).toHaveBeenCalledWith(mockRequest)
      const body = await response.json()
      expect(body.success).toBe(true)
    })

    it("converts thrown AppError to error response", async () => {
      const handler = vi.fn().mockRejectedValue(new NotFoundError("Not found"))
      const wrapped = withErrorHandling(handler)

      const mockRequest = new Request("http://test.com/api")
      const response = await wrapped(mockRequest)

      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe("NOT_FOUND")
    })

    it("converts unknown errors to AppError", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("Unknown error"))
      const wrapped = withErrorHandling(handler)

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const mockRequest = new Request("http://test.com/api", { method: "POST" })
      const response = await wrapped(mockRequest)

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)

      // Should log non-operational errors
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it("logs non-operational errors", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("Unexpected error"))
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const wrapped = withErrorHandling(handler)

      const mockRequest = new Request("http://test.com/api")
      await wrapped(mockRequest)

      expect(consoleSpy).toHaveBeenCalledWith(
        "[API Error]",
        expect.objectContaining({
          code: "INTERNAL_ERROR",
        })
      )
      consoleSpy.mockRestore()
    })
  })

  describe("actionSuccess", () => {
    it("creates a success result for server actions", () => {
      const data = { id: "123" }
      const result = actionSuccess(data)

      expect(result).toEqual({ success: true, data })
    })
  })

  describe("actionError", () => {
    it("creates an error result from AppError", () => {
      const appError = new ValidationError("Invalid")
      const result = actionError(appError)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR")
      }
    })

    it("converts unknown errors to AppError", () => {
      const result = actionError(new Error("Unknown"))

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("INTERNAL_ERROR")
      }
    })
  })

  describe("withActionErrorHandling", () => {
    it("returns action result on success", async () => {
      const action = vi.fn().mockResolvedValue(actionSuccess({ data: "test" }))
      const wrapped = withActionErrorHandling(action)

      const result = await wrapped("arg1", "arg2")

      expect(action).toHaveBeenCalledWith("arg1", "arg2")
      expect(result.success).toBe(true)
    })

    it("converts thrown errors to error result", async () => {
      const action = vi.fn().mockRejectedValue(new NotFoundError("Not found"))
      const wrapped = withActionErrorHandling(action)

      const result = await wrapped()

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND")
      }
    })

    it("logs non-operational errors", async () => {
      const action = vi.fn().mockRejectedValue(new Error("Unexpected error"))
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const wrapped = withActionErrorHandling(action)

      await wrapped()

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Action Error]",
        expect.objectContaining({
          code: "INTERNAL_ERROR",
        })
      )
      consoleSpy.mockRestore()
    })

    it("preserves function arguments", async () => {
      const action = vi.fn().mockResolvedValue(actionSuccess("done"))
      const wrapped = withActionErrorHandling(action)

      await wrapped("a", 123, { key: "value" })

      expect(action).toHaveBeenCalledWith("a", 123, { key: "value" })
    })
  })
})
