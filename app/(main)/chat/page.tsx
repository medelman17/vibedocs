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
  Suggestions,
  Suggestion,
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionAddAttachments,
  type PromptInputMessage,
} from "@/components/chat"
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
  files?: Array<{ url: string; filename?: string; mediaType?: string }>
}

export default function ChatPage() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [status, setStatus] = React.useState<"ready" | "submitted" | "streaming">("ready")
  const { artifact, openArtifact, closeArtifact, toggleArtifactExpanded } = useShellStore()

  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text.trim() && message.files.length === 0) return

    // Handle file upload flow
    if (message.files.length > 0) {
      const file = message.files[0] // MVP: single file
      setStatus("submitted")

      // Add user message immediately
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message.text || `Analyze ${file.filename}`,
        files: message.files.map((f) => ({
          url: f.url,
          filename: f.filename,
          mediaType: f.mediaType,
        })),
      }
      setMessages((prev) => [...prev, userMessage])

      try {
        // Fetch the blob from the URL and create FormData
        const response = await fetch(file.url)
        const blob = await response.blob()
        const formData = new FormData()
        formData.append("file", blob, file.filename || "document")

        // Upload document
        const uploadResult = await uploadDocument(formData)
        if (!uploadResult.success) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `Failed to upload: ${uploadResult.error.message}`,
            },
          ])
          setStatus("ready")
          return
        }

        // Trigger analysis
        const analysisResult = await triggerAnalysis(uploadResult.data.id, {
          userPrompt: message.text || undefined,
        })
        if (!analysisResult.success) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `Failed to start analysis: ${analysisResult.error.message}`,
            },
          ])
          setStatus("ready")
          return
        }

        // Add assistant message
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `I'm analyzing "${uploadResult.data.title}". This usually takes about 30 seconds...`,
          },
        ])

        // Auto-open artifact panel
        openArtifact({
          type: "analysis",
          id: analysisResult.data.id,
          title: uploadResult.data.title,
        })

        setStatus("ready")
        return
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `An error occurred: ${err instanceof Error ? err.message : "Unknown error"}`,
          },
        ])
        setStatus("ready")
        return
      }
    }

    // Regular text message handling (existing mock behavior)
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message.text,
    }
    setMessages((prev) => [...prev, userMessage])
    setStatus("submitted")

    await new Promise((resolve) => setTimeout(resolve, 500))
    setStatus("streaming")
    await new Promise((resolve) => setTimeout(resolve, 300))

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `I received your message: "${message.text}". Upload an NDA to analyze it!`,
    }
    setMessages((prev) => [...prev, assistantMessage])
    setStatus("ready")
  }

  const handleSuggestion = (suggestion: string) => {
    if (suggestion === "Analyze NDA") {
      openArtifact({
        type: "analysis",
        id: "demo-analysis",
        title: "Demo NDA Analysis",
      })
    } else if (suggestion === "Compare documents") {
      openArtifact({
        type: "document",
        id: "demo-doc",
        title: "Demo Document",
      })
    }

    // Create user message from suggestion
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: suggestion,
    }
    setMessages((prev) => [...prev, userMessage])
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
        <div className="flex h-full flex-col">
          <Conversation className="flex-1">
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
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      {message.files && message.files.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {message.files.map((file, idx) => (
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
                  </Message>
                ))}
              </ConversationContent>
            )}
            <ConversationScrollButton />
          </Conversation>

          {/* Input area */}
          <div className="border-t bg-background p-4">
            {messages.length === 0 && (
              <Suggestions className="mb-3">
                <Suggestion suggestion="Analyze NDA" onClick={handleSuggestion} />
                <Suggestion suggestion="Compare documents" onClick={handleSuggestion} />
                <Suggestion suggestion="Generate NDA" onClick={handleSuggestion} />
              </Suggestions>
            )}

            <PromptInput
              onSubmit={handleSubmit}
              accept="application/pdf,.doc,.docx,.txt"
              multiple
            >
              <PromptInputTextarea placeholder="Ask about NDAs or upload a document..." />
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
                  status={status === "ready" ? undefined : status}
                  disabled={status !== "ready"}
                />
              </PromptInputFooter>
            </PromptInput>
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
