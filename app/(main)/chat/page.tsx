"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { UIMessage, DefaultChatTransport } from "ai"
import { FileTextIcon, PlusIcon, SparklesIcon, BrainIcon } from "lucide-react"
import { useShellStore } from "@/lib/stores/shell-store"
import { AppBody } from "@/components/shell"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
  Suggestions,
  Suggestion,
  PromptInput,
  PromptInputProvider,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionAddAttachments,
  InputAutocomplete,
  type SlashCommand,
  type Mention,
  type PromptInputMessage,
} from "@/components/chat"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Artifact,
  ArtifactHeader,
  ArtifactTitle,
  ArtifactActions,
  ArtifactAction,
  ArtifactClose,
  ArtifactContent,
  DocumentViewer,
  AnalysisView,
} from "@/components/artifact"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Tool, ToolHeader, ToolContent, ToolOutput } from "@/components/ai-elements/tool"
import { ErrorBoundary } from "@/components/error-boundary"
import { ExpandIcon, MoreHorizontalIcon } from "lucide-react"
import { uploadDocument } from "@/app/(main)/(dashboard)/documents/actions"
import { triggerAnalysis } from "@/app/(main)/(dashboard)/analyses/actions"
import { getMessages } from "./actions"

export default function ChatPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const conversationId = searchParams.get("conversation")

  const [inputValue, setInputValue] = React.useState("")
  const [isUploading, setIsUploading] = React.useState(false)
  const inputWrapperRef = React.useRef<HTMLDivElement>(null)
  const { artifact, openArtifact, closeArtifact, toggleArtifactExpanded } =
    useShellStore()

  // AI SDK v6 useChat hook
  const {
    messages,
    sendMessage,
    status,
    setMessages,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId },
    }),
    onToolCall: async ({ toolCall }) => {
      // Handle client-side tools
      if (toolCall.toolName === "showArtifact") {
        const input = toolCall.input as {
          type: "analysis" | "document" | "comparison"
          id: string
          title: string
        }
        openArtifact(input)
        return undefined // Silent execution
      }
    },
    onFinish: () => {
      // Refresh sidebar history
      window.dispatchEvent(new Event("refresh-chat-history"))
    },
    onError: (error) => {
      console.error("Chat error:", error)
    },
  })

  const isLoading = status === "streaming" || status === "submitted" || isUploading

  // Load existing conversation on mount
  React.useEffect(() => {
    async function loadConversation() {
      if (!conversationId) return

      const result = await getMessages(conversationId)
      if (result.success) {
        // Convert stored messages to UIMessage format
        const uiMessages: UIMessage[] = result.data.map((msg) => {
          // Parse stored content (JSON string of parts)
          let parts: UIMessage["parts"] = []
          try {
            const parsed = JSON.parse(msg.content)
            if (Array.isArray(parsed)) {
              parts = parsed
            } else {
              // Fallback for plain text content
              parts = [{ type: "text", text: msg.content }]
            }
          } catch {
            // Plain text content
            parts = [{ type: "text", text: msg.content }]
          }

          return {
            id: msg.id,
            role: msg.role,
            parts,
          }
        })
        setMessages(uiMessages)
      }
    }
    loadConversation()
  }, [conversationId, setMessages])

  // Handle form submission
  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text.trim() && message.files.length === 0) return

    // Clear input immediately
    setInputValue("")

    // Handle file upload flow (document analysis)
    if (message.files.length > 0) {
      await handleFileUpload(message)
      return
    }

    // Regular text message - send via useChat
    sendMessage({ text: message.text })
  }

  // Handle file upload and analysis
  const handleFileUpload = async (message: PromptInputMessage) => {
    try {
      setIsUploading(true)
      const file = message.files[0] // MVP: single file

      // Add user message with file info
      const userMessageContent = message.text || `Analyze ${file.filename}`

      // Show uploading status
      const uploadingMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text: "Uploading document..." }],
      }
      setMessages([
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [
            { type: "text", text: userMessageContent },
            {
              type: "file",
              url: file.url,
              filename: file.filename,
              mediaType: file.mediaType,
            },
          ],
        },
        uploadingMessage,
      ])

      // Fetch the blob from the URL and create FormData
      const response = await fetch(file.url)
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`)
      }
      const blob = await response.blob()

      // Create a File with the correct MIME type
      const fileObj = new File([blob], file.filename || "document", {
        type: file.mediaType || blob.type,
      })
      const formData = new FormData()
      formData.append("file", fileObj)

      // Upload document
      const uploadResult = await uploadDocument(formData)
      if (!uploadResult.success) {
        setMessages([
          ...messages,
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: userMessageContent }],
          },
          {
            id: crypto.randomUUID(),
            role: "assistant",
            parts: [
              {
                type: "text",
                text: `**Upload failed:** ${uploadResult.error.message}`,
              },
            ],
          },
        ])
        return
      }

      // Trigger analysis
      const analysisResult = await triggerAnalysis(uploadResult.data.id, {
        userPrompt: message.text || undefined,
      })
      if (!analysisResult.success) {
        setMessages([
          ...messages,
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: userMessageContent }],
          },
          {
            id: crypto.randomUUID(),
            role: "assistant",
            parts: [
              {
                type: "text",
                text: `**Analysis failed:** ${analysisResult.error.message}`,
              },
            ],
          },
        ])
        return
      }

      // Success message
      const successMsg = `I'm analyzing **"${uploadResult.data.title}"**. This usually takes about 30 seconds...`
      setMessages([
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [
            { type: "text", text: userMessageContent },
            {
              type: "file",
              url: file.url,
              filename: file.filename,
              mediaType: file.mediaType,
            },
          ],
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          parts: [{ type: "text", text: successMsg }],
        },
      ])

      // Auto-open artifact panel
      openArtifact({
        type: "analysis",
        id: analysisResult.data.id,
        title: uploadResult.data.title,
      })

      // Refresh sidebar
      window.dispatchEvent(new Event("refresh-chat-history"))
    } catch (err) {
      const errorMsg = `**Error:** ${err instanceof Error ? err.message : "Unknown error"}`
      setMessages([
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          parts: [{ type: "text", text: errorMsg }],
        },
      ])
    } finally {
      setIsUploading(false)
    }
  }

  const handleSuggestion = async (suggestion: string) => {
    sendMessage({ text: suggestion })
  }

  const handleSlashCommand = async (command: SlashCommand) => {
    setInputValue("")

    switch (command.id) {
      case "analyze":
        // Trigger file upload
        const fileInput = document.querySelector<HTMLInputElement>(
          'input[type="file"][aria-label="Upload files"]'
        )
        fileInput?.click()
        break
      case "compare":
        router.push("/documents?action=compare")
        break
      case "generate":
        router.push("/generate")
        break
      case "help":
        sendMessage({ text: "What can VibeDocs help me with?" })
        break
    }
  }

  const handleMention = (mention: Mention) => {
    const lastAtIndex = inputValue.lastIndexOf("@")
    const beforeAt = inputValue.slice(0, lastAtIndex)
    const newValue = `${beforeAt}@${mention.name} `
    setInputValue(newValue)

    if (mention.type === "analysis") {
      openArtifact({
        type: "analysis",
        id: mention.id,
        title: mention.name,
      })
    } else if (mention.type === "document") {
      openArtifact({
        type: "document",
        id: mention.id,
        title: mention.name,
      })
    }
  }

  const handleAutocompleteClose = () => {
    const trimmed = inputValue.trim()
    if (trimmed === "/" || trimmed === "@") {
      setInputValue("")
    }
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

  // Render message parts in order - interleaving text and tool states
  const renderMessageParts = (message: UIMessage) => {
    return message.parts.map((part, index) => {
      // Text parts
      if (part.type === "text") {
        return (
          <MessageResponse key={index}>{part.text}</MessageResponse>
        )
      }

      // Tool parts - use ai-elements Tool component
      if (part.type.startsWith("tool-")) {
        const toolPart = part as {
          type: string
          toolCallId: string
          state: "input-streaming" | "input-available" | "output-available" | "output-error" | "output-denied" | "approval-requested" | "approval-responded"
          input?: unknown
          output?: unknown
          errorText?: string
        }

        // Skip silent tools (showArtifact)
        if (part.type === "tool-showArtifact") return null

        // Search tool - use Tool component
        if (part.type === "tool-search_references") {
          const results = toolPart.output as Array<{ id: string; content: string; source: string }> | null

          return (
            <Tool key={index} defaultOpen={false}>
              <ToolHeader
                type={part.type as `tool-${string}`}
                state={toolPart.state}
                title="Search Legal Corpus"
              />
              <ToolContent>
                <ToolOutput
                  output={results ? {
                    found: results.length,
                    sources: [...new Set(results.map(r => r.source))],
                    samples: results.slice(0, 2).map(r => ({
                      source: r.source,
                      excerpt: r.content.slice(0, 100) + "..."
                    }))
                  } : undefined}
                  errorText={toolPart.errorText}
                />
              </ToolContent>
            </Tool>
          )
        }

        return null
      }

      // File parts (shouldn't appear in assistant messages, but handle anyway)
      if (part.type === "file") {
        return (
          <div
            key={index}
            className="mb-2 flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs"
          >
            <FileTextIcon className="size-3" />
            {part.filename || "Attachment"}
          </div>
        )
      }

      return null
    })
  }

  return (
    <AppBody
      chat={
        <div className="flex min-h-0 flex-1 flex-col">
          <Conversation className="min-h-0 flex-1">
            {messages.length === 0 ? (
              <ConversationEmptyState
                icon={
                  <div className="rounded-full bg-fuchsia-100 p-4">
                    <FileTextIcon className="size-8 text-fuchsia-500" />
                  </div>
                }
                title="Welcome to VibeDocs"
                description="Upload an NDA to analyze, compare documents, or generate a new NDA from templates."
              />
            ) : (
              <ConversationContent>
                {messages.map((message) => (
                  <Message
                    key={message.id}
                    from={message.role as "user" | "assistant"}
                  >
                    {message.role === "user" ? (
                      <MessageContent>
                        {message.parts.map((part, i) => {
                          if (part.type === "file") {
                            return (
                              <div
                                key={i}
                                className="mb-2 flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs"
                              >
                                <FileTextIcon className="size-3" />
                                {part.filename || "Attachment"}
                              </div>
                            )
                          }
                          if (part.type === "text") {
                            return <span key={i}>{part.text}</span>
                          }
                          return null
                        })}
                      </MessageContent>
                    ) : (
                      <MessageContent>{renderMessageParts(message)}</MessageContent>
                    )}
                  </Message>
                ))}

                {/* Thinking indicator - fixed height to prevent layout shift */}
                <div className="h-8">
                  {status === "submitted" && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BrainIcon className="size-4" />
                      <Shimmer duration={1.5}>Thinking...</Shimmer>
                    </div>
                  )}
                </div>
              </ConversationContent>
            )}
            <ConversationScrollButton />
          </Conversation>

          {/* Input area */}
          <div className="shrink-0 border-t bg-background p-4">
            {messages.length === 0 && (
              <Suggestions className="mb-3">
                <Suggestion suggestion="Analyze NDA" onClick={handleSuggestion} />
                <Suggestion
                  suggestion="Compare documents"
                  onClick={handleSuggestion}
                />
                <Suggestion
                  suggestion="Generate NDA"
                  onClick={handleSuggestion}
                />
              </Suggestions>
            )}

            <div className="relative" ref={inputWrapperRef}>
              <InputAutocomplete
                inputValue={inputValue}
                onSlashCommand={handleSlashCommand}
                onMention={handleMention}
                onClose={handleAutocompleteClose}
                anchorRef={inputWrapperRef}
              />
              <PromptInputProvider initialInput={inputValue}>
                <PromptInput
                  onSubmit={handleSubmit}
                  accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
                  multiple
                >
                  <PromptInputTextarea
                    placeholder="Ask about NDAs or upload a document... (try /help)"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                  <PromptInputFooter>
                    <PromptInputTools>
                      <PromptInputActionMenu>
                        <PromptInputActionMenuTrigger>
                          <PlusIcon className="size-4" />
                        </PromptInputActionMenuTrigger>
                        <PromptInputActionMenuContent>
                          <PromptInputActionAddAttachments label="Upload documents" />
                          <PromptInputActionMenuItem disabled>
                            <SparklesIcon className="mr-2 size-4" />
                            Generate from template
                          </PromptInputActionMenuItem>
                        </PromptInputActionMenuContent>
                      </PromptInputActionMenu>
                    </PromptInputTools>
                    <PromptInputSubmit
                      status={isLoading ? "streaming" : undefined}
                      disabled={isLoading}
                    />
                  </PromptInputFooter>
                </PromptInput>
              </PromptInputProvider>
            </div>
          </div>
        </div>
      }
      artifact={
        artifact.open && artifact.content && (
          <Artifact className="h-full">
            <ArtifactHeader>
              <ArtifactTitle>{artifact.content.title}</ArtifactTitle>
              <ArtifactActions>
                <ArtifactAction
                  tooltip="Expand"
                  icon={ExpandIcon}
                  onClick={toggleArtifactExpanded}
                />
                <ArtifactAction tooltip="More" icon={MoreHorizontalIcon} />
                <ArtifactClose onClick={closeArtifact} />
              </ArtifactActions>
            </ArtifactHeader>
            <ArtifactContent>
              <ErrorBoundary>{renderArtifactContent()}</ErrorBoundary>
            </ArtifactContent>
          </Artifact>
        )
      }
    />
  )
}
