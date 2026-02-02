"use client"

import { useEffect, useState } from "react"
import { TaskPaneShell } from "./components/TaskPaneShell"
import { AuthGate } from "./components/AuthGate"
import { AnalyzeButton } from "./components/AnalyzeButton"
import { ResultsView } from "./components/ResultsView"
import { StoreHydration } from "./components/StoreHydration"
import { useAnalysisStore, initDevMode, useDevModeStore } from "./store"

// Office.js types
declare global {
  interface Window {
    Office?: typeof Office
  }
}

export default function TaskPanePage() {
  const status = useAnalysisStore((state) => state.status)
  const results = useAnalysisStore((state) => state.results)
  const isDevMode = useDevModeStore((state) => state.isDevMode)

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
    // Initialize dev mode from URL query param
    const devMode = initDevMode()

    // In dev mode, bypass Office.js entirely and use mock data
    if (devMode) {
      console.log("[Word Add-in] Dev mode active, bypassing Office.js")
      setOfficeState({
        isReady: true,
        error: null,
        host: "DevMode",
      })
      return
    }

    // Wait for Office.js to be ready (production mode)
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
    <StoreHydration>
      <TaskPaneShell>
        <AuthGate>
          <AnalyzeButton />
          {showResults && <ResultsView />}
        </AuthGate>
      </TaskPaneShell>
    </StoreHydration>
  )
}
