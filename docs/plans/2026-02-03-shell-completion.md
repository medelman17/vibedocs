# Application Shell Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the application shell using existing shadcn/ui and ai-elements components

**Architecture:** Replace custom components with installed ai-elements (Message, PromptInput, Conversation, Artifact, Suggestions) and shadcn/ui components

**Tech Stack:** ai-elements, shadcn/ui sidebar, use-stick-to-bottom, Zustand

---

## Installed Components to Use

### ai-elements (components/ai-elements/)
| Component | Purpose | Replaces |
|-----------|---------|----------|
| `Conversation`, `ConversationContent`, `ConversationScrollButton` | Auto-scrolling message container | Custom ChatPane, ChatMessages |
| `Message`, `MessageContent`, `MessageActions` | Message bubbles with actions | Custom Message component |
| `PromptInput`, `PromptInputTextarea`, `PromptInputActions` | Input with attachments, commands | Custom ChatInput |
| `Suggestions`, `Suggestion` | Suggestion chips | Custom SuggestionChips |
| `Artifact`, `ArtifactHeader`, `ArtifactContent`, `ArtifactClose` | Artifact panel | Custom ArtifactPane |

### shadcn/ui (components/ui/)
| Component | Purpose |
|-----------|---------|
| `Sidebar`, `SidebarProvider`, `SidebarInset`, etc. | Collapsible sidebar (already integrated) |
| `Command`, `CommandInput`, `CommandList`, `CommandGroup` | Command palette |
| `Sheet` | Mobile artifact overlay |
| `DropdownMenu` | Context menus |
| `ScrollArea` | Scrollable regions |

---

## Task 1: Replace Chat Components with ai-elements

**Files:**
- Delete: `components/chat/chat-pane.tsx`, `components/chat/message.tsx`, `components/chat/chat-input.tsx`, `components/chat/suggestion-chips.tsx`
- Modify: `app/(main)/chat/page.tsx`
- Modify: `components/chat/index.ts`

**Changes:**

1. Update `components/chat/index.ts` to re-export ai-elements:
```typescript
// Re-export ai-elements for chat
export {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"

export {
  Message,
  MessageContent,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message"

export {
  Suggestions,
  Suggestion,
} from "@/components/ai-elements/suggestion"

// PromptInput has many exports - re-export key ones
export {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
  usePromptInput,
} from "@/components/ai-elements/prompt-input"
```

2. Update `app/(main)/chat/page.tsx` to use ai-elements:
```typescript
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  Suggestions,
  Suggestion,
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
} from "@/components/chat"
```

3. Delete custom implementations:
- `components/chat/chat-pane.tsx`
- `components/chat/message.tsx`
- `components/chat/chat-input.tsx`
- `components/chat/suggestion-chips.tsx`

**Commit:** `refactor(chat): replace custom components with ai-elements`

---

## Task 2: Replace Artifact Components with ai-elements

**Files:**
- Delete: `components/artifact/artifact-pane.tsx`
- Modify: `components/artifact/index.ts`
- Modify: `app/(main)/chat/page.tsx`

**Changes:**

1. Update `components/artifact/index.ts`:
```typescript
// Re-export ai-elements artifact
export {
  Artifact,
  ArtifactHeader,
  ArtifactTitle,
  ArtifactDescription,
  ArtifactActions,
  ArtifactAction,
  ArtifactContent,
  ArtifactClose,
} from "@/components/ai-elements/artifact"

// Keep domain-specific viewers
export { DocumentViewer } from "./document-viewer"
export { AnalysisView } from "./analysis-view"
```

2. Update page.tsx to use ai-elements Artifact

3. Delete `components/artifact/artifact-pane.tsx`

**Commit:** `refactor(artifact): replace custom pane with ai-elements`

---

## Task 3: Wire Up PromptInput Features

**Files:**
- Modify: `app/(main)/chat/page.tsx`

**Changes:**

The ai-elements `PromptInput` supports:
- File attachments via `PromptInputAttachments`
- Slash commands via `PromptInputCommand`
- Auto-resize textarea
- Submit on Enter, newline on Shift+Enter

Wire up the full PromptInput with attachments and commands:

```typescript
<PromptInput onSubmit={handleSend}>
  <PromptInputAttachments />
  <PromptInputTextarea placeholder="Ask about NDAs..." />
  <PromptInputActions>
    <PromptInputAction type="submit" />
  </PromptInputActions>
  <PromptInputCommand>
    <PromptInputCommandList>
      <PromptInputCommandItem value="/analyze">Analyze NDA</PromptInputCommandItem>
      <PromptInputCommandItem value="/compare">Compare documents</PromptInputCommandItem>
      <PromptInputCommandItem value="/generate">Generate NDA</PromptInputCommandItem>
    </PromptInputCommandList>
  </PromptInputCommand>
</PromptInput>
```

**Commit:** `feat(chat): wire up PromptInput with attachments and commands`

---

## Task 4: Integrate Resizable Panels for Artifact

**Files:**
- Modify: `app/(main)/chat/page.tsx`
- Use: `components/ui/resizable.tsx` (react-resizable-panels)

**Changes:**

Use the shadcn resizable component for chat/artifact split:

