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
        className={cn("h-full overflow-y-auto px-4 py-6", className)}
      >
        <div className="mx-auto max-w-[720px]">{children}</div>
      </div>

      {showScrollButton && (
        <button
          type="button"
          aria-label="Scroll to new messages"
          onClick={scrollToBottom}
          className={cn(
            "absolute bottom-4 left-1/2 -translate-x-1/2",
            "flex items-center gap-1 rounded-full px-3 py-1.5",
            "bg-white/90 backdrop-blur-sm shadow-md border border-neutral-200",
            "text-xs text-neutral-600 hover:bg-white",
            "transition-all"
          )}
        >
          <span aria-hidden="true">↓</span>
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
