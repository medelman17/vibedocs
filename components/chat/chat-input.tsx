"use client"

import * as React from "react"
import { PaperclipIcon, SendIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface ChatInputProps {
  onSend?: (message: string) => void
  onAttach?: () => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(
  function ChatInput(
    { onSend, onAttach, placeholder = "Type a message...", disabled, className },
    ref
  ) {
    const [value, setValue] = React.useState("")
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)

    // Merge refs
    React.useImperativeHandle(ref, () => textareaRef.current!)

    const handleSend = React.useCallback(() => {
      if (!value.trim() || disabled) return
      onSend?.(value.trim())
      setValue("")
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
      }
    }, [value, disabled, onSend])

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          handleSend()
        }
      },
      [handleSend]
    )

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value)
        // Auto-resize
        const textarea = e.target
        textarea.style.height = "auto"
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
      },
      []
    )

    return (
      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border border-neutral-200/50",
          "bg-white/80 backdrop-blur-sm p-2",
          "focus-within:ring-2 focus-within:ring-violet-500/20",
          className
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={onAttach}
          disabled={disabled}
        >
          <PaperclipIcon className="size-4" />
          <span className="sr-only">Attach file</span>
        </Button>

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            "min-h-[36px] max-h-[120px] flex-1 resize-none border-0 bg-transparent",
            "text-[15px] leading-relaxed",
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            "placeholder:text-neutral-400"
          )}
        />

        <Button
          type="button"
          size="icon"
          className={cn(
            "size-8 shrink-0 rounded-xl",
            "bg-violet-500 hover:bg-violet-600",
            "disabled:opacity-50"
          )}
          onClick={handleSend}
          disabled={disabled || !value.trim()}
        >
          <SendIcon className="size-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    )
  }
)
