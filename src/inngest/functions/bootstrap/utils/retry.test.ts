import { describe, it, expect, vi } from "vitest"

describe("retry utility", () => {
  it("returns result on first success", async () => {
    const { withRetry } = await import("./retry.js")
    const fn = vi.fn().mockResolvedValue("success")

    const result = await withRetry(fn, { maxAttempts: 3 })

    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries on failure and succeeds", async () => {
    const { withRetry } = await import("./retry.js")
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success")

    const result = await withRetry(fn, {
      maxAttempts: 3,
      backoff: [10, 20, 40],
    })

    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("throws after max attempts", async () => {
    const { withRetry } = await import("./retry.js")
    const fn = vi.fn().mockRejectedValue(new Error("always fails"))

    await expect(
      withRetry(fn, { maxAttempts: 3, backoff: [10, 20, 40] })
    ).rejects.toThrow("always fails")

    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("does not retry non-retriable errors", async () => {
    const { withRetry, NonRetriableError } = await import("./retry.js")
    const fn = vi.fn().mockRejectedValue(new NonRetriableError("bad input"))

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow("bad input")

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("calls onRetry callback", async () => {
    const { withRetry } = await import("./retry.js")
    const onRetry = vi.fn()
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("success")

    await withRetry(fn, {
      maxAttempts: 3,
      backoff: [10],
      onRetry,
    })

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1)
  })
})
