"use client"

import { useEffect, useState } from "react"
import { TaskPaneShell } from "./components/TaskPaneShell"
import { AuthGate } from "./components/AuthGate"
import { AnalyzeButton } from "./components/AnalyzeButton"
import { ResultsView } from "./components/ResultsView"
import { useAnalysisStore } from "./store"

// Office.js types
declare global {
  interface Window {
    Office?: typeof Office
  }
}

export default function TaskPanePage() {
  const status = useAnalysisStore((state) => state.status)
  const results = useAnalysisStore((state) => state.results)

  const [officeState, setOfficeState] = useState<{
    isReady: boolean
    error: string | null
    host: string | null
  }>({
    isReady: false,
    error: null,
    host: null,
  })

  useEffect(() => {
    // Wait for Office.js to be ready
    if (typeof window !== "undefined" && window.Office) {
      window.Office.onReady((info) => {
        if (info.host === window.Office?.HostType.Word) {
          setOfficeState({
            isReady: true,
            error: null,
            host: info.host.toString(),
          })
        } else {
          setOfficeState({
            isReady: false,
            error: "This add-in only works in Microsoft Word",
            host: info.host?.toString() ?? null,
          })
        }
      })
    }
  }, [])

  if (!officeState.isReady) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <div className="text-center">
          {officeState.error ? (
            <p className="text-destructive">{officeState.error}</p>
          ) : (
            <p className="text-muted-foreground">Connecting to Word...</p>
          )}
        </div>
      </div>
    )
  }

  // Determine if we should show results
  const showResults = status === "completed" && results !== null

  return (
    <TaskPaneShell>
      <AuthGate>
        <AnalyzeButton />
        {showResults && <ResultsView />}
      </AuthGate>
    </TaskPaneShell>
  )
}
