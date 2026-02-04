"use client"

import { useCallback, useState } from "react"
import { useDevModeStore } from "../store/devMode"
import { MOCK_NDA_CONTENT, type DocumentContent, type Paragraph } from "./mockDocumentContent"

export type { DocumentContent, Paragraph }

interface UseDocumentContentReturn {
  extractContent: () => Promise<DocumentContent>
  isExtracting: boolean
  error: Error | null
}

/**
 * Hook to extract content from the current Word document.
 * Uses the Office.js Word API to get text and paragraph structure.
 * In dev mode (?dev=true), returns mock NDA content for testing.
 */
export function useDocumentContent(): UseDocumentContentReturn {
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const isDevMode = useDevModeStore((state) => state.isDevMode)

  const extractContent = useCallback(async (): Promise<DocumentContent> => {
    setIsExtracting(true)
    setError(null)

    // In dev mode, return mock content after a brief delay
    if (isDevMode) {
      await new Promise((resolve) => setTimeout(resolve, 500)) // Simulate extraction time
      setIsExtracting(false)
      console.log("[Dev Mode] Returning mock NDA content")
      return MOCK_NDA_CONTENT
    }

    try {
      const content = await Word.run(async (context) => {
        const body = context.document.body
        const paragraphs = body.paragraphs
        const properties = context.document.properties

        // Load document properties for metadata
        properties.load("title, author, creationDate, lastAuthor, lastSaveTime")
        body.load("text")
        paragraphs.load("items")
        await context.sync()

        // Load each paragraph's details including outlineLevel
        const structuredParagraphs: Paragraph[] = []
        for (const para of paragraphs.items) {
          para.load("text, style, outlineLevel")
        }
        await context.sync()

        for (const para of paragraphs.items) {
          structuredParagraphs.push({
            text: para.text,
            style: para.style || "Normal",
            isHeading: para.style?.startsWith("Heading") ?? false,
            outlineLevel: para.outlineLevel ?? 0,
          })
        }

        return {
          fullText: body.text,
          paragraphs: structuredParagraphs,
          title: properties.title || "Untitled Document",
          properties: {
            author: properties.author || undefined,
            creationDate: properties.creationDate || undefined,
            lastModifiedBy: properties.lastAuthor || undefined,
            lastModified: properties.lastSaveTime || undefined,
            wordVersion: Office.context.diagnostics?.version || undefined,
          },
        }
      })

      setIsExtracting(false)
      return content
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to extract document content")
      setError(error)
      setIsExtracting(false)
      throw error
    }
  }, [isDevMode])

  return { extractContent, isExtracting, error }
}
