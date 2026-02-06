"use client"

import * as React from "react"
import { MessageSquareIcon, XIcon } from "lucide-react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ChatTab } from "@/components/analysis/chat-tab"

// ============================================================================
// ChatDrawer - Animated inline chat panel within the analysis panel
// ============================================================================

interface ChatDrawerProps {
  analysisId: string
  documentTitle: string
}

export function ChatDrawer({ analysisId, documentTitle }: ChatDrawerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      {/* Animated chat panel — slides up/down like a pane of glass */}
      <motion.div
        animate={{ height: open ? "50%" : 0 }}
        initial={false}
        transition={{ type: "spring", bounce: 0, duration: 0.3 }}
        className="shrink-0 overflow-hidden"
      >
        <div className="flex h-full min-h-0 flex-col border-t bg-background">
          {/* Chat header */}
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageSquareIcon className="size-3.5" />
              Chat
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setOpen(false)}
            >
              <XIcon className="size-3.5" />
              <span className="sr-only">Close chat</span>
            </Button>
          </div>

          {/* Chat content — only mounted when open to avoid idle API calls */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {open && (
              <ChatTab analysisId={analysisId} documentTitle={documentTitle} />
            )}
          </div>
        </div>
      </motion.div>

      {/* Trigger bar — visible when chat is closed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "flex w-full items-center justify-center gap-2 border-t bg-background px-4 py-2.5",
            "text-sm text-muted-foreground transition-colors hover:bg-muted/50",
            "shrink-0"
          )}
        >
          <MessageSquareIcon className="size-4" />
          <span>Ask about this NDA</span>
        </button>
      )}
    </>
  )
}
