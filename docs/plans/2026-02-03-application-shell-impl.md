# Application Shell Implementation Plan

> **Status:** ⚠️ PARTIAL (audited 2026-02-04)
>
> Foundation implemented. Custom components replaced with ai-elements library (pragmatic decision).

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the chat-first application shell with resizable artifact panel, history drawer, and command palette.

**Architecture:** Zustand store manages shell state (panel visibility, sizes). React context provides shell actions to children. Components use shadcn primitives (Sheet, Dialog, Command) with custom glass styling. Motion/react handles animations.

**Tech Stack:** React 19, Next.js 16, Zustand, shadcn/ui, motion/react, cmdk, Tailwind CSS v4

---

## Phase 1: Shell Foundation

### Task 1: Create Shell Store (Zustand)

**Files:**
- Create: `lib/stores/shell-store.ts`
- Test: `lib/stores/shell-store.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/stores/shell-store.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm test lib/stores/shell-store.test.ts`
Expected: FAIL with "Cannot find module './shell-store'"

**Step 3: Write minimal implementation**

```typescript
// lib/stores/shell-store.ts
import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ArtifactContentType = "document" | "analysis" | "comparison" | "generation"

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
            width: Math.min(MAX_ARTIFACT_WIDTH, Math.max(MIN_ARTIFACT_WIDTH, width)),
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

      // Close topmost overlay (palette → drawer → artifact)
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
```

**Step 4: Run test to verify it passes**

Run: `pnpm test lib/stores/shell-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/stores/shell-store.ts lib/stores/shell-store.test.ts
git commit -m "feat(shell): add zustand store for shell state management"
```

---

### Task 2: Create useKeyboardShortcuts Hook

**Files:**
- Create: `hooks/use-keyboard-shortcuts.ts`
- Test: `hooks/use-keyboard-shortcuts.test.ts`

**Step 1: Write the failing test**

```typescript
// hooks/use-keyboard-shortcuts.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts"

describe("useKeyboardShortcuts", () => {
  const mockHandlers = {
    onTogglePalette: vi.fn(),
    onToggleDrawer: vi.fn(),
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

  it("calls onTogglePalette on Cmd+K", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(mockHandlers.onTogglePalette).toHaveBeenCalledTimes(1)
  })

  it("calls onToggleDrawer on Cmd+B", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "b",
      metaKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(mockHandlers.onToggleDrawer).toHaveBeenCalledTimes(1)
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

  it("calls onFocusChatInput on Cmd+/", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "/",
      metaKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(mockHandlers.onFocusChatInput).toHaveBeenCalledTimes(1)
  })

  it("calls onCollapseArtifact on Cmd+[", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "[",
      metaKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)

    expect(mockHandlers.onCollapseArtifact).toHaveBeenCalledTimes(1)
  })

  it("calls onExpandArtifact on Cmd+]", () => {
    renderHook(() => useKeyboardShortcuts(mockHandlers))

    const event = new KeyboardEvent("keydown", {
      key: "]",
      metaKey: true,
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
      metaKey: true,
      bubbles: true,
    })
    Object.defineProperty(event, "target", { value: input })
    document.dispatchEvent(event)

    // Cmd+K should still work even in input (it's a global shortcut)
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
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test hooks/use-keyboard-shortcuts.test.ts`
Expected: FAIL with "Cannot find module './use-keyboard-shortcuts'"

**Step 3: Write minimal implementation**

```typescript
// hooks/use-keyboard-shortcuts.ts
import { useEffect, useCallback } from "react"

interface KeyboardShortcutHandlers {
  onTogglePalette: () => void
  onToggleDrawer: () => void
  onCloseTopmost: () => void
  onFocusChatInput: () => void
  onCollapseArtifact: () => void
  onExpandArtifact: () => void
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0
      const modifier = isMac ? event.metaKey : event.ctrlKey

      // Cmd/Ctrl + K: Toggle command palette
      if (modifier && event.key === "k") {
        event.preventDefault()
        handlers.onTogglePalette()
        return
      }

      // Cmd/Ctrl + B: Toggle history drawer
      if (modifier && event.key === "b") {
        event.preventDefault()
        handlers.onToggleDrawer()
        return
      }

      // Cmd/Ctrl + /: Focus chat input
      if (modifier && event.key === "/") {
        event.preventDefault()
        handlers.onFocusChatInput()
        return
      }

      // Cmd/Ctrl + [: Collapse artifact
      if (modifier && event.key === "[") {
        event.preventDefault()
        handlers.onCollapseArtifact()
        return
      }

      // Cmd/Ctrl + ]: Expand artifact
      if (modifier && event.key === "]") {
        event.preventDefault()
        handlers.onExpandArtifact()
        return
      }

      // Escape: Close topmost overlay
      if (event.key === "Escape") {
        event.preventDefault()
        handlers.onCloseTopmost()
        return
      }
    },
    [handlers]
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test hooks/use-keyboard-shortcuts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add hooks/use-keyboard-shortcuts.ts hooks/use-keyboard-shortcuts.test.ts
git commit -m "feat(shell): add keyboard shortcuts hook"
```

