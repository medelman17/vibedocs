// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useAnalysisProgress } from "./use-analysis-progress"

// Mock the server action
const mockGetAnalysisStatus = vi.fn()
vi.mock("@/app/(main)/(dashboard)/analyses/actions", () => ({
  getAnalysisStatus: (...args: unknown[]) => mockGetAnalysisStatus(...args),
}))

describe("useAnalysisProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns initial loading state", async () => {
    mockGetAnalysisStatus.mockResolvedValue({
      success: true,
      data: { status: "pending", progress: { step: "Queued...", percent: 0 } },
    })

    const { result } = renderHook(() => useAnalysisProgress("analysis-123"))

    // Initially loading
    expect(result.current.isLoading).toBe(true)
    expect(result.current.status).toBe("pending")

    // After fetch completes
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it("updates state after fetching", async () => {
    mockGetAnalysisStatus.mockResolvedValue({
      success: true,
      data: {
        status: "processing",
        progress: { step: "Parsing...", percent: 20 },
      },
    })

    const { result } = renderHook(() => useAnalysisProgress("analysis-123"))

    await waitFor(() => {
      expect(result.current.status).toBe("processing")
      expect(result.current.progress).toBe(20)
      expect(result.current.stage).toBe("Parsing...")
    })
  })

  it("handles completed status", async () => {
    mockGetAnalysisStatus.mockResolvedValue({
      success: true,
      data: { status: "completed", progress: { step: "Complete", percent: 100 } },
    })

    const { result } = renderHook(() => useAnalysisProgress("analysis-123"))

    await waitFor(() => {
      expect(result.current.status).toBe("completed")
      expect(result.current.progress).toBe(100)
    })
  })

  it("returns default state when analysisId is null", () => {
    const { result } = renderHook(() => useAnalysisProgress(null))

    expect(result.current.status).toBe("pending")
    expect(result.current.isLoading).toBe(false)
    expect(result.current.progress).toBe(0)
    expect(mockGetAnalysisStatus).not.toHaveBeenCalled()
  })

  it("handles error responses", async () => {
    mockGetAnalysisStatus.mockResolvedValue({
      success: false,
      error: { code: "NOT_FOUND", message: "Analysis not found" },
    })

    const { result } = renderHook(() => useAnalysisProgress("analysis-123"))

    await waitFor(() => {
      expect(result.current.error).toBe("Analysis not found")
      expect(result.current.isLoading).toBe(false)
    })
  })
})
