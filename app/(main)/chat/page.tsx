"use client"

import * as React from "react"
import { FileTextIcon } from "lucide-react"
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
  PromptInputButton,
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
import { ExpandIcon, MoreHorizontalIcon } from "lucide-react"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

export default function ChatPage() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState("")
  const { artifact, openArtifact, closeArtifact, toggleArtifactExpanded } = useShellStore()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
    }
    setMessages((prev) => [...prev, userMessage])
    setInput("")

    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `I received your message: "${userMessage.content}". This is a demo response. Try the suggestion chips to see artifacts!`,
      }
      setMessages((prev) => [...prev, assistantMessage])
    }, 500)
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
    setInput(suggestion)
    // Submit after state update
    setTimeout(() => {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: suggestion,
      }
      setMessages((prev) => [...prev, userMessage])
      setInput("")
    }, 0)
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
                  <div className="rounded-full bg-violet-100 p-4">
                    <FileTextIcon className="size-8 text-violet-500" />
                  </div>
                }
                title="Welcome to VibeDocs"
                description="Upload an NDA to analyze, compare documents, or generate a new NDA from templates."
              />
            ) : (
              <ConversationContent>
                {messages.map((message) => (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>{message.content}</MessageContent>
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

            <form onSubmit={handleSubmit}>
              <PromptInput>
                <PromptInputTextarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about NDAs or upload a document..."
                />
                <PromptInputButton type="submit" disabled={!input.trim()}>
                  Send
                </PromptInputButton>
              </PromptInput>
            </form>
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
            <ArtifactContent>{renderArtifactContent()}</ArtifactContent>
          </Artifact>
        )
      }
    />
  )
}
