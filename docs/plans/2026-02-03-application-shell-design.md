# Application Shell Design

**Date:** 2026-02-03
**Status:** Approved
**Author:** Claude + Mike

---

## Overview

VibeDocs uses a **chat-first application shell** where users interact primarily through conversation with an AI assistant. Documents, analyses, comparisons, and generated NDAs appear as **artifacts** in a side panel that opens alongside the chat.

This design prioritizes:
- **Focus** — minimal chrome, maximum content area
- **Discoverability** — suggestion chips and command palette guide users
- **Power** — slash commands and @mentions for expert users
- **Accessibility** — full keyboard navigation, screen reader support

---

## Layout Structure

### Three-Zone Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Header (48px fixed)                                        │
├────────────────────────────┬────────────────────────────────┤
│                            │                                │
│      Chat Area             │      Artifact Panel            │
│   (flexible, min 400px)    │   (resizable, 0-60% width)     │
│                            │                                │
└────────────────────────────┴────────────────────────────────┘
```

### States

| State | Layout |
|-------|--------|
| **Default** | Chat fills viewport below header. Artifact hidden (0 width). |
| **Artifact open** | Horizontal resizable split. Chat left (min 400px), artifact right. Drag divider to resize. Double-click to reset 50/50. |
| **Artifact expanded** | Artifact full-screen, chat becomes hidden drawer accessible via button. |

### Shell Responsibilities

The shell manages:
- Panel visibility and sizing (persisted to localStorage)
- Keyboard shortcuts (⌘K command palette, ⌘B history drawer, Escape to close)
- Focus management between chat input and artifact content
- Responsive breakpoint transitions

The shell does NOT manage:
- Conversation state or message rendering
- Artifact content or internal state
- API calls or data fetching

---

## Header Design

48px fixed bar with soft glass treatment:

```
┌─────────────────────────────────────────────────────────────┐
│ ☰  VibeDocs                    ⌘K Search...      [Org ▾] 👤 │
└─────────────────────────────────────────────────────────────┘
```

### Left Cluster
- **History toggle** — hamburger/sidebar icon, opens slide-out drawer from left
- **Logo** — VibeDocs wordmark, clickable to start new conversation

### Center
- **Command palette trigger** — subtle input showing "⌘K Search...", opens palette on click/keystroke. Fades when chat is active.

### Right Cluster
- **Org switcher** — dropdown for current organization. Hidden if user has single org.
- **User menu** — avatar dropdown with: Settings, Keyboard shortcuts, Help, Sign out

### Visual Treatment
- Background: `oklch(0.99 0 0 / 0.7)` with `backdrop-blur-xl`
- Bottom border: `1px solid oklch(0.9 0 0 / 0.5)`
- Interactive elements: violet-100 hover background
- Fixed height, never scrolls

---

## Chat Area

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│                    ┌─────────────────┐                      │
│                    │   Message 1     │                      │
│                    └─────────────────┘                      │
│                    ┌─────────────────┐                      │
│                    │   Message 2     │  ← max-width: 720px  │
│                    └─────────────────┘    centered          │
│                              ↓                              │
│              (scroll area, auto-scroll on new messages)     │
├─────────────────────────────────────────────────────────────┤
│        [Analyze NDA] [Compare] [Generate] ← suggestion chips│
├─────────────────────────────────────────────────────────────┤
│  📎 │  Type a message... /commands @mentions      │  Send ↑ │
└─────────────────────────────────────────────────────────────┘
```

### Message Thread
- Centered column, max-width 720px for readability
- User messages: right-aligned bubble, violet-50 background
- Assistant messages: left-aligned, neutral-50 background with subtle border
- Timestamps shown on hover only
- Auto-scrolls to bottom on new messages
- Scroll-to-bottom FAB appears when user scrolls up

### Suggestion Chips
- Appear above input in empty/new conversation state
- Contextual: change based on artifact content (e.g., document open → "Analyze this" / "Find risks")
- Disappear after first user message
- Reappear on new conversation

