"use client"

import { useSyncExternalStore, useCallback } from "react"
import { TaskPaneShell } from "./components/TaskPaneShell"
import { AuthGate } from "./components/AuthGate"
import { AnalyzeButton } from "./components/AnalyzeButton"
import { ResultsView } from "./components/ResultsView"
import { StoreHydration } from "./components/StoreHydration"
import { DevTools } from "./components/DevTools"
// Direct imports to enable tree-shaking (bundle-barrel-imports)
import { useAnalysisStore } from "./store/analysis"
import { initDevMode } from "./store/devMode"

// Office.js types
declare global {
  interface Window {
    Office?: typeof Office
  }
}

// Office state managed outside React to avoid effect issues
interface OfficeState {
  isReady: boolean
  error: string | null
  host: string | null
}

let officeState: OfficeState = {
  isReady: false,
  error: null,
  host: null,
}

const listeners = new Set<() => void>()

function setOfficeState(newState: OfficeState) {
  officeState = newState
  listeners.forEach((listener) => listener())
}

function subscribeToOffice(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getOfficeSnapshot() {
  return officeState
}

// Initialize Office.js once (module-level side effect)
if (typeof window !== "undefined") {
  const devMode = initDevMode()

  if (devMode) {
    console.log("[Word Add-in] Dev mode active, bypassing Office.js")
    setOfficeState({ isReady: true, error: null, host: "DevMode" })
  } else {
    // Office.js loads async via next/script, so we need to wait for it
    const initOffice = () => {
      if (window.Office) {
        console.log("[Word Add-in] Office.js found, calling onReady")
        window.Office.onReady((info) => {
          console.log("[Word Add-in] Office.onReady fired", info)
          if (info.host === window.Office?.HostType.Word) {
            setOfficeState({ isReady: true, error: null, host: info.host.toString() })
          } else {
            setOfficeState({
              isReady: false,
              error: `This add-in only works in Microsoft Word (got: ${info.host})`,
              host: info.host?.toString() ?? null,
            })
          }
        })
      } else {
        // Office.js not loaded yet, try again shortly
        console.log("[Word Add-in] Waiting for Office.js to load...")
        setTimeout(initOffice, 100)
      }
    }
    initOffice()
  }
}

export default function TaskPanePage() {
  // Derive boolean in selector to minimize re-renders (rerender-derived-state)
  const showResults = useAnalysisStore(
    (state) => state.status === "completed" && state.results !== null
  )

  // Use useSyncExternalStore to subscribe to Office state without effects
  const getServerSnapshot = useCallback(() => officeState, [])
  const currentOfficeState = useSyncExternalStore(
    subscribeToOffice,
    getOfficeSnapshot,
    getServerSnapshot
  )

  if (!currentOfficeState.isReady) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <div className="text-center">
          {currentOfficeState.error ? (
            <p className="text-destructive">{currentOfficeState.error}</p>
          ) : (
            <p className="text-muted-foreground">Connecting to Word...</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <StoreHydration>
        <TaskPaneShell>
          <AuthGate>
            <AnalyzeButton />
            {showResults && <ResultsView />}
          </AuthGate>
        </TaskPaneShell>
      </StoreHydration>
      <DevTools />
    </>
  )
}
