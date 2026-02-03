// src/lib/result.test.ts
import { describe, it, expect } from "vitest"
import { Ok, Err, map, flatMap, unwrap, unwrapOr, tryCatch } from "./result"

describe("Result Type", () => {
  describe("Ok", () => {
    it("creates a success result", () => {
      const result = Ok(42)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(42)
      }
    })
  })

  describe("Err", () => {
    it("creates a failure result", () => {
      const result = Err(new Error("failed"))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe("failed")
      }
    })
  })

  describe("map", () => {
    it("transforms success value", () => {
      const result = map(Ok(2), (x) => x * 3)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(6)
      }
    })

    it("passes through error", () => {
      const error = new Error("fail")
      const result = map(Err(error), (x: number) => x * 3)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe(error)
      }
    })
  })

  describe("flatMap", () => {
    it("chains successful operations", () => {
      const result = flatMap(Ok(2), (x) => Ok(x * 3))
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(6)
      }
    })

    it("short-circuits on first error", () => {
      const error = new Error("first")
      const result = flatMap(Err(error), () => Ok(42))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe(error)
      }
    })

    it("propagates error from chain", () => {
      const error = new Error("chain")
      const result = flatMap(Ok(2), () => Err(error))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe(error)
      }
    })
  })

  describe("unwrap", () => {
    it("returns value for Ok", () => {
      expect(unwrap(Ok(42))).toBe(42)
    })

    it("throws for Err", () => {
      expect(() => unwrap(Err(new Error("fail")))).toThrow("fail")
    })
  })

  describe("unwrapOr", () => {
    it("returns value for Ok", () => {
      expect(unwrapOr(Ok(42), 0)).toBe(42)
    })

    it("returns default for Err", () => {
      expect(unwrapOr(Err(new Error("fail")), 0)).toBe(0)
    })
  })

  describe("tryCatch", () => {
    it("wraps successful async function", async () => {
      const result = await tryCatch(async () => 42)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(42)
      }
    })

    it("wraps throwing async function", async () => {
      const result = await tryCatch(async () => {
        throw new Error("async fail")
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe("async fail")
      }
    })

    it("converts non-Error throws to Error", async () => {
      const result = await tryCatch(async () => {
        throw "string error"
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(Error)
        expect(result.error.message).toBe("string error")
      }
    })
  })
})
