// src/db/helpers/validated-jsonb.test.ts
import { describe, it, expect } from "vitest"
import { validateJsonb, jsonbColumn } from "./validated-jsonb"
import { tokenUsageSchema } from "../types/jsonb-schemas"
import { ValidationError } from "@/lib/errors"

describe("Validated JSONB", () => {
  describe("validateJsonb", () => {
    it("returns parsed data for valid input", () => {
      const data = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        estimatedCost: 0.01,
      }

      const result = validateJsonb(tokenUsageSchema, data, "tokenUsage")
      expect(result).toEqual(data)
    })

    it("throws ValidationError for invalid input", () => {
      const data = { promptTokens: "not a number" }

      expect(() =>
        validateJsonb(tokenUsageSchema, data, "tokenUsage")
      ).toThrow(ValidationError)
    })

    it("includes field path in error details", () => {
      const data = { promptTokens: 100 } // missing required fields

      try {
        validateJsonb(tokenUsageSchema, data, "tokenUsage")
        expect.fail("Should have thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        const ve = error as ValidationError
        expect(ve.details).toBeDefined()
        expect(ve.details?.some((d) => d.field?.includes("tokenUsage"))).toBe(
          true
        )
      }
    })
  })

  describe("jsonbColumn", () => {
    it("creates a column helper with parse method", () => {
      const col = jsonbColumn(tokenUsageSchema, "tokenUsage")

      const data = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        estimatedCost: 0.01,
      }

      expect(col.parse(data)).toEqual(data)
    })

    it("exposes the schema", () => {
      const col = jsonbColumn(tokenUsageSchema, "tokenUsage")
      expect(col.schema).toBe(tokenUsageSchema)
    })
  })
})
