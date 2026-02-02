"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { triggerDemoProcess, triggerDemoMultiStep, type DemoResult } from "./actions"

interface EventLog {
  id: string
  type: string
  timestamp: Date
  result: DemoResult
}

export function DemoClient() {
  // Demo Process state
  const [documentId, setDocumentId] = useState("doc-" + Math.random().toString(36).slice(2, 8))
  const [message, setMessage] = useState("Hello from the demo UI!")
  const [processLoading, setProcessLoading] = useState(false)

  // Multi-Step state
  const [steps, setSteps] = useState(5)
  const [delayMs, setDelayMs] = useState(500)
  const [multiStepLoading, setMultiStepLoading] = useState(false)

  // Event log
  const [eventLog, setEventLog] = useState<EventLog[]>([])

  const addToLog = (type: string, result: DemoResult) => {
    setEventLog((prev) => [
      {
        id: crypto.randomUUID(),
        type,
        timestamp: new Date(),
        result,
      },
      ...prev.slice(0, 9), // Keep last 10
    ])
  }

  const handleTriggerProcess = async () => {
    setProcessLoading(true)
    try {
      const result = await triggerDemoProcess(documentId, message)
      addToLog("demo/process", result)
      // Generate new document ID for next run
      setDocumentId("doc-" + Math.random().toString(36).slice(2, 8))
    } finally {
      setProcessLoading(false)
    }
  }

  const handleTriggerMultiStep = async () => {
    setMultiStepLoading(true)
    try {
      const result = await triggerDemoMultiStep(steps, delayMs)
      addToLog("demo/multi-step", result)
    } finally {
      setMultiStepLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Inngest Demo</h1>
        <p className="text-muted-foreground">
          Test Inngest functions from this UI. Open the{" "}
          <a
            href="http://localhost:8288"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Inngest Dev Server
          </a>{" "}
          to see function runs in real-time.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Demo Process Card */}
        <Card>
          <CardHeader>
            <CardTitle>Demo: Process Document</CardTitle>
            <CardDescription>
              Simulates a document processing workflow with validation, delay, and logging.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="documentId">Document ID</Label>
              <Input
                id="documentId"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                placeholder="doc-123"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Input
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your message here"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={handleTriggerProcess}
              disabled={processLoading || !documentId}
              className="w-full"
            >
              {processLoading ? "Sending..." : "Trigger Process"}
            </Button>
          </CardFooter>
        </Card>

        {/* Multi-Step Card */}
        <Card>
          <CardHeader>
            <CardTitle>Demo: Multi-Step Workflow</CardTitle>
            <CardDescription>
              Runs multiple steps with configurable count and delay between each.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="steps">Number of Steps</Label>
              <Input
                id="steps"
                type="number"
                min={1}
                max={20}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delayMs">Delay Between Steps (ms)</Label>
              <Input
                id="delayMs"
                type="number"
                min={0}
                max={5000}
                step={100}
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value))}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={handleTriggerMultiStep}
              disabled={multiStepLoading || steps < 1}
              className="w-full"
            >
              {multiStepLoading ? "Sending..." : "Trigger Multi-Step"}
            </Button>
          </CardFooter>
        </Card>

        {/* Event Log Card */}
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle>Event Log</CardTitle>
            <CardDescription>Recent events sent to Inngest</CardDescription>
          </CardHeader>
          <CardContent>
            {eventLog.length === 0 ? (
              <p className="text-muted-foreground text-sm">No events sent yet</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {eventLog.map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg text-sm ${
                      log.result.success
                        ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono font-medium">{log.type}</span>
                      <span className="text-xs text-muted-foreground">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    {log.result.success ? (
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        Event ID: {log.result.eventId?.slice(0, 8)}...
                      </p>
                    ) : (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {log.result.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>How to Use</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Make sure both servers are running:
              <code className="ml-2 px-2 py-1 bg-muted rounded text-xs">pnpm dev</code>
              <span className="mx-2">and</span>
              <code className="px-2 py-1 bg-muted rounded text-xs">pnpm dev:inngest</code>
            </li>
            <li>
              Open the{" "}
              <a
                href="http://localhost:8288"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Inngest Dev Server UI
              </a>{" "}
              at localhost:8288
            </li>
            <li>Click one of the trigger buttons above</li>
            <li>Watch the function execute in the Inngest UI with real-time step tracking</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