```typescript
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

// In page:
<ResizablePanelGroup direction="horizontal">
  <ResizablePanel defaultSize={artifact.open ? 50 : 100} minSize={30}>
    {/* Chat content */}
  </ResizablePanel>
  {artifact.open && (
    <>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={50} minSize={30} maxSize={60}>
        {/* Artifact content */}
      </ResizablePanel>
    </>
  )}
</ResizablePanelGroup>
```

**Commit:** `feat(shell): add resizable chat/artifact panels`

---

## Task 5: Implement DocumentViewer

**Files:**
- Modify: `components/artifact/document-viewer.tsx`

**Changes:**

Create a real document viewer using:
- PDF: `react-pdf` or iframe with PDF.js
- For MVP: Simple iframe-based viewer or placeholder with file info

```typescript
export function DocumentViewer({ documentId }: { documentId: string }) {
  // Fetch document URL from API
  // Render in iframe or PDF viewer
  return (
    <div className="flex h-full flex-col">
      <iframe
        src={documentUrl}
        className="flex-1 border-0"
        title="Document viewer"
      />
    </div>
  )
}
```

**Commit:** `feat(artifact): implement document viewer`

---

## Task 6: Implement AnalysisView with Risk Badges

**Files:**
- Modify: `components/artifact/analysis-view.tsx`
- Create: `components/artifact/clause-card.tsx`
- Create: `components/artifact/risk-badge.tsx`

**Changes:**

Use shadcn components:
- `Card` for clause cards
- `Badge` for risk levels
- `Collapsible` for expandable evidence
- `ScrollArea` for scrolling

```typescript
// risk-badge.tsx
const riskColors = {
  standard: "bg-green-100 text-green-800",
  cautious: "bg-amber-100 text-amber-800",
  aggressive: "bg-red-100 text-red-800",
  unknown: "bg-neutral-100 text-neutral-800",
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <Badge className={riskColors[level]}>
      {level}
    </Badge>
  )
}
```

**Commit:** `feat(artifact): implement analysis view with clause cards`

---

## Task 7: Add Command Palette Search

**Files:**
- Modify: `components/navigation/command-palette.tsx`

**Changes:**

The command palette already uses shadcn `Command` component. Add:
- Fuzzy search with `cmdk` (already included)
- Dynamic items from props
- Recent items section
- Keyboard navigation (built-in)

```typescript
interface CommandPaletteProps {
  recentItems?: Array<{ id: string; title: string; type: string }>
  onSelectItem?: (item: { id: string; type: string }) => void
}
```

**Commit:** `feat(navigation): add dynamic search to command palette`

---

## Task 8: Clean Up Unused Files

**Files:**
- Delete: `components/shell/app-shell.tsx` (if not used after sidebar refactor)
- Delete: `components/shell/app-header.tsx` (replaced by SidebarInset header)
- Delete: `components/shell/app-body.tsx` (replaced by resizable panels)
- Delete: `components/navigation/history-drawer.tsx` (replaced by sidebar)
- Update: All barrel exports

**Commit:** `chore: remove unused shell components`

---

## Task 9: Mobile Responsiveness

**Files:**
- Modify: `app/(main)/chat/page.tsx`

**Changes:**

- Sidebar: Already handles mobile via Sheet (built into shadcn sidebar)
- Artifact: Use Sheet for mobile instead of resizable panel
- Use `useIsMobile()` hook to switch layouts

```typescript
const isMobile = useIsMobile()

// Mobile: artifact as bottom sheet
// Desktop: resizable side panel
```

**Commit:** `feat(shell): add mobile artifact sheet`

---

## Task 10: Keyboard Shortcuts Polish

**Files:**
- Modify: `hooks/use-keyboard-shortcuts.ts`
- Modify: `app/(main)/chat/layout.tsx`

**Changes:**

The shadcn sidebar handles ⌘B internally. Update remaining shortcuts:
- ⌘K: Command palette (working)
- ⌘/: Focus input
- ⌘[: Close artifact
- ⌘]: Expand artifact
- Escape: Close topmost

Remove duplicate ⌘B handling since sidebar does it.

**Commit:** `fix(shortcuts): remove duplicate sidebar toggle`

---

## Summary

| Task | Description | Components Used |
|------|-------------|-----------------|
| 1 | Replace chat components | ai-elements: Conversation, Message, PromptInput, Suggestions |
| 2 | Replace artifact pane | ai-elements: Artifact, ArtifactHeader, etc. |
| 3 | Wire PromptInput features | ai-elements: PromptInputCommand, PromptInputAttachments |
| 4 | Resizable panels | shadcn: ResizablePanelGroup |
| 5 | Document viewer | iframe/react-pdf |
| 6 | Analysis view | shadcn: Card, Badge, Collapsible |
| 7 | Command palette search | shadcn: Command (cmdk) |
| 8 | Clean up unused files | - |
| 9 | Mobile responsiveness | shadcn: Sheet, useIsMobile |
| 10 | Keyboard shortcuts | Zustand, existing hook |

**Estimated tasks:** 10
**Priority:** Tasks 1-4 are critical (core functionality), 5-7 are important (features), 8-10 are polish
