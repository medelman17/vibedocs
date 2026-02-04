"use client"

import * as React from "react"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
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
  const { artifact: artifactState, setArtifactWidth, closeArtifact } = useShellStore()

  // On mobile, artifact is a sheet
  if (isMobile) {
    return (
      <>
        <main className="flex-1 overflow-hidden">{chat}</main>
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
    return <main className="flex-1 overflow-hidden">{chat}</main>
  }

  // Desktop: resizable panels with artifact
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      onLayoutChange={(layout: { [id: string]: number }) => {
        const artifactWidth = layout["artifact-panel"]
        if (artifactWidth !== undefined) {
          setArtifactWidth(artifactWidth)
        }
      }}
    >
      <ResizablePanel
        id="chat-panel"
        defaultSize={100 - artifactState.width}
        minSize={40}
        className="overflow-hidden"
      >
        <main className="h-full overflow-hidden">{chat}</main>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel
        id="artifact-panel"
        defaultSize={artifactState.width}
        minSize={30}
        maxSize={60}
      >
        <aside
          className={cn("flex h-full flex-col border-l")}
          style={{
            background: "oklch(0.97 0.015 290 / 0.9)",
            borderColor: "oklch(0.90 0.02 293 / 0.5)",
          }}
        >
          {artifact}
        </aside>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
