# AI SDK v6 Chat Refactor Design

> **Status:** ✅ COMPLETE (audited 2026-02-04)
>
> Implemented using AI SDK v6 and ai-elements components.

## Overview

Refactor the chat page to use AI SDK v6 idiomatically, replacing custom streaming implementation with the `useChat` hook and proper server-side patterns.

## Goals

1. Replace custom fetch/streaming with `useChat` hook
2. Use `toUIMessageStreamResponse()` with `onFinish` for persistence
3. Render message `parts[]` for tool states (searching, thinking)
4. Implement `showArtifact` as silent client-side tool
5. Preserve: file uploads, artifact panel, message persistence, sidebar history, tenant isolation

## Architecture

### Client (`app/(main)/chat/page.tsx`)

```typescript
import { useChat, UIMessage } from 'ai/react'

function ChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(
    searchParams.get('conversation')
  )

  const { messages, input, setInput, handleSubmit, isLoading, setMessages } = useChat({
    api: '/api/chat',
    body: { conversationId },
    initialMessages: [],
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName === 'showArtifact') {
        openArtifact(toolCall.args)
        return undefined // Silent execution
      }
    },
    onFinish: (message, { response }) => {
      // Update conversation ID from response header if new
      const newConvId = response.headers.get('X-Conversation-Id')
      if (newConvId && !conversationId) {
        setConversationId(newConvId)
        window.history.replaceState(null, '', `/chat?conversation=${newConvId}`)
      }
      window.dispatchEvent(new Event('refresh-chat-history'))
    },
  })

  // Load existing conversation
  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId).then((conv) => {
        if (conv) setMessages(conv.messages)
      })
    }
  }, [conversationId])

  // File upload handler
  const handleSendMessage = async (text: string, files?: FileList) => {
    if (!files?.length) {
      handleSubmit()
      return
    }

    const fileAttachments = await Promise.all(
      Array.from(files).map(async (file) => {
        const url = await uploadToBlob(file)
        return { name: file.name, contentType: file.type, url }
      })
    )

    handleSubmit(undefined, {
      experimental_attachments: fileAttachments,
    })
  }

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} isLoading={isLoading} />
      <PromptInput
        value={input}
        onChange={setInput}
        onSubmit={handleSendMessage}
        isLoading={isLoading}
      />
    </div>
  )
}
```

### Message Rendering

```typescript
function MessageContent({ message }: { message: UIMessage }) {
  return (
    <div className="space-y-2">
      {message.parts.map((part, i) => {
        switch (part.type) {
          case 'text':
            return <Markdown key={i}>{part.text}</Markdown>

          case 'tool-invocation':
            return <ToolInvocation key={part.toolInvocationId} part={part} />
        }
      })}
    </div>
  )
}

function ToolInvocation({ part }: { part: ToolInvocationPart }) {
  // Silent tools - no UI
  if (part.toolName === 'showArtifact') return null

  // Search tool states
  if (part.toolName === 'search_references') {
    if (part.state === 'call') {
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Searching reference corpus...</span>
        </div>
      )
    }
    if (part.state === 'result') {
      const results = part.result as VectorSearchResult[]
      return (
        <div className="text-sm text-muted-foreground">
          Found {results.length} relevant clauses
        </div>
      )
    }
  }

  return null
}
```

### Loading States

```typescript
// Thinking indicator when waiting for first response
{isLoading && messages[messages.length - 1]?.role === 'user' && (
  <div className="flex items-center gap-2 text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />
    <span>Thinking...</span>
  </div>
)}
```

### Server (`app/api/chat/route.ts`)