---

### Task 3: Create AppShell Component

**Files:**
- Create: `components/shell/app-shell.tsx`
- Create: `components/shell/index.ts`

**Step 1: Create the component**

```typescript
// components/shell/app-shell.tsx
"use client"

import * as React from "react"
import { useShellStore } from "@/lib/stores/shell-store"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { cn } from "@/lib/utils"

interface AppShellProps {
  children: React.ReactNode
  header: React.ReactNode
  drawer?: React.ReactNode
  palette?: React.ReactNode
}

export function AppShell({ children, header, drawer, palette }: AppShellProps) {
  const chatInputRef = React.useRef<HTMLTextAreaElement>(null)

  const {
    togglePalette,
    toggleDrawer,
    closeTopmost,
    closeArtifact,
    toggleArtifactExpanded,
    artifact,
  } = useShellStore()

  useKeyboardShortcuts({
    onTogglePalette: togglePalette,
    onToggleDrawer: toggleDrawer,
    onCloseTopmost: closeTopmost,
    onFocusChatInput: () => chatInputRef.current?.focus(),
    onCollapseArtifact: () => {
      if (artifact.open) closeArtifact()
    },
    onExpandArtifact: () => {
      if (artifact.open) toggleArtifactExpanded()
    },
  })

  return (
    <div
      data-slot="app-shell"
      className={cn(
        "flex h-dvh flex-col overflow-hidden",
        "bg-gradient-to-br from-neutral-50 to-neutral-100"
      )}
    >
      {/* Header */}
      <div data-slot="app-shell-header">{header}</div>

      {/* Body */}
      <div data-slot="app-shell-body" className="relative flex flex-1 overflow-hidden">
        {children}
      </div>

      {/* Overlays */}
      {drawer}
      {palette}
    </div>
  )
}

// Export ref for chat input focus
export const ChatInputRefContext = React.createContext<
  React.RefObject<HTMLTextAreaElement> | null
>(null)

export function useChatInputRef() {
  const ref = React.useContext(ChatInputRefContext)
  if (!ref) {
    throw new Error("useChatInputRef must be used within AppShell")
  }
  return ref
}
```

**Step 2: Create barrel export**

```typescript
// components/shell/index.ts
export { AppShell, ChatInputRefContext, useChatInputRef } from "./app-shell"
```

**Step 3: Run lint to verify no errors**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/shell/app-shell.tsx components/shell/index.ts
git commit -m "feat(shell): add AppShell component with keyboard shortcuts"
```

---

### Task 4: Create AppHeader Component

**Files:**
- Create: `components/shell/app-header.tsx`
- Modify: `components/shell/index.ts`

**Step 1: Create the component**

```typescript
// components/shell/app-header.tsx
"use client"

import * as React from "react"
import { MenuIcon, SearchIcon } from "lucide-react"
import { useShellStore } from "@/lib/stores/shell-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface AppHeaderProps {
  logo?: React.ReactNode
  orgSwitcher?: React.ReactNode
  userMenu?: React.ReactNode
}

