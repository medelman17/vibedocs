"use client"

import * as React from "react"
import { FileTextIcon, PlusIcon, SparklesIcon } from "lucide-react"
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
import { useRouter } from "next/navigation"
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
import { ErrorBoundary } from "@/components/error-boundary"
import { ExpandIcon, MoreHorizontalIcon } from "lucide-react"
import { uploadDocument } from "@/app/(main)/(dashboard)/documents/actions"
import { triggerAnalysis } from "@/app/(main)/(dashboard)/analyses/actions"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

export default function ChatPage() {
  const router = useRouter()
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const inputWrapperRef = React.useRef<HTMLDivElement>(null)
  const { artifact, openArtifact, closeArtifact, toggleArtifactExpanded } = useShellStore()

  // Track file uploads separately
  const [fileAttachments, setFileAttachments] = React.useState<
    Record<string, Array<{ url: string; filename?: string; mediaType?: string }>>
  >({})

  // Send message to AI and stream response
  const sendMessage = async (text: string) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ""
      const assistantId = crypto.randomUUID()

      // Add placeholder assistant message
      setMessages([...newMessages, { id: assistantId, role: "assistant", content: "" }])

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // Plain text stream - just append the chunk
          const chunk = decoder.decode(value, { stream: true })
          assistantContent += chunk
          setMessages([
            ...newMessages,
            { id: assistantId, role: "assistant", content: assistantContent },
          ])
        }
      }
    } catch (error) {
      console.error("Chat error:", error)
      setMessages([
        ...newMessages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text.trim() && message.files.length === 0) return

    // Handle file upload flow
    if (message.files.length > 0) {
      const file = message.files[0] // MVP: single file

      // Add user message with file attachment
      const userMessageId = crypto.randomUUID()
      const userMessageContent = message.text || `Analyze ${file.filename}`

      // Track file attachment for this message
      setFileAttachments((prev) => ({
        ...prev,
        [userMessageId]: message.files.map((f) => ({
          url: f.url,
          filename: f.filename,
          mediaType: f.mediaType,
        })),
      }))

      // Add user message and uploading indicator to chat
      const uploadingMsgId = crypto.randomUUID()
      setMessages([
        ...messages,
        { id: userMessageId, role: "user", content: userMessageContent },
        { id: uploadingMsgId, role: "assistant", content: "Uploading document..." },
      ])
      setIsLoading(true)

      try {
        // Fetch the blob from the URL and create FormData
        const response = await fetch(file.url)
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`)
        }
        const blob = await response.blob()

        // Create a File with the correct MIME type (blob from fetch loses it)
        const fileObj = new File(
          [blob],
          file.filename || "document",
          { type: file.mediaType || blob.type }
        )
        const formData = new FormData()
        formData.append("file", fileObj)

        // Upload document
        const uploadResult = await uploadDocument(formData)
        if (!uploadResult.success) {
          setMessages([
            ...messages,
            { id: userMessageId, role: "user", content: userMessageContent },
            { id: crypto.randomUUID(), role: "assistant", content: `**Upload failed:** ${uploadResult.error.message}` },
          ])
          setIsLoading(false)
          return
        }

        // Trigger analysis
        const analysisResult = await triggerAnalysis(uploadResult.data.id, {
          userPrompt: message.text || undefined,
        })
        if (!analysisResult.success) {
          setMessages([
            ...messages,
            { id: userMessageId, role: "user", content: userMessageContent },
            { id: crypto.randomUUID(), role: "assistant", content: `**Analysis failed:** ${analysisResult.error.message}` },
          ])
          setIsLoading(false)
          return
        }

        // Add assistant message
        setMessages([
          ...messages,
          { id: userMessageId, role: "user", content: userMessageContent },
          { id: crypto.randomUUID(), role: "assistant", content: `I'm analyzing **"${uploadResult.data.title}"**. This usually takes about 30 seconds...` },
        ])
        setIsLoading(false)

        // Auto-open artifact panel
        openArtifact({
          type: "analysis",
          id: analysisResult.data.id,
          title: uploadResult.data.title,
        })

        return
      } catch (err) {
        setMessages([
          ...messages,
          { id: userMessageId, role: "user", content: userMessageContent },
          { id: crypto.randomUUID(), role: "assistant", content: `**Error:** ${err instanceof Error ? err.message : "Unknown error"}` },
        ])
        setIsLoading(false)
        return
      }
    }

    // Regular text message - send to AI
    await sendMessage(message.text)
  }

  const handleSuggestion = async (suggestion: string) => {
    // Send suggestion as user message - AI will guide user on next steps
    await sendMessage(suggestion)
  }

  const handleSlashCommand = async (command: SlashCommand) => {
    // Clear the input
    setInputValue("")

    // Execute the command
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
        // Send help message
        await sendMessage("What can VibeDocs help me with?")
        break
    }
  }

  const handleMention = (mention: Mention) => {
    // Replace the @query with the mention name
    const lastAtIndex = inputValue.lastIndexOf("@")
    const beforeAt = inputValue.slice(0, lastAtIndex)
    const newValue = `${beforeAt}@${mention.name} `
    setInputValue(newValue)

    // Open the artifact panel if it's an analysis
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
    // Clear the trigger character if user presses escape
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
                  <Message key={message.id} from={message.role as "user" | "assistant"}>
                    {message.role === "user" ? (
                      <MessageContent>
                        {fileAttachments[message.id] && fileAttachments[message.id].length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {fileAttachments[message.id].map((file, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs"
                              >
                                <FileTextIcon className="size-3" />
                                {file.filename || "Attachment"}
                              </div>
                            ))}
                          </div>
                        )}
                        {message.content}
                      </MessageContent>
                    ) : (
                      <MessageContent>
                        <MessageResponse>{message.content}</MessageResponse>
                      </MessageContent>
                    )}
                  </Message>
                ))}
              </ConversationContent>
            )}
            <ConversationScrollButton />
          </Conversation>

          {/* Input area - shrink-0 keeps it visible when artifact panel opens */}
          <div className="shrink-0 border-t bg-background p-4">
            {messages.length === 0 && (
              <Suggestions className="mb-3">
                <Suggestion suggestion="Analyze NDA" onClick={handleSuggestion} />
                <Suggestion suggestion="Compare documents" onClick={handleSuggestion} />
                <Suggestion suggestion="Generate NDA" onClick={handleSuggestion} />
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
