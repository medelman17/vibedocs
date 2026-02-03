import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ArtifactContentType =
  | "document"
  | "analysis"
  | "comparison"
  | "generation"

export interface ArtifactContent {
  type: ArtifactContentType
  id: string
  title: string
}

interface ArtifactState {
  open: boolean
  width: number // percentage 30-60
  expanded: boolean
  content: ArtifactContent | null
}

interface ShellState {
  artifact: ArtifactState
  drawer: { open: boolean }
  palette: { open: boolean }
}

interface ShellActions {
  // Artifact
  openArtifact: (content: ArtifactContent) => void
  closeArtifact: () => void
  setArtifactWidth: (width: number) => void
  toggleArtifactExpanded: () => void

  // Drawer
  toggleDrawer: () => void
  setDrawerOpen: (open: boolean) => void

  // Palette
  togglePalette: () => void
  setPaletteOpen: (open: boolean) => void

  // Global
  closeTopmost: () => void
}

const MIN_ARTIFACT_WIDTH = 30
const MAX_ARTIFACT_WIDTH = 60

export const useShellStore = create<ShellState & ShellActions>()(
  persist(
    (set, get) => ({
      // Initial state
      artifact: {
        open: false,
        width: 50,
        expanded: false,
        content: null,
      },
      drawer: { open: false },
      palette: { open: false },

      // Artifact actions
      openArtifact: (content) =>
        set((state) => ({
          artifact: { ...state.artifact, open: true, content },
        })),

      closeArtifact: () =>
        set((state) => ({
          artifact: { ...state.artifact, open: false, content: null },
        })),

      setArtifactWidth: (width) =>
        set((state) => ({
          artifact: {
            ...state.artifact,
            width: Math.min(
              MAX_ARTIFACT_WIDTH,
              Math.max(MIN_ARTIFACT_WIDTH, width)
            ),
          },
        })),

      toggleArtifactExpanded: () =>
        set((state) => ({
          artifact: { ...state.artifact, expanded: !state.artifact.expanded },
        })),

      // Drawer actions
      toggleDrawer: () =>
        set((state) => ({
          drawer: { open: !state.drawer.open },
        })),

      setDrawerOpen: (open) => set({ drawer: { open } }),

      // Palette actions
      togglePalette: () =>
        set((state) => ({
          palette: { open: !state.palette.open },
        })),

      setPaletteOpen: (open) => set({ palette: { open } }),

      // Close topmost overlay (palette -> drawer -> artifact)
      closeTopmost: () => {
        const state = get()
        if (state.palette.open) {
          set({ palette: { open: false } })
        } else if (state.drawer.open) {
          set({ drawer: { open: false } })
        } else if (state.artifact.open) {
          set((s) => ({
            artifact: { ...s.artifact, open: false, content: null },
          }))
        }
      },
    }),
    {
      name: "vibedocs-shell",
      partialize: (state) => ({
        artifact: { width: state.artifact.width },
      }),
    }
  )
)