export function AppHeader({ logo, orgSwitcher, userMenu }: AppHeaderProps) {
  const { toggleDrawer, togglePalette } = useShellStore()

  return (
    <header
      data-slot="app-header"
      className={cn(
        "flex h-12 shrink-0 items-center justify-between gap-4 px-4",
        "border-b border-neutral-200/50",
        "bg-white/70 backdrop-blur-xl",
        "supports-[backdrop-filter]:bg-white/70"
      )}
    >
      {/* Left cluster */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={toggleDrawer}
          aria-label="Toggle history drawer"
        >
          <MenuIcon className="size-4" />
        </Button>

        {logo ?? (
          <span className="text-sm font-semibold tracking-wide text-neutral-900">
            VibeDocs
          </span>
        )}
      </div>

      {/* Center - Command palette trigger */}
      <button
        onClick={togglePalette}
        className={cn(
          "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg",
          "text-sm text-neutral-500",
          "bg-neutral-100/50 hover:bg-neutral-100",
          "border border-neutral-200/50",
          "transition-colors"
        )}
      >
        <SearchIcon className="size-3.5" />
        <span>Search...</span>
        <kbd className="ml-2 text-xs text-neutral-400 font-mono">⌘K</kbd>
      </button>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        {orgSwitcher}
        {userMenu}
      </div>
    </header>
  )
}
```

**Step 2: Update barrel export**

```typescript
// components/shell/index.ts
export { AppShell, ChatInputRefContext, useChatInputRef } from "./app-shell"
export { AppHeader } from "./app-header"
```

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/shell/app-header.tsx components/shell/index.ts
git commit -m "feat(shell): add AppHeader with glass styling"
```

---

### Task 5: Create AppBody Component with Resizable Panels

**Files:**
- Create: `components/shell/app-body.tsx`
- Modify: `components/shell/index.ts`

**Step 1: Create the component**

```typescript
// components/shell/app-body.tsx
"use client"

import * as React from "react"
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels"
import { useShellStore } from "@/lib/stores/shell-store"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent } from "@/components/ui/sheet"

interface AppBodyProps {
  chat: React.ReactNode
  artifact?: React.ReactNode
}

export function AppBody({ chat, artifact }: AppBodyProps) {
  const isMobile = useIsMobile()
  const { artifact: artifactState, setArtifactWidth, closeArtifact } = useShellStore()

  // On mobile, artifact is a sheet
  if (isMobile) {
    return (
      <>
        <main className="flex-1 overflow-hidden">{chat}</main>
        <Sheet open={artifactState.open} onOpenChange={(open) => !open && closeArtifact()}>
          <SheetContent side="bottom" className="h-[90dvh] p-0">
            {artifact}
          </SheetContent>
        </Sheet>
      </>
    )
  }

  // Desktop: resizable panels
  if (!artifactState.open) {
    return <main className="flex-1 overflow-hidden">{chat}</main>
  }

  return (
    <PanelGroup
      direction="horizontal"
      onLayout={(sizes) => {
        if (sizes[1]) {
          setArtifactWidth(sizes[1])
        }
      }}
    >
      <Panel
        defaultSize={100 - artifactState.width}
        minSize={40}
        className="overflow-hidden"
      >
        <main className="h-full overflow-hidden">{chat}</main>
      </Panel>

      <PanelResizeHandle
        className={cn(
          "w-1 bg-neutral-200/50 hover:bg-violet-300 transition-colors",
          "data-[resize-handle-active]:bg-violet-500"
        )}
      />

      <Panel
        defaultSize={artifactState.width}
        minSize={30}
        maxSize={60}
        className="overflow-hidden"
      >
        <aside
          className={cn(
            "h-full overflow-hidden",
            "bg-neutral-50/90 backdrop-blur-md",
            "border-l border-neutral-200/50"
          )}
        >
          {artifact}
        </aside>
      </Panel>
    </PanelGroup>
  )
}
```

**Step 2: Update barrel export**

```typescript
// components/shell/index.ts
export { AppShell, ChatInputRefContext, useChatInputRef } from "./app-shell"
export { AppHeader } from "./app-header"
export { AppBody } from "./app-body"
```

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/shell/app-body.tsx components/shell/index.ts
git commit -m "feat(shell): add AppBody with resizable panels and mobile sheet"
```

---

## Phase 2: Navigation Components

### Task 6: Create HistoryDrawer Component

**Files:**
- Create: `components/navigation/history-drawer.tsx`
- Create: `components/navigation/index.ts`

**Step 1: Create the component**

```typescript
// components/navigation/history-drawer.tsx
"use client"

import * as React from "react"
import { XIcon, SearchIcon, FileTextIcon, BarChartIcon, MessageSquareIcon } from "lucide-react"
import { useShellStore } from "@/lib/stores/shell-store"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

interface HistoryItem {
  id: string
  type: "conversation" | "document" | "analysis"
  title: string
  date: Date
  pinned?: boolean
}

interface HistoryDrawerProps {
  items?: HistoryItem[]
  onSelectItem?: (item: HistoryItem) => void
}

export function HistoryDrawer({ items = [], onSelectItem }: HistoryDrawerProps) {
  const { drawer, setDrawerOpen } = useShellStore()
  const [search, setSearch] = React.useState("")

  const filteredItems = React.useMemo(() => {
    if (!search) return items
    const lower = search.toLowerCase()
    return items.filter((item) => item.title.toLowerCase().includes(lower))
  }, [items, search])

  const groupedItems = React.useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

    const groups: { label: string; items: HistoryItem[] }[] = [
      { label: "Pinned", items: [] },
      { label: "Today", items: [] },
      { label: "Yesterday", items: [] },
      { label: "This Week", items: [] },
      { label: "Older", items: [] },
    ]

    for (const item of filteredItems) {
      if (item.pinned) {
        groups[0].items.push(item)
      } else if (item.date >= today) {
        groups[1].items.push(item)
      } else if (item.date >= yesterday) {
        groups[2].items.push(item)
      } else if (item.date >= weekAgo) {
        groups[3].items.push(item)
      } else {
        groups[4].items.push(item)
      }
    }

    return groups.filter((g) => g.items.length > 0)
  }, [filteredItems])

  const getIcon = (type: HistoryItem["type"]) => {
    switch (type) {
      case "conversation":
        return <MessageSquareIcon className="size-4" />
      case "document":
        return <FileTextIcon className="size-4" />
      case "analysis":
        return <BarChartIcon className="size-4" />
    }
  }

  return (
    <Sheet open={drawer.open} onOpenChange={setDrawerOpen}>
      <SheetContent
        side="left"
        className={cn(
          "w-80 p-0",
          "bg-white/90 backdrop-blur-md",
          "border-r border-neutral-200/50"
        )}
        showCloseButton={false}
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b border-neutral-200/50 px-4 py-3">
          <SheetTitle className="text-base font-semibold">History</SheetTitle>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setDrawerOpen(false)}
          >
            <XIcon className="size-4" />
          </Button>
        </SheetHeader>

        <div className="p-3">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-3">
          {groupedItems.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="mb-1 px-2 text-xs font-medium text-neutral-500">
                {group.label}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectItem?.(item)
                    setDrawerOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5",
                    "text-sm text-neutral-700 text-left",
                    "hover:bg-neutral-100 transition-colors"
                  )}
                >
                  <span className="text-neutral-400">{getIcon(item.type)}</span>
                  <span className="truncate">{item.title}</span>
                </button>
              ))}
            </div>
          ))}

          {groupedItems.length === 0 && (
            <div className="py-8 text-center text-sm text-neutral-500">
              {search ? "No results found" : "No history yet"}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
```

**Step 2: Create barrel export**

```typescript
// components/navigation/index.ts
export { HistoryDrawer } from "./history-drawer"
export type { HistoryItem } from "./history-drawer"
```

Wait, we need to export the type. Update the history-drawer to export the type:

```typescript
// Add to components/navigation/history-drawer.tsx (at the export)
export type { HistoryItem }
```

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/navigation/history-drawer.tsx components/navigation/index.ts
git commit -m "feat(navigation): add HistoryDrawer with search and grouping"
```

---

### Task 7: Create CommandPalette Component

**Files:**
- Create: `components/navigation/command-palette.tsx`
- Modify: `components/navigation/index.ts`

**Step 1: Create the component**

```typescript
// components/navigation/command-palette.tsx
"use client"

import * as React from "react"
import {
  FileTextIcon,
  BarChartIcon,
  GitCompareIcon,
  PlusIcon,
  HelpCircleIcon,
} from "lucide-react"
import { useShellStore } from "@/lib/stores/shell-store"
import { cn } from "@/lib/utils"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

interface CommandItem {
  id: string
  type: "command" | "document" | "analysis" | "conversation"
  title: string
  description?: string
  icon?: React.ReactNode
  action?: () => void
}

interface CommandPaletteProps {
  recentItems?: CommandItem[]
  onSelectItem?: (item: CommandItem) => void
  onCommand?: (command: string) => void
}

const defaultCommands: CommandItem[] = [
  {
    id: "analyze",
    type: "command",
    title: "/analyze",
    description: "Start new analysis",
    icon: <BarChartIcon className="size-4" />,
  },
  {
    id: "compare",
    type: "command",
    title: "/compare",
    description: "Compare documents",
    icon: <GitCompareIcon className="size-4" />,
  },
  {
    id: "generate",
    type: "command",
    title: "/generate",
    description: "Create new NDA",
    icon: <PlusIcon className="size-4" />,
  },
  {
    id: "help",
    type: "command",
    title: "/help",
    description: "Show help",
    icon: <HelpCircleIcon className="size-4" />,
  },
]

export function CommandPalette({
  recentItems = [],
  onSelectItem,
  onCommand,
}: CommandPaletteProps) {
  const { palette, setPaletteOpen } = useShellStore()

  const handleSelect = (item: CommandItem) => {
    setPaletteOpen(false)
    if (item.type === "command") {
      onCommand?.(item.id)
    } else {
      onSelectItem?.(item)
    }
    item.action?.()
  }

  const getIcon = (item: CommandItem) => {
    if (item.icon) return item.icon
    switch (item.type) {
      case "document":
        return <FileTextIcon className="size-4" />
      case "analysis":
        return <BarChartIcon className="size-4" />
      default:
        return null
    }
  }

  return (
    <CommandDialog open={palette.open} onOpenChange={setPaletteOpen}>
      <CommandInput placeholder="Search commands and documents..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {recentItems.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentItems.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => handleSelect(item)}
                  className="gap-2"
                >
                  <span className="text-neutral-400">{getIcon(item)}</span>
                  <span>{item.title}</span>
                  {item.description && (
                    <span className="ml-auto text-xs text-neutral-400">
                      {item.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Commands">
          {defaultCommands.map((item) => (
            <CommandItem
              key={item.id}
              onSelect={() => handleSelect(item)}
              className="gap-2"
            >
              <span className="text-neutral-400">{item.icon}</span>
              <span className="font-mono text-sm">{item.title}</span>
              <span className="ml-2 text-neutral-500">{item.description}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

**Step 2: Update barrel export**

```typescript
// components/navigation/index.ts
export { HistoryDrawer, type HistoryItem } from "./history-drawer"
export { CommandPalette } from "./command-palette"
```

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/navigation/command-palette.tsx components/navigation/index.ts
git commit -m "feat(navigation): add CommandPalette with fuzzy search"
```

---

## Phase 3: Chat Components

### Task 8: Create ChatPane Container

**Files:**
- Create: `components/chat/chat-pane.tsx`
- Create: `components/chat/index.ts`

**Step 1: Create the component**

```typescript
// components/chat/chat-pane.tsx
"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ChatPaneProps {
  children: React.ReactNode
  className?: string
}

export function ChatPane({ children, className }: ChatPaneProps) {
  return (
    <div
      data-slot="chat-pane"
      className={cn("flex h-full flex-col", className)}
    >
      {children}
    </div>
  )
}

interface ChatMessagesProps {
  children: React.ReactNode
  className?: string
}

export function ChatMessages({ children, className }: ChatMessagesProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = React.useState(false)

  const scrollToBottom = React.useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [])

  const handleScroll = React.useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    setShowScrollButton(!isNearBottom)
  }, [])

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "h-full overflow-y-auto px-4 py-6",
          className
        )}
      >
        <div className="mx-auto max-w-[720px]">{children}</div>
      </div>

      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className={cn(
            "absolute bottom-4 left-1/2 -translate-x-1/2",
            "flex items-center gap-1 rounded-full px-3 py-1.5",
            "bg-white/90 backdrop-blur-sm shadow-md border border-neutral-200",
            "text-xs text-neutral-600 hover:bg-white",
            "transition-all"
          )}
        >
          <span>↓</span>
          <span>New messages</span>
        </button>
      )}
    </div>
  )
}

interface ChatInputAreaProps {
  children: React.ReactNode
  className?: string
}

export function ChatInputArea({ children, className }: ChatInputAreaProps) {
  return (
    <div
      data-slot="chat-input-area"
      className={cn(
        "shrink-0 border-t border-neutral-200/50",
        "bg-white/70 backdrop-blur-xl p-4",
        className
      )}
    >
      <div className="mx-auto max-w-[720px]">{children}</div>
    </div>
  )
}
```

**Step 2: Create barrel export**

```typescript
// components/chat/index.ts
export { ChatPane, ChatMessages, ChatInputArea } from "./chat-pane"
```

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/chat/chat-pane.tsx components/chat/index.ts
git commit -m "feat(chat): add ChatPane container components"
```

---

### Task 9: Create Message Component

**Files:**
- Create: `components/chat/message.tsx`
- Modify: `components/chat/index.ts`

**Step 1: Create the component**

```typescript
// components/chat/message.tsx
"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export interface MessageProps {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp?: Date
  avatar?: string
  userName?: string
}

export function Message({
  role,
  content,
  timestamp,
  avatar,
  userName,
}: MessageProps) {
  const [showTimestamp, setShowTimestamp] = React.useState(false)

  const isUser = role === "user"

  return (
    <div
      className={cn(
        "group flex gap-3 py-2",
        isUser && "flex-row-reverse"
      )}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={avatar} />
        <AvatarFallback className={cn(isUser ? "bg-violet-100" : "bg-neutral-100")}>
          {isUser ? (userName?.[0] ?? "U") : "V"}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "relative max-w-[80%] rounded-2xl px-4 py-2.5",
          isUser
            ? "bg-violet-50 text-neutral-900"
            : "bg-neutral-50 border border-neutral-200/50 text-neutral-900"
        )}
      >
        <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
          {content}
        </div>

        {timestamp && showTimestamp && (
          <div
            className={cn(
              "absolute -bottom-5 text-[10px] text-neutral-400",
              isUser ? "right-0" : "left-0"
            )}
          >
            {timestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Update barrel export**

```typescript
// components/chat/index.ts
export { ChatPane, ChatMessages, ChatInputArea } from "./chat-pane"
export { Message, type MessageProps } from "./message"
```

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/chat/message.tsx components/chat/index.ts
git commit -m "feat(chat): add Message component with user/assistant styling"
```

---

### Task 10: Create ChatInput Component

**Files:**
- Create: `components/chat/chat-input.tsx`
- Modify: `components/chat/index.ts`

**Step 1: Create the component**

```typescript
// components/chat/chat-input.tsx
"use client"

import * as React from "react"
import { PaperclipIcon, SendIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface ChatInputProps {
  onSend?: (message: string) => void
  onAttach?: () => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(
  function ChatInput(
    { onSend, onAttach, placeholder = "Type a message...", disabled, className },
    ref
  ) {
    const [value, setValue] = React.useState("")
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)

    // Merge refs
    React.useImperativeHandle(ref, () => textareaRef.current!)

    const handleSend = React.useCallback(() => {
      if (!value.trim() || disabled) return
      onSend?.(value.trim())
      setValue("")
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
      }
    }, [value, disabled, onSend])

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          handleSend()
        }
      },
      [handleSend]
    )

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value)
        // Auto-resize
        const textarea = e.target
        textarea.style.height = "auto"
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
      },
      []
    )

    return (
      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border border-neutral-200/50",
          "bg-white/80 backdrop-blur-sm p-2",
          "focus-within:ring-2 focus-within:ring-violet-500/20",
          className
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={onAttach}
          disabled={disabled}
        >
          <PaperclipIcon className="size-4" />
          <span className="sr-only">Attach file</span>
        </Button>

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            "min-h-[36px] max-h-[120px] flex-1 resize-none border-0 bg-transparent",
            "text-[15px] leading-relaxed",
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            "placeholder:text-neutral-400"
          )}
        />

        <Button
          type="button"
          size="icon"
          className={cn(
            "size-8 shrink-0 rounded-xl",
            "bg-violet-500 hover:bg-violet-600",
            "disabled:opacity-50"
          )}
          onClick={handleSend}
          disabled={disabled || !value.trim()}
        >
          <SendIcon className="size-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    )
  }
)
```

**Step 2: Update barrel export**

```typescript
// components/chat/index.ts
export { ChatPane, ChatMessages, ChatInputArea } from "./chat-pane"
export { Message, type MessageProps } from "./message"
export { ChatInput } from "./chat-input"
```

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/chat/chat-input.tsx components/chat/index.ts
git commit -m "feat(chat): add ChatInput with auto-resize and keyboard handling"
```

