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

export default function ChatPage() {
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
