"use client"

import * as React from "react"
import { Group, Panel, Separator } from "react-resizable-panels"
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
    <Group
      orientation="horizontal"
      onLayoutChanged={(layout) => {
        const artifactWidth = layout["artifact-panel"]
        if (artifactWidth !== undefined) {
          setArtifactWidth(artifactWidth)
        }
      }}
    >
      <Panel
        id="chat-panel"
        defaultSize={100 - artifactState.width}
        minSize={40}
        className="overflow-hidden"
      >
        <main className="h-full overflow-hidden">{chat}</main>
      </Panel>

      <Separator
        className={cn(
          "w-1 bg-neutral-200/50 hover:bg-violet-300 transition-colors",
          "data-[state=dragging]:bg-violet-500"
        )}
      />

      <Panel
        id="artifact-panel"
        defaultSize={artifactState.width}
        minSize={30}
        maxSize={60}
        className="overflow-hidden"
      >
        <aside
          className={cn(
            "h-full overflow-hidden",
            "bg-neutral-50/90 backdrop-blur-md",
            "border-l border-neutral-200/50"
          )}
        >
          {artifact}
        </aside>
      </Panel>
    </Group>
  )
}