---

### Task 11: Create SuggestionChips Component

**Files:**
- Create: `components/chat/suggestion-chips.tsx`
- Modify: `components/chat/index.ts`

**Step 1: Create the component**

```typescript
// components/chat/suggestion-chips.tsx
"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface Suggestion {
  id: string
  label: string
  action: string
}

interface SuggestionChipsProps {
  suggestions?: Suggestion[]
  onSelect?: (suggestion: Suggestion) => void
  visible?: boolean
  className?: string
}

const defaultSuggestions: Suggestion[] = [
  { id: "analyze", label: "Analyze NDA", action: "/analyze" },
  { id: "compare", label: "Compare", action: "/compare" },
  { id: "generate", label: "Generate", action: "/generate" },
]

export function SuggestionChips({
  suggestions = defaultSuggestions,
  onSelect,
  visible = true,
  className,
}: SuggestionChipsProps) {
  if (!visible || suggestions.length === 0) return null

  return (
    <div
      data-slot="suggestion-chips"
      className={cn(
        "flex flex-wrap items-center justify-center gap-2 pb-3",
        className
      )}
    >
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion.id}
          variant="outline"
          size="sm"
          onClick={() => onSelect?.(suggestion)}
          className={cn(
            "h-8 rounded-full px-4",
            "border-neutral-200/50 bg-white/50",
            "hover:bg-violet-50 hover:border-violet-200",
            "text-sm text-neutral-600 hover:text-violet-700",
            "transition-colors"
          )}
        >
          {suggestion.label}
        </Button>
      ))}
    </div>
  )
}
```