### Input Area
- Pinned to bottom, frosted glass background
- **Attach button (📎)** — opens file picker for NDA upload
- **Auto-growing textarea** — 1-5 lines, then scrolls internally
- **Slash commands** — trigger autocomplete dropdown
- **@mentions** — trigger document/analysis picker
- **Send button** — activates on non-empty input
- Enter to send, Shift+Enter for newline

### Slash Commands (Focused Set)
| Command | Action |
|---------|--------|
| `/analyze` | Start new analysis |
| `/compare` | Compare two documents |
| `/generate` | Create new NDA |
| `/help` | Show help |

### @Mentions
| Type | Example |
|------|---------|
| Document | `@acme-nda.pdf` |
| Analysis | `@acme-analysis` |
| Template | `@bonterms-mutual` |

---

## Artifact Panel

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─ Artifact Header ─────────────────────────────────────┐  │
│  │ 📄 Acme NDA Analysis          [Expand] [⋮] [✕]        │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌─ Artifact Content ────────────────────────────────────┐  │
│  │                                                       │  │
│  │   (content varies by type)                            │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌─ Artifact Footer (optional) ──────────────────────────┐  │
│  │ [Export PDF] [Export DOCX]           Page 1 of 12     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Artifact Header (40px fixed)
- Icon + title reflecting content type and name
- **Expand** — artifact goes full-screen, chat becomes hidden drawer
- **Overflow menu (⋮)** — copy link, export, open in new tab
- **Close (✕)** — dismisses panel, returns to chat-only

### Content Types

| Type | Layout |
|------|--------|
| **Document Viewer** | PDF/DOCX preview with page navigation, zoom, text selection |
| **Analysis View** | Scrollable clause cards with risk badges, expandable evidence, gap summary |
| **Comparison View** | Vertical split — two documents with clause alignment lines, diff highlighting |
| **Generation Wizard** | Multi-step form (parameters → clauses → preview), sticky step navigation |

### Visual Treatment
- Background: `oklch(0.985 0 0)`
- Left border: `1px solid oklch(0.92 0 0)`
- Content scrolls independently from chat
- Subtle shadow on resize handle for affordance

---

## Navigation Overlays

### History Drawer

Slides from left, overlays content (320px width):

```
┌──────────────────┐
│ ✕  History       │
├──────────────────┤
│ 🔍 Search...     │
├──────────────────┤
│ Today            │
│  • Acme NDA      │
│  • Beta Co       │
├──────────────────┤
│ Yesterday        │
│  • Gamma Inc     │
├──────────────────┤
│ Documents        │
│  📄 Acme.pdf     │
│  📄 Beta.pdf     │
└──────────────────┘
```

**Sections:**
- Search — filters inline
- Conversations — grouped by date (Today, Yesterday, This Week, Older)
- Documents — all uploaded NDAs
- Analyses — saved results

**Interactions:**
- Click item → loads it, drawer closes
- Right-click → context menu (rename, delete, pin)
- Pinned items at top
- Escape or click outside to dismiss

### Command Palette

Centered modal triggered by ⌘K:

```
┌─────────────────────────────────────────┐
│  🔍  Search commands and documents...   │
├─────────────────────────────────────────┤
│  Recent                                 │
│    📄 Acme NDA                    ↵     │
│    📊 Acme Analysis               ↵     │
├─────────────────────────────────────────┤
│  Commands                               │
│    /analyze   Start new analysis  ↵     │
│    /compare   Compare documents   ↵     │
│    /generate  Create new NDA      ↵     │
└─────────────────────────────────────────┘
```

**Behavior:**
- Fuzzy search across commands, documents, analyses, conversations
- Keyboard navigation (↑↓ select, Enter execute)
- Results grouped by type
- Recent items shown before typing
- Escape to dismiss

---

## Responsive Behavior

### Desktop (≥1024px)
- Full layout: header + chat + resizable artifact
- History drawer: 320px overlay
- Command palette: centered modal
- All keyboard shortcuts active

### Tablet (768px–1023px)
- Chat takes full width when artifact closed
- Artifact opens as right sheet (60% max width, no resize)
- History drawer same as desktop
- Touch-friendly targets (min 44px)