```typescript
import { streamText, UIMessage, convertToModelMessages, stepCountIs } from 'ai'
import { gateway } from 'ai'
import { withTenant } from '@/lib/dal'
import { vectorSearchTool } from '@/agents/tools/vector-search'
import { createConversation, createMessage } from '../chat/actions'
import { z } from 'zod'

const model = gateway('anthropic/claude-sonnet-4')

export const maxDuration = 60

const SYSTEM_PROMPT = `...` // Existing prompt

export async function POST(req: Request) {
  const { db, tenantId, userId } = await withTenant()
  const { messages, conversationId }: { messages: UIMessage[], conversationId?: string } = await req.json()

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: {
      search_references: vectorSearchTool,
      showArtifact: {
        description: 'Display content in the artifact panel (analysis, document, comparison)',
        parameters: z.object({
          type: z.enum(['analysis', 'document', 'comparison']),
          id: z.string(),
          title: z.string(),
        }),
        // No execute = client-side tool
      },
    },
    stopWhen: stepCountIs(5),
  })

  let newConversationId: string | null = null

  return result.toUIMessageStreamResponse({
    headers: async () => {
      // Return conversation ID header after persistence
      if (newConversationId) {
        return { 'X-Conversation-Id': newConversationId }
      }
      return {}
    },
    onFinish: async ({ response }) => {
      const assistantMessage = response.messages[response.messages.length - 1]

      let convId = conversationId
      if (!convId) {
        // Generate title from first user message
        const firstUserContent = messages[0]?.content
        const title = typeof firstUserContent === 'string'
          ? firstUserContent.slice(0, 50)
          : 'New chat'

        const conv = await createConversation({ tenantId, userId, title })
        convId = conv.id
        newConversationId = convId
      }

      // Persist user message
      const userMsg = messages[messages.length - 1]
      await createMessage({
        conversationId: convId,
        role: 'user',
        content: JSON.stringify(userMsg.parts || [{ type: 'text', text: userMsg.content }]),
      })

      // Persist assistant message
      await createMessage({
        conversationId: convId,
        role: 'assistant',
        content: JSON.stringify(assistantMessage.content),
      })
    },
  })
}
```

### File Uploads

Files are uploaded to Vercel Blob and sent as `experimental_attachments`:

```typescript
const handleSendMessage = async (text: string, files?: FileList) => {
  if (!files?.length) {
    handleSubmit()
    return
  }

  const fileAttachments = await Promise.all(
    Array.from(files).map(async (file) => {
      const url = await uploadToBlob(file) // Vercel Blob
      return {
        name: file.name,
        contentType: file.type,
        url,
      }
    })
  )

  handleSubmit(undefined, {
    experimental_attachments: fileAttachments,
  })
}
```

### Tenant Isolation

All database operations are tenant-scoped:

1. `withTenant()` at API route level sets RLS context
2. `createConversation()` includes `tenantId`
3. `createMessage()` inherits tenant scope from conversation
4. `getConversations()` filters by tenant
5. Reference corpus (CUAD/ContractNLI) is shared (not tenant-scoped)

## Files to Modify

| File | Scope | Changes |
|------|-------|---------|
| `app/(main)/chat/page.tsx` | Major | Replace custom streaming with `useChat`, parts-based rendering |
| `app/api/chat/route.ts` | Moderate | Clean idiomatic `streamText` + `toUIMessageStreamResponse` |
| `app/(main)/chat/actions.ts` | Minor | Add `getConversationMessages` for loading existing conversations |

## Files Unchanged

- `chat-layout-client.tsx` - Already correctly wired
- `agents/tools/vector-search.ts` - Already correct
- `components/` - PromptInput, MessageList mostly unchanged

## New Code

1. `showArtifact` client-side tool definition (in route.ts)
2. `ToolInvocation` component for rendering tool states
3. Message parts renderer

## Deletions

- Custom `handleSendMessage` with manual fetch/streaming
- Custom `ReadableStream` handling
- Manual message state management
- `toTextStreamResponse()` usage

## Implementation Sequence

1. Update `route.ts` to idiomatic AI SDK v6 pattern
2. Refactor `page.tsx` to use `useChat` hook
3. Implement message parts rendering with tool states
4. Wire file uploads to `experimental_attachments`
5. Add `getConversationMessages` action for loading
6. Test end-to-end: chat, search, artifacts, persistence, file uploads
