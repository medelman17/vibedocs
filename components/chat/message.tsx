"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export interface MessageProps {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp?: Date
  avatar?: string
  userName?: string
}

export function Message({
  role,
  content,
  timestamp,
  avatar,
  userName,
}: MessageProps) {
  const [showTimestamp, setShowTimestamp] = React.useState(false)

  const isUser = role === "user"

  return (
    <div
      className={cn("group flex gap-3 py-2", isUser && "flex-row-reverse")}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={avatar} />
        <AvatarFallback
          className={cn(isUser ? "bg-violet-100" : "bg-neutral-100")}
        >
          {isUser ? (userName?.[0] ?? "U") : "V"}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "relative max-w-[80%] rounded-2xl px-4 py-2.5",
          isUser
            ? "bg-violet-50 text-neutral-900"
            : "bg-neutral-50 border border-neutral-200/50 text-neutral-900"
        )}
      >
        <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
          {content}
        </div>

        {timestamp && showTimestamp && (
          <div
            className={cn(
              "absolute -bottom-5 text-[10px] text-neutral-400",
              isUser ? "right-0" : "left-0"
            )}
          >
            {timestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
    </div>
  )
}
