"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FileSearch, Loader2 } from "lucide-react"
import { useDocumentContent } from "../hooks"

/**
 * Button to trigger NDA analysis on the current document.
 * Extracts document content and submits it for analysis.
 */
export function AnalyzeButton() {
  const { extractContent, isExtracting } = useDocumentContent()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    setError(null)
    setIsAnalyzing(true)

    try {
      // Extract document content
      const content = await extractContent()

      // TODO: Submit to analysis API
      console.log("Document content extracted:", {
        title: content.title,
        paragraphs: content.paragraphs.length,
        textLength: content.fullText.length,
      })

      // For now, just show success
      // In Phase 3, this will call /api/word-addin/analyze
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze document")
    } finally {
      setIsAnalyzing(false)
    }
  }

  const isLoading = isExtracting || isAnalyzing

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-medium">Analyze Current Document</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Extract clauses and assess risks in your NDA
        </p>
        <Button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="mt-4 w-full gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isExtracting ? "Extracting..." : "Analyzing..."}
            </>
          ) : (
            <>
              <FileSearch className="h-4 w-4" />
              Analyze NDA
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