**Step 2: Update barrel export**

```typescript
// components/chat/index.ts
export { ChatPane, ChatMessages, ChatInputArea } from "./chat-pane"
export { Message, type MessageProps } from "./message"
export { ChatInput } from "./chat-input"
export { SuggestionChips } from "./suggestion-chips"
```

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/chat/suggestion-chips.tsx components/chat/index.ts
git commit -m "feat(chat): add SuggestionChips for contextual prompts"
```

---

## Phase 4: Artifact Components

### Task 12: Create ArtifactPane Container

**Files:**
- Create: `components/artifact/artifact-pane.tsx`
- Create: `components/artifact/index.ts`

**Step 1: Create the component**

```typescript
// components/artifact/artifact-pane.tsx
"use client"

import * as React from "react"
import {
  XIcon,
  MaximizeIcon,
  MinimizeIcon,
  MoreVerticalIcon,
} from "lucide-react"
import { useShellStore } from "@/lib/stores/shell-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ArtifactPaneProps {
  children: React.ReactNode
  title?: string
  icon?: React.ReactNode
  footer?: React.ReactNode
  onExport?: () => void
  onCopyLink?: () => void
}

export function ArtifactPane({
  children,
  title,
  icon,
  footer,
  onExport,
  onCopyLink,
}: ArtifactPaneProps) {
  const { artifact, closeArtifact, toggleArtifactExpanded } = useShellStore()

  return (
    <div
      data-slot="artifact-pane"
      className="flex h-full flex-col"
    >
      {/* Header */}
      <div
        className={cn(
          "flex h-10 shrink-0 items-center justify-between gap-2 px-3",
          "border-b border-neutral-200/50"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-neutral-400 shrink-0">{icon}</span>}
          <span className="truncate text-sm font-medium text-neutral-700">
            {title ?? artifact.content?.title ?? "Artifact"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={toggleArtifactExpanded}
            aria-label={artifact.expanded ? "Minimize" : "Maximize"}
          >
            {artifact.expanded ? (
              <MinimizeIcon className="size-3.5" />
            ) : (
              <MaximizeIcon className="size-3.5" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreVerticalIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onCopyLink && (
                <DropdownMenuItem onClick={onCopyLink}>
                  Copy link
                </DropdownMenuItem>
              )}
              {onExport && (
                <DropdownMenuItem onClick={onExport}>
                  Export
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={closeArtifact}
            aria-label="Close"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">{children}</div>

      {/* Footer */}
      {footer && (
        <div
          className={cn(
            "shrink-0 border-t border-neutral-200/50 px-3 py-2",
            "bg-neutral-50/50"
          )}
        >
          {footer}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Create barrel export**

```typescript
// components/artifact/index.ts
export { ArtifactPane } from "./artifact-pane"
```

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/artifact/artifact-pane.tsx components/artifact/index.ts
git commit -m "feat(artifact): add ArtifactPane container with header actions"
```

---

### Task 13: Create Placeholder Artifact Content Components

**Files:**
- Create: `components/artifact/document-viewer.tsx`
- Create: `components/artifact/analysis-view.tsx`
- Modify: `components/artifact/index.ts`

**Step 1: Create DocumentViewer placeholder**

```typescript
// components/artifact/document-viewer.tsx
"use client"

import * as React from "react"
import { FileTextIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocumentViewerProps {
  documentId: string
  className?: string
}

export function DocumentViewer({ documentId, className }: DocumentViewerProps) {
  // Placeholder - will be implemented with actual document rendering
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center p-8",
        "text-center",
        className
      )}
    >
      <div className="mb-4 rounded-full bg-neutral-100 p-4">
        <FileTextIcon className="size-8 text-neutral-400" />
      </div>
      <h3 className="mb-2 text-lg font-medium text-neutral-900">
        Document Viewer
      </h3>
      <p className="text-sm text-neutral-500">
        Document preview will appear here
      </p>
      <p className="mt-2 text-xs text-neutral-400 font-mono">
        ID: {documentId}
      </p>
    </div>
  )
}
```

**Step 2: Create AnalysisView placeholder**

```typescript
// components/artifact/analysis-view.tsx
"use client"

import * as React from "react"
import { BarChartIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface AnalysisViewProps {
  analysisId: string
  className?: string
}

export function AnalysisView({ analysisId, className }: AnalysisViewProps) {
  // Placeholder - will be implemented with actual analysis rendering
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center p-8",
        "text-center",
        className
      )}
    >
      <div className="mb-4 rounded-full bg-neutral-100 p-4">
        <BarChartIcon className="size-8 text-neutral-400" />
      </div>
      <h3 className="mb-2 text-lg font-medium text-neutral-900">
        Analysis View
      </h3>
      <p className="text-sm text-neutral-500">
        Clause analysis will appear here
      </p>
      <p className="mt-2 text-xs text-neutral-400 font-mono">
        ID: {analysisId}
      </p>
    </div>
  )
}
```

**Step 3: Update barrel export**

```typescript
// components/artifact/index.ts
export { ArtifactPane } from "./artifact-pane"
export { DocumentViewer } from "./document-viewer"
export { AnalysisView } from "./analysis-view"
```

**Step 4: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 5: Commit**

```bash
git add components/artifact/document-viewer.tsx components/artifact/analysis-view.tsx components/artifact/index.ts
git commit -m "feat(artifact): add placeholder DocumentViewer and AnalysisView"
```

---

## Phase 5: Integration

### Task 14: Create App Route Group and Layout

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/page.tsx`

**Step 1: Create the layout**

```typescript
// app/(app)/layout.tsx
import { AppShell, AppHeader, AppBody } from "@/components/shell"
import { HistoryDrawer, CommandPalette } from "@/components/navigation"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      header={<AppHeader />}
      drawer={<HistoryDrawer />}
      palette={<CommandPalette />}
    >
      {children}
    </AppShell>
  )
}
```

**Step 2: Create the page with demo chat**

```typescript
// app/(app)/page.tsx
"use client"

import * as React from "react"
import { FileTextIcon } from "lucide-react"
import { useShellStore } from "@/lib/stores/shell-store"
import { AppBody } from "@/components/shell"
import {
  ChatPane,
  ChatMessages,
  ChatInputArea,
  ChatInput,
  Message,
  SuggestionChips,
} from "@/components/chat"
import { ArtifactPane, DocumentViewer, AnalysisView } from "@/components/artifact"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export default function AppPage() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const { artifact, openArtifact } = useShellStore()

  const handleSend = (content: string) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])

    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `I received your message: "${content}". This is a demo response. Try clicking the suggestion chips to see artifacts open!`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    }, 500)
  }

  const handleSuggestion = (suggestion: { id: string; label: string; action: string }) => {
    if (suggestion.id === "analyze") {
      openArtifact({
        type: "analysis",
        id: "demo-analysis",
        title: "Demo NDA Analysis",
      })
    } else if (suggestion.id === "compare") {
      openArtifact({
        type: "document",
        id: "demo-doc",
        title: "Demo Document",
      })
    }
    handleSend(suggestion.action)
  }

  const renderArtifactContent = () => {
    if (!artifact.content) return null

    switch (artifact.content.type) {
      case "document":
        return <DocumentViewer documentId={artifact.content.id} />
      case "analysis":
        return <AnalysisView analysisId={artifact.content.id} />
      default:
        return null
    }
  }

  return (
    <AppBody
      chat={
        <ChatPane>
          <ChatMessages>
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 rounded-full bg-violet-100 p-4">
                  <FileTextIcon className="size-8 text-violet-500" />
                </div>
                <h2 className="mb-2 text-xl font-semibold text-neutral-900">
                  Welcome to VibeDocs
                </h2>
                <p className="max-w-sm text-sm text-neutral-500">
                  Upload an NDA to analyze, compare documents, or generate a new
                  NDA from templates.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <Message key={message.id} {...message} />
              ))
            )}
          </ChatMessages>

          <ChatInputArea>
            <SuggestionChips
              visible={messages.length === 0}
              onSelect={handleSuggestion}
            />
            <ChatInput
              onSend={handleSend}
              placeholder="Ask about NDAs or upload a document..."
            />
          </ChatInputArea>
        </ChatPane>
      }
      artifact={
        artifact.open && (
          <ArtifactPane
            icon={<FileTextIcon className="size-4" />}
          >
            {renderArtifactContent()}
          </ArtifactPane>
        )
      }
    />
  )
}
```

**Step 3: Run lint and build**

Run: `pnpm lint && pnpm build`
Expected: No errors

**Step 4: Commit**

```bash
git add app/\(app\)/layout.tsx app/\(app\)/page.tsx
git commit -m "feat(app): add (app) route group with shell integration"
```

---

### Task 15: Add Link to New App from Landing Page

**Files:**
- Modify: `app/(main)/page.tsx` (add temporary link)

**Step 1: Add dev link to landing page**

Add a small link at the bottom of the landing page for development access:

```typescript
// In app/(main)/page.tsx, add inside the footer div (around line 300-310):

{/* Dev link - remove before production */}
{process.env.NODE_ENV === "development" && (
  <a
    href="/app"
    className="mt-4 text-xs text-violet-500 hover:text-violet-600 underline"
  >
    Open App Shell (dev)
  </a>
)}
```

Wait - that won't work since the app is at `/(app)` which maps to `/`. Let me reconsider.

Actually, the `(app)` route group means the routes are at the root level. So we need a different approach. Let's create a dedicated `/chat` route instead.

**Revised Step 1: Rename route group**

Actually, let's use a named route:

- Rename `app/(app)/` to `app/chat/`

```typescript
// app/chat/layout.tsx
import { AppShell, AppHeader, AppBody } from "@/components/shell"
import { HistoryDrawer, CommandPalette } from "@/components/navigation"

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      header={<AppHeader />}
      drawer={<HistoryDrawer />}
      palette={<CommandPalette />}
    >
      {children}
    </AppShell>
  )
}
```

```typescript
// app/chat/page.tsx
// (same content as before)
```

**Step 2: Add link to landing page**

```typescript
// In app/(main)/page.tsx footer section, add:
<a
  href="/chat"
  className="mt-4 block text-xs text-violet-500 hover:underline"
>
  Try the chat interface →
</a>
```

**Step 3: Run build**

Run: `pnpm build`
Expected: No errors

**Step 4: Commit**

```bash
git add app/chat/layout.tsx app/chat/page.tsx app/\(main\)/page.tsx
git commit -m "feat(app): add /chat route with shell integration"
```

---

### Task 16: Final Test and Polish

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Run dev server and manual test**

Run: `pnpm dev`

Manual checklist:
- [ ] Navigate to `/chat`
- [ ] Verify header renders with glass effect
- [ ] Click hamburger → drawer opens
- [ ] Press ⌘K → command palette opens
- [ ] Press Escape → overlays close
- [ ] Type message and send → message appears
- [ ] Click suggestion chip → artifact opens
- [ ] Resize artifact panel by dragging
- [ ] Click close on artifact → closes
- [ ] Resize browser → mobile layout activates

**Step 3: Fix any issues found**

(Address as needed based on manual testing)

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(shell): complete application shell MVP"
```

---

## Summary

| Phase | Tasks | Components |
|-------|-------|------------|
| 1. Foundation | 1-5 | ShellStore, useKeyboardShortcuts, AppShell, AppHeader, AppBody |
| 2. Navigation | 6-7 | HistoryDrawer, CommandPalette |
| 3. Chat | 8-11 | ChatPane, Message, ChatInput, SuggestionChips |
| 4. Artifact | 12-13 | ArtifactPane, DocumentViewer, AnalysisView |
| 5. Integration | 14-16 | Route layout, demo page, testing |

**Total: 16 tasks, ~23 components**

Each task is atomic (test → implement → commit). Run tests after each task to catch regressions early.
