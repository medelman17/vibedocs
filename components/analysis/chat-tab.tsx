"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { SendIcon, MessageSquareIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useClauseSelection } from "@/hooks/use-clause-selection"
import { Streamdown } from "streamdown"
import { cjk } from "@streamdown/cjk"

// ============================================================================
// ChatTab - Lightweight chat component for the analysis panel
// ============================================================================

interface ChatTabProps {
  analysisId: string
  documentTitle: string
}

export function ChatTab({ analysisId, documentTitle }: ChatTabProps) {
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [inputValue, setInputValue] = React.useState("")
  const [conversationId, setConversationId] = React.useState<string | null>(
    null
  )

  // Read pending clause context from the store
  const pendingClauseContext = useClauseSelection(
    (s) => s.pendingClauseContext
  )

  // Custom fetch to capture X-Conversation-Id header for new conversations
  const customFetch = React.useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, init)
      const newConvId = response.headers.get("X-Conversation-Id")
      if (newConvId) {
        setConversationId(newConvId)
      }
      return response
    },
    []
  )

  // Create transport - recreated when conversationId changes (only once per conversation)
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { conversationId, analysisId },
        fetch: customFetch,
      }),
    [analysisId, conversationId, customFetch]
  )

  const { messages, sendMessage, status } = useChat({
    transport,
    onError: (error) => {
      console.error("[ChatTab] Chat error:", error)
    },
  })

  const isLoading = status === "streaming" || status === "submitted"

  // Auto-scroll to bottom when messages change
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, status])

  // Handle "Ask about this" clause context
  React.useEffect(() => {
    if (!pendingClauseContext) return

    const { clauseText } = pendingClauseContext
    const message = `Explain this clause:\n\n> ${clauseText}`

    // Send the message
    sendMessage({ text: message })

    // Clear the pending context
    useClauseSelection.setState({ pendingClauseContext: null })
  }, [pendingClauseContext, sendMessage])

  // Handle form submission
  const handleSubmit = React.useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || isLoading) return

    sendMessage({ text: trimmed })
    setInputValue("")
  }, [inputValue, isLoading, sendMessage])

  // Handle keyboard events
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  // Auto-resize textarea
  const handleTextareaChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value)
      // Reset height to auto to shrink when text is deleted
      e.target.style.height = "auto"
      // Set to scrollHeight but cap at ~4 lines
      e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`
    },
    []
  )

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <MessageSquareIcon className="size-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              Ask a question about &ldquo;{documentTitle}&rdquo;
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {/* Thinking indicator */}
            {status === "submitted" && (
              <div className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" />
                Thinking...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area - fixed at bottom */}
      <div className="shrink-0 border-t bg-background p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this document..."
            disabled={isLoading}
            rows={1}
            className={cn(
              "min-h-[36px] flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-xs",
              "placeholder:text-muted-foreground/60",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
            style={{ height: "36px" }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={handleSubmit}
            disabled={!inputValue.trim() || isLoading}
          >
            <SendIcon className="size-3.5" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ChatMessage - Compact message rendering
// ============================================================================

interface ChatMessageProps {
  message: UIMessage
}

const ChatMessage = React.memo(function ChatMessage({
  message,
}: ChatMessageProps) {
  const isUser = message.role === "user"

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        isUser ? "items-end" : "items-start"
      )}
    >
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          if (isUser) {
            return (
              <div
                key={i}
                className="max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-xs"
              >
                {part.text}
              </div>
            )
          }

          return (
            <div key={i} className="max-w-[95%] text-xs">
              <Streamdown
                className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_blockquote]:text-muted-foreground [&_li]:ml-3 [&_p]:my-1"
                plugins={{ cjk }}
              >
                {part.text}
              </Streamdown>
            </div>
          )
        }

        // Skip non-text parts (tool calls, files, etc.) in compact view
        return null
      })}
    </div>
  )
})