### Mobile (<768px)

```
Default:
┌─────────────────────┐
│  ☰  VibeDocs    👤  │  ← Simplified header
├─────────────────────┤
│    Chat thread      │
├─────────────────────┤
│  [suggestion chips] │
├─────────────────────┤
│  📎  Message...  ↑  │
└─────────────────────┘

Artifact open:
┌─────────────────────┐
│  ← Back   Acme NDA  │  ← Full takeover
├─────────────────────┤
│   Artifact content  │
└─────────────────────┘
```

**Mobile-specific:**
- Artifact: full-screen bottom sheet, slides up
- Back button returns to chat
- History drawer: full-screen from left
- No command palette — drawer search suffices
- Long-press messages for actions
- Pull-to-refresh on conversation list

### Transitions
- Panel transitions: `motion/react` with spring physics
- Sheet open/close: 300ms ease-out
- Drawer: 250ms ease-out with slight overshoot
- Content crossfades during artifact type changes
- Respect `prefers-reduced-motion`

---

## Visual Design

### Glass Surfaces

| Surface | Background | Blur | Border | Usage |
|---------|------------|------|--------|-------|
| **Primary** | `oklch(0.99 0 0 / 0.8)` | `backdrop-blur-xl` | `1px oklch(0.92 0 0 / 0.6)` | Header, input area |
| **Secondary** | `oklch(0.985 0 0 / 0.9)` | `backdrop-blur-md` | `1px oklch(0.9 0 0 / 0.4)` | Artifact panel, drawer |
| **Elevated** | `oklch(1 0 0 / 0.95)` | `backdrop-blur-sm` | `1px oklch(0.88 0 0)` + shadow | Dropdowns, palette, tooltips |

### Color Application

**Brand (violet-500):**
- Logo accent
- Active nav indicators
- Primary buttons
- Links
- User message bubbles (violet-50 bg)

**Risk Indicators:**
- Standard/Safe: success-500 (green) + ✓ icon
- Cautious: warning-500 (amber) + ⚠ icon
- Aggressive: error-500 (red) + ✕ icon
- Unknown/Missing: neutral-400 (gray)

**Secondary (teal-500):**
- Success states
- Generation/create actions
- Progress indicators

### Typography
- **Geist Sans** — all UI text
- **Geist Mono** — code, clause IDs, technical content
- Message text: 15px/1.6
- UI chrome: 13px/1.4
- Artifact headings: 18px semibold

### Shadows & Depth
- Minimal shadows — glass blur creates depth
- Elevated elements: `shadow-lg` with `oklch(0 0 0 / 0.08)`
- Focus rings: `ring-2 ring-violet-500/50 ring-offset-2`

---

## Keyboard Shortcuts

### Global

| Shortcut | Action |
|----------|--------|
| `⌘K` | Open command palette |
| `⌘B` | Toggle history drawer |
| `Escape` | Close topmost overlay |
| `⌘Enter` | Send message |
| `⌘/` | Focus chat input |
| `⌘[` | Collapse artifact |
| `⌘]` | Expand artifact full-screen |
| `↑` (empty input) | Edit last message |

### Artifact-Focused

| Shortcut | Action |
|----------|--------|
| `⌘E` | Export artifact |
| `←` / `→` | Previous/next page (document) |
| `+` / `-` | Zoom in/out (document) |

---

## Accessibility

### Focus Management

```
Default: Header → Chat input → Send button
Artifact open: Header → Chat input → Send → Artifact header → Artifact content
Drawer/Palette: Trap focus until dismissed, Escape always available
```

Focus restoration: overlays return focus to trigger element on close.

### ARIA & Semantics
- Landmarks: `<header>`, `<main>`, `<aside>` (artifact), `<nav>` (drawer)
- Message thread: `aria-live="polite"`
- Announcements: "Artifact opened: [title]", "Analysis complete", "X risks identified"

