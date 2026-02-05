"use client"

import * as React from "react"
import { useShellStore } from "@/lib/stores/shell-store"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent } from "@/components/ui/sheet"

interface AppBodyProps {
  chat: React.ReactNode
  artifact?: React.ReactNode
}

export function AppBody({ chat, artifact }: AppBodyProps) {
  const isMobile = useIsMobile()
  const { artifact: artifactState, closeArtifact } = useShellStore()

  // On mobile, artifact is a sheet
  if (isMobile) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{chat}</div>
        <Sheet open={artifactState.open} onOpenChange={(open) => !open && closeArtifact()}>
          <SheetContent side="bottom" className="h-[90dvh] p-0" showCloseButton={false}>
            {artifact}
          </SheetContent>
        </Sheet>
      </>
    )
  }

  // Desktop: no artifact, just chat
  if (!artifactState.open) {
    return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{chat}</div>
  }

  // Desktop: side-by-side layout (like Vercel AI Chatbot)
  // Fixed chat width, artifact takes remaining space
  // Each panel uses overflow-hidden to contain scroll within their children
  return (
    <div className="flex h-full w-full flex-1 overflow-hidden">
      {/* Chat panel - fixed width, children handle scrolling */}
      <div className="flex h-full min-h-0 w-[400px] shrink-0 flex-col overflow-hidden border-r border-border/50">
        {chat}
      </div>

      {/* Artifact panel - takes remaining width, children handle scrolling */}
      <aside
        className={cn("flex h-full min-h-0 flex-1 flex-col overflow-hidden")}
        style={{
          background: "oklch(0.97 0.015 290 / 0.9)",
        }}
      >
        {artifact}
      </aside>
    </div>
  )
}
