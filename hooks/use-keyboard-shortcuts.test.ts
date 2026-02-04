// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts"

describe("useKeyboardShortcuts", () => {
  const mockHandlers = {
    onTogglePalette: vi.fn(),
    onToggleSidebar: vi.fn(),
    onCloseTopmost: vi.fn(),
    onFocusChatInput: vi.fn(),
    onCollapseArtifact: vi.fn(),
    onExpandArtifact: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Note: jsdom doesn't report as Mac, so we use ctrlKey (Ctrl+K) in tests
  // The hook uses metaKey on Mac, ctrlKey on Windows/Linux

  it("calls onTogglePalette on Ctrl+K", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(mockHandlers.onTogglePalette).toHaveBeenCalledTimes(1)
  })

  it("calls onToggleSidebar on Ctrl+B", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "b",
      ctrlKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(mockHandlers.onToggleSidebar).toHaveBeenCalledTimes(1)
  })

  it("calls onCloseTopmost on Escape", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(mockHandlers.onCloseTopmost).toHaveBeenCalledTimes(1)
  })

  it("calls onFocusChatInput on Ctrl+/", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "/",
      ctrlKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(mockHandlers.onFocusChatInput).toHaveBeenCalledTimes(1)
  })

  it("calls onCollapseArtifact on Ctrl+[", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "[",
      ctrlKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(mockHandlers.onCollapseArtifact).toHaveBeenCalledTimes(1)
  })

  it("calls onExpandArtifact on Ctrl+]", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "]",
      ctrlKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(mockHandlers.onExpandArtifact).toHaveBeenCalledTimes(1)
  })

  it("does not call handlers when typing in input", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()

    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
    })
    Object.defineProperty(event, "target", { value: input })
    document.dispatchEvent(event)

    // Ctrl+K should still work even in input (it's a global shortcut)
    expect(mockHandlers.onTogglePalette).toHaveBeenCalledTimes(1)

    document.body.removeChild(input)
  })

  it("cleans up event listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener")
    const { unmount } = renderHook(() => useKeyboardShortcuts(mockHandlers))

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function)
    )
  })

  it("handles Mac platform detection with userAgentData", () => {
    const originalNavigator = global.navigator
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: { platform: "macOS" },
      },
      configurable: true,
    })

    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(mockHandlers.onTogglePalette).toHaveBeenCalledTimes(1)

    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      configurable: true,
    })
  })
})