### Visual Accessibility
- Color contrast: WCAG AA (4.5:1 body, 3:1 large)
- Risk indicators: never color alone — always icon + text label
- Reduced motion: `prefers-reduced-motion` disables springs
- Zoom: layout functional at 200%

---

## Component Architecture

### Tree

```
app/(app)/layout.tsx
└── <AppShell>
    ├── <AppHeader>
    │   ├── <HistoryDrawerTrigger />
    │   ├── <Logo />
    │   ├── <CommandPaletteTrigger />
    │   ├── <OrgSwitcher />
    │   └── <UserMenu />
    │
    ├── <AppBody>
    │   ├── <ChatPane>
    │   │   ├── <MessageThread>
    │   │   │   └── <Message />
    │   │   ├── <SuggestionChips />
    │   │   └── <ChatInput>
    │   │       ├── <AttachButton />
    │   │       ├── <MessageTextarea />
    │   │       ├── <SlashCommandMenu />
    │   │       ├── <MentionPicker />
    │   │       └── <SendButton />
    │   │
    │   ├── <ResizeHandle />
    │   │
    │   └── <ArtifactPane>
    │       ├── <ArtifactHeader />
    │       ├── <ArtifactContent>
    │       │   ├── <DocumentViewer />
    │       │   ├── <AnalysisView />
    │       │   ├── <ComparisonView />
    │       │   └── <GenerationWizard />
    │       └── <ArtifactFooter />
    │
    ├── <HistoryDrawer />
    └── <CommandPalette />
```

### State Management

```typescript
interface ShellState {
  artifact: {
    open: boolean
    width: number        // percentage, 30-60
    expanded: boolean    // full-screen mode
    content: ArtifactContent | null
  }
  drawer: { open: boolean }
  palette: { open: boolean }
}

// Separate contexts
<ShellProvider>           // layout, panels, resize
  <ConversationProvider>  // messages, streaming, history
    <ArtifactProvider>    // current artifact content/state
      {children}
    </ArtifactProvider>
  </ConversationProvider>
</ShellProvider>
```

### File Structure

```
components/
  shell/
    app-shell.tsx
    app-header.tsx
    app-body.tsx
    resize-handle.tsx
    shell-provider.tsx

  chat/
    chat-pane.tsx
    message-thread.tsx
    message.tsx
    chat-input.tsx
    suggestion-chips.tsx
    slash-command-menu.tsx
    mention-picker.tsx

  artifact/
    artifact-pane.tsx
    artifact-header.tsx
    artifact-content.tsx
    document-viewer.tsx
    analysis-view.tsx
    comparison-view.tsx
    generation-wizard.tsx

  navigation/
    history-drawer.tsx
    command-palette.tsx
    org-switcher.tsx
    user-menu.tsx
```

---

## Component Inventory

| Category | Components | Count |
|----------|------------|-------|
| Shell | AppShell, AppHeader, AppBody, ResizeHandle, ShellProvider | 5 |
| Chat | ChatPane, MessageThread, Message, ChatInput, SuggestionChips, SlashCommandMenu, MentionPicker | 7 |
| Artifact | ArtifactPane, ArtifactHeader, ArtifactContent, DocumentViewer, AnalysisView, ComparisonView, GenerationWizard | 7 |
| Navigation | HistoryDrawer, CommandPalette, OrgSwitcher, UserMenu | 4 |
| **Total** | | **23** |

---

## Open Items (Future)

1. **Streaming UX** — How should in-progress AI responses render?
2. **Multi-artifact** — Tabs within artifact panel for multiple open items?
3. **Collaboration** — Presence indicators if real-time collab added?
4. **Offline** — Should shell work offline with cached conversations?

These are noted for future iterations, not blocking for initial implementation.

---

## Next Steps

1. Create git worktree for isolated development
2. Write detailed implementation plan with task breakdown
3. Build shell components (AppShell, AppHeader, AppBody)
4. Build chat components (ChatPane, MessageThread, ChatInput)
5. Build artifact components (ArtifactPane, content types)
6. Build navigation (HistoryDrawer, CommandPalette)
7. Integration and polish
