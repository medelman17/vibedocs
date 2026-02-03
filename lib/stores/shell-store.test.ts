import { describe, it, expect, beforeEach } from "vitest"
import { useShellStore } from "./shell-store"

describe("shell-store", () => {
  beforeEach(() => {
    useShellStore.setState({
      artifact: { open: false, width: 50, expanded: false, content: null },
      drawer: { open: false },
      palette: { open: false },
    })
  })

  describe("artifact panel", () => {
    it("opens artifact with content", () => {
      const store = useShellStore.getState()
      store.openArtifact({ type: "document", id: "doc-1", title: "Test Doc" })

      const state = useShellStore.getState()
      expect(state.artifact.open).toBe(true)
      expect(state.artifact.content?.type).toBe("document")
    })

    it("closes artifact and clears content", () => {
      useShellStore.setState({
        artifact: {
          open: true,
          width: 50,
          expanded: false,
          content: { type: "document", id: "doc-1", title: "Test" },
        },
        drawer: { open: false },
        palette: { open: false },
      })

      useShellStore.getState().closeArtifact()

      const state = useShellStore.getState()
      expect(state.artifact.open).toBe(false)
      expect(state.artifact.content).toBeNull()
    })

    it("resizes artifact within bounds", () => {
      useShellStore.getState().setArtifactWidth(70)
      expect(useShellStore.getState().artifact.width).toBe(60) // clamped to max

      useShellStore.getState().setArtifactWidth(20)
      expect(useShellStore.getState().artifact.width).toBe(30) // clamped to min
    })

    it("toggles expanded mode", () => {
      useShellStore.getState().toggleArtifactExpanded()
      expect(useShellStore.getState().artifact.expanded).toBe(true)

      useShellStore.getState().toggleArtifactExpanded()
      expect(useShellStore.getState().artifact.expanded).toBe(false)
    })
  })

  describe("drawer", () => {
    it("toggles drawer", () => {
      useShellStore.getState().toggleDrawer()
      expect(useShellStore.getState().drawer.open).toBe(true)

      useShellStore.getState().toggleDrawer()
      expect(useShellStore.getState().drawer.open).toBe(false)
    })
  })

  describe("palette", () => {
    it("toggles palette", () => {
      useShellStore.getState().togglePalette()
      expect(useShellStore.getState().palette.open).toBe(true)

      useShellStore.getState().togglePalette()
      expect(useShellStore.getState().palette.open).toBe(false)
    })
  })

  describe("closeTopmost", () => {
    it("closes palette first if open", () => {
      useShellStore.setState({
        artifact: { open: true, width: 50, expanded: false, content: null },
        drawer: { open: true },
        palette: { open: true },
      })

      useShellStore.getState().closeTopmost()

      const state = useShellStore.getState()
      expect(state.palette.open).toBe(false)
      expect(state.drawer.open).toBe(true)
      expect(state.artifact.open).toBe(true)
    })

    it("closes drawer second if palette closed", () => {
      useShellStore.setState({
        artifact: { open: true, width: 50, expanded: false, content: null },
        drawer: { open: true },
        palette: { open: false },
      })

      useShellStore.getState().closeTopmost()

      const state = useShellStore.getState()
      expect(state.drawer.open).toBe(false)
      expect(state.artifact.open).toBe(true)
    })

    it("closes artifact last", () => {
      useShellStore.setState({
        artifact: { open: true, width: 50, expanded: false, content: null },
        drawer: { open: false },
        palette: { open: false },
      })

      useShellStore.getState().closeTopmost()

      expect(useShellStore.getState().artifact.open).toBe(false)
    })
  })
})
